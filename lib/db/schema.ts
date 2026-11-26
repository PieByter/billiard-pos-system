import { sql } from 'drizzle-orm';
import { DEFAULT_OUTLET_ID } from '@/lib/constants';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/*                                  Outlets                                   */
/* -------------------------------------------------------------------------- */

export const outlets = pgTable('outlets', {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  name: text().notNull(),
  address: text().notNull().default(''),
  timezone: text().notNull().default('Asia/Jakarta'),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * Semua tabel operasional membawa outlet_id agar data antar cabang tidak
 * tercampur. Default dipertahankan untuk kompatibilitas data demo/lama.
 */
function outletRef() {
  return uuid()
    .notNull()
    .default(DEFAULT_OUTLET_ID)
    .references(() => outlets.id, { onDelete: 'restrict', onUpdate: 'cascade' });
}

/* -------------------------------------------------------------------------- */
/*                                   Enums                                    */
/* -------------------------------------------------------------------------- */

export const roleEnum = pgEnum('role', ['owner', 'cashier', 'kitchen']);
export const tableKindEnum = pgEnum('table_kind', ['billiard', 'cafe']);
export const sessionStatusEnum = pgEnum('session_status', ['running', 'paused', 'finished']);
export const billStatusEnum = pgEnum('bill_status', ['open', 'paid', 'void']);
export const orderSourceEnum = pgEnum('order_source', ['customer_qr', 'cashier']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'served',
  'cancelled',
]);
export const payMethodEnum = pgEnum('pay_method', [
  'cash',
  'qris',
  'transfer',
  'edc',
  'balance',
]);
export const refundCategoryEnum = pgEnum('refund_category', ['billiard', 'fnb', 'other']);
export const stationEnum = pgEnum('station', ['kitchen', 'bar']);
export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed']);
export const serviceRequestTypeEnum = pgEnum('service_request_type', ['waiter', 'bill', 'assistance']);
export const serviceRequestStatusEnum = pgEnum('service_request_status', ['open', 'done', 'cancelled']);
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
]);
export const depositStatusEnum = pgEnum('deposit_status', [
  'none',
  'pending',
  'paid',
  'refunded',
  'forfeited',
]);
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'waiting',
  'called',
  'seated',
  'cancelled',
  'no_show',
]);
export const billSplitStatusEnum = pgEnum('bill_split_status', ['open', 'paid', 'void']);
export const billSplitItemTypeEnum = pgEnum('bill_split_item_type', ['order_item', 'session']);
export const paymentIntentStatusEnum = pgEnum('payment_intent_status', [
  'pending',
  'paid',
  'expired',
  'failed',
  'cancelled',
]);
export const promotionTypeEnum = pgEnum('promotion_type', ['percent', 'fixed', 'bundle']);
export const promotionScopeEnum = pgEnum('promotion_scope', ['all', 'billiard', 'fnb']);
export const loyaltyTypeEnum = pgEnum('loyalty_type', ['earn', 'redeem', 'adjust']);
export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'whatsapp', 'log']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'receipt',
  'order_ready',
  'reservation',
  'reservation_reminder',
  'test',
]);
export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
]);
export const cashMovementTypeEnum = pgEnum('cash_movement_type', [
  'drop',
  'petty_cash',
  'adjustment',
  'transfer_in',
  'transfer_out',
]);
export const assetTypeEnum = pgEnum('asset_type', ['cue', 'table', 'equipment']);
export const assetStatusEnum = pgEnum('asset_status', ['active', 'maintenance', 'retired']);
export const maintenanceTypeEnum = pgEnum('maintenance_type', [
  'service',
  'repair',
  'retipping',
  'inspection',
]);
export const movementTypeEnum = pgEnum('stock_movement_type', [
  'in',
  'out',
  'adjust',
  'waste',
  'opname',
]);
export const penaltyTypeEnum = pgEnum('penalty_type', [
  'overtime',
  'no_show',
  'cancellation',
  'damage',
  'loss',
  'other',
]);
export const penaltyStatusEnum = pgEnum('penalty_status', ['pending', 'approved', 'waived', 'cancelled']);
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'ordered',
  'received',
  'cancelled',
]);
export const printJobStatusEnum = pgEnum('print_job_status', [
  'queued',
  'processing',
  'printed',
  'failed',
  'cancelled',
]);
export const printJobTypeEnum = pgEnum('print_job_type', [
  'receipt',
  'kitchen',
  'shift',
  'split',
  'test',
]);
export const memberDepositTypeEnum = pgEnum('member_deposit_type', [
  'topup',
  'usage',
  'adjustment',
  'refund',
]);

/* -------------------------------------------------------------------------- */
/*                                  Profiles                                  */
/* -------------------------------------------------------------------------- */

export const profiles = pgTable('profiles', {
    outletId: outletRef(),
  id: uuid().primaryKey(), // = auth.users.id saat Supabase Auth aktif
  email: text().notNull().unique(),
  name: text().notNull(),
  role: roleEnum().notNull(),
  passwordHash: text(), // hanya dipakai oleh mode demo lokal
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/* -------------------------------------------------------------------------- */
/*                              Billiard & Meja                               */
/* -------------------------------------------------------------------------- */

export const venueSettings = pgTable('venue_settings', {
    outletId: outletRef(),
  id: text().primaryKey().default('default'),
  venueName: text().notNull().default('Cue & Tap'),
  address: text().notNull().default(''),
  timezone: text().notNull().default('Asia/Jakarta'),
  taxRateBps: integer().notNull().default(1000),
  serviceRateBps: integer().notNull().default(500),
  warningMinutes: integer().notNull().default(15),
  receiptFooter: text().notNull().default('Terima kasih sudah mampir. Sampai jumpa lagi!'),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, (t) => [uniqueIndex('venue_settings_outlet_unique').on(t.outletId)]).enableRLS();

export const billiardRates = pgTable('billiard_rates', {
    outletId: outletRef(),
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  pricePerHour: integer().notNull(),
  minMinutes: integer().notNull().default(30),
  incrementMinutes: integer().notNull().default(15),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const venueTables = pgTable(
  'venue_tables',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    kind: tableKindEnum().notNull(),
    zone: text().notNull().default(''),
    capacity: integer().notNull().default(4),
    allowSelfOrder: boolean().notNull().default(false),
    qrToken: text().notNull().unique(),
    rateId: uuid().references(() => billiardRates.id, { onDelete: 'set null' }),
    needsCleaningAt: timestamp({ withTimezone: true }),
    maintenanceAt: timestamp({ withTimezone: true }),
    maintenanceNote: text(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('venue_tables_kind_idx').on(t.kind, t.sortOrder),
    uniqueIndex('venue_tables_outlet_code_unique').on(t.outletId, t.code),
  ],
).enableRLS();

export const tableRateSchedules = pgTable(
  'table_rate_schedules',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'cascade' }),
    rateId: uuid()
      .notNull()
      .references(() => billiardRates.id, { onDelete: 'restrict' }),
    // ISO weekday: 1 = Senin ... 7 = Minggu.
    daysOfWeek: jsonb().$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6, 7]),
    // Menit sejak 00:00 Asia/Jakarta. Rentang [startMinute, endMinute).
    startMinute: integer().notNull(),
    endMinute: integer().notNull(),
    priority: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('table_rate_schedules_table_idx').on(t.tableId, t.active),
    index('table_rate_schedules_rate_idx').on(t.rateId),
  ],
).enableRLS();

export const memberTiers = pgTable('member_tiers', {
    outletId: outletRef(),
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  minSpend: integer().notNull().default(0),
  discountBps: integer().notNull().default(0),
  pointsMultiplierBps: integer().notNull().default(10_000),
  benefits: text(),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const members = pgTable(
  'members',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    phone: text().notNull().unique(),
    email: text(),
    tierId: uuid().references(() => memberTiers.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    points: integer().notNull().default(0),
    totalSpend: integer().notNull().default(0),
    balance: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    consent: boolean().notNull().default(false),
    notifyEmail: boolean().notNull().default(true),
    notifyWhatsapp: boolean().notNull().default(true),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('members_phone_idx').on(t.phone), index('members_tier_idx').on(t.tierId)],
).enableRLS();

export const promotions = pgTable(
  'promotions',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    type: promotionTypeEnum().notNull(),
    value: integer().notNull(),
    minSpend: integer().notNull().default(0),
    maxDiscount: integer(),
    maxUses: integer(),
    usesCount: integer().notNull().default(0),
    validFrom: timestamp({ withTimezone: true }),
    validTo: timestamp({ withTimezone: true }),
    appliesTo: promotionScopeEnum().notNull().default('all'),
    memberOnly: boolean().notNull().default(false),
    stackable: boolean().notNull().default(false),
    autoApply: boolean().notNull().default(false),
    daysOfWeek: jsonb().$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6, 7]),
    startMinute: integer().notNull().default(0),
    endMinute: integer().notNull().default(1440),
    maxUsesPerMember: integer(),
    bundlePrice: integer(),
    bundleItemIds: jsonb().$type<string[]>().notNull().default([]),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promotions_active_idx').on(t.active, t.validTo)],
).enableRLS();

export const assets = pgTable(
  'assets',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    type: assetTypeEnum().notNull().default('equipment'),
    status: assetStatusEnum().notNull().default('active'),
    tableId: uuid().references(() => venueTables.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_status_idx').on(t.status, t.type)],
).enableRLS();

export const maintenanceLogs = pgTable(
  'maintenance_logs',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    type: maintenanceTypeEnum().notNull().default('service'),
    performedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    cost: integer().notNull().default(0),
    vendor: text(),
    notes: text(),
    nextDueAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('maintenance_asset_idx').on(t.assetId, t.performedAt)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                   Bills                                    */
/* -------------------------------------------------------------------------- */

export const bills = pgTable(
  'bills',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billNumber: text().notNull().unique(),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'restrict' }),
    guestName: text(),
    status: billStatusEnum().notNull().default('open'),
    subtotal: integer().notNull().default(0),
    discountAmount: integer().notNull().default(0),
    discountReason: text(),
    memberId: uuid().references(() => members.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    memberDiscountAmount: integer().notNull().default(0),
    promotionId: uuid().references(() => promotions.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    promotionCode: text(),
    promoDiscountAmount: integer().notNull().default(0),
    promotionConsumedAt: timestamp({ withTimezone: true }),
    pointsRedeemed: integer().notNull().default(0),
    pointsDiscountAmount: integer().notNull().default(0),
    voucherId: uuid(),
    voucherCode: text(),
    voucherDiscountAmount: integer().notNull().default(0),
    penaltyAmount: integer().notNull().default(0),
    taxRateBps: integer().notNull().default(1000), // 1000 bps = PB1 10%
    serviceRateBps: integer().notNull().default(500), // 5%
    taxAmount: integer().notNull().default(0),
    serviceAmount: integer().notNull().default(0),
    total: integer().notNull().default(0),
    refundedAmount: integer().notNull().default(0),
    note: text(),
    openedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    closedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('one_open_bill_per_table')
      .on(t.tableId)
      .where(sql`${t.status} = 'open'`),
    index('bills_status_opened_idx').on(t.status, t.openedAt),
    index('bills_closed_idx').on(t.closedAt),
  ],
).enableRLS();

export const billiardSessions = pgTable(
  'billiard_sessions',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'restrict' }),
    status: sessionStatusEnum().notNull().default('running'),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    pausedAt: timestamp({ withTimezone: true }),
    pausedSeconds: integer().notNull().default(0),
    targetMinutes: integer(),
    endedAt: timestamp({ withTimezone: true }),
    // Snapshot tarif: perubahan master rate tidak mengubah sesi berjalan.
    ratePerHour: integer().notNull(),
    minMinutes: integer().notNull(),
    incrementMinutes: integer().notNull(),
    amount: integer(),
    startedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    endedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  },
  (t) => [
    uniqueIndex('one_active_session_per_table')
      .on(t.tableId)
      .where(sql`${t.status} <> 'finished'`),
    index('billiard_sessions_bill_idx').on(t.billId),
    index('billiard_sessions_status_idx').on(t.status),
  ],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                    Menu                                    */
/* -------------------------------------------------------------------------- */

export const menuCategories = pgTable('menu_categories', {
    outletId: outletRef(),
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  icon: text().notNull().default('restaurant_menu'),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
}).enableRLS();

export const menuItems = pgTable(
  'menu_items',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    categoryId: uuid()
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    description: text().notNull().default(''),
    price: integer().notNull(),
    isAvailable: boolean().notNull().default(true),
    stock: integer(), // null = stok tidak dilacak
    station: stationEnum().notNull().default('kitchen'),
    imageIcon: text().notNull().default('restaurant_menu'),
    isBestSeller: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('menu_items_category_idx').on(t.categoryId, t.sortOrder)],
).enableRLS();

export const ingredients = pgTable(
  'ingredients',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    unit: text().notNull().default('pcs'),
    stockQty: integer().notNull().default(0),
    minStock: integer().notNull().default(0),
    costPerUnit: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ingredients_active_idx').on(t.active, t.name)],
).enableRLS();

export const recipes = pgTable(
  'recipes',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    menuItemId: uuid()
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    qty: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('recipes_menu_ingredient_unique').on(t.menuItemId, t.ingredientId),
    index('recipes_menu_idx').on(t.menuItemId),
  ],
).enableRLS();

export const stockMovements = pgTable(
  'stock_movements',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    type: movementTypeEnum().notNull(),
    qty: integer().notNull(),
    referenceType: text(),
    referenceId: text(),
    note: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_ingredient_idx').on(t.ingredientId, t.createdAt)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                  Orders                                    */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  'orders',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    orderNumber: text().notNull().unique(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'restrict' }),
    source: orderSourceEnum().notNull(),
    status: orderStatusEnum().notNull().default('pending'),
    idempotencyKey: text().notNull().unique(),
    placedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    approvedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp({ withTimezone: true }),
    preparingAt: timestamp({ withTimezone: true }),
    readyAt: timestamp({ withTimezone: true }),
    servedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('orders_status_idx').on(t.status, t.createdAt),
    index('orders_bill_idx').on(t.billId),
    index('orders_table_idx').on(t.tableId, t.createdAt),
  ],
).enableRLS();

export const orderItems = pgTable(
  'order_items',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid()
      .notNull()
      .references(() => menuItems.id, { onDelete: 'restrict' }),
    nameSnapshot: text().notNull(),
    priceSnapshot: integer().notNull(),
    qty: integer().notNull(),
    note: text(),
    station: stationEnum().notNull().default('kitchen'),
    doneAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
).enableRLS();

export const billSplits = pgTable(
  'bill_splits',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    status: billSplitStatusEnum().notNull().default('open'),
    subtotal: integer().notNull().default(0),
    discountAmount: integer().notNull().default(0),
    taxAmount: integer().notNull().default(0),
    serviceAmount: integer().notNull().default(0),
    total: integer().notNull().default(0),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('bill_splits_bill_idx').on(t.billId, t.status)],
).enableRLS();

export const billSplitItems = pgTable(
  'bill_split_items',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    splitId: uuid()
      .notNull()
      .references(() => billSplits.id, { onDelete: 'cascade' }),
    itemType: billSplitItemTypeEnum().notNull(),
    orderItemId: uuid().references(() => orderItems.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
    sessionId: uuid().references(() => billiardSessions.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
    amount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bill_split_items_split_idx').on(t.splitId),
    uniqueIndex('bill_split_items_order_unique').on(t.orderItemId),
    uniqueIndex('bill_split_items_session_unique').on(t.sessionId),
  ],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                 Payments                                   */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  'payments',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    billSplitId: uuid().references(() => billSplits.id, { onDelete: 'set null' }),
    method: payMethodEnum().notNull(),
    amount: integer().notNull(),
    tendered: integer(),
    externalRef: text().unique(),
    receivedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_bill_idx').on(t.billId),
    index('payments_created_idx').on(t.createdAt),
  ],
).enableRLS();

export const refunds = pgTable(
  'refunds',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    amount: integer().notNull(),
    category: refundCategoryEnum().notNull().default('other'),
    reason: text().notNull(),
    restocked: boolean().notNull().default(false),
    externalRef: text().unique(),
    approvedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refunds_bill_idx').on(t.billId),
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_created_idx').on(t.createdAt),
  ],
).enableRLS();

export const reservations = pgTable(
  'reservations',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'restrict' }),
    guestName: text().notNull(),
    phone: text(),
    partySize: integer().notNull().default(2),
    startAt: timestamp({ withTimezone: true }).notNull(),
    endAt: timestamp({ withTimezone: true }).notNull(),
    status: reservationStatusEnum().notNull().default('pending'),
    depositAmount: integer().notNull().default(0),
    depositStatus: depositStatusEnum().notNull().default('none'),
    note: text(),
    billId: uuid().references(() => bills.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    sessionId: uuid().references(() => billiardSessions.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    checkedInAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reservations_start_idx').on(t.startAt, t.status),
    index('reservations_table_idx').on(t.tableId, t.startAt),
  ],
).enableRLS();

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    guestName: text().notNull(),
    phone: text(),
    partySize: integer().notNull().default(2),
    preference: tableKindEnum().notNull().default('billiard'),
    status: waitlistStatusEnum().notNull().default('waiting'),
    estimatedWaitMinutes: integer().notNull().default(15),
    note: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    calledAt: timestamp({ withTimezone: true }),
    seatedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('waitlist_status_idx').on(t.status, t.createdAt)],
).enableRLS();

export const paymentIntents = pgTable(
  'payment_intents',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    providerOrderId: text().notNull().unique(),
    providerRef: text(),
    amount: integer().notNull(),
    status: paymentIntentStatusEnum().notNull().default('pending'),
    qrString: text(),
    qrUrl: text(),
    billSplitId: uuid().references(() => billSplits.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    expiresAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    rawPayload: jsonb().$type<Record<string, unknown>>(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_intents_bill_idx').on(t.billId, t.status),
    index('payment_intents_status_idx').on(t.status, t.createdAt),
  ],
).enableRLS();

export const penaltyRules = pgTable(
  'penalty_rules',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    type: penaltyTypeEnum().notNull().default('other'),
    defaultAmount: integer().notNull().default(0),
    maxAmount: integer(),
    graceMinutes: integer().notNull().default(0),
    ratePerHour: integer(),
    autoApply: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('penalty_rules_active_idx').on(t.active, t.type)],
).enableRLS();

export const penalties = pgTable(
  'penalties',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid().references(() => bills.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ruleId: uuid().references(() => penaltyRules.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    type: penaltyTypeEnum().notNull().default('other'),
    amount: integer().notNull(),
    reason: text().notNull(),
    status: penaltyStatusEnum().notNull().default('approved'),
    approvedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    reservationId: uuid().references(() => reservations.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    autoKey: text().unique(),
    autoGenerated: boolean().notNull().default(false),
    waivedReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('penalties_bill_idx').on(t.billId, t.status)],
).enableRLS();

export const loyaltyLedger = pgTable(
  'loyalty_ledger',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    billId: uuid().references(() => bills.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    type: loyaltyTypeEnum().notNull(),
    points: integer().notNull(),
    note: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('loyalty_ledger_member_idx').on(t.memberId, t.createdAt),
    uniqueIndex('loyalty_earn_bill_unique')
      .on(t.billId)
      .where(sql`${t.type} = 'earn'`),
  ],
).enableRLS();

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    channel: notificationChannelEnum().notNull(),
    type: notificationTypeEnum().notNull(),
    templateKey: text(),
    recipient: text().notNull(),
    subject: text(),
    body: text().notNull(),
    status: notificationStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    billId: uuid().references(() => bills.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    orderId: uuid().references(() => orders.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    memberId: uuid().references(() => members.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('notification_outbox_status_idx').on(t.status, t.createdAt),
    uniqueIndex('notification_receipt_bill_unique')
      .on(t.billId)
      .where(sql`${t.type} = 'receipt'`),
    uniqueIndex('notification_order_ready_unique')
      .on(t.orderId)
      .where(sql`${t.type} = 'order_ready'`),
  ],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                   Shift                                    */
/* -------------------------------------------------------------------------- */

export const shifts = pgTable(
  'shifts',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    staffId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    status: shiftStatusEnum().notNull().default('open'),
    openingCash: integer().notNull().default(0),
    expectedCash: integer(),
    actualCash: integer(),
    difference: integer(),
    notes: text(),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('one_open_shift')
      .on(t.outletId)
      .where(sql`${t.status} = 'open'`),
    index('shifts_closed_idx').on(t.closedAt),
  ],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                          Audit log & service calls                         */
/* -------------------------------------------------------------------------- */

export const cashMovements = pgTable(
  'cash_movements',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    type: cashMovementTypeEnum().notNull(),
    amount: integer().notNull(),
    reason: text().notNull(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cash_movements_shift_idx').on(t.shiftId, t.createdAt)],
).enableRLS();

export const auditLog = pgTable(
  'audit_log',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    staffId: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    detail: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
).enableRLS();

export const serviceRequests = pgTable(
  'service_requests',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    tableId: uuid()
      .notNull()
      .references(() => venueTables.id, { onDelete: 'cascade' }),
    type: serviceRequestTypeEnum().notNull(),
    status: serviceRequestStatusEnum().notNull().default('open'),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  },
  (t) => [index('service_requests_status_idx').on(t.status, t.createdAt)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                        Advanced loyalty & promotion                        */
/* -------------------------------------------------------------------------- */

export const billPromotions = pgTable(
  'bill_promotions',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    billId: uuid()
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    promotionId: uuid()
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    code: text().notNull(),
    name: text().notNull(),
    discountAmount: integer().notNull().default(0),
    autoApplied: boolean().notNull().default(false),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bill_promotions_unique').on(t.billId, t.promotionId),
    index('bill_promotions_bill_idx').on(t.billId),
    index('bill_promotions_promotion_idx').on(t.promotionId, t.consumedAt),
  ],
).enableRLS();

export const vouchers = pgTable(
  'vouchers',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    memberId: uuid().references(() => members.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
    name: text().notNull(),
    type: promotionTypeEnum().notNull().default('fixed'),
    value: integer().notNull(),
    minSpend: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }),
    usedAt: timestamp({ withTimezone: true }),
    billId: uuid().references(() => bills.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('vouchers_member_idx').on(t.memberId, t.usedAt),
    index('vouchers_active_idx').on(t.active, t.expiresAt),
  ],
).enableRLS();

export const memberDeposits = pgTable(
  'member_deposits',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    type: memberDepositTypeEnum().notNull().default('topup'),
    method: payMethodEnum().notNull().default('cash'),
    amount: integer().notNull(),
    billId: uuid().references(() => bills.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    note: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('member_deposits_member_idx').on(t.memberId, t.createdAt)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                         Inventory: supplier & PO                          */
/* -------------------------------------------------------------------------- */

export const suppliers = pgTable(
  'suppliers',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    contactName: text(),
    phone: text(),
    email: text(),
    address: text(),
    notes: text(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('suppliers_active_idx').on(t.active, t.name)],
).enableRLS();

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    poNumber: text().notNull().unique(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    status: purchaseOrderStatusEnum().notNull().default('draft'),
    orderedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    total: integer().notNull().default(0),
    notes: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    receivedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('purchase_orders_status_idx').on(t.status, t.createdAt),
    index('purchase_orders_supplier_idx').on(t.supplierId),
  ],
).enableRLS();

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    qty: integer().notNull(),
    unitCost: integer().notNull(),
    receivedQty: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('purchase_order_items_po_idx').on(t.purchaseOrderId)],
).enableRLS();

export const stockOpnames = pgTable(
  'stock_opnames',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    notes: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_opnames_created_idx').on(t.createdAt)],
).enableRLS();

export const stockOpnameItems = pgTable(
  'stock_opname_items',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    opnameId: uuid()
      .notNull()
      .references(() => stockOpnames.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    systemQty: integer().notNull(),
    countedQty: integer().notNull(),
    difference: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('stock_opname_items_unique').on(t.opnameId, t.ingredientId)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                     Notification template & print queue                    */
/* -------------------------------------------------------------------------- */

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    templateKey: text().notNull(),
    name: text().notNull(),
    channel: notificationChannelEnum(),
    subject: text(),
    body: text().notNull(),
    active: boolean().notNull().default(true),
    updatedBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_templates_outlet_key').on(t.outletId, t.templateKey)],
).enableRLS();

export const printJobs = pgTable(
  'print_jobs',
  {
    outletId: outletRef(),
    id: uuid().primaryKey().defaultRandom(),
    type: printJobTypeEnum().notNull(),
    referenceType: text(),
    referenceId: text(),
    title: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: printJobStatusEnum().notNull().default('queued'),
    attempts: integer().notNull().default(0),
    agentId: text(),
    lastError: text(),
    createdBy: uuid().references(() => profiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    printedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('print_jobs_status_idx').on(t.status, t.createdAt)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type StaffProfile = typeof profiles.$inferSelect;
export type VenueTable = typeof venueTables.$inferSelect;
export type BilliardRate = typeof billiardRates.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BilliardSession = typeof billiardSessions.$inferSelect;
export type MenuCategory = typeof menuCategories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type VenueSettings = typeof venueSettings.$inferSelect;
export type TableRateSchedule = typeof tableRateSchedules.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type BillSplit = typeof billSplits.$inferSelect;
export type BillSplitItem = typeof billSplitItems.$inferSelect;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type MemberTier = typeof memberTiers.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type LoyaltyLedgerEntry = typeof loyaltyLedger.$inferSelect;
export type NotificationOutboxEntry = typeof notificationOutbox.$inferSelect;
export type CashMovement = typeof cashMovements.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type PenaltyRule = typeof penaltyRules.$inferSelect;
export type Penalty = typeof penalties.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type Outlet = typeof outlets.$inferSelect;
export type BillPromotion = typeof billPromotions.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type MemberDeposit = typeof memberDeposits.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type StockOpname = typeof stockOpnames.$inferSelect;
export type StockOpnameItem = typeof stockOpnameItems.$inferSelect;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;

export type ProfileRole = StaffProfile['role'];
export type TableKind = VenueTable['kind'];
export type OrderStatus = Order['status'];
export type OrderSource = Order['source'];
export type PayMethod = Payment['method'];
export type StationType = 'kitchen' | 'bar';
export type Station = StationType;
