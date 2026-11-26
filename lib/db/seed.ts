import { hashSync } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import {
  billableElapsedSeconds,
  computeBillTotals,
  computeSessionAmount,
  computeSessionAmountFromSeconds,
} from '../billing';
import { DEFAULT_OUTLET_ID, DEMO_PASSWORD, SERVICE_RATE_BPS, TAX_RATE_BPS } from '../constants';
import { randomToken, yymmdd } from '../ids';
import type { AppDb } from './index';
import * as s from './schema';

type SeedOptions = { demo?: boolean };

type MenuDef = {
  category: string;
  name: string;
  description: string;
  price: number;
  station: 'kitchen' | 'bar';
  stock: number | null;
  icon: string;
  bestSeller?: boolean;
};

let orderSeq = 1000;

function nextOrderNumber() {
  orderSeq += 1;
  return `ORD-${orderSeq}`;
}

const billSeq = new Map<string, number>();
function nextBillNumber(date: Date) {
  const key = yymmdd(date);
  const seq = (billSeq.get(key) ?? 0) + 1;
  billSeq.set(key, seq);
  return `BLL-${key}-${String(seq).padStart(4, '0')}`;
}

function minutesAgo(minutes: number, base = new Date()): Date {
  return new Date(base.getTime() - minutes * 60_000);
}

function atTime(date: Date, hour: number, minute: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

async function ensureLoyaltyDefaults(db: AppDb, demo: boolean): Promise<void> {
  const [existingTier] = await db
    .select({ id: s.memberTiers.id })
    .from(s.memberTiers)
    .limit(1);
  let tierRows: Array<typeof s.memberTiers.$inferSelect> = [];
  if (!existingTier) {
    tierRows = await db
      .insert(s.memberTiers)
      .values([
        { name: 'Bronze', minSpend: 0, discountBps: 0, pointsMultiplierBps: 10_000, sortOrder: 1 },
        {
          name: 'Silver',
          minSpend: 500_000,
          discountBps: 500,
          pointsMultiplierBps: 12_500,
          sortOrder: 2,
        },
        {
          name: 'Gold',
          minSpend: 2_000_000,
          discountBps: 1000,
          pointsMultiplierBps: 15_000,
          sortOrder: 3,
        },
      ])
      .returning();
  } else {
    tierRows = await db.select().from(s.memberTiers);
  }
  if (!demo) return;

  const tierByName = new Map(tierRows.map((tier) => [tier.name, tier]));
  const [existingMember] = await db.select({ id: s.members.id }).from(s.members).limit(1);
  if (!existingMember && tierByName.get('Gold') && tierByName.get('Silver')) {
    await db.insert(s.members).values([
      {
        code: 'MBR-DEMO01',
        name: 'Kevin Sanjaya',
        phone: '081200001111',
        email: 'kevin@example.com',
        tierId: tierByName.get('Gold')!.id,
        points: 1_250,
        totalSpend: 3_250_000,
        consent: true,
      },
      {
        code: 'MBR-DEMO02',
        name: 'Dewi Anggraini',
        phone: '081200002222',
        email: 'dewi@example.com',
        tierId: tierByName.get('Silver')!.id,
        points: 420,
        totalSpend: 780_000,
        consent: true,
      },
    ]);
  }

  const [existingVoucher] = await db
    .select({ id: s.vouchers.id })
    .from(s.vouchers)
    .limit(1);
  if (!existingVoucher) {
    const memberRows = await db.select().from(s.members);
    if (memberRows[0]) {
      await db.insert(s.vouchers).values([
        {
          code: 'VCH-DEMO50',
          memberId: memberRows[0].id,
          name: 'Voucher loyalitas Rp50.000',
          type: 'fixed',
          value: 50_000,
          minSpend: 100_000,
        },
        {
          code: 'VCH-DEMO10',
          name: 'Voucher semua member 10%',
          type: 'percent',
          value: 1000,
          minSpend: 75_000,
        },
      ]);
      await db
        .update(s.members)
        .set({ balance: 250_000 })
        .where(eq(s.members.id, memberRows[0].id));
      await db.insert(s.memberDeposits).values({
        outletId: DEFAULT_OUTLET_ID,
        memberId: memberRows[0].id,
        type: 'topup',
        method: 'cash',
        amount: 250_000,
        note: 'Seed saldo demo',
      });
    }
  }

  const [existingPromo] = await db
    .select({ id: s.promotions.id })
    .from(s.promotions)
    .limit(1);
  if (!existingPromo) {
    await db.insert(s.promotions).values([
      {
        code: 'WEEKEND10',
        name: 'Weekend 10%',
        description: 'Diskon 10% semua item, maksimal Rp50.000.',
        type: 'percent',
        value: 1000,
        maxDiscount: 50_000,
        active: true,
      },
      {
        code: 'MEMBER20',
        name: 'Member 20%',
        description: 'Diskon member 20%, maksimal Rp100.000.',
        type: 'percent',
        value: 2000,
        maxDiscount: 100_000,
        memberOnly: true,
        active: true,
      },
    ]);
  }

  const [existingAuto] = await db
    .select({ id: s.promotions.id })
    .from(s.promotions)
    .where(eq(s.promotions.autoApply, true))
    .limit(1);
  if (!existingAuto) {
    await db.insert(s.promotions).values({
      code: 'HAPPYHOUR15',
      name: 'Happy Hour 15%',
      description: 'Otomatis aktif Senin-Jumat 14.00-17.00.',
      type: 'percent',
      value: 1500,
      maxDiscount: 75_000,
      stackable: true,
      autoApply: true,
      daysOfWeek: [1, 2, 3, 4, 5],
      startMinute: 14 * 60,
      endMinute: 17 * 60,
      active: true,
    });
  }
}

async function ensureOpsDefaults(db: AppDb, demo: boolean): Promise<void> {
  if (!demo) return;

  const [existingIngredient] = await db
    .select({ id: s.ingredients.id })
    .from(s.ingredients)
    .limit(1);
  if (!existingIngredient) {
    const ingredientRows = await db
      .insert(s.ingredients)
      .values([
        { name: 'Coffee Beans', unit: 'g', stockQty: 5000, minStock: 500, costPerUnit: 200 },
        { name: 'Susu Segar', unit: 'ml', stockQty: 8000, minStock: 1000, costPerUnit: 18 },
        { name: 'Chicken Wings', unit: 'pcs', stockQty: 200, minStock: 20, costPerUnit: 12000 },
        { name: 'Beef Patty', unit: 'pcs', stockQty: 120, minStock: 12, costPerUnit: 18000 },
        { name: 'Mineral Water', unit: 'pcs', stockQty: 240, minStock: 24, costPerUnit: 2500 },
      ])
      .returning();
    const ingredientByName = new Map(ingredientRows.map((row) => [row.name, row]));
    const menuRows = await db.select().from(s.menuItems);
    const menuByName = new Map(menuRows.map((row) => [row.name, row]));
    const recipeDefs: Array<[string, string, number]> = [
      ['Americano', 'Coffee Beans', 18],
      ['Signature Iced Latte', 'Coffee Beans', 18],
      ['Signature Iced Latte', 'Susu Segar', 150],
      ['Chicken Wings BBQ', 'Chicken Wings', 6],
      ['Cue & Tap Signature Burger', 'Beef Patty', 2],
      ['Mineral Water', 'Mineral Water', 1],
    ];
    const recipeValues = recipeDefs
      .map(([menuName, ingredientName, qty]) => {
        const menu = menuByName.get(menuName);
        const ingredient = ingredientByName.get(ingredientName);
        return menu && ingredient ? { menuItemId: menu.id, ingredientId: ingredient.id, qty } : null;
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    if (recipeValues.length) {
      await db.insert(s.recipes).values(recipeValues).onConflictDoNothing();
    }
  }

  const [existingAsset] = await db.select({ id: s.assets.id }).from(s.assets).limit(1);
  if (!existingAsset) {
    await db.insert(s.assets).values([
      { code: 'CUE-01', name: 'Cue House 1', type: 'cue' },
      { code: 'CUE-02', name: 'Cue House 2', type: 'cue' },
      { code: 'KIT-01', name: 'Kit cue ball set', type: 'equipment' },
    ]);
  }

  const [existingRule] = await db
    .select({ id: s.penaltyRules.id })
    .from(s.penaltyRules)
    .limit(1);
  if (!existingRule) {
    await db.insert(s.penaltyRules).values([
      { name: 'Kerusakan cue', type: 'damage', defaultAmount: 100_000, maxAmount: 500_000 },
      { name: 'Kehilangan bola', type: 'loss', defaultAmount: 50_000, maxAmount: 100_000 },
      {
        name: 'Overtime sesi',
        type: 'overtime',
        defaultAmount: 50_000,
        maxAmount: 250_000,
        graceMinutes: 10,
        ratePerHour: 50_000,
        autoApply: true,
      },
      { name: 'No-show reservasi', type: 'no_show', defaultAmount: 50_000, autoApply: true },
    ]);
  }

  const [existingSupplier] = await db
    .select({ id: s.suppliers.id })
    .from(s.suppliers)
    .limit(1);
  if (!existingSupplier) {
    await db.insert(s.suppliers).values({
      name: 'PT Sumber Bahan Nusantara',
      contactName: 'Rina',
      phone: '081200009999',
      email: 'sales@sumberbahan.example',
      address: 'Jakarta',
      notes: 'Supplier bahan kering & minuman. Termin 14 hari.',
    });
  }
}

export async function seedDatabase(db: AppDb, options: SeedOptions = {}): Promise<void> {
  await db
    .insert(s.outlets)
    .values({
      id: DEFAULT_OUTLET_ID,
      code: 'MAIN',
      name: 'Cue & Tap Main',
      address: 'Jl. Cue Sports No. 8, Jakarta',
      timezone: 'Asia/Jakarta',
    })
    .onConflictDoNothing();

  const existing = await db.select({ id: s.profiles.id }).from(s.profiles).limit(1);
  if (existing.length > 0) {
    await ensureLoyaltyDefaults(db, options.demo !== false);
    await ensureOpsDefaults(db, options.demo !== false);
    return;
  }

  const demo = options.demo !== false;
  const now = new Date();
  const passwordHash = hashSync(DEMO_PASSWORD, 10);

  await db.transaction(async (tx) => {
    /* ------------------------------ Staff ------------------------------ */
    const staffRows = await tx
      .insert(s.profiles)
      .values([
        {
          id: crypto.randomUUID(),
          email: 'owner@cuetap.id',
          name: 'Hendra Wijaya',
          role: 'owner',
          passwordHash,
        },
        {
          id: crypto.randomUUID(),
          email: 'kasir@cuetap.id',
          name: 'Budi Santoso',
          role: 'cashier',
          passwordHash,
        },
        {
          id: crypto.randomUUID(),
          email: 'dapur@cuetap.id',
          name: 'Reno Pratama',
          role: 'kitchen',
          passwordHash,
        },
      ])
      .returning();
    const owner = staffRows[0];
    const cashier = staffRows[1];

    await tx.insert(s.venueSettings).values({
      id: 'default',
      venueName: 'Cue & Tap',
      address: 'Jl. Cue Sports No. 8 · Jakarta',
      timezone: 'Asia/Jakarta',
      taxRateBps: TAX_RATE_BPS,
      serviceRateBps: SERVICE_RATE_BPS,
      warningMinutes: 15,
      receiptFooter: 'Terima kasih sudah bermain & ngopi di Cue & Tap.',
      updatedBy: owner.id,
    });

    /* --------------------------- Loyalty ------------------------------- */
    const tierRows = await tx
      .insert(s.memberTiers)
      .values([
        {
          name: 'Bronze',
          minSpend: 0,
          discountBps: 0,
          pointsMultiplierBps: 10_000,
          sortOrder: 1,
        },
        {
          name: 'Silver',
          minSpend: 500_000,
          discountBps: 500,
          pointsMultiplierBps: 12_500,
          sortOrder: 2,
        },
        {
          name: 'Gold',
          minSpend: 2_000_000,
          discountBps: 1000,
          pointsMultiplierBps: 15_000,
          sortOrder: 3,
        },
      ])
      .returning();
    const tierByName = new Map(tierRows.map((tier) => [tier.name, tier]));
    await tx.insert(s.members).values([
      {
        code: 'MBR-DEMO01',
        name: 'Kevin Sanjaya',
        phone: '081200001111',
        email: 'kevin@example.com',
        tierId: tierByName.get('Gold')!.id,
        points: 1_250,
        totalSpend: 3_250_000,
        consent: true,
      },
      {
        code: 'MBR-DEMO02',
        name: 'Dewi Anggraini',
        phone: '081200002222',
        email: 'dewi@example.com',
        tierId: tierByName.get('Silver')!.id,
        points: 420,
        totalSpend: 780_000,
        consent: true,
      },
    ]);
    await tx.insert(s.promotions).values([
      {
        code: 'WEEKEND10',
        name: 'Weekend 10%',
        description: 'Diskon 10% semua item, maksimal Rp50.000.',
        type: 'percent',
        value: 1000,
        maxDiscount: 50_000,
        active: true,
      },
      {
        code: 'MEMBER20',
        name: 'Member 20%',
        description: 'Diskon member 20%, maksimal Rp100.000.',
        type: 'percent',
        value: 2000,
        maxDiscount: 100_000,
        memberOnly: true,
        active: true,
      },
    ]);

    /* ------------------------------ Rates ------------------------------ */
    const rateRows = await tx
      .insert(s.billiardRates)
      .values([
        {
          name: 'Standard 9ft',
          description: 'Meja reguler, tarif sepanjang hari',
          pricePerHour: 50_000,
          minMinutes: 30,
          incrementMinutes: 15,
          sortOrder: 1,
        },
        {
          name: 'VIP 9ft',
          description: 'Meja VIP dengan cue premium & lounge seat',
          pricePerHour: 60_000,
          minMinutes: 30,
          incrementMinutes: 15,
          sortOrder: 2,
        },
        {
          name: 'Happy Hour',
          description: 'Tarif khusus weekday sebelum jam 17.00',
          pricePerHour: 45_000,
          minMinutes: 30,
          incrementMinutes: 15,
          sortOrder: 3,
        },
        {
          name: 'VIP Private Room',
          description: 'Private room dengan sound system & private bar',
          pricePerHour: 100_000,
          minMinutes: 60,
          incrementMinutes: 30,
          sortOrder: 4,
        },
      ])
      .returning();
    const rateByName = new Map(rateRows.map((rate) => [rate.name, rate]));

    /* ------------------------------ Tables ----------------------------- */
    const tableDefs: Array<{
      code: string;
      kind: 'billiard' | 'cafe';
      zone: string;
      capacity: number;
      selfOrder: boolean;
      rate?: string;
      cleaningMinutesAgo?: number;
    }> = [
      { code: 'B1', kind: 'billiard', zone: 'VIP 9FT', capacity: 4, selfOrder: false, rate: 'VIP 9ft' },
      { code: 'B2', kind: 'billiard', zone: 'Standard 9ft', capacity: 4, selfOrder: false, rate: 'Standard 9ft' },
      { code: 'B3', kind: 'billiard', zone: 'Standard 9ft', capacity: 4, selfOrder: false, rate: 'Standard 9ft' },
      { code: 'B4', kind: 'billiard', zone: 'Standard 9ft', capacity: 4, selfOrder: false, rate: 'Standard 9ft' },
      {
        code: 'B5',
        kind: 'billiard',
        zone: 'Standard 9ft',
        capacity: 4,
        selfOrder: false,
        rate: 'Standard 9ft',
        cleaningMinutesAgo: 3,
      },
      { code: 'B6', kind: 'billiard', zone: 'VIP Room 2', capacity: 6, selfOrder: false, rate: 'VIP Private Room' },
      { code: 'B7', kind: 'billiard', zone: 'Standard 9ft', capacity: 4, selfOrder: false, rate: 'Happy Hour' },
      { code: 'B8', kind: 'billiard', zone: 'VIP 9ft', capacity: 4, selfOrder: false, rate: 'VIP 9ft' },
      { code: 'C1', kind: 'cafe', zone: 'Indoor Sofa', capacity: 4, selfOrder: true },
      { code: 'C2', kind: 'cafe', zone: 'Bar Stool', capacity: 2, selfOrder: true },
      { code: 'C3', kind: 'cafe', zone: 'VIP Balcony', capacity: 6, selfOrder: true },
      { code: 'C4', kind: 'cafe', zone: 'Window Seat', capacity: 2, selfOrder: true },
      { code: 'C5', kind: 'cafe', zone: 'Lounge Sofa', capacity: 4, selfOrder: true },
      { code: 'C6', kind: 'cafe', zone: 'Indoor Sofa', capacity: 4, selfOrder: true },
      { code: 'C7', kind: 'cafe', zone: 'Outdoor Deck', capacity: 4, selfOrder: true },
      { code: 'C8', kind: 'cafe', zone: 'Bar Stool', capacity: 2, selfOrder: true },
      { code: 'C9', kind: 'cafe', zone: 'Lounge Sofa', capacity: 6, selfOrder: true },
      { code: 'C10', kind: 'cafe', zone: 'Window Seat', capacity: 2, selfOrder: true },
      { code: 'C11', kind: 'cafe', zone: 'Outdoor Deck', capacity: 4, selfOrder: true },
      { code: 'C12', kind: 'cafe', zone: 'Indoor Sofa', capacity: 4, selfOrder: true },
    ];

    const tableRows = await tx
      .insert(s.venueTables)
      .values(
        tableDefs.map((table, index) => ({
          code: table.code,
          kind: table.kind,
          zone: table.zone,
          capacity: table.capacity,
          allowSelfOrder: table.selfOrder,
          qrToken: `${table.code.toLowerCase()}-${randomToken(16)}`,
          rateId: table.rate ? rateByName.get(table.rate)!.id : null,
          needsCleaningAt: table.cleaningMinutesAgo
            ? minutesAgo(table.cleaningMinutesAgo, now)
            : null,
          sortOrder: index + 1,
        })),
      )
      .returning();
    const tableByCode = new Map(tableRows.map((table) => [table.code, table]));

    /* ------------------------- Rate schedules -------------------------- */
    const happyHourTable = tableByCode.get('B7');
    const vipRate = rateByName.get('VIP 9ft');
    if (happyHourTable && vipRate) {
      await tx.insert(s.tableRateSchedules).values({
        tableId: happyHourTable.id,
        rateId: vipRate.id,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        startMinute: 17 * 60,
        endMinute: 23 * 60,
        priority: 10,
      });
    }

    /* --------------------------- Menu catalog -------------------------- */
    const categoryDefs = [
      { name: 'Coffee & Tea', icon: 'local_cafe' },
      { name: 'Mocktails & Cocktails', icon: 'local_bar' },
      { name: 'Billiard Bites', icon: 'tapas' },
      { name: 'Main Course', icon: 'restaurant' },
      { name: 'Pizza & Pasta', icon: 'local_pizza' },
      { name: 'Dessert', icon: 'icecream' },
      { name: 'Beer & Soft Drinks', icon: 'sports_bar' },
    ];
    const categoryRows = await tx
      .insert(s.menuCategories)
      .values(
        categoryDefs.map((category, index) => ({
          name: category.name,
          icon: category.icon,
          sortOrder: index + 1,
        })),
      )
      .returning();
    const categoryByName = new Map(categoryRows.map((category) => [category.name, category]));

    const menuDefs: MenuDef[] = [
      {
        category: 'Main Course',
        name: 'Wagyu Fried Rice Special',
        description: 'Nasi goreng wagyu dengan aroma truffle, telur mata sapi, dan kerupuk udang renyah.',
        price: 55_000,
        station: 'kitchen',
        stock: 8,
        icon: 'rice_bowl',
        bestSeller: true,
      },
      {
        category: 'Main Course',
        name: 'Cue & Tap Signature Burger',
        description: 'Double beef patty, smoked cheddar, caramelized onion, brioche bun bakar.',
        price: 68_000,
        station: 'kitchen',
        stock: 12,
        icon: 'lunch_dining',
        bestSeller: true,
      },
      {
        category: 'Billiard Bites',
        name: 'Truffle Parmesan Fries',
        description: 'French fries renyah dengan truffle oil murni dan parutan keju parmesan.',
        price: 38_000,
        station: 'kitchen',
        stock: 24,
        icon: 'tapas',
        bestSeller: true,
      },
      {
        category: 'Mocktails & Cocktails',
        name: 'Emerald Mojito Mocktail',
        description: 'Mint segar, lime zest, club soda, dan melon nectar khas billiard table green.',
        price: 32_000,
        station: 'bar',
        stock: null,
        icon: 'local_drink',
        bestSeller: true,
      },
      {
        category: 'Main Course',
        name: 'Sirloin Steak 200g',
        description: 'Sirloin panggang dengan blackpepper sauce, mashed potato, dan sayur.',
        price: 120_000,
        station: 'kitchen',
        stock: 0,
        icon: 'kebab_dining',
      },
      {
        category: 'Main Course',
        name: 'Crispy Chicken Steak',
        description: 'Chicken steak crispy dengan mushroom sauce dan french fries.',
        price: 65_000,
        station: 'kitchen',
        stock: 14,
        icon: 'set_meal',
      },
      {
        category: 'Main Course',
        name: 'Club Sandwich',
        description: 'Triple-decker sandwich dengan ayam panggang, telur, dan bacon.',
        price: 48_000,
        station: 'kitchen',
        stock: 10,
        icon: 'breakfast_dining',
      },
      {
        category: 'Billiard Bites',
        name: 'Chicken Wings BBQ',
        description: 'Sayap ayam juicy dengan saus BBQ smoky dan coleslaw.',
        price: 45_000,
        station: 'kitchen',
        stock: 18,
        icon: 'local_fire_department',
        bestSeller: true,
      },
      {
        category: 'Billiard Bites',
        name: 'Beef Nachos',
        description: 'Tortilla chips, beef bolognese, cheddar, jalapeño, dan sour cream.',
        price: 42_000,
        station: 'kitchen',
        stock: 16,
        icon: 'lunch_dining',
      },
      {
        category: 'Billiard Bites',
        name: 'Crispy Tofu Salt & Pepper',
        description: 'Tahu crispy dengan cabai rawit iris, daun bawang, dan five spice.',
        price: 35_000,
        station: 'kitchen',
        stock: 20,
        icon: 'ramen_dining',
      },
      {
        category: 'Pizza & Pasta',
        name: 'Margherita Pizza',
        description: 'Pizza artisan dengan tomato San Marzano, mozzarella, dan basil segar.',
        price: 75_000,
        station: 'kitchen',
        stock: 9,
        icon: 'local_pizza',
      },
      {
        category: 'Pizza & Pasta',
        name: 'Truffle Mushroom Pasta',
        description: 'Fettuccine creamy dengan jamur sauté dan truffle oil.',
        price: 62_000,
        station: 'kitchen',
        stock: 11,
        icon: 'ramen_dining',
      },
      {
        category: 'Coffee & Tea',
        name: 'Signature Iced Latte',
        description: 'Double espresso, susu segar, dan sirup gula aren Cue & Tap.',
        price: 28_000,
        station: 'bar',
        stock: null,
        icon: 'local_cafe',
        bestSeller: true,
      },
      {
        category: 'Coffee & Tea',
        name: 'Cappuccino',
        description: 'Espresso dengan microfoam tebal dan cocoa dust.',
        price: 28_000,
        station: 'bar',
        stock: null,
        icon: 'coffee',
      },
      {
        category: 'Coffee & Tea',
        name: 'Americano',
        description: 'Espresso panjang dengan es batu, clean dan bold.',
        price: 22_000,
        station: 'bar',
        stock: null,
        icon: 'coffee',
      },
      {
        category: 'Coffee & Tea',
        name: 'Matcha Latte',
        description: 'Matcha ceremonial grade dengan susu segar.',
        price: 32_000,
        station: 'bar',
        stock: null,
        icon: 'emoji_food_beverage',
      },
      {
        category: 'Mocktails & Cocktails',
        name: 'Classic Mojito',
        description: 'White rum, mint, lime, dan soda. Available versi mocktail.',
        price: 35_000,
        station: 'bar',
        stock: null,
        icon: 'local_bar',
      },
      {
        category: 'Mocktails & Cocktails',
        name: 'Lychee Tea Lounge',
        description: 'Teh premium dengan lychee, mint, dan es batu kristal.',
        price: 25_000,
        station: 'bar',
        stock: null,
        icon: 'local_drink',
      },
      {
        category: 'Mocktails & Cocktails',
        name: 'Virgin Sunset',
        description: 'Mocktail orange, passion fruit, grenadine, dan soda.',
        price: 30_000,
        station: 'bar',
        stock: null,
        icon: 'local_drink',
      },
      {
        category: 'Dessert',
        name: 'Chocolate Lava Cake',
        description: 'Chocolate cake hangat dengan molten center dan vanilla ice cream.',
        price: 35_000,
        station: 'kitchen',
        stock: 10,
        icon: 'cake',
      },
      {
        category: 'Dessert',
        name: 'Vanilla Ice Cream',
        description: 'Tiga scoop vanilla bean ice cream dengan caramel drizzle.',
        price: 20_000,
        station: 'bar',
        stock: null,
        icon: 'icecream',
      },
      {
        category: 'Beer & Soft Drinks',
        name: 'Craft Beer Draft',
        description: 'Draft beer lokal, citrus aroma, disajikan dingin 330ml.',
        price: 45_000,
        station: 'bar',
        stock: 24,
        icon: 'sports_bar',
      },
      {
        category: 'Beer & Soft Drinks',
        name: 'Soft Drink Can',
        description: 'Pilihan cola, lemon-lime, atau soda. Disajikan dengan es.',
        price: 12_000,
        station: 'bar',
        stock: 48,
        icon: 'local_drink',
      },
      {
        category: 'Beer & Soft Drinks',
        name: 'Mineral Water',
        description: 'Botol air mineral 600ml dingin.',
        price: 8_000,
        station: 'bar',
        stock: 60,
        icon: 'water_drop',
      },
    ];

    const menuRows = await tx
      .insert(s.menuItems)
      .values(
        menuDefs.map((item, index) => ({
          categoryId: categoryByName.get(item.category)!.id,
          name: item.name,
          description: item.description,
          price: item.price,
          stock: item.stock,
          station: item.station,
          imageIcon: item.icon,
          isBestSeller: item.bestSeller ?? false,
          sortOrder: index + 1,
        })),
      )
      .returning();
    const menuByName = new Map(menuRows.map((item) => [item.name, item]));

    /* ------------------------ Seeds helpers ---------------------------- */
    async function insertBill(input: {
      code: string;
      guestName?: string | null;
      openedAt: Date;
      status?: 'open' | 'paid' | 'void';
      closedAt?: Date | null;
      openedBy?: string | null;
      closedBy?: string | null;
    }) {
      const table = tableByCode.get(input.code)!;
      const [bill] = await tx
        .insert(s.bills)
        .values({
          billNumber: nextBillNumber(input.openedAt),
          tableId: table.id,
          guestName: input.guestName ?? null,
          status: input.status ?? 'open',
          taxRateBps: TAX_RATE_BPS,
          serviceRateBps: SERVICE_RATE_BPS,
          openedAt: input.openedAt,
          closedAt: input.closedAt ?? null,
          openedBy: input.openedBy ?? null,
          closedBy: input.closedBy ?? null,
        })
        .returning();
      return bill;
    }

    async function setBillTotals(billId: string, subtotal: number, discountAmount = 0) {
      const totals = computeBillTotals({
        subtotal,
        discountAmount,
        taxRateBps: TAX_RATE_BPS,
        serviceRateBps: SERVICE_RATE_BPS,
      });
      await tx
        .update(s.bills)
        .set({
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          serviceAmount: totals.serviceAmount,
          total: totals.total,
        })
        .where(eq(s.bills.id, billId));
      return totals;
    }

    async function insertSession(input: {
      code: string;
      billId: string;
      rateName: string;
      startedAt: Date;
      status?: 'running' | 'paused' | 'finished';
      pausedSeconds?: number;
      pausedAt?: Date | null;
      endedAt?: Date | null;
      amount?: number | null;
      startedBy?: string | null;
    }) {
      const table = tableByCode.get(input.code)!;
      const rate = rateByName.get(input.rateName)!;
      const [session] = await tx
        .insert(s.billiardSessions)
        .values({
          billId: input.billId,
          tableId: table.id,
          status: input.status ?? 'running',
          startedAt: input.startedAt,
          pausedAt: input.pausedAt ?? null,
          pausedSeconds: input.pausedSeconds ?? 0,
          endedAt: input.endedAt ?? null,
          ratePerHour: rate.pricePerHour,
          minMinutes: rate.minMinutes,
          incrementMinutes: rate.incrementMinutes,
          amount: input.amount ?? null,
          startedBy: input.startedBy ?? null,
        })
        .returning();
      return session;
    }

    async function insertOrder(input: {
      code: string;
      billId: string;
      source: 'customer_qr' | 'cashier';
      status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';
      createdAt: Date;
      items: Array<{ name: string; qty: number; note?: string }>;
      note?: string;
      placedBy?: string | null;
      approvedBy?: string | null;
      acceptedAt?: Date | null;
      preparingAt?: Date | null;
      readyAt?: Date | null;
      servedAt?: Date | null;
    }) {
      const table = tableByCode.get(input.code)!;
      const [order] = await tx
        .insert(s.orders)
        .values({
          orderNumber: nextOrderNumber(),
          billId: input.billId,
          tableId: table.id,
          source: input.source,
          status: input.status,
          idempotencyKey: `seed-${crypto.randomUUID()}`,
          placedBy: input.placedBy ?? null,
          approvedBy: input.approvedBy ?? null,
          note: input.note,
          createdAt: input.createdAt,
          acceptedAt: input.acceptedAt ?? null,
          preparingAt: input.preparingAt ?? null,
          readyAt: input.readyAt ?? null,
          servedAt: input.servedAt ?? null,
        })
        .returning();

      let total = 0;
      const itemValues = input.items.map((item) => {
        const menuItem = menuByName.get(item.name);
        if (!menuItem) throw new Error(`Seed menu item not found: ${item.name}`);
        total += menuItem.price * item.qty;
        const isDone =
          input.status === 'ready' || input.status === 'served' || Boolean(input.readyAt);
        return {
          orderId: order.id,
          menuItemId: menuItem.id,
          nameSnapshot: menuItem.name,
          priceSnapshot: menuItem.price,
          qty: item.qty,
          note: item.note ?? null,
          station: menuItem.station,
          doneAt: isDone ? (input.readyAt ?? input.servedAt ?? input.createdAt) : null,
        };
      });
      await tx.insert(s.orderItems).values(itemValues);
      return { order, total };
    }

    function estimateOpenSession(session: s.BilliardSession, at: Date) {
      if (session.amount != null) return session.amount;
      const extraPause = session.pausedAt
        ? Math.max(0, (at.getTime() - new Date(session.pausedAt).getTime()) / 1000)
        : 0;
      const seconds = billableElapsedSeconds(
        session.startedAt,
        at,
        session.pausedSeconds + extraPause,
      );
      return computeSessionAmountFromSeconds(seconds, {
        ratePerHour: session.ratePerHour,
        minMinutes: session.minMinutes,
        incrementMinutes: session.incrementMinutes,
      }).amount;
    }

    /* ------------------------- Live demo state ------------------------- */
    if (demo) {
      // B1 — running, combined F&B + pending QR order
      const b1 = await insertBill({
        code: 'B1',
        guestName: 'Kevin Sanjaya',
        openedAt: minutesAgo(102, now),
        openedBy: cashier.id,
      });
      const b1Session = await insertSession({
        code: 'B1',
        billId: b1.id,
        rateName: 'VIP 9ft',
        startedAt: minutesAgo(102, now),
        startedBy: cashier.id,
      });
      const b1Order1 = await insertOrder({
        code: 'B1',
        billId: b1.id,
        source: 'cashier',
        status: 'served',
        createdAt: minutesAgo(95, now),
        acceptedAt: minutesAgo(94, now),
        preparingAt: minutesAgo(93, now),
        readyAt: minutesAgo(92, now),
        servedAt: minutesAgo(90, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [{ name: 'Lychee Tea Lounge', qty: 2, note: 'Less sugar, extra mint' }],
      });
      const b1Order2 = await insertOrder({
        code: 'B1',
        billId: b1.id,
        source: 'customer_qr',
        status: 'pending',
        createdAt: minutesAgo(7, now),
        items: [
          { name: 'Truffle Parmesan Fries', qty: 1, note: 'Extra mayo, dibuat garing' },
          { name: 'Wagyu Fried Rice Special', qty: 1, note: 'Pedas level 2, telur setengah matang' },
        ],
      });
      await setBillTotals(
        b1.id,
        estimateOpenSession(b1Session, now) + b1Order1.total + b1Order2.total,
      );

      // B2 — running, F&B ready
      const b2 = await insertBill({
        code: 'B2',
        guestName: 'Adrian / Walk-in',
        openedAt: minutesAgo(35, now),
        openedBy: cashier.id,
      });
      const b2Session = await insertSession({
        code: 'B2',
        billId: b2.id,
        rateName: 'Standard 9ft',
        startedAt: minutesAgo(35, now),
        startedBy: cashier.id,
      });
      const b2Order = await insertOrder({
        code: 'B2',
        billId: b2.id,
        source: 'cashier',
        status: 'ready',
        createdAt: minutesAgo(25, now),
        acceptedAt: minutesAgo(25, now),
        preparingAt: minutesAgo(22, now),
        readyAt: minutesAgo(5, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [{ name: 'Soft Drink Can', qty: 2, note: 'Cold + 2 gelas es' }],
      });
      await setBillTotals(b2.id, estimateOpenSession(b2Session, now) + b2Order.total);

      // B3 — paused 12 minutes
      const b3 = await insertBill({
        code: 'B3',
        guestName: 'Rangga & Rekan',
        openedAt: minutesAgo(135, now),
        openedBy: cashier.id,
      });
      const b3Session = await insertSession({
        code: 'B3',
        billId: b3.id,
        rateName: 'Standard 9ft',
        startedAt: minutesAgo(135, now),
        status: 'paused',
        pausedSeconds: 600,
        pausedAt: minutesAgo(12, now),
        startedBy: cashier.id,
      });
      const b3Order = await insertOrder({
        code: 'B3',
        billId: b3.id,
        source: 'cashier',
        status: 'served',
        createdAt: minutesAgo(100, now),
        acceptedAt: minutesAgo(99, now),
        preparingAt: minutesAgo(98, now),
        readyAt: minutesAgo(95, now),
        servedAt: minutesAgo(93, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [{ name: 'Lychee Tea Lounge', qty: 1 }],
      });
      await setBillTotals(b3.id, estimateOpenSession(b3Session, now) + b3Order.total);

      // C1 — kitchen sedang memasak
      const c1 = await insertBill({
        code: 'C1',
        guestName: 'Bill CAF-902 · Dine In',
        openedAt: minutesAgo(55, now),
        openedBy: cashier.id,
      });
      const c1Order = await insertOrder({
        code: 'C1',
        billId: c1.id,
        source: 'cashier',
        status: 'preparing',
        createdAt: minutesAgo(12, now),
        acceptedAt: minutesAgo(11, now),
        preparingAt: minutesAgo(9, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [
          { name: 'Cue & Tap Signature Burger', qty: 1, note: 'Medium well' },
          { name: 'Truffle Parmesan Fries', qty: 1 },
          { name: 'Signature Iced Latte', qty: 2, note: 'Less sugar' },
        ],
      });
      await setBillTotals(c1.id, c1Order.total);

      // C2 — served, siap checkout
      const c2 = await insertBill({
        code: 'C2',
        guestName: 'Dimas Satria',
        openedAt: minutesAgo(48, now),
        openedBy: cashier.id,
      });
      const c2Order = await insertOrder({
        code: 'C2',
        billId: c2.id,
        source: 'cashier',
        status: 'served',
        createdAt: minutesAgo(38, now),
        acceptedAt: minutesAgo(37, now),
        preparingAt: minutesAgo(35, now),
        readyAt: minutesAgo(30, now),
        servedAt: minutesAgo(28, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [
          { name: 'Craft Beer Draft', qty: 1 },
          { name: 'Beef Nachos', qty: 1 },
          { name: 'Classic Mojito', qty: 1 },
        ],
      });
      await setBillTotals(c2.id, c2Order.total);

      // C3 — pending QR self-order, sumber perhatian di matrix
      const c3 = await insertBill({
        code: 'C3',
        guestName: 'Guest QR · Meja C3',
        openedAt: minutesAgo(20, now),
        openedBy: cashier.id,
      });
      const c3Order = await insertOrder({
        code: 'C3',
        billId: c3.id,
        source: 'customer_qr',
        status: 'pending',
        createdAt: minutesAgo(4, now),
        items: [
          { name: 'Chicken Wings BBQ', qty: 1, note: 'Saus BBQ dipisah' },
          { name: 'Americano', qty: 1, note: 'Less ice' },
        ],
      });
      await setBillTotals(c3.id, c3Order.total);

      // C4 — preparing di bar
      const c4 = await insertBill({
        code: 'C4',
        guestName: 'Walk-in Window',
        openedAt: minutesAgo(15, now),
        openedBy: cashier.id,
      });
      const c4Order = await insertOrder({
        code: 'C4',
        billId: c4.id,
        source: 'cashier',
        status: 'preparing',
        createdAt: minutesAgo(8, now),
        acceptedAt: minutesAgo(8, now),
        preparingAt: minutesAgo(6, now),
        placedBy: cashier.id,
        approvedBy: cashier.id,
        items: [
          { name: 'Cappuccino', qty: 2 },
          { name: 'Chocolate Lava Cake', qty: 1 },
        ],
      });
      await setBillTotals(c4.id, c4Order.total);

      // C5 — pending QR order
      const c5 = await insertBill({
        code: 'C5',
        guestName: 'Guest QR · Meja C5',
        openedAt: minutesAgo(10, now),
        openedBy: cashier.id,
      });
      const c5Order = await insertOrder({
        code: 'C5',
        billId: c5.id,
        source: 'customer_qr',
        status: 'pending',
        createdAt: minutesAgo(2, now),
        items: [{ name: 'Beef Nachos', qty: 1, note: 'Extra jalapeño' }],
      });
      await setBillTotals(c5.id, c5Order.total);

      // Open shift
      const shiftOpenedAt = minutesAgo(240, now);
      await tx.insert(s.shifts).values({
        staffId: cashier.id,
        status: 'open',
        openingCash: 500_000,
        openedAt: shiftOpenedAt,
      });

      // Service call dari C3
      await tx.insert(s.serviceRequests).values({
        tableId: tableByCode.get('C3')!.id,
        type: 'waiter',
        status: 'open',
        note: 'Minta tambahan es & tisu',
        createdAt: minutesAgo(6, now),
      });

      // Audit log contoh
      await tx.insert(s.auditLog).values([
        {
          staffId: cashier.id,
          action: 'session.start',
          entityType: 'billiard_session',
          entityId: b1Session.id,
          detail: { table: 'B1', rate: 60_000, guest: 'Kevin Sanjaya' },
          createdAt: minutesAgo(102, now),
        },
        {
          staffId: cashier.id,
          action: 'order.cancel_item',
          entityType: 'order_item',
          entityId: c2Order.order.id,
          detail: { item: '1x Classic Mojito', reason: 'Customer salah klik pada kiosk' },
          createdAt: minutesAgo(24, now),
        },
        {
          staffId: owner.id,
          action: 'bill.discount_applied',
          entityType: 'bill',
          entityId: b2.id,
          detail: { bill: 'Bill #0012', discount: '10% Member VIP Championship' },
          createdAt: minutesAgo(70, now),
        },
        {
          staffId: cashier.id,
          action: 'session.pause',
          entityType: 'billiard_session',
          entityId: b3Session.id,
          detail: { table: 'B3', reason: 'Tunggu pemain' },
          createdAt: minutesAgo(12, now),
        },
      ]);

      /* --------------------- Historical paid bills ---------------------- */
      const guestNames = [
        'Andi Pratama',
        'Sinta Lestari',
        'Raka Wijaya',
        'Maya Kusuma',
        'Fajar Nugroho',
        'Dewi Anggraini',
        'Bagas Setiawan',
        'Nadia Putri',
      ];
      const billiardCodes = ['B1', 'B2', 'B3', 'B4', 'B6', 'B7', 'B8'];
      const cafeCodes = ['C1', 'C2', 'C3', 'C4', 'C6', 'C7', 'C8', 'C9', 'C10'];
      const historyItems = [
        'Signature Iced Latte',
        'Cappuccino',
        'Truffle Parmesan Fries',
        'Chicken Wings BBQ',
        'Emerald Mojito Mocktail',
        'Soft Drink Can',
        'Craft Beer Draft',
        'Chocolate Lava Cake',
      ];
      const methods: Array<'cash' | 'qris' | 'edc' | 'transfer'> = [
        'cash',
        'qris',
        'edc',
        'cash',
        'transfer',
      ];

      let idx = 0;
      for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
        const billsPerDay = dayOffset === 0 ? 4 : 5;
        for (let i = 0; i < billsPerDay; i += 1) {
          const isBilliard = idx % 3 !== 2;
          let closedAt: Date;
          if (dayOffset === 0) {
            closedAt = minutesAgo(30 + i * 35, now);
          } else {
            const day = new Date(now);
            day.setDate(day.getDate() - dayOffset);
            closedAt = atTime(day, 12 + ((i * 2 + idx) % 10), 15 + ((i * 7) % 40));
          }

          const durationMin = 45 + ((idx * 17 + dayOffset * 13) % 140);
          const openedAt = new Date(closedAt.getTime() - durationMin * 60_000);
          const code = isBilliard
            ? billiardCodes[idx % billiardCodes.length]
            : cafeCodes[idx % cafeCodes.length];
          const rateName =
            code === 'B1' || code === 'B8'
              ? 'VIP 9ft'
              : code === 'B6'
                ? 'VIP Private Room'
                : code === 'B7'
                  ? 'Happy Hour'
                  : 'Standard 9ft';

          const bill = await insertBill({
            code,
            guestName: guestNames[idx % guestNames.length],
            openedAt,
            status: 'paid',
            closedAt,
            openedBy: cashier.id,
            closedBy: cashier.id,
          });

          let subtotal = 0;
          if (isBilliard) {
            const rate = rateByName.get(rateName)!;
            const amount = computeSessionAmount(openedAt, closedAt, 0, {
              ratePerHour: rate.pricePerHour,
              minMinutes: rate.minMinutes,
              incrementMinutes: rate.incrementMinutes,
            }).amount;
            subtotal += amount;
            await insertSession({
              code,
              billId: bill.id,
              rateName,
              startedAt: openedAt,
              status: 'finished',
              endedAt: closedAt,
              amount,
              startedBy: cashier.id,
            });
          }

          const itemName = historyItems[idx % historyItems.length];
          const qty = 1 + (idx % 3);
          const order = await insertOrder({
            code,
            billId: bill.id,
            source: idx % 4 === 1 ? 'customer_qr' : 'cashier',
            status: 'served',
            createdAt: new Date(closedAt.getTime() - 18 * 60_000),
            acceptedAt: new Date(closedAt.getTime() - 17 * 60_000),
            preparingAt: new Date(closedAt.getTime() - 15 * 60_000),
            readyAt: new Date(closedAt.getTime() - 10 * 60_000),
            servedAt: new Date(closedAt.getTime() - 8 * 60_000),
            placedBy: cashier.id,
            approvedBy: cashier.id,
            items: [{ name: itemName, qty }],
          });
          subtotal += order.total;

          const totals = computeBillTotals({
            subtotal,
            taxRateBps: TAX_RATE_BPS,
            serviceRateBps: SERVICE_RATE_BPS,
          });
          await tx
            .update(s.bills)
            .set({
              subtotal: totals.subtotal,
              taxAmount: totals.taxAmount,
              serviceAmount: totals.serviceAmount,
              total: totals.total,
            })
            .where(eq(s.bills.id, bill.id));

          await tx.insert(s.payments).values({
            billId: bill.id,
            method: methods[idx % methods.length],
            amount: totals.total,
            receivedBy: cashier.id,
            createdAt: closedAt,
          });

          idx += 1;
        }
      }

      // Shift yang sudah ditutup (riwayat)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      await tx.insert(s.shifts).values({
        staffId: cashier.id,
        status: 'closed',
        openingCash: 500_000,
        expectedCash: 3_150_000,
        actualCash: 3_150_000,
        difference: 0,
        notes: 'Semua bill meja clear, stok opname sesuai.',
        openedAt: atTime(yesterday, 10, 0),
        closedAt: atTime(yesterday, 22, 0),
      });
    }

    await tx.insert(s.auditLog).values({
      staffId: null,
      action: demo ? 'system.seed_demo' : 'system.seed_catalog',
      entityType: 'system',
      entityId: null,
      detail: {
        message: demo ? 'Seed demo Cue & Tap selesai' : 'Seed katalog dasar selesai',
        tables: tableRows.length,
        menuItems: menuRows.length,
      },
      createdAt: now,
    });
  });

  await ensureLoyaltyDefaults(db, demo);
  await ensureOpsDefaults(db, demo);
}
