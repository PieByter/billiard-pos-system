import { rmSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { computeSegmentedSessionBilling } from '../lib/billing';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function main() {
  const dbPath = path.resolve('.data/integration-test');
  rmSync(dbPath, { recursive: true, force: true });
  process.env.DEMO_DB_PATH = dbPath;
  process.env.CUETAP_SEED_MODE = 'catalog';
  process.env.PAYMENT_GATEWAY = 'mock';
  delete process.env.DATABASE_URL;

  const { getDb } = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const {
    startBilliardSession,
    stopBilliardSession,
    pauseBilliardSession,
    resumeBilliardSession,
    markTableReady,
    openCafeBill,
  } = await import('../lib/services/sessions');
  const { placeOrder, approveOrder, markStationReady, markOrderServed, rejectOrder } = await import(
    '../lib/services/orders'
  );
  const { payBill, applyBillDiscount, voidBill } = await import('../lib/services/payments');
  const { refundPayment } = await import('../lib/services/refunds');
  const { openShift, closeShift } = await import('../lib/services/shifts');
  const {
    createReservation,
    createWaitlistEntry,
    setReservationDeposit,
    setReservationStatus,
    setWaitlistStatus,
  } = await import('../lib/services/reservations');
  const {
    saveRateSchedule,
    previewRateForTable,
    toggleRateSchedule,
    buildRateTimelineForTable,
  } = await import('../lib/services/rate-schedules');
  const { createBillSplits, payBillSplit } = await import('../lib/services/splits');
  const {
    createBillQrisIntent,
    createBillSplitQrisIntent,
    settleQrisIntent,
    simulateMockIntentPaid,
  } = await import('../lib/services/payment-intents');
  const {
    saveMember,
    attachMemberToBill,
    topUpMemberBalance,
    issueVoucher,
    applyVoucherToBill,
    redeemMemberPoints,
  } = await import('../lib/services/membership');
  const { applyPromotionToBill, savePromotion } = await import('../lib/services/promotions');
  const {
    processNotificationOutbox,
    saveNotificationTemplate,
    enqueueReservationReminder,
    getNotificationsData,
  } = await import('../lib/services/notifications');
  const {
    saveIngredient,
    saveRecipe,
    saveSupplier,
    savePurchaseOrder,
    setPurchaseOrderStatus,
    postStockOpname,
  } = await import('../lib/services/inventory');
  const { savePenaltyRule } = await import('../lib/services/penalties');
  const { claimPrintJobs, completePrintJob } = await import('../lib/services/printing');
  const { saveOutlet } = await import('../lib/services/outlets');
  const { saveTable } = await import('../lib/services/admin');
  const { getCashierData } = await import('../lib/queries/cashier');

  const db = await getDb();

  const [cashier] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.role, 'cashier'))
    .limit(1);
  assert(cashier, 'cashier seed tersedia');

  const [billiard] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B4'))
    .limit(1);
  const [cafe] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'C6'))
    .limit(1);
  assert(billiard && cafe, 'meja B4 dan C6 tersedia');

  const [wings] = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.name, 'Chicken Wings BBQ'))
    .limit(1);
  const [sirloin] = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.name, 'Sirloin Steak 200g'))
    .limit(1);
  assert(wings && sirloin, 'menu test tersedia');
  assert(sirloin.stock === 0, 'sirloin seeded sold out');
  const testIngredient = await saveIngredient(cashier.id, {
    name: 'Test Ingredient',
    unit: 'pcs',
    stockQty: 100,
    minStock: 5,
    costPerUnit: 1000,
  });
  await saveRecipe(cashier.id, {
    menuItemId: wings.id,
    ingredientId: testIngredient.id,
    qty: 2,
  });

  /* ---------------------------- Shift & session ---------------------------- */
  const shift = await openShift(cashier.id, 500_000);
  assert(shift.shiftId, 'shift dibuka');

  const started = await startBilliardSession(billiard.id, cashier.id, 'Integration Guest');
  assert(started.billId, 'sesi dimulai dan bill dibuat');

  let doubleSessionBlocked = false;
  try {
    await startBilliardSession(billiard.id, cashier.id, 'Duplicate');
  } catch (error) {
    doubleSessionBlocked =
      error instanceof Error && error.message.includes('sedang berjalan');
  }
  assert(doubleSessionBlocked, 'sesi ganda pada meja yang sama ditolak');

  await pauseBilliardSession(billiard.id, cashier.id);
  await resumeBilliardSession(billiard.id, cashier.id);

  const cashierOrder = await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: billiard.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1, note: 'Integration test' }],
  });
  assert(cashierOrder.status === 'accepted', 'order kasir langsung accepted');
  const [ingredientAfterOrder] = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, testIngredient.id))
    .limit(1);
  assert(ingredientAfterOrder?.stockQty === 98, 'resep memotong stok bahan atomik');

  const rejectCandidate = await placeOrder({
    actor: { type: 'customer' },
    tableId: cafe.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1 }],
  });
  await rejectOrder(rejectCandidate.orderId, cashier.id, 'Integration restore test');
  const [ingredientAfterReject] = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, testIngredient.id))
    .limit(1);
  assert(ingredientAfterReject?.stockQty === 98, 'reject order mengembalikan stok bahan');
  const [rejectBill] = await db
    .select({ id: schema.bills.id })
    .from(schema.bills)
    .where(and(eq(schema.bills.tableId, cafe.id), eq(schema.bills.status, 'open')))
    .limit(1);
  if (rejectBill) await db.delete(schema.bills).where(eq(schema.bills.id, rejectBill.id));

  let voidBlocked = false;
  try {
    await voidBill(started.billId, cashier.id, 'should fail while running');
  } catch (error) {
    voidBlocked = error instanceof Error && error.message.includes('Stop sesi');
  }
  assert(voidBlocked, 'void bill saat sesi aktif ditolak');

  const stopped = await stopBilliardSession(billiard.id, cashier.id);
  assert(stopped.amount >= 25_000, 'amount minimal 30 menit diterapkan');
  assert(stopped.billTotal > stopped.amount, 'bill total termasuk F&B');

  let closeBlocked = false;
  try {
    await closeShift(cashier.id, 500_000, 'should fail');
  } catch (error) {
    closeBlocked = error instanceof Error && error.message.includes('bill open');
  }
  assert(closeBlocked, 'tutup shift dengan bill open ditolak');

  const paid = await payBill(started.billId, cashier.id, [
    { method: 'cash', amount: stopped.billTotal, tendered: stopped.billTotal + 50_000 },
  ]);
  assert(paid.total === stopped.billTotal, 'payment sama dengan total bill');
  assert(paid.change === 50_000, 'kembalian dihitung');

  await markTableReady(billiard.id, cashier.id);

  const [owner] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.role, 'owner'))
    .limit(1);
  assert(owner, 'owner seed tersedia');

  const [paymentRow] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.billId, started.billId))
    .limit(1);
  assert(paymentRow, 'payment bill tersedia');
  const refund = await refundPayment(owner.id, {
    billId: started.billId,
    paymentId: paymentRow.id,
    amount: 10_000,
    category: 'fnb',
    reason: 'Integration refund',
  });
  assert(refund.refundedTotal === 10_000, 'refund partial tersimpan');

  let overRefundBlocked = false;
  try {
    await refundPayment(owner.id, {
      billId: started.billId,
      paymentId: paymentRow.id,
      amount: paymentRow.amount,
      category: 'fnb',
      reason: 'should fail',
    });
  } catch (error) {
    overRefundBlocked = error instanceof Error && error.message.includes('melebihi sisa');
  }
  assert(overRefundBlocked, 'refund melebihi sisa payment ditolak');

  const closed = await closeShift(
    cashier.id,
    500_000 + stopped.billTotal - 10_000,
    'Integration shift close',
  );
  assert(closed.difference === 0, 'kas shift match setelah refund');
  assert(closed.expectedCash === 500_000 + stopped.billTotal - 10_000, 'expected cash net refund');

  /* --------------------------- Customer + KDS ------------------------------ */
  const idem = crypto.randomUUID();
  const customerOrder = await placeOrder({
    actor: { type: 'customer' },
    tableId: cafe.id,
    idempotencyKey: idem,
    items: [{ menuItemId: wings.id, qty: 2, note: 'Pedas' }],
  });
  assert(customerOrder.status === 'pending', 'customer order pending');

  const duplicateOrder = await placeOrder({
    actor: { type: 'customer' },
    tableId: cafe.id,
    idempotencyKey: idem,
    items: [{ menuItemId: wings.id, qty: 2 }],
  });
  assert(duplicateOrder.duplicate === true, 'idempotency mengembalikan order yang sama');
  assert(duplicateOrder.orderId === customerOrder.orderId, 'order id sama');

  await approveOrder(customerOrder.orderId, cashier.id);
  const ready = await markStationReady(customerOrder.orderId, 'kitchen', cashier.id);
  assert(ready.status === 'ready', 'order ready setelah station selesai');
  await markOrderServed(customerOrder.orderId, cashier.id);

  const [cafeOrderRow] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, customerOrder.orderId))
    .limit(1);
  assert(cafeOrderRow?.status === 'served', 'order served tersimpan');

  /* ------------------------------ Oversell -------------------------------- */
  let oversellBlocked = false;
  try {
    await placeOrder({
      actor: { type: 'staff', id: cashier.id, role: 'cashier' },
      tableId: cafe.id,
      idempotencyKey: crypto.randomUUID(),
      items: [{ menuItemId: sirloin.id, qty: 1 }],
    });
  } catch (error) {
    oversellBlocked = error instanceof Error && error.message.includes('Stok');
  }
  assert(oversellBlocked, 'oversell stok 0 ditolak');

  /* ------------------------- Discount (owner only) ------------------------- */
  const [cafeBill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.tableId, cafe.id))
    .limit(1);
  assert(cafeBill, 'bill cafe ada');
  const discounted = await applyBillDiscount(
    cafeBill.id,
    owner.id,
    5_000,
    'Integration discount',
  );
  assert(discounted.discount === 5_000, 'diskon tersimpan');

  /* --------------------------- Reservation ------------------------------- */
  const [billiardTable] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B8'))
    .limit(1);
  assert(billiardTable, 'meja B8 tersedia');
  const reservationDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 86_400_000));
  const reservation = await createReservation(cashier.id, {
    tableId: billiardTable.id,
    guestName: 'Reservation Test',
    partySize: 2,
    date: reservationDate,
    startTime: '19:00',
    durationMinutes: 60,
    depositAmount: 50_000,
  });
  assert(reservation.code.startsWith('RES-'), 'reservasi dibuat');

  let overlapBlocked = false;
  try {
    await createReservation(cashier.id, {
      tableId: billiardTable.id,
      guestName: 'Overlap Test',
      partySize: 2,
      date: reservationDate,
      startTime: '19:30',
      durationMinutes: 60,
    });
  } catch (error) {
    overlapBlocked = error instanceof Error && error.message.includes('dibooking');
  }
  assert(overlapBlocked, 'reservasi overlap ditolak');
  await setReservationStatus(cashier.id, reservation.id, 'cancelled');

  const waitlist = await createWaitlistEntry(cashier.id, {
    guestName: 'Waitlist Test',
    partySize: 2,
    preference: 'billiard',
  });
  await setWaitlistStatus(cashier.id, waitlist.id, 'called');
  const seated = await setWaitlistStatus(cashier.id, waitlist.id, 'seated');
  assert(seated.status === 'seated', 'waitlist bisa dipanggil dan duduk');

  /* --------------------------- Rate schedule ----------------------------- */
  const [privateRate] = await db
    .select()
    .from(schema.billiardRates)
    .where(eq(schema.billiardRates.name, 'VIP Private Room'))
    .limit(1);
  assert(privateRate, 'rate VIP private tersedia');
  const schedule = await saveRateSchedule(owner.id, {
    tableId: billiardTable.id,
    rateId: privateRate.id,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startMinute: 0,
    endMinute: 1440,
    priority: 50,
  });
  const preview = await previewRateForTable(billiardTable.id);
  assert(preview.scheduleId === schedule.id, 'jadwal tarif aktif terdeteksi');
  assert(preview.rate?.id === privateRate.id, 'rate jadwal dipakai untuk preview');
  await toggleRateSchedule(owner.id, schedule.id);

  /* ------------------- Timeline tarif lintas happy hour ------------------ */
  const [b7Table] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B7'))
    .limit(1);
  assert(b7Table, 'meja B7 tersedia untuk timeline tarif');
  const timelineStart = new Date('2026-11-26T09:00:00.000Z'); // 16:00 WIB
  const timeline = await db.transaction((tx) =>
    buildRateTimelineForTable(tx, b7Table.id, timelineStart),
  );
  assert(timeline.length >= 2, 'timeline tarif punya beberapa segmen');
  assert(timeline[0].ratePerHour === 45_000, 'sebelum 17:00 memakai tarif happy hour');
  assert(
    timeline[0].endAt === '2026-11-26T10:00:00.000Z',
    'segmen happy hour berakhir tepat 17:00 WIB',
  );
  assert(timeline[1].ratePerHour === 60_000, 'setelah 17:00 tarif otomatis berubah');

  const [b4Table] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B4'))
    .limit(1);
  assert(b4Table, 'meja B4 tersedia untuk billing segmen');
  const segmentedStart = await startBilliardSession(
    b4Table.id,
    cashier.id,
    'Segmented Billing Guest',
  );
  const segmentBase = Date.now();
  const customSegments = [
    {
      startAt: new Date(segmentBase - 40 * 60_000).toISOString(),
      endAt: new Date(segmentBase - 10 * 60_000).toISOString(),
      rateName: 'Happy Hour',
      ratePerHour: 45_000,
      minMinutes: 30,
      incrementMinutes: 15,
      scheduleId: null,
    },
    {
      startAt: new Date(segmentBase - 10 * 60_000).toISOString(),
      endAt: new Date(segmentBase + 24 * 60 * 60_000).toISOString(),
      rateName: 'VIP',
      ratePerHour: 60_000,
      minMinutes: 30,
      incrementMinutes: 15,
      scheduleId: null,
    },
  ];
  await db
    .update(schema.billiardSessions)
    .set({
      startedAt: new Date(segmentBase - 40 * 60_000),
      ratePerHour: 45_000,
      minMinutes: 30,
      incrementMinutes: 15,
      rateSegments: customSegments,
      pauseLog: [],
    })
    .where(eq(schema.billiardSessions.id, segmentedStart.sessionId));
  const segmentedStop = await stopBilliardSession(b4Table.id, cashier.id);
  assert(segmentedStop.rateSegments.length === 2, 'stop sesi menyimpan dua rate segment');
  assert(segmentedStop.rateSegments[0].rateName === 'Happy Hour', 'segmen 1 tarif happy hour');
  assert(segmentedStop.rateSegments[1].rateName === 'VIP', 'segmen 2 tarif VIP');
  const [segmentedSessionRow] = await db
    .select()
    .from(schema.billiardSessions)
    .where(eq(schema.billiardSessions.id, segmentedStart.sessionId))
    .limit(1);
  assert(segmentedSessionRow?.endedAt, 'sesi segmented selesai');
  const segmentedExpected = computeSegmentedSessionBilling({
    startedAt: segmentedSessionRow.startedAt,
    endedAt: segmentedSessionRow.endedAt,
    pauses: segmentedSessionRow.pauseLog,
    segments: segmentedSessionRow.rateSegments,
    ratePerHour: segmentedSessionRow.ratePerHour,
    minMinutes: segmentedSessionRow.minMinutes,
    incrementMinutes: segmentedSessionRow.incrementMinutes,
  });
  assert(
    segmentedStop.amount === segmentedExpected.amount,
    'amount stop sama dengan billing segmented',
  );
  await payBill(segmentedStart.billId, cashier.id, [
    { method: 'cash', amount: segmentedStop.billTotal, tendered: segmentedStop.billTotal },
  ]);

  /* ------------------------------ Split bill ----------------------------- */
  const splitStart = await startBilliardSession(billiardTable.id, cashier.id, 'Split Guest');
  const splitOrder = await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: billiardTable.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1 }],
  });
  await stopBilliardSession(billiardTable.id, cashier.id);
  const [splitItem] = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, splitOrder.orderId))
    .limit(1);
  assert(splitItem, 'item split tersedia');
  const split = await createBillSplits(cashier.id, splitStart.billId, [
    { label: 'Pemain A', itemIds: [], sessionIds: [splitStart.sessionId] },
    { label: 'Pemain B', itemIds: [splitItem.id], sessionIds: [] },
  ]);
  assert(split.splits.length === 2, 'split bill punya dua group');
  const groupA = split.splits[0];
  const groupB = split.splits[1];
  const paidA = await payBillSplit(cashier.id, groupA.id, [
    { method: 'cash', amount: groupA.total },
  ]);
  assert(paidA.billClosed === false, 'bill tetap open setelah group pertama');
  const paidB = await payBillSplit(cashier.id, groupB.id, [
    { method: 'qris', amount: groupB.total },
  ]);
  assert(paidB.billClosed === true, 'bill lunas setelah semua group dibayar');

  /* ---------------------------- Gateway mock ----------------------------- */
  const [gatewayTable] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B6'))
    .limit(1);
  assert(gatewayTable, 'meja B6 tersedia');
  const gatewayStart = await startBilliardSession(gatewayTable.id, cashier.id, 'Gateway Guest');
  await stopBilliardSession(gatewayTable.id, cashier.id);
  const loyaltyMember = await saveMember(cashier.id, {
    name: 'Loyalty Test',
    phone: '081299998888',
    email: 'loyalty@example.com',
    consent: true,
  });
  await attachMemberToBill(cashier.id, gatewayStart.billId, loyaltyMember.id);
  const promotion = await applyPromotionToBill(cashier.id, gatewayStart.billId, 'WEEKEND10');
  assert(promotion.discount > 0, 'promo diterapkan ke bill');
  const intent = await createBillQrisIntent(cashier.id, gatewayStart.billId);
  assert(intent.provider === 'mock', 'gateway mock dipakai di test');
  const settled = await settleQrisIntent(intent.intentId);
  assert(settled.duplicate === false, 'settlement gateway tidak duplikat');
  const [gatewayBill] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, gatewayStart.billId))
    .limit(1);
  assert(gatewayBill?.status === 'paid', 'bill terbayar lewat gateway');
  const [loyaltyAfter] = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.id, loyaltyMember.id))
    .limit(1);
  assert((loyaltyAfter?.points ?? 0) > 0, 'poin member bertambah setelah lunas');
  const [promoAfter] = await db
    .select()
    .from(schema.promotions)
    .where(eq(schema.promotions.code, 'WEEKEND10'))
    .limit(1);
  assert(promoAfter?.usesCount === 1, 'kuota promo bertambah setelah lunas');
  const [receiptNotification] = await db
    .select()
    .from(schema.notificationOutbox)
    .where(eq(schema.notificationOutbox.billId, gatewayStart.billId))
    .limit(1);
  assert(receiptNotification, 'e-receipt masuk outbox');
  const processed = await processNotificationOutbox();
  assert(processed.sent >= 1, 'outbox e-receipt terkirim');
  const [gatewayPayment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.billId, gatewayStart.billId))
    .limit(1);
  assert(gatewayPayment, 'payment gateway tersedia');
  const gatewayRefund = await refundPayment(owner.id, {
    billId: gatewayStart.billId,
    paymentId: gatewayPayment.id,
    amount: 5_000,
    category: 'fnb',
    reason: 'Integration gateway refund',
  });
  assert(gatewayRefund.gatewayRefunded, 'refund gateway otomatis dipanggil');

  /* ------------------- Inventory: supplier, PO, opname ------------------ */
  const [beforePo] = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, testIngredient.id))
    .limit(1);
  assert(beforePo, 'bahan test tersedia sebelum PO');
  const supplier = await saveSupplier(owner.id, {
    name: 'Integration Supplier',
    phone: '081200007777',
    email: 'supplier@example.com',
  });
  const po = await savePurchaseOrder(owner.id, {
    supplierId: supplier.id,
    notes: 'Integration PO',
    items: [{ ingredientId: testIngredient.id, qty: 10, unitCost: 1200 }],
  });
  await setPurchaseOrderStatus(owner.id, po.id, 'received');
  const [afterPo] = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, testIngredient.id))
    .limit(1);
  assert(afterPo?.stockQty === beforePo.stockQty + 10, 'PO received menambah stok');
  assert(afterPo?.costPerUnit === 1200, 'PO received update harga modal');
  const opname = await postStockOpname(
    owner.id,
    [{ ingredientId: testIngredient.id, countedQty: 50 }],
    'Integration opname',
  );
  assert(opname.differenceUnits > 0, 'opname mencatat selisih');
  const [afterOpname] = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, testIngredient.id))
    .limit(1);
  assert(afterOpname?.stockQty === 50, 'opname menyesuaikan stok fisik');

  /* -------------------- Notification template & cron ------------------- */
  await saveNotificationTemplate(owner.id, {
    templateKey: 'test',
    name: 'Integration Template',
    channel: 'log',
    subject: 'Test {{memberName}}',
    body: 'Halo {{memberName}}, ini template integration.',
    active: true,
  });
  const notificationData = await getNotificationsData();
  assert(
    notificationData.templates.some(
      (template) => template.templateKey === 'test' && !template.isDefault,
    ),
    'template notifikasi kustom tersimpan',
  );
  const reservationSoon = new Date(Date.now() + 2 * 60 * 60_000);
  const soonDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reservationSoon);
  const soonTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(reservationSoon);
  const [reminderTable] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B2'))
    .limit(1);
  assert(reminderTable, 'meja B2 tersedia');
  const reminderReservation = await createReservation(cashier.id, {
    tableId: reminderTable.id,
    guestName: 'Reminder Guest',
    phone: '081277776666',
    partySize: 2,
    date: soonDate,
    startTime: soonTime,
    durationMinutes: 60,
  });
  const reminder = await enqueueReservationReminder(reminderReservation.id);
  assert(reminder, 'reminder reservasi masuk outbox');
  const processedReminder = await processNotificationOutbox();
  assert(processedReminder.sent >= 1, 'reminder reservasi terkirim');

  /* ------------------- Membership: voucher, poin, saldo ---------------- */
  const [cafe8] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'C8'))
    .limit(1);
  assert(cafe8, 'meja C8 tersedia');
  const memberBill = await openCafeBill(cafe8.id, cashier.id, 'Member Benefit Guest');
  await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: cafe8.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1 }],
  });
  await attachMemberToBill(cashier.id, memberBill.billId, loyaltyMember.id);
  const voucher = await issueVoucher(cashier.id, {
    memberId: loyaltyMember.id,
    name: 'Integration Voucher',
    type: 'fixed',
    value: 10_000,
    minSpend: 0,
  });
  const voucherResult = await applyVoucherToBill(cashier.id, memberBill.billId, voucher.code);
  assert(voucherResult.discount === 10_000, 'voucher member diterapkan');
  const topUp = await topUpMemberBalance(cashier.id, {
    memberId: loyaltyMember.id,
    amount: 200_000,
    method: 'cash',
    note: 'Integration topup',
  });
  assert(topUp.balance >= 200_000, 'top up saldo member tersimpan');
  const pointsResult = await redeemMemberPoints(cashier.id, memberBill.billId, 10);
  assert(pointsResult.points === 10, 'poin member ditukar');
  const [memberBillRow] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, memberBill.billId))
    .limit(1);
  assert(memberBillRow, 'bill member tersedia');
  await payBill(memberBill.billId, cashier.id, [
    { method: 'balance', amount: memberBillRow.total },
  ]);
  const [memberAfterBalance] = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.id, loyaltyMember.id))
    .limit(1);
  assert(
    (memberAfterBalance?.balance ?? 0) < topUp.balance,
    'saldo member terpotong saat pembayaran',
  );

  /* --------------------- Promotion stacking & bundle ------------------- */
  await db
    .update(schema.promotions)
    .set({ active: false })
    .where(eq(schema.promotions.autoApply, true));
  await savePromotion(owner.id, {
    code: 'INTEG10',
    name: 'Integration 10%',
    type: 'percent',
    value: 1000,
    minSpend: 0,
    appliesTo: 'all',
    stackable: true,
    active: true,
  });
  await savePromotion(owner.id, {
    code: 'INTEG5K',
    name: 'Integration 5k',
    type: 'fixed',
    value: 5_000,
    minSpend: 0,
    appliesTo: 'all',
    stackable: true,
    active: true,
  });
  const [cafe9] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'C9'))
    .limit(1);
  assert(cafe9, 'meja C9 tersedia');
  const promoBill = await openCafeBill(cafe9.id, cashier.id, 'Promo Stack Guest');
  await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: cafe9.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1 }],
  });
  const promoA = await applyPromotionToBill(cashier.id, promoBill.billId, 'INTEG10');
  const promoB = await applyPromotionToBill(cashier.id, promoBill.billId, 'INTEG5K');
  assert(promoA.discount > 0 && promoB.discount === 5_000, 'dua promo stackable diterapkan');
  const [promoBillRow] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, promoBill.billId))
    .limit(1);
  assert(
    promoBillRow?.promoDiscountAmount === promoA.discount + 5_000,
    'total diskon stacking benar',
  );
  await voidBill(promoBill.billId, owner.id, 'Integration cleanup promo');

  const [water] = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.name, 'Mineral Water'))
    .limit(1);
  assert(water, 'menu mineral water tersedia');
  await savePromotion(owner.id, {
    code: 'INTEGBUNDLE',
    name: 'Integration Bundle',
    type: 'bundle',
    value: 0,
    minSpend: 0,
    appliesTo: 'fnb',
    bundlePrice: 40_000,
    bundleItemIds: [wings.id, water.id],
    active: true,
  });
  const [cafe10] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'C10'))
    .limit(1);
  assert(cafe10, 'meja C10 tersedia');
  const bundleBill = await openCafeBill(cafe10.id, cashier.id, 'Bundle Guest');
  await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: cafe10.id,
    idempotencyKey: crypto.randomUUID(),
    items: [
      { menuItemId: wings.id, qty: 1 },
      { menuItemId: water.id, qty: 1 },
    ],
  });
  const bundleResult = await applyPromotionToBill(cashier.id, bundleBill.billId, 'INTEGBUNDLE');
  assert(bundleResult.discount === 13_000, 'bundle menghitung selisih harga paket');
  await voidBill(bundleBill.billId, owner.id, 'Integration cleanup bundle');

  /* ----------------------- Overtime & no-show -------------------------- */
  await savePenaltyRule(owner.id, {
    name: 'Integration Overtime',
    type: 'overtime',
    defaultAmount: 0,
    graceMinutes: 10,
    ratePerHour: 50_000,
    autoApply: true,
    active: true,
  });
  const [b3] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B3'))
    .limit(1);
  assert(b3, 'meja B3 tersedia');
  const overtimeStart = await startBilliardSession(b3.id, cashier.id, 'Overtime Guest', 15);
  await db
    .update(schema.billiardSessions)
    .set({ startedAt: new Date(Date.now() - 40 * 60_000) })
    .where(eq(schema.billiardSessions.id, overtimeStart.sessionId));
  const overtimeStop = await stopBilliardSession(b3.id, cashier.id);
  assert(overtimeStop.overtimePenalty > 0, 'denda overtime otomatis dibuat');
  await payBill(overtimeStart.billId, cashier.id, [
    { method: 'cash', amount: overtimeStop.billTotal, tendered: overtimeStop.billTotal },
  ]);

  const noShowReservation = await createReservation(cashier.id, {
    tableId: b3.id,
    guestName: 'No Show Guest',
    phone: '081255554444',
    partySize: 2,
    date: soonDate,
    startTime: soonTime,
    durationMinutes: 60,
    depositAmount: 50_000,
  });
  await setReservationDeposit(cashier.id, noShowReservation.id, 'paid');
  const noShow = await setReservationStatus(cashier.id, noShowReservation.id, 'no_show');
  assert(noShow.depositStatus === 'forfeited', 'deposit no-show di-forfeit');
  const [noShowPenalty] = await db
    .select()
    .from(schema.penalties)
    .where(eq(schema.penalties.reservationId, noShowReservation.id))
    .limit(1);
  assert(noShowPenalty?.amount === 50_000, 'penalti no-show tercatat');

  /* ------------------------- Split QRIS gateway ------------------------ */
  const [b7] = await db
    .select()
    .from(schema.venueTables)
    .where(eq(schema.venueTables.code, 'B7'))
    .limit(1);
  assert(b7, 'meja B7 tersedia');
  const splitQrisStart = await startBilliardSession(b7.id, cashier.id, 'Split QRIS Guest');
  const splitQrisOrder = await placeOrder({
    actor: { type: 'staff', id: cashier.id, role: 'cashier' },
    tableId: b7.id,
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: wings.id, qty: 1 }],
  });
  await stopBilliardSession(b7.id, cashier.id);
  const [splitQrisItem] = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, splitQrisOrder.orderId))
    .limit(1);
  assert(splitQrisItem, 'item split QRIS tersedia');
  const splitQris = await createBillSplits(cashier.id, splitQrisStart.billId, [
    { label: 'QR Group', itemIds: [], sessionIds: [splitQrisStart.sessionId] },
    { label: 'Cash Group', itemIds: [splitQrisItem.id], sessionIds: [] },
  ]);
  const splitQrIntent = await createBillSplitQrisIntent(cashier.id, splitQris.splits[0].id);
  const splitQrPaid = await simulateMockIntentPaid(cashier.id, splitQrIntent.intentId);
  assert(
    (splitQrPaid as { billClosed?: boolean }).billClosed === false,
    'split QRIS hanya menutup group pertama',
  );
  const splitCashPaid = await payBillSplit(cashier.id, splitQris.splits[1].id, [
    { method: 'cash', amount: splitQris.splits[1].total },
  ]);
  assert(splitCashPaid.billClosed === true, 'bill lunas setelah semua group dibayar');

  /* ---------------------------- Print queue ---------------------------- */
  const queuedPrintJobs = await claimPrintJobs('integration-agent', 20);
  assert(queuedPrintJobs.length > 0, 'print job struk/kitchen masuk antrean');
  await completePrintJob(queuedPrintJobs[0].id, 'integration-agent', true);
  const [printedJob] = await db
    .select()
    .from(schema.printJobs)
    .where(eq(schema.printJobs.id, queuedPrintJobs[0].id))
    .limit(1);
  assert(printedJob?.status === 'printed', 'print job ditandai printed');

  /* --------------------------- Multi-outlet ---------------------------- */
  const secondOutlet = await saveOutlet(owner.id, {
    code: 'CAB2',
    name: 'Cue & Tap Cabang 2',
    address: 'Bandung',
  });
  process.env.CUETAP_OUTLET_ID = secondOutlet.id;
  const [outletRate] = await db
    .select()
    .from(schema.billiardRates)
    .where(eq(schema.billiardRates.outletId, secondOutlet.id))
    .limit(1);
  assert(outletRate, 'outlet baru mendapat rate default');
  await saveTable(owner.id, {
    code: 'X1',
    kind: 'billiard',
    zone: 'Test Outlet',
    capacity: 4,
    allowSelfOrder: false,
    rateId: outletRate.id,
    sortOrder: 1,
  });
  const outletCashier = await getCashierData();
  assert(outletCashier.tables.length === 1, 'meja outlet baru ter-scope');
  assert(outletCashier.menuItems.length === 0, 'menu outlet baru tidak bercampur');
  delete process.env.CUETAP_OUTLET_ID;

  console.log('INTEGRATION PASS', {
    shift: shift.shiftId,
    session: started.sessionId,
    billTotal: stopped.billTotal,
    orderNumber: customerOrder.orderNumber,
    discountedTotal: discounted.total,
  });

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
