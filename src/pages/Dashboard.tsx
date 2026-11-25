import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCommitments, useFinance, type Finance } from '@/hooks/useData';
import { STATUS_META, summarizeOcc, unpaidLiquidCommitments, type OccView } from '@/domain/commitments';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Card, Empty, Loading, PageHeader, Select, Button, Modal } from '@/components/ui';
import { DateInput } from '@/components/inputs';
import { Stat } from '@/components/Stat';
import { TxnRow } from '@/components/TxnRow';
import { computeBalances, computePosition, dailyAllowance, summarize } from '@/domain/ledger';
import { formatRM } from '@/lib/money';
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, monthEnd, monthStart, todayKL } from '@/lib/date';

const rm = (c: number) => formatRM(c);
const short = (c: number) => { const v = c / 100; return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0); };
const tip = { contentStyle: { borderRadius: 8, fontSize: 12 }, formatter: (v: number) => rm(v) };

export default function Dashboard() {
  const f = useFinance(); const cm = useCommitments(); const t = useT(); const { openTxn, openAccount } = useUI();
  const today = todayKL();
  const [period, setPeriod] = useState<'this' | 'last' | 'custom'>('this');
  const [custom, setCustom] = useState({ from: monthStart(today), to: today });
  const [accountId, setAccountId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [showCalc, setShowCalc] = useState(false);

  const range = period === 'this' ? { from: monthStart(today), to: monthEnd(today) }
    : period === 'last' ? { from: monthStart(addMonths(monthStart(today), -1)), to: monthEnd(addMonths(monthStart(today), -1)) } : custom;
  const filt = { ...range, accountIds: accountId ? [accountId] : undefined, categoryIds: categoryId ? [categoryId] : undefined };

  const data = useMemo(() => f && cm && build(f, cm.views, filt, today), [f, cm, JSON.stringify(filt), today]); // eslint-disable-line
  if (!f || !cm || !data) return <Loading />;
  const { s, trend, allowance, upcoming, occ, dueSoon } = data; const p = f.position;

  if (!f.accounts.length) return (
    <>
      <PageHeader title={t('Dashboard')} />
      <Empty title="Welcome to MyFinance 👋">
        <p>Start by adding your bank accounts, cash and e-wallets. Your data stays on this device.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => openAccount()}>Add your first account</Button><Link to="/settings"><Button variant="secondary">Load demo data</Button></Link></div>
      </Empty>
    </>
  );

  const catName = (id: string) => { const c = f.catMap.get(id); return c ? (f.settings.language === 'ms' && c.nameMs ? c.nameMs : c.name) : 'Uncategorised'; };
  const recent = [...f.txns].filter((x) => !x.deletedAt && x.status === 'actual').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 8);
  const dailyData = Array.from({ length: Math.min(62, daysBetween(range.from, range.to) + 1) }, (_, i) => { const d = addDays(range.from, i); return { d: d.slice(8), v: s.daily.get(d) ?? 0 }; });

  return (
    <>
      <PageHeader title={t('Dashboard')} subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period"><option value="this">This month</option><option value="last">Last month</option><option value="custom">Custom range</option></Select>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account"><option value="">All accounts</option>{f.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="col-span-2 sm:col-span-1"><option value="">All categories</option>{f.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        {period === 'custom' && <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-4 sm:max-w-md"><DateInput value={custom.from} onChange={(v) => v && setCustom({ ...custom, from: v })} /><DateInput value={custom.to} onChange={(v) => v && setCustom({ ...custom, to: v })} /></div>}
      </div>

      {p.lowBalance.length > 0 && <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950/40 dark:text-orange-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Low balance: {p.lowBalance.map((a) => `${a.name} (${rm(f.balances.get(a.id) ?? 0)})`).join(', ')}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('Total Balance')} value={rm(p.total)} sub="All non-credit accounts" />
        <Stat label={t('Available to Spend')} value={rm(p.available)} tone={p.available < 0 ? 'red' : 'blue'} sub="Liquid accounts" />
        <Stat label={t('Net Worth')} value={rm(p.netWorth)} tone="purple" sub={`Assets ${rm(p.assets)}`} />
        <Stat label={t('Outstanding Debt')} value={rm(p.liabilities)} tone="red" sub={`Credit cards ${rm(p.creditDebt)}`} />
        <Stat label={t('Income')} value={rm(s.income)} tone="green" sub={s.expectedIncome ? `+ ${rm(s.expectedIncome)} expected` : 'Received'} />
        <Stat label={t('Expenses')} value={rm(s.netExpenses)} tone="red" sub={s.refunds ? `after ${rm(s.refunds)} refunds` : 'Net of refunds'} />
        <Stat label={t('Cash Flow')} value={formatRM(s.cashFlow, { sign: true })} tone={s.cashFlow >= 0 ? 'green' : 'red'} sub={s.income ? `Savings rate ${(s.savingsRate * 100).toFixed(1)}%` : 'Income − expenses − loan repayments'} />
        <Stat label={t('Savings')} value={rm(s.savingsTransfers)} tone="purple" sub="Net moved to savings accounts" />
        <button className="text-left" onClick={() => setShowCalc(true)}>
          <Stat label={t('Daily Allowance')} value={rm(allowance.perDay)} tone={allowance.insufficient ? 'red' : 'green'} icon={<Info className="h-3 w-3" />} sub={allowance.insufficient ? 'Insufficient funds' : `${rm(allowance.spendable)} over ${allowance.daysLeft} day(s)`} />
        </button>
        <Stat label={t('Days to Salary')} value={`${daysBetween(today, allowance.nextPayday)} day(s)`} sub={`Payday ${fmtDate(allowance.nextPayday)}`} />
        <Stat label="Debt repayments" value={rm(s.debtRepayments + s.cardRepayments)} tone="orange" sub={`Loans ${rm(s.debtRepayments)} · Cards ${rm(s.cardRepayments)}`} />
        <Stat label="Needs / Wants" value={`${pct(s.needs, s.needs + s.wants)} / ${pct(s.wants, s.needs + s.wants)}`} sub={`${rm(s.needs)} / ${rm(s.wants)}`} />
      </div>

      {cm.commitments.length > 0 && <Link to="/commitments" className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Commitments paid" value={rm(occ.paid)} tone="green" sub={`${occ.counts.paid} of ${occ.counts.paid + occ.counts.partial + occ.counts.pending + occ.counts.upcoming + occ.counts.overdue} this month`} />
        <Stat label="Pending" value={rm(occ.pending)} tone="blue" sub={`${occ.counts.pending + occ.counts.upcoming + occ.counts.partial} item(s)`} />
        <Stat label="Overdue" value={rm(occ.overdue)} tone={occ.overdue ? 'red' : 'green'} sub={`${occ.counts.overdue} item(s)`} />
      </Link>}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {dueSoon.length > 0 && <Card title="Upcoming payments (14 days)" action={<Link to="/commitments" className="text-xs text-teal-700 hover:underline dark:text-teal-400">Manage</Link>}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{dueSoon.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate">{fmtDate(v.dueDate)} · {v.commitment.name} <Badge tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</Badge></span><span className="tabular-nums font-medium">{rm(v.remaining)}</span></li>))}</ul>
        </Card>}
        <Card title={t('Income vs Expenses')}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="m" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={40} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t('Spending by Category')}>
          {s.byCategory.length ? (
            <div className="grid items-center gap-2 sm:grid-cols-2">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={s.byCategory.filter((x) => x.amount > 0)} dataKey="amount" nameKey="categoryId" innerRadius={50} outerRadius={85} paddingAngle={1} isAnimationActive={false}>
                  {s.byCategory.map((c) => <Cell key={c.categoryId} fill={f.catMap.get(c.categoryId)?.color ?? '#94a3b8'} />)}</Pie>
                  <Tooltip contentStyle={tip.contentStyle} formatter={(v: number, n: string) => [rm(v), catName(n)]} /></PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1 text-xs">{s.byCategory.slice(0, 8).map((c) => (
                <li key={c.categoryId} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: f.catMap.get(c.categoryId)?.color }} /><span className="flex-1 truncate">{catName(c.categoryId)}</span><span className="tabular-nums">{rm(c.amount)}</span></li>))}</ul>
            </div>
          ) : <Empty title="No spending in this period" />}
        </Card>
        <Card title={t('Daily Spending')}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="d" fontSize={10} interval="preserveStartEnd" /><YAxis tickFormatter={short} fontSize={11} width={40} /><Tooltip {...tip} labelFormatter={(l) => `Day ${l}`} />
              <Bar dataKey="v" name="Spent" fill="#f97316" radius={[3, 3, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Net Worth & Debt Trend">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="m" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={40} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="netWorth" name="Net worth" stroke="#9333ea" strokeWidth={2} dot={false} /><Line dataKey="debt" name="Debt" stroke="#dc2626" strokeWidth={2} dot={false} /><Line dataKey="savings" name="Savings (cash flow)" stroke="#2563eb" strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t('Needs vs Wants')}>
          {s.needs + s.wants + s.unclassified > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={[{ n: 'Needs', v: s.needs }, { n: 'Wants', v: s.wants }, { n: 'Unclassified', v: s.unclassified }].filter((x) => x.v > 0)} dataKey="v" nameKey="n" outerRadius={75} label={(e) => e.n} isAnimationActive={false}>
                <Cell fill="#0f766e" /><Cell fill="#f43f5e" /><Cell fill="#94a3b8" /></Pie><Tooltip {...tip} /></PieChart>
            </ResponsiveContainer>
          ) : <Empty title="No classified spending" />}
        </Card>
        <Card title={t('Recent Transactions')} action={<Link to="/transactions" className="text-xs text-teal-700 hover:underline dark:text-teal-400">View all</Link>}>
          {recent.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{recent.map((x) => <TxnRow key={x.id} t={x} f={f} onClick={() => openTxn({ edit: x })} />)}</div>
            : <Empty title="No transactions yet"><Button className="mt-2" onClick={() => openTxn({ type: 'expense' })}>Add transaction</Button></Empty>}
        </Card>
        {upcoming.length > 0 && <Card title={t('Expected Income')}><div className="divide-y divide-slate-100 dark:divide-slate-800">{upcoming.map((x) => <TxnRow key={x.id} t={x} f={f} onClick={() => openTxn({ edit: x })} />)}</div></Card>}
      </div>

      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="Daily allowance calculation">
        <table className="w-full text-sm"><tbody className="[&_td]:py-1.5">
          <tr><td>Available liquid balance</td><td className="text-right tabular-nums">{rm(allowance.available)}</td></tr>
          <tr><td>− Unpaid commitments due before payday</td><td className="text-right tabular-nums">{rm(allowance.unpaidCommitments)}</td></tr>
          <tr><td>− Planned savings transfers <span className="text-xs text-slate-500">(goals: Phase 3)</span></td><td className="text-right tabular-nums">{rm(allowance.reserved)}</td></tr>
          <tr><td>− Planned / expected expenses & repayments</td><td className="text-right tabular-nums">{rm(allowance.plannedEssentials)}</td></tr>
          <tr className="border-t font-semibold"><td>Spendable until payday</td><td className="text-right tabular-nums">{rm(allowance.spendable)}</td></tr>
          <tr><td>÷ Days until payday ({fmtDate(allowance.nextPayday)})</td><td className="text-right">{allowance.daysLeft}</td></tr>
          <tr className="border-t font-semibold"><td>Daily allowance</td><td className="text-right tabular-nums">{rm(allowance.perDay)}</td></tr>
        </tbody></table>
        <p className="mt-3 text-xs text-slate-500">Expected salary is not added, to avoid counting money you have not received. Change your payday in Settings.</p>
        {allowance.insufficient && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">Warning: your obligations exceed your available balance by {rm(-allowance.spendable)}.</p>}
      </Modal>
    </>
  );
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

function build(f: Finance, views: OccView[], filt: Parameters<typeof summarize>[2], today: string) {
  const s = summarize(f.txns, f.accounts, filt);
  const trend = Array.from({ length: 6 }, (_, i) => {
    const ms = addMonths(monthStart(today), i - 5); const me = monthEnd(ms);
    const x = summarize(f.txns, f.accounts, { from: ms, to: me, accountIds: filt.accountIds, categoryIds: filt.categoryIds });
    const pos = computePosition(f.accounts, computeBalances(f.accounts, f.txns, me < today ? me : today));
    return { m: fmtMonth(ms.slice(0, 7), f.settings.language), income: x.income, expenses: x.netExpenses, savings: x.cashFlow, netWorth: pos.netWorth, debt: pos.liabilities };
  });
  // Daily allowance: deduct obligations due before next payday. Credit-card-paid items don't reduce liquid cash.
  const np = dailyAllowance({ available: 0, today, payDay: f.settings.payDay }).nextPayday;
  const beforePay = addDays(np, -1);
  const accType = (id: string | null) => (id ? f.accMap.get(id)?.type : undefined);
  const exp = f.txns.filter((x) => !x.deletedAt && x.status === 'expected' && x.date <= beforePay && accType(x.accountId) !== 'credit_card');
  const planned = exp.filter((x) => x.type === 'expense' || (x.type === 'debt_repayment')).reduce((a, x) => a + x.amount, 0);
  const reserved = exp.filter((x) => x.type === 'transfer' && ['savings', 'investment'].includes(accType(x.toAccountId) ?? '') && accType(x.accountId) !== 'savings').reduce((a, x) => a + x.amount + x.fee, 0);
  const allowance = dailyAllowance({ available: f.position.available, today, payDay: f.settings.payDay, unpaidCommitments: unpaidLiquidCommitments(views, f.accounts, beforePay), plannedEssentials: planned, reserved });
  const occ = summarizeOcc(views, monthStart(today), monthEnd(today), today);
  const dueSoon = views.filter((v) => v.remaining > 0 && v.dueDate <= addDays(today, 14)).slice(0, 8);
  const upcoming = f.txns.filter((x) => !x.deletedAt && x.status === 'expected' && x.type === 'income').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return { s, trend, allowance, upcoming, occ, dueSoon };
}
