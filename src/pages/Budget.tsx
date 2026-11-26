import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBudgets, useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Button, Card, Empty, Loading, PageHeader, Select } from '@/components/ui';
import { MoneyInput } from '@/components/inputs';
import { Stat } from '@/components/Stat';
import { Progress } from '@/components/Progress';
import { IconBadge } from '@/components/Icon';
import { copyBudgets, setBudget } from '@/db/planningRepo';
import { budgetLines, budgetLevel } from '@/domain/planning';
import { summarize } from '@/domain/ledger';
import { formatRM } from '@/lib/money';
import { addMonths, daysBetween, fmtMonth, monthEnd, todayKL } from '@/lib/date';

const rm = (c: number) => formatRM(c);
const LEVEL_TEXT = { ok: 'text-income', warn: 'text-warn', over: 'text-expense' } as const;

export default function BudgetPage() {
  const t = useT(); const f = useFinance(); const budgets = useBudgets(); const { toast, confirm } = useUI();
  const today = todayKL();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [addCat, setAddCat] = useState('');
  const ms = `${month}-01`;
  const spent = useMemo(() => f ? summarize(f.txns, f.accounts, { from: ms, to: monthEnd(ms) }) : null, [f, ms]);
  if (!f || !budgets || !spent) return <Loading />;
  const lines = budgetLines(budgets, spent.byCategory, month);
  const tot = lines.reduce((a, l) => ({ alloc: a.alloc + l.allocated, spent: a.spent + l.spent }), { alloc: 0, spent: 0 });
  const unbudgeted = spent.byCategory.filter((c) => c.amount > 0 && !lines.some((l) => l.categoryId === c.categoryId));
  const unbudgetedTotal = unbudgeted.reduce((a, c) => a + c.amount, 0);
  const available = f.cats.filter((c) => c.kind === 'expense' && !c.archived && !lines.some((l) => l.categoryId === c.id));
  const prev = addMonths(ms, -1).slice(0, 7);
  const isCurrent = month === today.slice(0, 7);
  const daysLeft = isCurrent ? daysBetween(today, monthEnd(ms)) + 1 : 0;
  const name = (id: string) => { const c = f.catMap.get(id); return c ? (f.settings.language === 'ms' && c.nameMs ? c.nameMs : c.name) : 'Uncategorised'; };

  const copy = async () => {
    const existing = lines.length;
    const overwrite = existing > 0 && await confirm({ title: 'Copy budgets from ' + fmtMonth(prev), message: `This month already has ${existing} budget(s). Overwrite matching categories with last month's amounts? Choose Cancel to only add missing ones.`, confirmText: 'Overwrite' });
    const n = await copyBudgets(prev, month, overwrite);
    toast(n ? `Copied ${n} budget(s) from ${fmtMonth(prev)}` : `Nothing new to copy from ${fmtMonth(prev)}`, n ? 'ok' : 'err');
  };

  return (
    <>
      <PageHeader title={t('Budget Planner')} actions={<Button variant="secondary" onClick={copy}><Copy className="h-4 w-4" />Copy {fmtMonth(prev)}</Button>} />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" aria-label="Previous month" onClick={() => setMonth(addMonths(ms, -1).slice(0, 7))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-28 text-center font-semibold">{fmtMonth(month, f.settings.language)}</span>
        <Button variant="secondary" aria-label="Next month" onClick={() => setMonth(addMonths(ms, 1).slice(0, 7))}><ChevronRight className="h-4 w-4" /></Button>
        {!isCurrent && <Button variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>This month</Button>}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Allocated" value={rm(tot.alloc)} sub={`${lines.length} categories`} />
        <Stat label="Spent (budgeted)" value={rm(tot.spent)} tone={budgetLevel(tot.spent, tot.alloc) === 'over' ? 'red' : budgetLevel(tot.spent, tot.alloc) === 'warn' ? 'orange' : 'green'} sub={tot.alloc ? `${Math.round((tot.spent / tot.alloc) * 100)}% used` : '—'} />
        <Stat label="Remaining" value={rm(tot.alloc - tot.spent)} tone={tot.alloc - tot.spent < 0 ? 'red' : 'blue'} sub={isCurrent && tot.alloc - tot.spent > 0 ? `${rm(Math.floor((tot.alloc - tot.spent) / daysLeft))}/day for ${daysLeft} day(s)` : undefined} />
        <Stat label="Unbudgeted spending" value={rm(unbudgetedTotal)} tone={unbudgetedTotal ? 'orange' : undefined} sub={`${unbudgeted.length} categor${unbudgeted.length === 1 ? 'y' : 'ies'}`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <Card title="Category budgets" action={available.length > 0 && (
          <div className="flex gap-2"><Select value={addCat} onChange={(e) => setAddCat(e.target.value)} aria-label="Category to add" className="w-44"><option value="">Add category…</option>{available.map((c) => <option key={c.id} value={c.id}>{name(c.id)}</option>)}</Select>
            <Button disabled={!addCat} onClick={async () => { await setBudget(month, addCat, 0); setAddCat(''); }} aria-label="Add"><Plus className="h-4 w-4" /></Button></div>)}>
          {lines.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{lines.map((l) => {
            const c = f.catMap.get(l.categoryId);
            return (
              <div key={l.categoryId} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {c && <IconBadge name={c.icon} color={c.color} />}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name(l.categoryId)}</p>
                    <p className="text-xs text-slate-500">Spent <b className={LEVEL_TEXT[l.level]}>{rm(l.spent)}</b> · {l.remaining >= 0 ? `${rm(l.remaining)} left` : <span className="text-expense">{rm(-l.remaining)} over</span>}</p></div>
                  <div className="w-36"><BudgetInput key={`${month}:${l.categoryId}`} value={l.allocated} onSave={(v) => setBudget(month, l.categoryId, v)} /></div>
                  <button aria-label="Remove budget" className="p-1 text-slate-400 hover:text-red-600" onClick={() => setBudget(month, l.categoryId, null)}><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 flex items-center gap-2"><Progress value={l.pct} tone={l.level} label={`${name(l.categoryId)} budget used`} /><span className={`w-12 text-right text-xs font-medium ${LEVEL_TEXT[l.level]}`}>{Math.round(l.pct * 100)}%</span></div>
              </div>);
          })}</div> : <Empty title="No budgets for this month">Add categories above, or copy last month's budgets.</Empty>}
          <p className="mt-3 text-xs text-slate-500">Spent = expenses minus refunds for the month (transfer fees count under Bank & Transfer Fees). Green below 70%, orange 70–99%, red 100%+.</p>
        </Card>
        <div className="space-y-4">
          {lines.length > 0 && <Card title="Allocated vs spent">
            <div role="img" aria-label="Chart – the same figures are listed in the cards and tables on this page"><div aria-hidden="true"><ResponsiveContainer width="100%" height={Math.max(160, lines.length * 34)}>
              <BarChart data={lines.map((l) => ({ n: name(l.categoryId), a: l.allocated, s: l.spent }))} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis type="number" fontSize={10} tickFormatter={(v) => `${Math.round(v / 100)}`} /><YAxis type="category" dataKey="n" width={90} fontSize={10} />
                <Tooltip formatter={(v: number) => rm(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="a" name="Allocated" fill="#cbd5e1" isAnimationActive={false} /><Bar dataKey="s" name="Spent" fill="#0f766e" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer></div></div>
          </Card>}
          {unbudgeted.length > 0 && <Card title="Spending without a budget">
            <ul className="text-sm">{unbudgeted.map((u) => <li key={u.categoryId} className="flex items-center justify-between py-1"><span>{name(u.categoryId)}</span><span className="flex items-center gap-2 tabular-nums">{rm(u.amount)}
              {f.catMap.has(u.categoryId) && <button className="text-xs text-teal-700 hover:underline dark:text-teal-400" onClick={() => setBudget(month, u.categoryId, Math.ceil(u.amount / 10000) * 10000)}>Budget</button>}</span></li>)}</ul>
          </Card>}
        </div>
      </div>
    </>
  );
}

/** Saves 600 ms after typing stops, so each edit is one write and one audit entry. */
function BudgetInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState<number | null>(value || null);
  const timer = useRef<ReturnType<typeof setTimeout>>(); const pending = useRef<number | null>(null);
  const flush = () => { clearTimeout(timer.current); if (pending.current != null) { onSave(pending.current); pending.current = null; } };
  useEffect(() => flush, []); // eslint-disable-line -- save an unsaved edit when leaving the page
  return <MoneyInput value={v} onChange={(c) => { setV(c); clearTimeout(timer.current); pending.current = c != null && c !== value ? c : null; if (pending.current != null) timer.current = setTimeout(flush, 600); }} />;
}
