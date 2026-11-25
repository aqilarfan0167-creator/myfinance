import { useMemo, useState } from 'react';
import { CalendarClock, CreditCard, Landmark, Pencil, Plus, Receipt, Scale, ShoppingBag, Wallet, Table2 } from 'lucide-react';
import { useCommitments, useFinance, type Finance } from '@/hooks/useData';
import type { OccView } from '@/domain/commitments';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { DateInput, MoneyInput } from '@/components/inputs';
import { Tabs } from '@/components/Tabs';
import { Stat } from '@/components/Stat';
import { Progress } from '@/components/Progress';
import { Reconcile } from './Accounts';
import { recordLiabilityCharge, suggestedInterest } from '@/db/planningRepo';
import { saveCommitment } from '@/db/commitmentRepo';
import { ValidationError } from '@/db/repo';
import type { Account } from '@/db/types';
import { project } from '@/domain/loan';
import { cardStatus } from '@/domain/cards';
import { formatRM } from '@/lib/money';
import { addDays, addMonths, daysInMonth, fmtDate, todayKL } from '@/lib/date';

const rm = (c: number) => formatRM(c);
const nextDue = (today: string, day: number | null | undefined) => {
  if (!day) return addMonths(today, 1);
  const [y, m] = today.split('-').map(Number); const d = `${today.slice(0, 7)}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
  return d > today ? d : addMonths(d, 1);
};

/** Earliest unpaid commitment item that repays this account – repayments made here are linked to it, so the commitment shows as paid (no double counting). */
const openOcc = (views: OccView[], accountId: string) => views.find((v) => v.commitment.toAccountId === accountId && v.remaining > 0 && v.dueDate <= addDays(todayKL(), 31));
const linkTo = (o?: OccView) => (o ? [{ kind: 'occurrence', id: o.id }, { kind: 'commitment', id: o.commitmentId }] : []);

export default function DebtsPage() {
  const t = useT(); const f = useFinance(); const cm = useCommitments(); const { openAccount } = useUI();
  const [tab, setTab] = useState<'loans' | 'cards'>('loans');
  const [charge, setCharge] = useState<Account | null>(null); const [sched, setSched] = useState<Account | null>(null); const [rec, setRec] = useState<Account | null>(null);
  if (!f || !cm) return <Loading />;
  const loans = f.accounts.filter((a) => a.type === 'loan' && a.status === 'active');
  const cards = f.accounts.filter((a) => a.type === 'credit_card' && a.status === 'active');
  const monthly = loans.reduce((a, l) => a + (l.loan?.instalment ?? 0), 0);

  return (
    <>
      <PageHeader title={t('Debt & Credit Cards')} actions={<Button onClick={() => openAccount()}><Plus className="h-4 w-4" />Add loan / card</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total debt" value={rm(f.position.loanDebt + f.position.creditDebt)} tone="red" />
        <Stat label="Loans outstanding" value={rm(f.position.loanDebt)} tone="red" sub={`${loans.length} loan(s)`} />
        <Stat label="Credit cards owed" value={rm(f.position.creditDebt)} tone="red" sub={`${cards.length} card(s)`} />
        <Stat label="Monthly instalments" value={rm(monthly)} tone="orange" sub="Loans only" />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ v: 'loans', label: `Loans (${loans.length})` }, { v: 'cards', label: `Credit cards (${cards.length})` }]} />
      {tab === 'loans' && (loans.length ? <div className="grid gap-4 lg:grid-cols-2">{loans.map((l) => <LoanCard key={l.id} a={l} f={f} open={openOcc(cm.views, l.id)} hasCommitment={cm.commitments.some((c) => c.toAccountId === l.id && c.active)} onCharge={() => setCharge(l)} onSchedule={() => setSched(l)} onReconcile={() => setRec(l)} />)}</div>
        : <Empty title="No loans tracked">Add car loans, housing loans, PTPTN or MARA as a "Loan / Financing" account to track balances, repayments and settlement dates.<br /><Button className="mt-2" onClick={() => openAccount()}>Add loan</Button></Empty>)}
      {tab === 'cards' && (cards.length ? <div className="grid gap-4 lg:grid-cols-2">{cards.map((c) => <CardCard key={c.id} a={c} f={f} open={openOcc(cm.views, c.id)} onCharge={() => setCharge(c)} onReconcile={() => setRec(c)} />)}</div>
        : <Empty title="No credit cards">Add a credit card account to track limits, statements and payments.</Empty>)}
      <p className="mt-4 text-xs text-slate-500">Card purchases are expenses; repayments settle the balance and are never counted as expenses again. Interest and fees are recorded separately as “Loan Interest & Fees”. Minimum payments are estimates (5% or RM50) – check your statement.</p>
      {charge && <ChargeModal a={charge} f={f} onClose={() => setCharge(null)} />}
      {sched && <ScheduleModal a={sched} f={f} onClose={() => setSched(null)} />}
      {rec && <Reconcile a={rec} onClose={() => setRec(null)} />}
    </>
  );
}

function LoanCard({ a, f, open, hasCommitment, onCharge, onSchedule, onReconcile }: { a: Account; f: Finance; open?: OccView; hasCommitment: boolean; onCharge: () => void; onSchedule: () => void; onReconcile: () => void }) {
  const { openTxn, openAccount, toast } = useUI(); const today = todayKL();
  const owed = Math.max(0, -(f.balances.get(a.id) ?? 0)); const L = a.loan;
  const p = useMemo(() => L && L.instalment ? project({ balance: owed, annualRatePct: L.annualRate, payment: L.instalment, rateType: L.rateType, startDate: nextDue(today, a.dueDay) }) : null, [owed, L, a.dueDay, today]);
  const repaid = f.txns.filter((t) => !t.deletedAt && t.status === 'actual' && t.toAccountId === a.id && t.type === 'debt_repayment').sort((x, y) => y.date.localeCompare(x.date));
  const progress = L?.originalAmount && L.rateType === 'reducing' ? 1 - owed / L.originalAmount : null;
  const late = p?.payoffDate && L?.targetDate && p.payoffDate > L.targetDate;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-expense-soft text-expense dark:bg-red-900/30"><Landmark className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold">{a.name}</p><p className="text-xs text-slate-500">{L?.lender || 'Lender not set'} · {L ? `${L.annualRate}% ${L.rateType === 'flat' ? 'flat' : 'reducing'}` : 'no loan details'}</p></div>
        <Button variant="ghost" onClick={() => openAccount(a)} aria-label="Edit loan"><Pencil className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 flex items-baseline justify-between"><span className="text-xl font-bold tabular-nums text-expense">{rm(owed)}</span>{L?.originalAmount ? <span className="text-sm text-slate-500">of {rm(L.originalAmount)}</span> : null}</div>
      {progress != null && <Progress value={progress} tone="ok" className="mt-1" />}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span>Instalment: <b>{L?.instalment ? rm(L.instalment) : '—'}</b></span><span>Next due: <b>{a.dueDay ? fmtDate(nextDue(today, a.dueDay)) : '—'}</b></span>
        <span>Months left: <b>{p ? (p.feasible ? p.months : '∞') : '—'}</b></span><span>Settlement est.: <b className={late ? 'text-warn' : ''}>{p?.payoffDate ? fmtDate(p.payoffDate) : '—'}</b></span>
        {L?.rateType === 'reducing' && p?.feasible && <span>Interest to go: <b>{rm(p.totalInterest)}</b></span>}
        {L?.targetDate && <span>Target: <b>{fmtDate(L.targetDate)}</b>{late ? ' (behind)' : ''}</span>}
        <span>Last payment: <b>{repaid[0] ? `${fmtDate(repaid[0].date)} · ${rm(repaid[0].amount)}` : '—'}</b></span>
      </div>
      {!L?.instalment && <p className="mt-2 text-xs text-warn">Add the instalment and rate (Edit) to see settlement estimates.</p>}
      {p && !p.feasible && <p className="mt-2 text-xs text-expense">The instalment doesn't cover the monthly interest – the balance won't reduce.</p>}
      <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Button variant="secondary" onClick={() => openTxn({ type: 'debt_repayment', preset: { toAccountId: a.id, amount: open?.remaining || L?.instalment || undefined, name: `${a.name} repayment`, accountId: open?.commitment.accountId ?? null, related: linkTo(open) } })}><Wallet className="h-4 w-4" />Repay</Button>
        <Button variant="ghost" onClick={onCharge}><Receipt className="h-4 w-4" />Interest/fee</Button>
        <Button variant="ghost" onClick={onSchedule}><Table2 className="h-4 w-4" />Schedule</Button>
        <Button variant="ghost" onClick={onReconcile}><Scale className="h-4 w-4" />Update balance</Button>
        {!hasCommitment && L?.instalment ? <Button variant="ghost" onClick={async () => { await saveCommitment({ name: a.name, kind: 'debt', categoryId: null, amount: L.instalment, startDate: nextDue(today, a.dueDay), endDate: L.targetDate, frequency: 'monthly', accountId: null, toAccountId: a.id, active: true, remarks: '' }); toast('Monthly commitment created'); }}><CalendarClock className="h-4 w-4" />Track monthly</Button> : null}
      </div>
    </Card>
  );
}

function CardCard({ a, f, open, onCharge, onReconcile }: { a: Account; f: Finance; open?: OccView; onCharge: () => void; onReconcile: () => void }) {
  const { openTxn, openAccount } = useUI(); const today = todayKL();
  const s = cardStatus(a, f.accounts, f.txns, today);
  const tone = s.utilisation == null ? 'ok' : s.utilisation >= 1 ? 'over' : s.utilisation >= 0.7 ? 'warn' : 'ok';
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: a.color + '22', color: a.color }}><CreditCard className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold">{a.name}</p><p className="text-xs text-slate-500">{a.creditLimit ? `Limit ${rm(a.creditLimit)}` : 'No limit set'}{a.statementDay ? ` · statement day ${a.statementDay}` : ''}{a.dueDay ? ` · due day ${a.dueDay}` : ''}</p></div>
        <Button variant="ghost" onClick={() => openAccount(a)} aria-label="Edit card"><Pencil className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 flex items-baseline justify-between"><span className="text-xl font-bold tabular-nums text-expense">{rm(s.used)}</span>{s.available != null && <span className="text-sm text-slate-500">{rm(s.available)} available</span>}</div>
      {s.utilisation != null && <><Progress value={s.utilisation} tone={tone} className="mt-1" /><p className="mt-1 text-xs text-slate-500">{Math.round(s.utilisation * 100)}% utilised</p></>}
      {s.statementDate ? <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span>Statement {fmtDate(s.statementDate)}: <b>{rm(s.statementBalance ?? 0)}</b></span><span>Due: <b>{s.dueDate ? fmtDate(s.dueDate) : '—'}</b></span>
        <span>Paid since statement: <b className="text-income">{rm(s.paidSinceStatement)}</b></span>
        <span>Still due: <b className={s.remainingDue ? 'text-expense' : 'text-income'}>{rm(s.remainingDue ?? 0)}</b>{s.remainingDue === 0 && ' ✓'}</span>
        {!!s.minimumDue && <span>Minimum still due (est.): <b>{rm(s.minimumDue)}</b></span>}
      </div> : <p className="mt-2 text-xs text-warn">Set the statement & due day (Edit) to track statements.</p>}
      <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Button variant="secondary" onClick={() => openTxn({ type: 'debt_repayment', preset: { toAccountId: a.id, amount: s.remainingDue || open?.remaining || undefined, name: `${a.name} payment`, accountId: open?.commitment.accountId ?? null, related: linkTo(open) } })}><Wallet className="h-4 w-4" />Pay card</Button>
        <Button variant="ghost" onClick={() => openTxn({ type: 'expense', preset: { accountId: a.id, paymentMethod: 'credit_card' } })}><ShoppingBag className="h-4 w-4" />Purchase</Button>
        <Button variant="ghost" onClick={onCharge}><Receipt className="h-4 w-4" />Interest/fee</Button>
        <Button variant="ghost" onClick={onReconcile}><Scale className="h-4 w-4" />Reconcile</Button>
      </div>
    </Card>
  );
}

function ChargeModal({ a, f, onClose }: { a: Account; f: Finance; onClose: () => void }) {
  const { toast } = useUI(); const owed = Math.max(0, -(f.balances.get(a.id) ?? 0));
  const sug = a.loan?.rateType === 'reducing' ? suggestedInterest(owed, a.loan.annualRate) : 0;
  const [amt, setAmt] = useState<number | null>(sug || null); const [date, setDate] = useState(todayKL()); const [name, setName] = useState(a.type === 'loan' ? 'Monthly interest' : 'Finance charge');
  const [err, setErr] = useState('');
  return (
    <Modal open onClose={onClose} title={`Interest / fee · ${a.name}`}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Adds a charge to the balance owed and records it as an expense (“Loan Interest & Fees”).{a.loan?.rateType === 'flat' && ' Flat-rate loans usually already include interest in the balance – only record extra charges such as late fees.'}</p>
      <div className="grid gap-3">
        <Field label="Description"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
        <Field label="Amount" hint={sug ? `Suggested: ${rm(owed)} × ${a.loan!.annualRate}% ÷ 12 = ${rm(sug)}` : undefined}><MoneyInput value={amt} onChange={setAmt} /></Field>
        <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { if (!amt) return setErr('Enter an amount.'); try { await recordLiabilityCharge(a.id, { amount: amt, date, name }); toast('Charge recorded'); onClose(); } catch (e) { setErr(e instanceof ValidationError ? e.errors[0] : String(e)); } }}>Record</Button></div>
      </div>
    </Modal>
  );
}

function ScheduleModal({ a, f, onClose }: { a: Account; f: Finance; onClose: () => void }) {
  const L = a.loan; const today = todayKL(); const owed = Math.max(0, -(f.balances.get(a.id) ?? 0));
  const [extra, setExtra] = useState<number | null>(null); const [lump, setLump] = useState<number | null>(null);
  const base = { balance: owed, annualRatePct: L?.annualRate ?? 0, payment: L?.instalment ?? 0, rateType: L?.rateType ?? 'reducing', startDate: nextDue(today, a.dueDay) } as const;
  const p0 = project(base); const p1 = project({ ...base, extraMonthly: extra ?? 0, lumpSum: lump ?? 0 });
  const changed = (extra ?? 0) > 0 || (lump ?? 0) > 0;
  return (
    <Modal open onClose={onClose} title={`Repayment schedule · ${a.name}`} wide>
      {!L?.instalment ? <Empty title="Add the instalment and rate to this loan first" /> : <>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Extra repayment every month"><MoneyInput value={extra} onChange={setExtra} /></Field><Field label="One-off lump sum now"><MoneyInput value={lump} onChange={setLump} /></Field></div>
        <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Settlement" value={p1.payoffDate ? fmtDate(p1.payoffDate) : 'Never'} sub={changed && p0.payoffDate ? `was ${fmtDate(p0.payoffDate)}` : undefined} />
          <Stat label="Months left" value={p1.feasible ? String(p1.months) : '∞'} tone="blue" sub={changed && p0.feasible ? `${p0.months - p1.months} month(s) sooner` : undefined} />
          <Stat label="Interest remaining" value={rm(p1.totalInterest)} tone="orange" sub={changed ? `saves ${rm(p0.totalInterest - p1.totalInterest)}` : L.rateType === 'flat' ? 'included in balance' : undefined} />
          <Stat label="Total to pay" value={rm(p1.totalPaid)} />
        </div>
        <p className="mb-2 text-xs text-slate-500">Projection only – nothing is recorded. {L.rateType === 'flat' ? 'Flat-rate balances already include interest; early settlement rebates (Rule of 78 / HP Act) are not modelled.' : 'Assumes the rate stays the same and payments are made on time.'}</p>
        <div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-white dark:bg-slate-900"><tr className="text-left text-slate-500"><th className="py-1">#</th><th>Date</th><th className="text-right">Payment</th><th className="text-right">Interest</th><th className="text-right">Principal</th><th className="text-right">Balance</th></tr></thead>
          <tbody>{p1.rows.slice(0, 600).map((r) => <tr key={r.n} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{r.n}</td><td>{fmtDate(r.date)}</td><td className="text-right tabular-nums">{rm(r.payment)}</td><td className="text-right tabular-nums">{rm(r.interest)}</td><td className="text-right tabular-nums">{rm(r.principal)}</td><td className="text-right tabular-nums">{rm(r.balance)}</td></tr>)}</tbody></table></div>
      </>}
      <div className="mt-3 flex justify-end"><Badge tone="blue">Simulation</Badge></div>
    </Modal>
  );
}
