import type { Cents } from '@/lib/money';

export interface Base { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null }

export type AccountType = 'bank' | 'cash' | 'ewallet' | 'savings' | 'investment' | 'credit_card';
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
}

export interface AuditEntry { id: string; at: string; entity: string; entityId: string; action: 'create' | 'update' | 'delete' | 'restore' | 'import'; before?: unknown; after?: unknown }
export interface Meta { key: string; value: unknown }
