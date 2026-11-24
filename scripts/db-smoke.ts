import { getDb } from '../lib/db';
import { bills, menuItems, orders, payments, profiles, venueTables } from '../lib/db/schema';

async function main() {
  const db = await getDb();
  const [profileRows, tableRows, menuRows, billRows, orderRows, paymentRows] = await Promise.all([
    db.select().from(profiles),
    db.select().from(venueTables),
    db.select().from(menuItems),
    db.select().from(bills),
    db.select().from(orders),
    db.select().from(payments),
  ]);
  console.log({
    profiles: profileRows.length,
    tables: tableRows.length,
    menu: menuRows.length,
    bills: billRows.length,
    orders: orderRows.length,
    payments: paymentRows.length,
    openBills: billRows.filter((b) => b.status === 'open').length,
    paidBills: billRows.filter((b) => b.status === 'paid').length,
  });
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
