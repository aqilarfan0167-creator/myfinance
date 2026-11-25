import { db } from './db';
import type { OTEntry, SalaryRecord, Transaction } from './types';
import { ValidationError } from './repo';
import { uid } from '@/lib/cn';
import { fmtMonth, nowTimeKL } from '@/lib/date';
import { otAmount, otHours, salaryTotals } from '@/domain/salary';

const now = () => new Date().toISOString();
const audit = (entity: string, entityId: string, action: 'create' | 'update' | 'delete', before?: unknown, after?: unknown) =>
  db.audit.add({ id: uid(), at: now(), entity, entityId, action, before, after });
export const salaryTxnId = (salaryId: string) => `salary:${salaryId}`;

/* ---------------- OT ---------------- */
export type OTInput = Omit<OTEntry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'hours' | 'amount'>;

export function computeOT(i: OTInput) { const hours = otHours(i.start, i.end, i.breakMinutes); return { hours, amount: otAmount(hours, i.hourlyRate, i.multiplier) }; }

export async function saveOT(i: OTInput, id?: string): Promise<string> {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) e.push('Date is required.');
  if (!/^\d{2}:\d{2}$/.test(i.start) || !/^\d{2}:\d{2}$/.test(i.end)) e.push('Start and end times are required.');
  if (i.breakMinutes < 0) e.push('Break cannot be negative.');
  if (!(i.multiplier > 0 && i.multiplier <= 10)) e.push('Multiplier must be between 0 and 10.');
  if (i.hourlyRate < 0) e.push('Rate cannot be negative.');
  if (!/^\d{4}-\d{2}$/.test(i.salaryMonth)) e.push('Salary month is required.');
  const c = computeOT(i); if (c.hours <= 0) e.push('OT hours must be more than zero.');
  if (e.length) throw new ValidationError(e);
  let oldMonth: string | undefined;
  const newId = await db.transaction('rw', db.otEntries, db.audit, async () => {
    if (id) {
      const before = await db.otEntries.get(id); if (!before) throw new Error('OT entry not found');
      oldMonth = before.salaryMonth;
      const after = { ...before, ...i, ...c, updatedAt: now() }; await db.otEntries.put(after); await audit('ot', id, 'update', before, after); return id;
    }
    const rec: OTEntry = { ...i, ...c, id: uid(), createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.otEntries.add(rec); await audit('ot', rec.id, 'create', undefined, rec); return rec.id;
  });
  await refreshSalaryOT(i.salaryMonth); if (oldMonth && oldMonth !== i.salaryMonth) await refreshSalaryOT(oldMonth);
  return newId;
}
export async function deleteOT(id: string) {
  const e = await db.otEntries.get(id); if (!e) return;
  await db.transaction('rw', db.otEntries, db.audit, async () => { await db.otEntries.update(id, { deletedAt: now(), updatedAt: now() }); await audit('ot', id, 'delete', e); });
  await refreshSalaryOT(e.salaryMonth);
}
export async function otTotalForMonth(month: string) {
  const list = await db.otEntries.where('salaryMonth').equals(month).toArray();
  return list.filter((x) => !x.deletedAt && x.approval !== 'rejected').reduce((a, x) => a + x.amount, 0);
}
/** Keeps salary records with auto OT in sync with the OT log (only while not yet received). */
async function refreshSalaryOT(month: string) {
  const recs = (await db.salaries.where('month').equals(month).toArray()).filter((r) => !r.deletedAt && r.otAuto && r.status === 'expected');
  for (const r of recs) { const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, gross: _g, totalDeductions: _t, expectedNet: _e, status: _s, incomeTxnId: _i, ...rest } = r; await saveSalary(rest, id); }
}

/* ---------------- Salary ---------------- */
export type SalaryInput = Omit<SalaryRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'gross' | 'totalDeductions' | 'expectedNet' | 'status' | 'incomeTxnId'>;

export async function saveSalary(i: SalaryInput, id?: string): Promise<string> {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(i.month)) e.push('Salary month is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.expectedPayDate)) e.push('Expected pay date is required.');
  const money = [i.basic, i.bonus, i.claims, i.incentives, i.ot, i.epf, i.socso, i.eis, i.pcb, i.unpaidLeave, ...i.allowances.map((a) => a.amount), ...i.otherDeductions.map((a) => a.amount)];
  if (money.some((m) => !Number.isInteger(m) || m < 0)) e.push('Amounts must be zero or positive.');
  if (e.length) throw new ValidationError(e);
  const dup = (await db.salaries.where('month').equals(i.month).toArray()).find((r) => !r.deletedAt && r.id !== id && r.company.trim().toLowerCase() === i.company.trim().toLowerCase());
  if (dup) throw new ValidationError([`A salary record for ${fmtMonth(i.month)}${i.company ? ` (${i.company})` : ''} already exists. Edit it instead.`]);

  const ot = i.otAuto ? await otTotalForMonth(i.month) : i.ot;
  const clean = { ...i, ot, allowances: i.allowances.filter((a) => a.name.trim() || a.amount), otherDeductions: i.otherDeductions.filter((a) => a.name.trim() || a.amount) };
  const totals = salaryTotals(clean);

  return db.transaction('rw', db.salaries, db.transactions, db.audit, async () => {
    const before = id ? await db.salaries.get(id) : undefined;
    if (id && !before) throw new Error('Salary record not found');
    const rec: SalaryRecord = before
      ? { ...before, ...clean, ...totals, updatedAt: now() }
      : { ...clean, ...totals, id: uid(), status: 'expected', incomeTxnId: null, createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.salaries.put(rec); await audit('salary', rec.id, before ? 'update' : 'create', before, rec);
    if (rec.status === 'expected') await upsertExpectedIncome(rec);
    return rec.id;
  });
}

/** Expected salary appears as expected income (same deterministic ID used when confirmed → never duplicated). */
async function upsertExpectedIncome(r: SalaryRecord) {
  const tid = salaryTxnId(r.id); const ex = await db.transactions.get(tid);
  if (ex && ex.status === 'actual' && !ex.deletedAt) return;
  if (r.expectedNet <= 0) { if (ex) await db.transactions.delete(tid); return; }
  await db.transactions.put(salaryTxn(r, ex, { status: 'expected', amount: r.expectedNet, date: r.expectedPayDate, accountId: r.accountId }));
}
function salaryTxn(r: SalaryRecord, ex: Transaction | undefined, p: Pick<Transaction, 'status' | 'amount' | 'date' | 'accountId'>): Transaction {
  const t = now();
  return { id: salaryTxnId(r.id), createdAt: ex?.createdAt ?? t, updatedAt: t, deletedAt: null, time: ex?.time ?? nowTimeKL(),
    name: `Salary ${fmtMonth(r.month)}`, merchant: r.company, type: 'income', categoryId: 'inc-salary', fee: 0, toAccountId: null,
    paymentMethod: 'online_banking', needWant: null, remarks: ex?.remarks ?? '', attachmentIds: ex?.attachmentIds ?? [], related: [{ kind: 'salary', id: r.id }], recurringId: null, ...p };
}

/** Records actual salary as income exactly once (idempotent: re-confirming updates the same transaction). */
export async function confirmSalaryReceived(id: string, p: { actualNet: number; date: string; accountId: string }) {
  if (!p.accountId) throw new ValidationError(['Select the account the salary was paid into.']);
  if (!(p.actualNet > 0)) throw new ValidationError(['Actual net salary must be more than zero.']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new ValidationError(['Payment date is required.']);
  await db.transaction('rw', db.salaries, db.transactions, db.otEntries, db.audit, async () => {
    const r = await db.salaries.get(id); if (!r || r.deletedAt) throw new Error('Salary record not found');
    const ex = await db.transactions.get(salaryTxnId(id));
    const txn = salaryTxn(r, ex, { status: 'actual', amount: p.actualNet, date: p.date, accountId: p.accountId });
    await db.transactions.put(txn);
    await audit('transaction', txn.id, ex ? 'update' : 'create', ex, txn);
    const after: SalaryRecord = { ...r, status: 'received', actualNet: p.actualNet, paymentDate: p.date, accountId: p.accountId, incomeTxnId: txn.id, updatedAt: now() };
    await db.salaries.put(after); await audit('salary', id, 'update', r, after);
    await db.otEntries.where('salaryMonth').equals(r.month).modify((o) => { if (!o.deletedAt && o.approval !== 'rejected') { o.payment = 'paid'; o.updatedAt = now(); } });
  });
}

/** Deleting a salary record removes its *expected* income only; received income stays in the ledger. */
export async function deleteSalary(id: string) {
  await db.transaction('rw', db.salaries, db.transactions, db.audit, async () => {
    const r = await db.salaries.get(id); if (!r) return;
    const t = await db.transactions.get(salaryTxnId(id));
    if (t && t.status === 'expected') await db.transactions.delete(t.id);
    await db.salaries.update(id, { deletedAt: now(), updatedAt: now() }); await audit('salary', id, 'delete', r);
  });
}
