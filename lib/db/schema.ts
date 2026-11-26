import { sql } from 'drizzle-orm';
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
export const payMethodEnum = pgEnum('pay_method', ['cash', 'qris', 'transfer', 'edc']);
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
export const promotionTypeEnum = pgEnum('promotion_type', ['percent', 'fixed']);
export const promotionScopeEnum = pgEnum('promotion_scope', ['all', 'billiard', 'fnb']);
export const loyaltyTypeEnum = pgEnum('loyalty_type', ['earn', 'redeem', 'adjust']);

/* -------------------------------------------------------------------------- */
/*                                  Profiles                                  */
/* -------------------------------------------------------------------------- */

export const profiles = pgTable('profiles', {
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
}).enableRLS();

export const billiardRates = pgTable('billiard_rates', {
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
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    kind: tableKindEnum().notNull(),
    zone: text().notNull().default(''),
    capacity: integer().notNull().default(4),
    allowSelfOrder: boolean().notNull().default(false),
    qrToken: text().notNull().unique(),
    rateId: uuid().references(() => billiardRates.id, { onDelete: 'set null' }),
    needsCleaningAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('venue_tables_kind_idx').on(t.kind, t.sortOrder)],
).enableRLS();

export const tableRateSchedules = pgTable(
  'table_rate_schedules',
  {
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
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  minSpend: integer().notNull().default(0),
  discountBps: integer().notNull().default(0),
  pointsMultiplierBps: integer().notNull().default(10_000),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    phone: text().notNull().unique(),
    email: text(),
    tierId: uuid().references(() => memberTiers.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    points: integer().notNull().default(0),
    totalSpend: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    consent: boolean().notNull().default(false),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('members_phone_idx').on(t.phone), index('members_tier_idx').on(t.tierId)],
).enableRLS();

export const promotions = pgTable(
  'promotions',
  {
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
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promotions_active_idx').on(t.active, t.validTo)],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                                   Bills                                    */
/* -------------------------------------------------------------------------- */

export const bills = pgTable(
  'bills',
  {
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
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  icon: text().notNull().default('restaurant_menu'),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
}).enableRLS();

export const menuItems = pgTable(
  'menu_items',
  {
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

/* -------------------------------------------------------------------------- */
/*                                  Orders                                    */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  'orders',
  {
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

export const loyaltyLedger = pgTable(
  'loyalty_ledger',
  {
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

/* -------------------------------------------------------------------------- */
/*                                   Shift                                    */
/* -------------------------------------------------------------------------- */

export const shifts = pgTable(
  'shifts',
  {
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
      .on(t.status)
      .where(sql`${t.status} = 'open'`),
    index('shifts_closed_idx').on(t.closedAt),
  ],
).enableRLS();

/* -------------------------------------------------------------------------- */
/*                          Audit log & service calls                         */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  'audit_log',
  {
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
export type Shift = typeof shifts.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

export type ProfileRole = StaffProfile['role'];
export type TableKind = VenueTable['kind'];
export type OrderStatus = Order['status'];
export type OrderSource = Order['source'];
export type PayMethod = Payment['method'];
export type StationType = 'kitchen' | 'bar';
export type Station = StationType;
