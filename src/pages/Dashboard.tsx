import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Info, Receipt, Wallet, Target, ListTodo } from 'lucide-react';
import { useBudgets, useCommitments, useFinance, useGoals, useReceipts, useTasks } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Button, Card, Loading, Modal } from '@/components/ui';
import { TxnRow } from '@/components/TxnRow';
import { Progress } from '@/components/Progress';
import { computeAllowance } from '@/domain/allowance';
import { summarize } from '@/domain/ledger';
import { budgetLines, isOverdueTask } from '@/domain/planning';
import { formatRM } from '@/lib/money';
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, monthEnd, monthStart, nowTimeKL, todayKL } from '@/lib/date';
import { cn } from '@/lib/cn';

const rm = (c: number) => formatRM(c);
const greeting = () => { const h = Number(nowTimeKL().slice(0, 2)); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const longDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));

export default function Dashboard() {
  const f = useFinance(); const cm = useCommitments(); const goals = useGoals(); const budgets = useBudgets(); const tasks = useTasks(); const receipts = useReceipts();
  const t = useT(); const { openTxn, openAccount } = useUI(); const today = todayKL();
  const [showCalc, setShowCalc] = useState(false);

  const d = useMemo(() => {
    if (!f || !cm || !goals || !budgets || !tasks || !receipts) return null;
    const ms = monthStart(today), me = monthEnd(today), pms = addMonths(ms, -1);
    const cur = summarize(f.txns, f.accounts, { from: ms, to: me });
    const prev = summarize(f.txns, f.accounts, { from: pms, to: monthEnd(pms) });
    const allowance = computeAllowance({ available: f.position.available, accounts: f.accounts, txns: f.txns, occ: cm.views, goals: goals.views, today, payDay: f.settings.payDay });
    const lines = budgetLines(budgets, cur.byCategory, today.slice(0, 7));
    const upcoming = [
      ...cm.views.filter((v) => v.remaining > 0 && v.dueDate >= today && v.dueDate <= addDays(today, 14)).map((v) => ({ id: v.id, date: v.dueDate, name: v.commitment.name, amount: -v.remaining, link: '/commitments' })),
      ...f.txns.filter((x) => !x.deletedAt && x.status === 'expected' && x.date >= today && x.date <= addDays(today, 14)).map((x) => ({ id: x.id, date: x.date, name: x.name, amount: x.type === 'income' ? x.amount : -x.amount, link: '/transactions' })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const overdue = cm.views.filter((v) => v.status === 'overdue' || (v.status === 'partial' && v.dueDate < today));
    const attention = [
      overdue.length && { icon: CalendarClock, text: `${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''} · ${rm(overdue.reduce((a, v) => a + v.remaining, 0))}`, link: '/commitments', tone: 'red' },
      lines.filter((l) => l.level === 'over').length && { icon: Target, text: `${lines.filter((l) => l.level === 'over').length} budget${lines.filter((l) => l.level === 'over').length > 1 ? 's' : ''} over the limit`, link: '/budget', tone: 'red' },
      f.position.lowBalance.length && { icon: Wallet, text: `Low balance: ${f.position.lowBalance.map((a) => a.name).join(', ')}`, link: '/accounts', tone: 'orange' },
      receipts.filter((r) => ['review', 'draft', 'duplicate', 'failed'].includes(r.status)).length && { icon: Receipt, text: plural(receipts.filter((r) => ['review', 'draft', 'duplicate', 'failed'].includes(r.status)).length, 'receipt') + ' to review', link: '/scan', tone: 'orange' },
      tasks.filter((x) => isOverdueTask(x, today)).length && { icon: ListTodo, text: plural(tasks.filter((x) => isOverdueTask(x, today)).length, 'overdue task'), link: '/tasks', tone: 'orange' },
    ].filter(Boolean) as { icon: typeof Receipt; text: string; link: string; tone: 'red' | 'orange' }[];
    const recent = [...f.txns].filter((x) => !x.deletedAt && x.status === 'actual').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
    const goalTotals = goals.views.filter((g) => g.status === 'active').reduce((a, g) => ({ saved: a.saved + g.saved, target: a.target + g.target }), { saved: 0, target: 0 });
    return { cur, prev, allowance, lines, upcoming, attention, recent, goalTotals };
  }, [f, cm, goals, budgets, tasks, receipts, today]);

  if (!f || !d) return <Loading />;

  if (!f.accounts.length) return (
    <div className="mx-auto max-w-xl py-10">
      <p className="text-sm text-slate-500">{longDate(today)}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Welcome to MyFinance</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">Track your money in ringgit, simply. Everything stays on this device unless you turn on sync.</p>
      <ol className="mt-8 space-y-3">
        {[['Add your accounts', 'Bank, cash, e-wallets and cards with today’s balance.'], ['Record spending', 'Add expenses or scan a receipt – it’s read on your phone.'], ['See what’s safe to spend', 'MyFinance works out a daily amount until payday.']].map(([h, p], i) => (
          <li key={h} className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">{i + 1}</span>
            <div><p className="font-semibold">{h}</p><p className="text-sm text-slate-500">{p}</p></div>
          </li>))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => openAccount()}>Add your first account</Button><Link to="/settings"><Button variant="secondary">Try with demo data</Button></Link></div>
    </div>
  );

  const a = d.allowance; const days = daysBetween(today, a.nextPayday);
  const delta = (cur: number, prev: number) => { if (!prev) return ''; const pct = Math.round(((cur - prev) / prev) * 100); return Math.abs(pct) < 1 ? `about the same as ${fmtMonth(addMonths(monthStart(today), -1).slice(0, 7))}` : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs ${fmtMonth(addMonths(monthStart(today), -1).slice(0, 7))}`; };
  const cats = d.cur.byCategory.filter((c) => c.amount > 0).slice(0, 5); const top = cats[0]?.amount ?? 1;
  const catName = (id: string) => { const c = f.catMap.get(id); return c ? (f.settings.language === 'ms' && c.nameMs ? c.nameMs : c.name) : 'Uncategorised'; };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">{longDate(today)}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-[28px]">{greeting()}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Hero: the one number that matters day to day */}
        <section className="relative overflow-hidden rounded-3xl bg-teal-700 p-6 text-white sm:p-7 lg:col-span-3 dark:bg-teal-900">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-teal-50">{t('Safe to spend today')}</p>
              <button onClick={() => setShowCalc(true)} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20"><Info className="h-3.5 w-3.5" />How?</button>
            </div>
            <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">{rm(a.perDay)}</p>
            {a.insufficient
              ? <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white"><AlertTriangle className="h-4 w-4" />Bills due before payday exceed your available money by {rm(-a.spendable)}.</p>
              : <p className="mt-3 text-sm text-teal-50">{rm(a.spendable)} to last {days} day{days === 1 ? '' : 's'} until payday on {fmtDate(a.nextPayday)}</p>}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-sm">
              <div><p className="text-teal-100">Available now</p><p className="mt-0.5 font-semibold tabular-nums">{rm(f.position.available)}</p></div>
              <div><p className="text-teal-100">Set aside for bills & goals</p><p className="mt-0.5 font-semibold tabular-nums">{rm(a.unpaidCommitments + a.reserved + a.plannedEssentials)}</p></div>
            </div>
          </div>
        </section>

        {/* This month */}
        <Card className="lg:col-span-2" title={fmtMonth(today.slice(0, 7), f.settings.language)} action={<Link to="/reports" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">Report</Link>}>
          <dl className="space-y-4">
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Money in</dt><dd className="text-right"><span className="text-lg font-semibold tabular-nums text-income">{formatRM(d.cur.income, { sign: true })}</span><span className="block text-[11px] text-slate-500">{delta(d.cur.income, d.prev.income)}</span></dd></div>
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Spent</dt><dd className="text-right"><span className="text-lg font-semibold tabular-nums">{rm(d.cur.netExpenses)}</span><span className="block text-[11px] text-slate-500">{delta(d.cur.netExpenses, d.prev.netExpenses)}</span></dd></div>
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><dt className="text-sm font-medium">Left this month</dt><dd className={cn('text-lg font-bold tabular-nums', d.cur.cashFlow < 0 && 'text-expense')}>{formatRM(d.cur.cashFlow)}</dd></div>
          </dl>
        </Card>
      </div>

      {d.attention.length > 0 && (
        <section aria-label={t('Needs attention')} className="rounded-2xl border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          {d.attention.map((x) => (
            <Link key={x.text} to={x.link} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', x.tone === 'red' ? 'bg-expense-soft text-expense dark:bg-red-900/30' : 'bg-warn-soft text-warn dark:bg-orange-900/30')}><x.icon className="h-4 w-4" /></span>
              <span className="flex-1 font-medium">{x.text}</span><ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>))}
        </section>)}

      <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title={t('Coming up')} action={<span className="text-xs text-slate-500">next 14 days</span>}>
          {d.upcoming.length ? <ul className="-my-1 divide-y divide-slate-100 dark:divide-slate-800">{d.upcoming.map((u) => (
            <li key={u.id}><Link to={u.link} className="flex items-center gap-3 py-2.5">
              <span className="w-12 shrink-0 rounded-lg bg-slate-100 py-1 text-center dark:bg-slate-800"><span className="block text-[10px] font-semibold uppercase text-slate-500">{new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(u.date + 'T00:00:00Z'))}</span><span className="block text-sm font-bold leading-tight">{Number(u.date.slice(8))}</span></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</span>
              <span className={cn('text-sm font-semibold tabular-nums', u.amount > 0 && 'text-income')}>{formatRM(u.amount, { sign: u.amount > 0 })}</span>
            </Link></li>))}</ul> : <p className="py-4 text-sm text-slate-500">Nothing due in the next two weeks.</p>}
        </Card>

        <Card title="Where your money went" action={<Link to="/reports" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">Details</Link>}>
          {cats.length ? <ul className="space-y-3.5">{cats.map((c) => (
            <li key={c.categoryId}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm"><span className="truncate">{catName(c.categoryId)}</span><span className="shrink-0 font-semibold tabular-nums">{rm(c.amount)} <span className="ml-1 text-xs font-normal text-slate-500">{Math.round((c.amount / Math.max(1, d.cur.netExpenses)) * 100)}%</span></span></div>
              <div aria-hidden className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-600 dark:bg-teal-400" style={{ width: `${Math.max(3, (c.amount / top) * 100)}%` }} /></div>
            </li>))}</ul> : <p className="py-4 text-sm text-slate-500">No spending recorded this month yet.</p>}
        </Card>

        {d.lines.length > 0 && <Card title="Budgets" action={<Link to="/budget" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">Manage</Link>}>
          <ul className="space-y-3.5">{d.lines.slice(0, 4).map((l) => (
            <li key={l.categoryId} className="text-sm"><div className="mb-1.5 flex justify-between gap-2"><span className="truncate">{catName(l.categoryId)}</span><span className="shrink-0 tabular-nums text-slate-500"><span className={cn('font-semibold', l.level === 'over' ? 'text-expense' : 'text-slate-900 dark:text-white')}>{rm(l.spent)}</span> / {rm(l.allocated)}</span></div>
              <Progress value={l.pct} tone={l.level} label={`${catName(l.categoryId)} budget used`} /></li>))}</ul>
        </Card>}

        <Card title={t('Recent transactions')} action={<Link to="/transactions" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">View all</Link>}>
          {d.recent.length ? <div className="-my-1 divide-y divide-slate-100 dark:divide-slate-800">{d.recent.map((x) => <TxnRow key={x.id} t={x} f={f} onClick={() => openTxn({ edit: x })} />)}</div>
            : <div className="py-4 text-sm text-slate-500">No transactions yet. <button className="font-medium text-teal-700 underline dark:text-teal-300" onClick={() => openTxn({ type: 'expense' })}>Add one</button></div>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{ to: '/accounts', label: 'Net worth', value: rm(f.position.netWorth) }, { to: '/debts', label: 'Debt', value: rm(f.position.liabilities) },
          { to: '/savings', label: 'Savings goals', value: d.goalTotals.target ? `${Math.round((d.goalTotals.saved / d.goalTotals.target) * 100)}% of ${rm(d.goalTotals.target)}` : 'Set a goal' }].map((x) => (
          <Link key={x.to} to={x.to} className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span><span className="block text-xs text-slate-500">{x.label}</span><span className="font-semibold tabular-nums">{x.value}</span></span>
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
          </Link>))}
      </div>

      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="How “safe to spend” is worked out">
        <table className="w-full text-sm"><tbody className="[&_td]:py-2 [&_td:last-child]:text-right [&_td:last-child]:tabular-nums">
          <tr><td>Available in your spending accounts</td><td>{rm(a.available)}</td></tr>
          <tr><td>− Unpaid bills due before payday</td><td>{rm(a.unpaidCommitments)}</td></tr>
          <tr><td>− Set aside for savings goals</td><td>{rm(a.reserved)}</td></tr>
          <tr><td>− Planned expenses & repayments</td><td>{rm(a.plannedEssentials)}</td></tr>
          <tr className="border-t border-slate-200 font-semibold dark:border-slate-700"><td>Left until payday ({fmtDate(a.nextPayday)})</td><td>{rm(a.spendable)}</td></tr>
          <tr><td>÷ Days left</td><td>{a.daysLeft}</td></tr>
          <tr className="border-t border-slate-200 text-base font-bold dark:border-slate-700"><td>Safe to spend per day</td><td>{rm(a.perDay)}</td></tr>
        </tbody></table>
        <p className="mt-4 text-xs text-slate-500">Expected salary isn’t counted until it arrives. Bills paid by credit card don’t reduce your cash now. Change your payday in Settings.</p>
      </Modal>
    </div>
  );
}
