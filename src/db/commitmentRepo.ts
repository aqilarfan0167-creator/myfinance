import { db } from './db';
import type { Commitment, Occurrence, RecurringRule, Transaction } from './types';
import { saveTransaction, ValidationError, validateTxn, blankTxn } from './repo';
import { uid } from '@/lib/cn';
import { addDays, monthStart, todayKL } from '@/lib/date';
import { scheduleDates } from '@/domain/schedule';
import { paymentsByOccurrence } from '@/domain/commitments';

const now = () => new Date().toISOString();
const audit = (entity: string, entityId: string, action: 'create' | 'update' | 'delete', before?: unknown, after?: unknown) =>
  db.audit.add({ id: uid(), at: now(), entity, entityId, action, before, after });
export const OCC_HORIZON_DAYS = 62;
export const REC_HORIZON_DAYS = 31;

/* ---------------- Commitments ---------------- */
export type CommitmentInput = Omit<Commitment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'trackFrom'> & { trackFrom?: string };

export async function saveCommitment(i: CommitmentInput, id?: string): Promise<string> {
  const e: string[] = [];
  if (!i.name.trim()) e.push('Name is required.');
  if (!Number.isInteger(i.amount) || i.amount <= 0) e.push('Amount must be more than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.startDate)) e.push('First due date is required.');
  if (i.endDate && i.endDate < i.startDate) e.push('End date must be after the first due date.');
  if (i.kind === 'expense' && !i.categoryId) e.push('Choose a category.');
  if (e.length) throw new ValidationError(e);
  const rid = await db.transaction('rw', db.commitments, db.audit, async () => {
    if (id) {
      const before = await db.commitments.get(id); if (!before) throw new Error('Not found');
      const after = { ...before, ...i, name: i.name.trim(), trackFrom: i.trackFrom ?? before.trackFrom, updatedAt: now() };
      await db.commitments.put(after); await audit('commitment', id, 'update', before, after); return id;
    }
    // Track from the current month (or the start date if later) – don't back-fill years of "overdue" items.
    const tf = i.trackFrom ?? (i.startDate > monthStart(todayKL()) ? i.startDate : monthStart(todayKL()));
    const rec: Commitment = { ...i, name: i.name.trim(), trackFrom: tf, id: uid(), createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.commitments.add(rec); await audit('commitment', rec.id, 'create', undefined, rec); return rec.id;
  });
  await generateOccurrences();
  return rid;
}
export async function deleteCommitment(id: string) {
  await db.transaction('rw', db.commitments, db.audit, async () => { const b = await db.commitments.get(id); await db.commitments.update(id, { deletedAt: now(), updatedAt: now(), active: false }); await audit('commitment', id, 'delete', b); });
  await generateOccurrences();
}

/**
 * Idempotent: creates missing occurrences (deterministic IDs), syncs amounts of unpaid future ones,
 * and removes unpaid occurrences no longer in the schedule. Paid occurrences are never removed.
 */
export async function generateOccurrences(today = todayKL()) {
  const horizon = addDays(today, OCC_HORIZON_DAYS);
  // Payments are read outside the write transaction so the (possibly large) transactions table is never write-locked here.
  const paid = paymentsByOccurrence(await db.transactions.filter((t) => t.related?.some((r) => r.kind === 'occurrence')).toArray());
  await db.transaction('rw', db.commitments, db.occurrences, async () => {
    const [comms, existing] = await Promise.all([db.commitments.toArray(), db.occurrences.toArray()]);
    const byC = new Map<string, Occurrence[]>();
    for (const o of existing) { const a = byC.get(o.commitmentId) ?? []; a.push(o); byC.set(o.commitmentId, a); }
    const add: Occurrence[] = [], upd: Occurrence[] = [], del: string[] = [];
    for (const c of comms) {
      const live = !c.deletedAt && c.active;
      const wanted = new Set(live ? scheduleDates(c.startDate, c.endDate, c.frequency, c.trackFrom, horizon).map((d) => `${c.id}:${d}`) : []);
      const have = new Map((byC.get(c.id) ?? []).map((o) => [o.id, o]));
      for (const oid of wanted) {
        const o = have.get(oid);
        if (!o) add.push({ id: oid, commitmentId: c.id, dueDate: oid.slice(c.id.length + 1), amount: c.amount, amountOverridden: false, skipped: false, updatedAt: now() });
        else if (!o.amountOverridden && o.amount !== c.amount && !paid.has(oid) && o.dueDate >= today) upd.push({ ...o, amount: c.amount, updatedAt: now() });
      }
      for (const o of have.values()) if (!wanted.has(o.id) && !paid.has(o.id)) del.push(o.id);
    }
    if (add.length) await db.occurrences.bulkAdd(add);
    if (upd.length) await db.occurrences.bulkPut(upd);
    if (del.length) await db.occurrences.bulkDelete(del);
  });
}

export async function updateOccurrence(id: string, p: Partial<Pick<Occurrence, 'amount' | 'skipped'>>) {
  const o = await db.occurrences.get(id); if (!o) return;
  if (p.amount != null && (!Number.isInteger(p.amount) || p.amount <= 0)) throw new ValidationError(['Amount must be more than zero.']);
  await db.occurrences.put({ ...o, ...p, amountOverridden: p.amount != null ? true : o.amountOverridden, updatedAt: now() });
}

/** Mark Paid: creates the right ledger entry (expense or debt repayment) linked to the occurrence. */
export async function payOccurrence(occId: string, p: { amount: number; date: string; accountId: string; remarks?: string }) {
  const o = await db.occurrences.get(occId); if (!o) throw new Error('Not found');
  const c = await db.commitments.get(o.commitmentId); if (!c) throw new Error('Commitment not found');
  const type = c.kind === 'debt' ? 'debt_repayment' : 'expense';
  return saveTransaction({ ...blankTxn(type), name: c.name, merchant: c.name, date: p.date, amount: p.amount, accountId: p.accountId,
    toAccountId: c.kind === 'debt' ? c.toAccountId : null, categoryId: c.kind === 'expense' ? c.categoryId : null, needWant: c.kind === 'expense' ? 'need' : null,
    remarks: p.remarks ?? '', paymentMethod: 'online_banking', related: [{ kind: 'occurrence', id: occId }, { kind: 'commitment', id: c.id }] });
}

/** Link an already-recorded transaction to an occurrence instead of creating a new one (prevents duplicates). */
export async function linkTransaction(occId: string, txnId: string) {
  await db.transaction('rw', db.transactions, db.occurrences, db.audit, async () => {
    const t = await db.transactions.get(txnId); if (!t || t.deletedAt) throw new Error('Transaction not found');
    if (t.related.some((r) => r.kind === 'occurrence')) throw new ValidationError(['That transaction is already linked to a commitment.']);
    const o = await db.occurrences.get(occId);
    const after: Transaction = { ...t, related: [...t.related, { kind: 'occurrence', id: occId }, ...(o ? [{ kind: 'commitment', id: o.commitmentId }] : [])], updatedAt: now() };
    await db.transactions.put(after); await audit('transaction', txnId, 'update', t, after);
  });
}
export async function unlinkPayment(occId: string, txnId: string) {
  const t = await db.transactions.get(txnId); if (!t) return;
  await db.transactions.put({ ...t, related: t.related.filter((r) => !(r.kind === 'occurrence' && r.id === occId)), updatedAt: now() });
}

/* ---------------- Recurring transactions ---------------- */
export type RuleInput = Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'trackFrom'>;
export const recTxnId = (ruleId: string, date: string) => `rec:${ruleId}:${date}`;

export async function saveRule(i: RuleInput, id?: string): Promise<string> {
  const e = validateTxn({ ...blankTxn(i.template.type), ...i.template, name: i.name, date: i.startDate, status: 'actual' });
  if (!i.name.trim()) e.unshift('Name is required.');
  if (i.endDate && i.endDate < i.startDate) e.push('End date must be after the start date.');
  if (e.length) throw new ValidationError(e);
  const rid = await db.transaction('rw', db.recurring, db.audit, async () => {
    if (id) {
      const before = await db.recurring.get(id); if (!before) throw new Error('Not found');
      const after = { ...before, ...i, updatedAt: now() }; await db.recurring.put(after); await audit('recurring', id, 'update', before, after); return id;
    }
    const rec: RecurringRule = { ...i, trackFrom: i.startDate, id: uid(), createdAt: now(), updatedAt: now(), deletedAt: null };
    await db.recurring.add(rec); await audit('recurring', rec.id, 'create', undefined, rec); return rec.id;
  });
  await generateRecurring();
  return rid;
}
export async function deleteRule(id: string) {
  await db.recurring.update(id, { deletedAt: now(), active: false, updatedAt: now() });
  await generateRecurring();
}

/**
 * Idempotent recurring generator using deterministic IDs (rec:<rule>:<date>).
 * - Creates entries up to 31 days ahead: actual if auto-post and due, else expected.
 * - Auto-posts expected entries once due (only if the user hasn't edited them).
 * - Removes untouched future expected entries that are no longer scheduled. Soft-deleted ones are never recreated.
 */
export async function generateRecurring(today = todayKL()) {
  const horizon = addDays(today, REC_HORIZON_DAYS);
  await db.transaction('rw', db.recurring, db.transactions, db.audit, async () => {
    const rules = await db.recurring.toArray();
    for (const r of rules) {
      const live = !r.deletedAt && r.active;
      const dates = live ? scheduleDates(r.startDate, r.endDate, r.frequency, r.trackFrom, horizon) : [];
      const wanted = new Set(dates.map((d) => recTxnId(r.id, d)));
      const existing = await db.transactions.where('recurringId').equals(r.id).toArray();
      const have = new Map(existing.map((t) => [t.id, t]));
      for (const d of dates) {
        const tid = recTxnId(r.id, d); const ex = have.get(tid);
        const due = d <= today;
        if (!ex) {
          const t = now();
          const rec: Transaction = { ...blankTxn(r.template.type), ...r.template, id: tid, name: r.name, date: d, time: '09:00', status: r.autoPost && due ? 'actual' : 'expected',
            recurringId: r.id, related: [{ kind: 'recurring', id: r.id }], attachmentIds: [], createdAt: t, updatedAt: t, deletedAt: null };
          await db.transactions.add(rec); await audit('transaction', tid, 'create', undefined, { generatedBy: r.id });
        } else if (r.autoPost && due && ex.status === 'expected' && !ex.deletedAt && ex.updatedAt === ex.createdAt) {
          await db.transactions.update(tid, { status: 'actual', updatedAt: now() });
        }
      }
      const stale = existing.filter((t) => !wanted.has(t.id) && t.status === 'expected' && !t.deletedAt && t.updatedAt === t.createdAt && (t.date >= today || !live)).map((t) => t.id);
      if (stale.length) await db.transactions.bulkDelete(stale);
    }
  });
}

export async function runGenerators() { await generateOccurrences(); await generateRecurring(); }
