import type { Cents } from '@/lib/money';

export interface Base { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null }

export type AccountType = 'bank' | 'cash' | 'ewallet' | 'savings' | 'investment' | 'credit_card' | 'loan';
export const LIABILITY_TYPES: AccountType[] = ['credit_card', 'loan'];
export const isLiability = (t?: AccountType) => t === 'credit_card' || t === 'loan';

export interface LoanInfo {
  lender: string;
  loanType: 'car' | 'housing' | 'ptptn' | 'mara' | 'personal' | 'other';
  originalAmount: Cents;
  annualRate: number; // % p.a.
  /** reducing: balance is principal, interest accrues monthly. flat: balance already includes all interest (hire purchase). */
  rateType: 'reducing' | 'flat';
  instalment: Cents;
  targetDate: string | null;
}
export interface Account extends Base {
  name: string;
  type: AccountType;
  /** For credit cards: enter outstanding as positive; stored as negative (liability). */
  openingBalance: Cents;
  openingDate: string; // YYYY-MM-DD
  icon: string;
  color: string;
  status: 'active' | 'archived';
  lowBalanceThreshold: Cents | null;
  includeInAvailable: boolean;
  includeInNetWorth: boolean;
  creditLimit?: Cents | null;
  statementDay?: number | null;
  dueDay?: number | null;
  notes?: string;
  loan?: LoanInfo | null;
}

export type TxnType = 'income' | 'expense' | 'transfer' | 'debt_repayment' | 'refund' | 'adjustment';
export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'online_banking' | 'duitnow_qr' | 'ewallet' | 'other';
export type NeedWant = 'need' | 'want' | null;

export interface Transaction extends Base {
  date: string; // YYYY-MM-DD (Asia/Kuala_Lumpur)
  time: string; // HH:mm
  name: string;
  merchant: string;
  type: TxnType;
  categoryId: string | null;
  /** Positive cents. For 'adjustment' it is signed (+/-). */
  amount: Cents;
  /** Transfer fee (transfers only), deducted from source and counted as a fee expense. */
  fee: Cents;
  accountId: string | null; // source (expense/transfer/repayment) or destination (income/refund/adjustment)
  toAccountId: string | null; // transfer destination or credit-card account being repaid
  paymentMethod: PaymentMethod | null;
  needWant: NeedWant;
  remarks: string;
  /** 'expected' records do not affect balances until confirmed. */
  status: 'actual' | 'expected';
  attachmentIds: string[];
  related: { kind: string; id: string }[];
  recurringId?: string | null;
}

export interface Category extends Base {
  name: string;
  nameMs?: string;
  kind: 'income' | 'expense';
  color: string;
  icon: string;
  needWant: NeedWant; // default
  system: boolean;
  archived: boolean;
}

export interface Settings {
  id: 'app';
  language: 'en' | 'ms';
  theme: 'light' | 'dark' | 'system';
  payDay: number; // day of month salary arrives
  demoLoaded: boolean;
  merchantCategory: Record<string, string>; // learned merchant -> categoryId
  salaryProfile: SalaryProfile;
  notificationPrefs: NotificationPrefs;
  updatedAt?: string;
}

export interface AuditEntry { id: string; at: string; entity: string; entityId: string; action: 'create' | 'update' | 'delete' | 'restore' | 'import'; before?: unknown; after?: unknown }
export interface Meta { key: string; value: unknown }

/* ---------------- Phase 2 ---------------- */
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
export type DayType = 'normal' | 'rest' | 'public_holiday';

export interface SalaryProfile {
  company: string;
  basic: Cents;
  allowances: { name: string; amount: Cents }[];
  /** Hourly OT base. Default (Employment Act 1955): basic ÷ 26 ÷ 8. */
  hourlyRateOverride: Cents | null;
  workDaysPerMonth: number;
  hoursPerDay: number;
  multipliers: Record<DayType, number>;
  defaultAccountId: string | null;
}

export interface OTEntry extends Base {
  date: string; start: string; end: string; breakMinutes: number;
  dayType: DayType; multiplier: number; hourlyRate: Cents;
  hours: number; // decimal hours (computed)
  amount: Cents; // computed: hours × rate × multiplier
  reason: string;
  approval: 'pending' | 'approved' | 'rejected';
  payment: 'unpaid' | 'paid';
  salaryMonth: string; // YYYY-MM the OT is paid in
}

export interface SalaryRecord extends Base {
  month: string; // YYYY-MM salary month
  company: string;
  basic: Cents;
  allowances: { name: string; amount: Cents }[];
  bonus: Cents; claims: Cents; incentives: Cents;
  otAuto: boolean; ot: Cents; // ot = sum of OT log when otAuto
  epf: Cents; socso: Cents; eis: Cents; pcb: Cents; unpaidLeave: Cents;
  otherDeductions: { name: string; amount: Cents }[];
  gross: Cents; totalDeductions: Cents; expectedNet: Cents;
  actualNet: Cents | null;
  expectedPayDate: string; paymentDate: string | null;
  accountId: string | null;
  status: 'expected' | 'received';
  incomeTxnId: string | null;
  remarks: string;
  attachmentIds: string[];
}

export interface Commitment extends Base {
  name: string;
  kind: 'expense' | 'debt'; // debt → paid as debt repayment (not an expense)
  categoryId: string | null;
  amount: Cents;
  startDate: string; // first due date; anchors the schedule
  endDate: string | null;
  frequency: Frequency;
  accountId: string | null; // usual paying account
  toAccountId: string | null; // credit card account when repaying a card
  trackFrom: string; // occurrences generated from this date (avoids back-filling years)
  active: boolean;
  remarks: string;
}

export interface Occurrence {
  id: string; // `${commitmentId}:${dueDate}` – deterministic, prevents duplicates
  commitmentId: string;
  dueDate: string;
  amount: Cents;
  amountOverridden: boolean;
  skipped: boolean;
  updatedAt: string;
}

export interface RecurringRule extends Base {
  name: string;
  template: Pick<Transaction, 'type' | 'amount' | 'fee' | 'categoryId' | 'accountId' | 'toAccountId' | 'merchant' | 'paymentMethod' | 'needWant' | 'remarks'>;
  frequency: Frequency;
  startDate: string; endDate: string | null;
  autoPost: boolean; // true: becomes actual on its date; false: stays expected until confirmed
  active: boolean;
  trackFrom: string;
}

/* ---------------- Phase 3 ---------------- */
export interface Budget { id: string /* `${month}:${categoryId}` */; month: string; categoryId: string; amount: Cents; createdAt: string; updatedAt: string }

export type GoalType = 'emergency' | 'car' | 'house' | 'wedding' | 'travel' | 'investment' | 'education' | 'other';
export interface Goal extends Base {
  name: string; type: GoalType;
  target: Cents; targetDate: string | null;
  startingAmount: Cents; monthlyContribution: Cents;
  linkedAccountId: string | null;
  priority: 1 | 2 | 3; // 1 high
  status: 'active' | 'completed' | 'archived';
  color: string;
  /** Set aside this month's unpaid contribution in the daily allowance. */
  reserveMonthly: boolean;
  remarks: string;
}
export interface GoalEntry extends Base { goalId: string; date: string; amount: Cents /* + contribution, − withdrawal */; txnId: string | null; note: string }

export type Priority = 'low' | 'medium' | 'high';
export interface Task extends Base {
  name: string; category: string; dueDate: string | null; priority: Priority;
  recurrence: 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  status: 'pending' | 'done' | 'cancelled';
  seriesId: string; completedAt: string | null; remarks: string;
}

/* ---------------- Phase 4 ---------------- */
export type AttachmentKind = 'receipt' | 'payslip' | 'other';
/** File metadata. The bytes live in the `files` table so lists stay fast. Deleting an attachment never deletes a transaction. */
export interface Attachment extends Base {
  kind: AttachmentKind;
  fileName: string; mimeType: string; size: number;
  hash: string; // SHA-256 of the original bytes (duplicate detection)
  width?: number; height?: number; pages?: number;
}
export interface StoredFile { id: string /* = attachment id */; blob: Blob; thumb: Blob | null; processed: Blob | null /* edited image used for OCR */ }

export type Confidence = 'high' | 'medium' | 'low';
export interface Field<T> { value: T | null; confidence: Confidence | null; source?: string }
export interface ReceiptItem { name: string; qty: number | null; unitPrice: number | null; amount: number | null }
export interface ReceiptData {
  merchant: Field<string>; address: Field<string>; registrationNo: Field<string>;
  date: Field<string>; time: Field<string>; receiptNo: Field<string>;
  items: ReceiptItem[];
  subtotal: Field<number>; discount: Field<number>; sst: Field<number>; serviceCharge: Field<number>; rounding: Field<number>; total: Field<number>;
  currency: Field<string>; paymentMethod: Field<PaymentMethod>;
  warnings: string[];
}
export type ReceiptStatus = 'processing' | 'review' | 'draft' | 'recorded' | 'duplicate' | 'failed';
export interface Split { categoryId: string; amount: number; needWant: NeedWant; note: string }
export interface Receipt extends Base {
  attachmentId: string;
  status: ReceiptStatus;
  ocrText: string; ocrConfidence: number | null; ocrEngine: string; textSource: 'ocr' | 'pdf-text' | 'manual' | null;
  data: ReceiptData | null;
  /** User-edited values (what gets saved). */
  form: ReceiptForm | null;
  txnIds: string[];
  duplicateOf: string[]; // receipt or transaction ids flagged as possible duplicates
  error: string | null;
  merchant: string; date: string | null; total: number | null; receiptNo: string; // denormalised for search
}
export interface ReceiptForm {
  merchant: string; address: string; date: string; time: string; receiptNo: string;
  items: ReceiptItem[]; subtotal: number | null; discount: number | null; sst: number | null; serviceCharge: number | null; total: number | null;
  paymentMethod: PaymentMethod | null; accountId: string | null; categoryId: string | null; needWant: NeedWant; remarks: string;
  splits: Split[]; // empty = single category
}

/* ---------------- Phase 5 ---------------- */
export type NotifType = 'payment_due' | 'overdue' | 'budget' | 'low_balance' | 'salary' | 'task' | 'receipt' | 'subscription' | 'backup' | 'card_due';
export interface NotificationPrefs {
  payments: { enabled: boolean; daysBefore: number };
  overdue: boolean;
  budget: { enabled: boolean; warnAt: number /* % */ };
  lowBalance: boolean;
  salary: boolean;
  tasks: { enabled: boolean; daysBefore: number };
  receipts: boolean;
  subscriptions: { enabled: boolean; daysBefore: number };
  backup: { enabled: boolean; everyDays: number };
  /** Show system notifications while MyFinance is open (needs browser permission). */
  browser: boolean;
}
export interface AppNotification {
  id: string; // deterministic key, e.g. `due:<occurrenceId>` – prevents duplicates
  type: NotifType; severity: 'info' | 'warning' | 'alert';
  title: string; body: string; link: string;
  createdAt: string; readAt: string | null; dismissedAt: string | null; resolvedAt: string | null;
}
