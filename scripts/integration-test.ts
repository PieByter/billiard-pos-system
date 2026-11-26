import { rmSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function main() {
  const dbPath = path.resolve('.data/integration-test');
  rmSync(dbPath, { recursive: true, force: true });
  process.env.DEMO_DB_PATH = dbPath;
  process.env.CUETAP_SEED_MODE = 'catalog';
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
  const { placeOrder, approveOrder, markStationReady, markOrderServed } = await import(
    '../lib/services/orders'
  );
  const { payBill, applyBillDiscount, voidBill } = await import('../lib/services/payments');
  const { refundPayment } = await import('../lib/services/refunds');
  const { openShift, closeShift } = await import('../lib/services/shifts');

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
