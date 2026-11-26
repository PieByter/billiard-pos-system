import { rmSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';

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
    setReservationStatus,
    setWaitlistStatus,
  } = await import('../lib/services/reservations');
  const { saveRateSchedule, previewRateForTable, toggleRateSchedule } = await import(
    '../lib/services/rate-schedules'
  );
  const { createBillSplits, payBillSplit } = await import('../lib/services/splits');
  const { createBillQrisIntent, settleQrisIntent } = await import(
    '../lib/services/payment-intents'
  );
  const { saveMember, attachMemberToBill } = await import('../lib/services/membership');
  const { applyPromotionToBill } = await import('../lib/services/promotions');
  const { processNotificationOutbox } = await import('../lib/services/notifications');
  const { saveIngredient, saveRecipe } = await import('../lib/services/inventory');

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
