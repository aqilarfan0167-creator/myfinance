import type { AccountType, PaymentMethod, TxnType } from '@/db/types';
export const TXN_TYPES: { v: TxnType; label: string; color: string }[] = [
  { v: 'expense', label: 'Expense', color: 'text-expense' },
  { v: 'income', label: 'Income', color: 'text-income' },
  { v: 'transfer', label: 'Transfer', color: 'text-transfer' },
  { v: 'debt_repayment', label: 'Debt Repayment', color: 'text-warn' },
  { v: 'refund', label: 'Refund', color: 'text-income' },
  { v: 'adjustment', label: 'Adjustment', color: 'text-slate-500' },
];
export const txnLabel = (t: TxnType) => TXN_TYPES.find((x) => x.v === t)!.label;
export const PAYMENT_METHODS: { v: PaymentMethod; label: string }[] = [
  { v: 'cash', label: 'Cash' }, { v: 'debit_card', label: 'Debit Card' }, { v: 'credit_card', label: 'Credit Card' },
  { v: 'online_banking', label: 'Online Banking' }, { v: 'duitnow_qr', label: 'DuitNow QR' }, { v: 'ewallet', label: 'E-Wallet' }, { v: 'other', label: 'Other' },
];
export const ACCOUNT_TYPES: { v: AccountType; label: string; icon: string }[] = [
  { v: 'bank', label: 'Bank Account', icon: 'Landmark' }, { v: 'cash', label: 'Cash', icon: 'Banknote' }, { v: 'ewallet', label: 'E-Wallet', icon: 'Wallet' },
  { v: 'savings', label: 'Savings', icon: 'PiggyBank' }, { v: 'investment', label: 'Investment', icon: 'LineChart' }, { v: 'credit_card', label: 'Credit Card', icon: 'CreditCard' },
];
/** Sign shown for a transaction in lists, relative to a viewing account (optional). */
export function txnSign(type: TxnType, amount: number, viewAccount?: string, t?: { accountId: string | null; toAccountId: string | null }): number {
  if (type === 'adjustment') return Math.sign(amount);
  if (type === 'income' || type === 'refund') return 1;
  if ((type === 'transfer' || type === 'debt_repayment') && viewAccount && t?.toAccountId === viewAccount) return 1;
  if (type === 'transfer' && !viewAccount) return 0;
  return -1;
}
