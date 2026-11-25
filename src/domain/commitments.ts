import { isLiability, type Account, type Commitment, type Occurrence, type Transaction } from '@/db/types';
import type { Cents } from '@/lib/money';
import { addDays } from '@/lib/date';

export type OccStatus = 'paid' | 'partial' | 'overdue' | 'pending' | 'upcoming' | 'skipped';
export interface OccView extends Occurrence { commitment: Commitment; paid: Cents; remaining: Cents; status: OccStatus; payments: Transaction[] }

export const STATUS_META: Record<OccStatus, { label: string; tone: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'slate' }> = {
  paid: { label: 'Paid', tone: 'green' }, partial: { label: 'Partially Paid', tone: 'orange' }, overdue: { label: 'Overdue', tone: 'red' },
  pending: { label: 'Pending', tone: 'blue' }, upcoming: { label: 'Upcoming', tone: 'slate' }, skipped: { label: 'Skipped', tone: 'slate' },
};

/** Payments are derived from live transactions linked to the occurrence – deleting a payment makes it unpaid again. */
export function paymentsByOccurrence(txns: Transaction[]): Map<string, Transaction[]> {
  const m = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.deletedAt || t.status !== 'actual') continue;
    for (const r of t.related ?? []) if (r.kind === 'occurrence') { const a = m.get(r.id) ?? []; a.push(t); m.set(r.id, a); }
  }
  return m;
}

/** Status rules: Pending = due within the next 7 days; Upcoming = later; Overdue = past due and not fully paid. */
export function occStatus(o: Occurrence, paid: Cents, today: string): OccStatus {
  if (o.skipped) return 'skipped';
  if (paid >= o.amount) return 'paid';
  if (o.dueDate < today) return paid > 0 ? 'partial' : 'overdue';
  if (paid > 0) return 'partial';
  return o.dueDate <= addDays(today, 7) ? 'pending' : 'upcoming';
}

export function buildOccViews(occ: Occurrence[], commitments: Commitment[], txns: Transaction[], today: string): OccView[] {
  const cm = new Map(commitments.filter((c) => !c.deletedAt).map((c) => [c.id, c]));
  const pays = paymentsByOccurrence(txns);
  const out: OccView[] = [];
  for (const o of occ) {
    const c = cm.get(o.commitmentId); if (!c) continue;
    const payments = pays.get(o.id) ?? [];
    const paid = payments.reduce((a, t) => a + t.amount, 0);
    out.push({ ...o, commitment: c, paid, remaining: o.skipped ? 0 : Math.max(0, o.amount - paid), status: occStatus(o, paid, today), payments });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Unpaid commitments due on/before `until` that will reduce liquid money (credit-card-paid ones don't). */
export function unpaidLiquidCommitments(views: OccView[], accounts: Account[], until: string): Cents {
  const cc = new Set(accounts.filter((a) => isLiability(a.type)).map((a) => a.id));
  return views.filter((v) => v.remaining > 0 && v.dueDate <= until && !(v.commitment.accountId && cc.has(v.commitment.accountId)))
    .reduce((a, v) => a + v.remaining, 0);
}

export function summarizeOcc(views: OccView[], from: string, to: string, today: string) {
  const r = { total: 0, paid: 0, pending: 0, overdue: 0, counts: { paid: 0, partial: 0, overdue: 0, pending: 0, upcoming: 0, skipped: 0 } as Record<OccStatus, number> };
  for (const v of views) {
    if (v.dueDate < from || v.dueDate > to) continue;
    r.counts[v.status]++;
    if (v.status === 'skipped') continue;
    r.total += v.amount; r.paid += Math.min(v.paid, v.amount);
    if (v.remaining > 0 && v.dueDate < today) r.overdue += v.remaining; else r.pending += v.remaining;
  }
  return r;
}
