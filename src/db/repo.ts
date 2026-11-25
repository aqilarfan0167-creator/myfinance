import { db } from './db';
import type { Account, AuditEntry, Category, Settings, Transaction } from './types';
import { uid } from '@/lib/cn';
import { nowTimeKL, todayKL } from '@/lib/date';
import { computeBalances } from '@/domain/ledger';

const now = () => new Date().toISOString();
const audit = (e: Omit<AuditEntry, 'id' | 'at'>) => db.audit.add({ id: uid(), at: now(), ...e });

export class ValidationError extends Error { constructor(public errors: string[]) { super(errors.join('\n')); } }

/* ---------------- Accounts ---------------- */
export type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export function validateAccount(a: AccountInput): string[] {
  const e: string[] = [];
  if (!a.name.trim()) e.push('Account name is required.');
  if (!Number.isInteger(a.openingBalance)) e.push('Opening balance is invalid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.openingDate)) e.push('Opening date is required.');
  if (a.creditLimit != null && a.creditLimit < 0) e.push('Credit limit cannot be negative.');
  return e;
}

export async function saveAccount(input: AccountInput, id?: string): Promise<string> {
  const errs = validateAccount(input); if (errs.length) throw new ValidationError(errs);
  return db.transaction('rw', db.accounts, db.audit, async () => {
    if (id) {
      const before = await db.accounts.get(id); if (!before) throw new Error('Account not found');
      const after = { ...before, ...input, updatedAt: now() };
      await db.accounts.put(after); await audit({ entity: 'account', entityId: id, action: 'update', before, after });
      return id;
    }
    const t = now(); const rec: Account = { ...input, id: uid(), createdAt: t, updatedAt: t, deletedAt: null };
    await db.accounts.add(rec); await audit({ entity: 'account', entityId: rec.id, action: 'create', after: rec });
    return rec.id;
  });
}

/** Accounts with transactions cannot be deleted (would corrupt history) – archive instead. */
export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.audit, async () => {
    const used = await db.transactions.filter((t) => !t.deletedAt && (t.accountId === id || t.toAccountId === id)).count();
    if (used) throw new ValidationError([`This account has ${used} transaction(s). Archive it instead of deleting.`]);
    const before = await db.accounts.get(id); if (!before) return;
    await db.accounts.update(id, { deletedAt: now(), updatedAt: now() });
    await audit({ entity: 'account', entityId: id, action: 'delete', before });
  });
}

/** Creates an adjustment transaction so the computed balance matches the real balance. */
export async function reconcileAccount(accountId: string, actualBalance: number, remarks = ''): Promise<string | null> {
  const [accs, txns] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
  const current = computeBalances(accs, txns).get(accountId) ?? 0;
  const diff = actualBalance - current;
  if (diff === 0) return null;
  return saveTransaction({ ...blankTxn('adjustment'), name: 'Balance reconciliation', amount: diff, accountId, remarks: remarks || `Reconciled from ${current / 100} to ${actualBalance / 100}` });
}

/* ---------------- Transactions ---------------- */
export type TxnInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export function blankTxn(type: Transaction['type'] = 'expense'): TxnInput {
  return { date: todayKL(), time: nowTimeKL(), name: '', merchant: '', type, categoryId: null, amount: 0, fee: 0, accountId: null, toAccountId: null, paymentMethod: null, needWant: null, remarks: '', status: 'actual', attachmentIds: [], related: [], recurringId: null };
}

export function validateTxn(t: TxnInput): string[] {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) e.push('A valid date is required.');
  if (!Number.isInteger(t.amount)) e.push('Amount is invalid.');
  if (t.type === 'adjustment' ? t.amount === 0 : t.amount <= 0) e.push('Amount must be greater than zero.');
  if (!Number.isInteger(t.fee) || t.fee < 0) e.push('Fee is invalid.');
  if (!t.accountId && t.status === 'actual') e.push('Please select an account.');
  if (t.type === 'transfer') {
    if (!t.toAccountId) e.push('Please select the destination account.');
    if (t.toAccountId && t.toAccountId === t.accountId) e.push('Source and destination accounts must differ.');
  }
  if (t.type === 'debt_repayment' && t.toAccountId === t.accountId && t.toAccountId) e.push('Cannot repay an account from itself.');
  if ((t.type === 'income' || t.type === 'expense') && !t.categoryId) e.push('Please choose a category.');
  if (t.name.length > 200 || t.remarks.length > 2000) e.push('Text is too long.');
  return e;
}

export async function saveTransaction(input: TxnInput, id?: string): Promise<string> {
  const clean: TxnInput = { ...input, name: input.name.trim(), merchant: input.merchant.trim(), remarks: input.remarks.trim(),
    fee: input.type === 'transfer' ? input.fee : 0,
    toAccountId: input.type === 'transfer' || input.type === 'debt_repayment' ? input.toAccountId : null };
  if (!clean.name) clean.name = clean.merchant || defaultName(clean.type);
  const errs = validateTxn(clean); if (errs.length) throw new ValidationError(errs);

  return db.transaction('rw', db.transactions, db.audit, db.settings, async () => {
    // learn merchant -> category
    if (clean.merchant && clean.categoryId && (clean.type === 'expense' || clean.type === 'income')) {
      const s = await db.settings.get('app');
      if (s) await db.settings.update('app', { merchantCategory: { ...s.merchantCategory, [clean.merchant.toLowerCase()]: clean.categoryId } });
    }
    if (id) {
      const before = await db.transactions.get(id); if (!before || before.deletedAt) throw new Error('Transaction not found');
      const after: Transaction = { ...before, ...clean, id, updatedAt: now() };
      await db.transactions.put(after); await audit({ entity: 'transaction', entityId: id, action: 'update', before, after });
      return id;
    }
    const t = now(); const rec: Transaction = { ...clean, id: uid(), createdAt: t, updatedAt: t, deletedAt: null };
    await db.transactions.add(rec); await audit({ entity: 'transaction', entityId: rec.id, action: 'create', after: rec });
    return rec.id;
  });
}

const defaultName = (t: Transaction['type']) => ({ income: 'Income', expense: 'Expense', transfer: 'Transfer', debt_repayment: 'Debt repayment', refund: 'Refund', adjustment: 'Balance adjustment' })[t];

/** Soft delete: kept for audit/undo, excluded from all calculations. */
export async function deleteTransaction(id: string) {
  await db.transaction('rw', db.transactions, db.audit, async () => {
    const before = await db.transactions.get(id); if (!before) return;
    await db.transactions.update(id, { deletedAt: now(), updatedAt: now() });
    await audit({ entity: 'transaction', entityId: id, action: 'delete', before });
  });
}
export async function restoreTransaction(id: string) {
  await db.transaction('rw', db.transactions, db.audit, async () => {
    await db.transactions.update(id, { deletedAt: null, updatedAt: now() });
    await audit({ entity: 'transaction', entityId: id, action: 'restore' });
  });
}

/** Expected income -> actual received income (same record, so no duplication). */
export async function confirmExpected(id: string, accountId: string, date = todayKL(), amount?: number) {
  const t = await db.transactions.get(id); if (!t) throw new Error('Not found');
  const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = t;
  return saveTransaction({ ...rest, status: 'actual', accountId, date, amount: amount ?? t.amount }, id);
}

/** Possible duplicates: same type & amount, within ±1 day, same account or same merchant. */
export async function findDuplicates(t: TxnInput, excludeId?: string): Promise<Transaction[]> {
  const all = await db.transactions.where('date').between(shift(t.date, -1), shift(t.date, 1), true, true).toArray();
  return all.filter((x) => !x.deletedAt && x.id !== excludeId && x.type === t.type && x.amount === t.amount &&
    (x.accountId === t.accountId || (!!t.merchant && x.merchant.toLowerCase() === t.merchant.toLowerCase())));
}
function shift(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/* ---------------- Categories & settings ---------------- */
export async function saveCategory(c: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'system'>, id?: string) {
  if (!c.name.trim()) throw new ValidationError(['Category name is required.']);
  const t = now();
  if (id) { await db.categories.update(id, { ...c, updatedAt: t }); return id; }
  const rec: Category = { ...c, id: uid(), system: false, createdAt: t, updatedAt: t };
  await db.categories.add(rec); return rec.id;
}
export async function updateSettings(p: Partial<Settings>) { await db.settings.update('app', p); }
