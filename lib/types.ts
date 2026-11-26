import type {
  BilliardRate,
  OrderSource,
  OrderStatus,
  PayMethod,
  ProfileRole,
  Shift,
  StationType,
  TableKind,
} from './db/schema';

export type { OrderSource, OrderStatus, PayMethod, ProfileRole } from './db/schema';
export type RefundCategory = 'billiard' | 'fnb' | 'other';

export type RateView = Pick<
  BilliardRate,
  | 'id'
  | 'name'
  | 'description'
  | 'pricePerHour'
  | 'minMinutes'
  | 'incrementMinutes'
  | 'active'
  | 'sortOrder'
>;

export type SessionView = {
  id: string;
  status: 'running' | 'paused' | 'finished';
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  baseElapsedSeconds: number;
  ratePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  amount: number | null;
  estimate: number;
};

export type OrderItemView = {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  price: number;
  note: string | null;
  station: StationType;
  done: boolean;
};

export type OrderView = {
  id: string;
  number: string;
  source: OrderSource;
  status: OrderStatus;
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  items: OrderItemView[];
  subtotal: number;
};

export type BillView = {
  id: string;
  number: string;
  guestName: string | null;
  status: 'open' | 'paid' | 'void';
  openedAt: string;
  sessions: SessionView[];
  activeSession: SessionView | null;
  orders: OrderView[];
  sessionSubtotal: number;
  ordersSubtotal: number;
  subtotal: number;
  discountAmount: number;
  memberId: string | null;
  memberDiscountAmount: number;
  promotionCode: string | null;
  promoDiscountAmount: number;
  totalDiscountAmount: number;
  taxRateBps: number;
  serviceRateBps: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  pendingOrdersCount: number;
};

export type TableState = 'available' | 'running' | 'paused' | 'occupied' | 'cleaning';

export type ServiceRequestView = {
  id: string;
  tableId: string;
  tableCode: string;
  type: 'waiter' | 'bill' | 'assistance';
  note: string | null;
  createdAt: string;
};

export type TableView = {
  id: string;
  code: string;
  kind: TableKind;
  zone: string;
  capacity: number;
  allowSelfOrder: boolean;
  qrToken: string;
  rate: RateView | null;
  needsCleaningAt: string | null;
  state: TableState;
  bill: BillView | null;
  serviceRequests: ServiceRequestView[];
  pendingOrdersCount: number;
};

export type ShiftView = {
  id: string;
  staffId: string;
  staffName: string;
  status: 'open' | 'closed';
  openingCash: number;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
};

export type MenuCategoryView = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  active: boolean;
};

export type MenuItemView = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  price: number;
  stock: number | null;
  station: StationType;
  imageIcon: string;
  bestSeller: boolean;
  available: boolean;
  soldOut: boolean;
  sortOrder: number;
};

export type CashierMetrics = {
  billiardTotal: number;
  billiardRunning: number;
  billiardPaused: number;
  billiardAvailable: number;
  billiardCleaning: number;
  cafeTotal: number;
  cafeOccupied: number;
  openBillCount: number;
  openBillTotal: number;
  pendingCount: number;
  serviceRequestCount: number;
};

export type CashierData = {
  serverNow: string;
  tables: TableView[];
  metrics: CashierMetrics;
  shift: ShiftView | null;
  categories: MenuCategoryView[];
  menuItems: MenuItemView[];
  serviceRequests: ServiceRequestView[];
};

export type KdsOrderView = OrderView & {
  tableCode: string;
  tableZone: string;
  tableKind: TableKind;
  waitSeconds: number;
  stationItemsDone: number;
  stationItemsTotal: number;
  allItemsDone: boolean;
};

export type KdsMetrics = {
  activeTickets: number;
  avgServeSeconds: number | null;
  overdueCount: number;
  readyCount: number;
  kitchenCount: number;
  barCount: number;
};

export type KdsData = {
  serverNow: string;
  orders: KdsOrderView[];
  metrics: KdsMetrics;
};

export type PaymentBreakdown = {
  method: PayMethod;
  amount: number;
  count: number;
};

export type AdminData = {
  serverNow: string;
  shift: ShiftView | null;
  shiftStats: {
    revenue: number;
    billiardRevenue: number;
    fnbRevenue: number;
    cashRevenue: number;
    nonCashRevenue: number;
    refundAmount: number;
    transactionCount: number;
    openBills: number;
    openBillTotal: number;
    cashInDrawer: number;
    expectedCash: number;
    avgPlaySeconds: number | null;
    totalPlaySeconds: number;
    topTable: { code: string; amount: number; seconds: number } | null;
    paymentBreakdown: PaymentBreakdown[];
  };
  rates: Array<RateView & { tableCount: number }>;
  audits: Array<{
    id: string;
    staffName: string;
    staffRole: string;
    action: string;
    entityType: string;
    entityId: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
  }>;
  shiftHistory: ShiftView[];
  menuCount: number;
  tableCount: number;
  openServiceRequests: number;
};

export type ShiftReportData = {
  shift: ShiftView;
  staffName: string;
  venueName: string;
  venueAddress: string;
  serverNow: string;
  payments: Array<{
    id: string;
    billNumber: string;
    tableCode: string;
    method: PayMethod;
    amount: number;
    createdAt: string;
  }>;
  totals: Array<{ method: PayMethod; amount: number; count: number }>;
  totalRevenue: number;
  cashRevenue: number;
  expectedCash: number;
  refundTotal: number;
  refunds: Array<{
    id: string;
    billNumber: string;
    tableCode: string;
    method: PayMethod;
    amount: number;
    reason: string;
    createdAt: string;
  }>;
  bills: Array<{
    id: string;
    billNumber: string;
    tableCode: string;
    guestName: string | null;
    total: number;
    refundedAmount: number;
    closedAt: string | null;
  }>;
};

export type ReportDay = {
  date: string;
  revenue: number;
  refunds: number;
  transactionCount: number;
  billiardRevenue: number;
  fnbRevenue: number;
};

export type ReportData = {
  days: ReportDay[];
  topItems: Array<{ name: string; qty: number; revenue: number }>;
  topTables: Array<{ code: string; zone: string; revenue: number; sessions: number }>;
  paymentMix: Array<{ method: PayMethod; amount: number; count: number; share: number }>;
  totals: {
    revenue: number;
    refunds: number;
    transactions: number;
    avgBill: number;
    billiard: number;
    fnb: number;
  };
};

export type MenuAdminData = {
  categories: MenuCategoryView[];
  items: MenuItemView[];
};

export type TablesAdminData = {
  tables: Array<
    TableView & {
      qrDataUrl: string;
      customerUrl: string;
      rateName: string | null;
      activeSession: SessionView | null;
    }
  >;
  rates: RateView[];
};

export type CustomerOrderView = {
  id: string;
  number: string;
  status: OrderStatus;
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    note: string | null;
    station: StationType;
  }>;
  subtotal: number;
};

export type NotificationView = {
  id: string;
  channel: 'email' | 'whatsapp' | 'log';
  type: 'receipt' | 'order_ready' | 'reservation' | 'test';
  recipient: string;
  subject: string | null;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  lastError: string | null;
  billNumber: string | null;
  orderNumber: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type NotificationsData = {
  items: NotificationView[];
  config: {
    preferred: 'email' | 'whatsapp' | 'log';
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    label: string;
  };
  stats: { pending: number; sent: number; failed: number };
};

export type MemberTierView = {
  id: string;
  name: string;
  minSpend: number;
  discountBps: number;
  pointsMultiplierBps: number;
  active: boolean;
  sortOrder: number;
};

export type MemberView = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  tierId: string | null;
  tierName: string | null;
  points: number;
  totalSpend: number;
  active: boolean;
  consent: boolean;
  note: string | null;
  createdAt: string;
};

export type MemberAdminData = {
  members: MemberView[];
  tiers: MemberTierView[];
};

export type PromotionView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'percent' | 'fixed';
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usesCount: number;
  validFrom: string | null;
  validTo: string | null;
  appliesTo: 'all' | 'billiard' | 'fnb';
  memberOnly: boolean;
  active: boolean;
};

export type PromotionsAdminData = {
  promotions: PromotionView[];
};

export type BillSplitItemView = {
  id: string;
  type: 'order_item' | 'session';
  refId: string;
  name: string;
  qty: number;
  amount: number;
};

export type BillSplitView = {
  id: string;
  label: string;
  status: 'open' | 'paid' | 'void';
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  paidAmount: number;
  paidAt: string | null;
  items: BillSplitItemView[];
};

export type SplitBillData = {
  bill: BillView;
  table: {
    code: string;
    zone: string;
    kind: TableKind;
  };
  serverNow: string;
  splits: BillSplitView[];
  payments: Array<{
    id: string;
    billSplitId: string | null;
    method: PayMethod;
    amount: number;
    staffName: string | null;
    createdAt: string;
  }>;
};

export type ReservationView = {
  id: string;
  code: string;
  tableId: string;
  tableCode: string;
  tableZone: string;
  tableKind: TableKind;
  guestName: string;
  phone: string | null;
  partySize: number;
  startAt: string;
  endAt: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  depositAmount: number;
  depositStatus: 'none' | 'pending' | 'paid' | 'refunded' | 'forfeited';
  note: string | null;
  billId: string | null;
  sessionId: string | null;
  createdAt: string;
};

export type WaitlistView = {
  id: string;
  code: string;
  guestName: string;
  phone: string | null;
  partySize: number;
  preference: TableKind;
  status: 'waiting' | 'called' | 'seated' | 'cancelled' | 'no_show';
  estimatedWaitMinutes: number;
  note: string | null;
  createdAt: string;
};

export type ReservationsData = {
  serverNow: string;
  tables: Array<{
    id: string;
    code: string;
    zone: string;
    kind: TableKind;
    capacity: number;
  }>;
  reservations: ReservationView[];
  waitlist: WaitlistView[];
};

export type RateScheduleView = {
  id: string;
  tableId: string;
  tableCode: string;
  rateId: string;
  rateName: string;
  pricePerHour: number;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  priority: number;
  active: boolean;
};

export type RateSchedulesAdminData = {
  tables: Array<{
    id: string;
    code: string;
    zone: string;
    rateId: string | null;
    rateName: string | null;
  }>;
  rates: RateView[];
  schedules: RateScheduleView[];
};

export type RefundAdminPaymentView = {
  id: string;
  method: PayMethod;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  createdAt: string;
};

export type RefundAdminBillView = {
  id: string;
  number: string;
  tableCode: string;
  guestName: string | null;
  total: number;
  refundedAmount: number;
  closedAt: string | null;
  payments: RefundAdminPaymentView[];
  refunds: Array<{
    id: string;
    amount: number;
    category: RefundCategory;
    reason: string;
    restocked: boolean;
    staffName: string;
    createdAt: string;
  }>;
};

export type RefundAdminData = {
  bills: RefundAdminBillView[];
  totalRefunded: number;
};

export type VenueSettingsView = {
  venueName: string;
  address: string;
  timezone: string;
  taxRateBps: number;
  serviceRateBps: number;
  warningMinutes: number;
  receiptFooter: string;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type StaffAdminView = {
  id: string;
  email: string;
  name: string;
  role: ProfileRole;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
};

export type StaffSettingsData = {
  settings: VenueSettingsView;
  staff: StaffAdminView[];
  authMode: 'supabase' | 'demo' | 'disabled';
  canProvisionAuth: boolean;
};

export type CustomerData = {
  table: {
    code: string;
    zone: string;
    kind: TableKind;
    capacity: number;
    allowSelfOrder: boolean;
    qrToken: string;
  };
  venueName: string;
  categories: MenuCategoryView[];
  items: MenuItemView[];
  orders: CustomerOrderView[];
  bill: {
    id: string;
    number: string;
    subtotal: number;
    total: number;
    openedAt: string;
  } | null;
  serverNow: string;
  openServiceRequest: boolean;
};

export type PaymentInput = {
  method: PayMethod;
  amount: number;
  tendered?: number;
};

export type CartLine = {
  menuItemId: string;
  qty: number;
  note?: string;
};

export type PublicOrderStatusResponse = {
  serverNow: string;
  orders: CustomerOrderView[];
  bill: CustomerData['bill'];
};

export type ShiftHistoryItem = Shift & { staffName: string };
