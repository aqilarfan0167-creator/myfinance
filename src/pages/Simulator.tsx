import { useMemo, useState } from 'react';
import { Plus, Trash2, FlaskConical, AlertTriangle, RotateCcw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCommitments, useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select } from '@/components/ui';
import { MoneyInput } from '@/components/inputs';
import { baselineFrom, MONTHLY_FACTOR, simulate, type Baseline, type ScenarioItem } from '@/domain/planning';
import { flatInstalment, project, reducingInstalment } from '@/domain/loan';
import { summarize } from '@/domain/ledger';
import { formatRM } from '@/lib/money';
import { fmtDate, todayKL } from '@/lib/date';
import { uid } from '@/lib/cn';

const rm = (c: number) => formatRM(c);
const inst = (p: number, r: number, m: number, t: 'reducing' | 'flat') => (t === 'flat' ? flatInstalment(p, r, m) : reducingInstalment(p, r, m));
type Item = ScenarioItem & { id: string; loanId?: string };
const TEMPLATES: { kind: ScenarioItem['kind']; label: string; make: () => ScenarioItem }[] = [
  { kind: 'salary', label: 'Salary change', make: () => ({ kind: 'salary', label: 'Salary increase', monthly: 50000 }) },
  { kind: 'car', label: 'Buy a car', make: () => ({ kind: 'car', label: 'New car', price: 9000000, downPayment: 900000, ratePct: 3, months: 108, running: 50000 }) },
  { kind: 'loan', label: 'New loan', make: () => ({ kind: 'loan', label: 'Personal loan', principal: 2000000, ratePct: 6, months: 60, rateType: 'reducing' }) },
  { kind: 'commitment', label: 'New commitment', make: () => ({ kind: 'commitment', label: 'New subscription / bill', monthly: 10000 }) },
  { kind: 'savings', label: 'Save more', make: () => ({ kind: 'savings', label: 'Extra savings', monthly: 30000 }) },
  { kind: 'extra_repayment', label: 'Extra debt repayment', make: () => ({ kind: 'extra_repayment', label: 'Pay loan faster', monthly: 20000 }) },
];

export default function SimulatorPage() {
  const t = useT(); const f = useFinance(); const cm = useCommitments(); const today = todayKL();
  const auto = useMemo<Baseline | null>(() => {
    if (!f || !cm) return null;
    const b = baselineFrom(f.txns, (from, to) => summarize(f.txns, f.accounts, { from, to }), today);
    const commitments = cm.commitments.filter((c) => c.active).reduce((a, c) => a + Math.round(c.amount * MONTHLY_FACTOR[c.frequency]), 0);
    return { ...b, commitments, liquid: f.position.available };
  }, [f, cm, today]);
  const [over, setOver] = useState<Partial<Baseline>>({});
  const [items, setItems] = useState<Item[]>([]);
  if (!f || !auto) return <Loading />;
  const base: Baseline = { ...auto, ...over };
  const before = simulate(base, [], inst); const after = simulate(base, items, inst);
  const loans = f.accounts.filter((a) => a.type === 'loan' && a.status === 'active' && a.loan?.instalment);
  const upd = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? ({ ...x, ...p } as Item) : x)));
  const B = ({ k, label }: { k: 'income' | 'expenses' | 'debtPayments' | 'savings' | 'liquid'; label: string }) => (
    <Field label={label} hint={over[k] != null ? <button className="text-teal-700 hover:underline dark:text-teal-400" onClick={() => setOver((o) => { const n = { ...o }; delete n[k]; return n; })}>reset to {rm(auto[k])}</button> : undefined}>
      <MoneyInput value={base[k]} onChange={(c) => c != null && setOver((o) => ({ ...o, [k]: c }))} allowNegative={k === 'liquid'} /></Field>);
  const rows: [string, keyof typeof before, boolean][] = [['Monthly income', 'income', true], ['Living expenses', 'expenses', false], ['Loan & debt payments', 'debt', false], ['Disposable income (after debts)', 'disposable', true], ['Cash flow (before savings)', 'cashFlow', true], ['Planned savings', 'savings', true], ['Savings capacity left', 'savingsCapacity', true]];
  const warnings = [
    after.cashFlow < 0 && 'Monthly cash flow becomes negative – expenses and debts exceed income.',
    after.savingsCapacity < 0 && after.cashFlow >= 0 && 'Planned savings exceed what is left each month.',
    after.dsr > 0.6 && `Debt service ratio ${Math.round(after.dsr * 100)}% is high – many Malaysian banks look for roughly 60–70% or less.`,
    after.liquidAfter < 0 && `One-off payments (${rm(after.oneOff)}) exceed your available balance.`,
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title={t('Financial Simulator')} subtitle="What-if planning. Nothing here changes your actual records." actions={<Badge tone="blue"><FlaskConical className="mr-1 h-3 w-3" />Simulation only</Badge>} />
      <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr] [&>*]:min-w-0">
        <div className="space-y-4">
          <Card title="Your baseline (per month)" action={Object.keys(over).length > 0 && <Button variant="ghost" onClick={() => setOver({})}><RotateCcw className="h-4 w-4" />Reset</Button>}>
            <p className="mb-3 text-xs text-slate-500">{auto.months ? `Averaged from your last ${auto.months} complete month(s) of actual records.` : 'Not enough history yet – enter your typical figures.'} Active commitments total {rm(auto.commitments)}/month (already inside expenses/debts).</p>
            <div className="grid gap-3"><B k="income" label="Income" /><B k="expenses" label="Living expenses (incl. bills)" /><B k="debtPayments" label="Loan & debt repayments" /><B k="savings" label="Savings transfers" /><B k="liquid" label="Available balance today" /></div>
          </Card>
          <Card title="Add a change">
            <div className="grid grid-cols-2 gap-2">{TEMPLATES.map((tp) => <Button key={tp.kind} variant="secondary" onClick={() => setItems((xs) => [...xs, { ...tp.make(), id: uid(), loanId: loans[0]?.id } as Item])}><Plus className="h-4 w-4" />{tp.label}</Button>)}</div>
          </Card>
        </div>
        <div className="space-y-4">
          {items.map((it) => (
            <Card key={it.id} title={<Input value={it.label} onChange={(e) => upd(it.id, { label: e.target.value })} className="font-semibold" aria-label="Scenario name" />} action={<Button variant="ghost" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}><Trash2 className="h-4 w-4" /></Button>}>
              <div className="grid gap-3 sm:grid-cols-3">
                {(it.kind === 'salary' || it.kind === 'commitment' || it.kind === 'savings' || it.kind === 'extra_repayment') &&
                  <Field label={it.kind === 'salary' ? 'Change in monthly income (− for a cut)' : 'Amount per month'}><MoneyInput value={it.monthly} allowNegative={it.kind === 'salary'} onChange={(c) => upd(it.id, { monthly: c ?? 0 })} /></Field>}
                {it.kind === 'extra_repayment' && loans.length > 0 && <Field label="Loan"><Select value={it.loanId} onChange={(e) => upd(it.id, { loanId: e.target.value })}>{loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>}
                {it.kind === 'loan' && <>
                  <Field label="Loan amount"><MoneyInput value={it.principal} onChange={(c) => upd(it.id, { principal: c ?? 0 })} /></Field>
                  <Field label="Rate % p.a."><Input type="number" step="0.01" min={0} value={it.ratePct} onChange={(e) => upd(it.id, { ratePct: Number(e.target.value) })} /></Field>
                  <Field label="Tenure (months)"><Input type="number" min={1} max={480} value={it.months} onChange={(e) => upd(it.id, { months: Math.max(1, Number(e.target.value)) })} /></Field>
                  <Field label="Rate type"><Select value={it.rateType} onChange={(e) => upd(it.id, { rateType: e.target.value as 'reducing' | 'flat' })}><option value="reducing">Reducing balance</option><option value="flat">Flat rate</option></Select></Field>
                </>}
                {it.kind === 'car' && <>
                  <Field label="Car price"><MoneyInput value={it.price} onChange={(c) => upd(it.id, { price: c ?? 0 })} /></Field>
                  <Field label="Down payment"><MoneyInput value={it.downPayment} onChange={(c) => upd(it.id, { downPayment: c ?? 0 })} /></Field>
                  <Field label="Flat rate % p.a."><Input type="number" step="0.01" min={0} value={it.ratePct} onChange={(e) => upd(it.id, { ratePct: Number(e.target.value) })} /></Field>
                  <Field label="Tenure (months)"><Input type="number" min={12} max={108} value={it.months} onChange={(e) => upd(it.id, { months: Math.max(1, Number(e.target.value)) })} /></Field>
                  <Field label="Running costs / month" hint="Petrol, insurance, road tax, service"><MoneyInput value={it.running} onChange={(c) => upd(it.id, { running: c ?? 0 })} /></Field>
                </>}
              </div>
              <ItemNote it={it} loans={loans} balances={f.balances} today={today} />
            </Card>))}
          {!items.length && <Card><p className="text-sm text-slate-500">Add a change on the left – e.g. a salary increase, buying a car or paying a loan faster – to compare before and after.</p></Card>}

          <Card title="Before vs after (monthly)">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Item</th><th className="text-right">Before</th><th className="text-right">After</th><th className="text-right">Change</th></tr></thead>
              <tbody>{rows.map(([label, k, goodUp]) => { const d = (after[k] as number) - (before[k] as number); return (
                <tr key={k} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">{label}</td><td className="text-right tabular-nums">{rm(before[k] as number)}</td><td className="text-right font-medium tabular-nums">{rm(after[k] as number)}</td>
                  <td className={`text-right tabular-nums ${d === 0 ? 'text-slate-400' : (d > 0) === goodUp ? 'text-income' : 'text-expense'}`}>{d === 0 ? '—' : formatRM(d, { sign: true })}</td></tr>); })}
                <tr className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">Debt service ratio</td><td className="text-right">{Math.round(before.dsr * 100)}%</td><td className="text-right font-medium">{Math.round(after.dsr * 100)}%</td><td /></tr>
                {after.oneOff > 0 && <tr className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">One-off payment / balance after</td><td className="text-right">{rm(base.liquid)}</td><td className="text-right font-medium">{rm(after.liquidAfter)}</td><td className="text-right text-expense">{formatRM(-after.oneOff, { sign: true })}</td></tr>}
              </tbody></table></div>
            {warnings.length > 0 && <ul className="mt-3 space-y-1">{warnings.map((w) => <li key={w} className="flex gap-1.5 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}</ul>}
          </Card>
          <Card title="Comparison">
            <ResponsiveContainer width="100%" height={220}><BarChart data={[{ n: 'Income', b: before.income, a: after.income }, { n: 'Expenses', b: before.expenses, a: after.expenses }, { n: 'Debts', b: before.debt, a: after.debt }, { n: 'Cash flow', b: before.cashFlow, a: after.cashFlow }, { n: 'Savings left', b: before.savingsCapacity, a: after.savingsCapacity }]}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="n" fontSize={11} /><YAxis fontSize={11} width={45} tickFormatter={(v) => `${(v / 100000).toFixed(1)}k`} /><Tooltip formatter={(v: number) => rm(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="b" name="Before" fill="#94a3b8" isAnimationActive={false} /><Bar dataKey="a" name="After" fill="#0f766e" isAnimationActive={false} /></BarChart></ResponsiveContainer>
          </Card>
        </div>
      </div>
    </>
  );
}

function ItemNote({ it, loans, balances, today }: { it: Item; loans: { id: string; loan?: { instalment: number; annualRate: number; rateType: 'reducing' | 'flat' } | null; name: string }[]; balances: Map<string, number>; today: string }) {
  if (it.kind === 'loan') return <p className="mt-2 text-xs text-slate-500">Instalment ≈ <b>{rm(inst(it.principal, it.ratePct, it.months, it.rateType))}</b>/month · total interest ≈ {rm(inst(it.principal, it.ratePct, it.months, it.rateType) * it.months - it.principal)}</p>;
  if (it.kind === 'car') { const m = flatInstalment(Math.max(0, it.price - it.downPayment), it.ratePct, it.months); return <p className="mt-2 text-xs text-slate-500">Financing {rm(Math.max(0, it.price - it.downPayment))} · instalment ≈ <b>{rm(m)}</b>/month + running {rm(it.running)} · down payment {rm(it.downPayment)} once</p>; }
  if (it.kind === 'extra_repayment') {
    const l = loans.find((x) => x.id === it.loanId); if (!l?.loan) return <p className="mt-2 text-xs text-slate-500">Add a loan with instalment details to see time saved.</p>;
    const owed = Math.max(0, -(balances.get(l.id) ?? 0));
    const base = { balance: owed, annualRatePct: l.loan.annualRate, payment: l.loan.instalment, rateType: l.loan.rateType, startDate: today };
    const p0 = project(base), p1 = project({ ...base, extraMonthly: it.monthly });
    return <p className="mt-2 text-xs text-slate-500">{l.name}: settled {p1.payoffDate ? fmtDate(p1.payoffDate) : '—'} instead of {p0.payoffDate ? fmtDate(p0.payoffDate) : '—'} · {p0.feasible && p1.feasible ? `${p0.months - p1.months} month(s) sooner, interest saved ${rm(p0.totalInterest - p1.totalInterest)}` : ''}</p>;
  }
  return null;
}
