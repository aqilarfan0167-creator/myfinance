import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCommitments, useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Card, Loading, PageHeader, Button, Badge } from '@/components/ui';
import { Tabs } from '@/components/Tabs';
import { STATUS_META } from '@/domain/commitments';
import { formatRM } from '@/lib/money';
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, monthEnd, monthStart, todayKL } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { Transaction } from '@/db/types';

type Kind = 'income' | 'expense' | 'transfer' | 'expected' | 'commitment';
interface Ev { id: string; date: string; title: string; amount: number; kind: Kind; status?: string; txn?: Transaction }
const DOT: Record<Kind, string> = { income: 'bg-income', expense: 'bg-expense', transfer: 'bg-transfer', expected: 'bg-warn', commitment: 'bg-saving' };
const CHIP: Record<Kind, string> = {
  income: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300', expense: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  transfer: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', expected: 'border border-dashed border-orange-400 text-orange-700 dark:text-orange-300',
  commitment: 'bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};
const LEGEND: { k: Kind; label: string }[] = [{ k: 'income', label: 'Income' }, { k: 'expense', label: 'Expenses' }, { k: 'transfer', label: 'Transfers & repayments' }, { k: 'expected', label: 'Expected / planned' }, { k: 'commitment', label: 'Commitments due' }];
const weekStart = (d: string) => { const dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(d, -dow); }; // Monday

export default function CalendarPage() {
  const t = useT(); const f = useFinance(); const c = useCommitments(); const { openTxn } = useUI();
  const today = todayKL();
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [cursor, setCursor] = useState(today);
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());

  const events = useMemo(() => {
    if (!f || !c) return new Map<string, Ev[]>();
    const m = new Map<string, Ev[]>();
    const push = (e: Ev) => { if (hidden.has(e.kind)) return; const a = m.get(e.date) ?? []; a.push(e); m.set(e.date, a); };
    for (const x of f.txns) {
      if (x.deletedAt || x.related?.some((r) => r.kind === 'occurrence')) continue; // shown under the commitment instead
      const kind: Kind = x.status === 'expected' ? 'expected' : x.type === 'income' || x.type === 'refund' ? 'income' : x.type === 'expense' ? 'expense' : 'transfer';
      push({ id: x.id, date: x.date, title: x.name, amount: x.amount, kind, txn: x });
    }
    for (const v of c.views) if (!v.skipped) push({ id: v.id, date: v.dueDate, title: v.commitment.name, amount: v.amount, kind: 'commitment', status: v.status });
    return m;
  }, [f, c, hidden]);
  if (!f || !c) return <Loading />;

  const step = (n: number) => setCursor(view === 'month' ? addMonths(monthStart(cursor), n) : addDays(cursor, n * (view === 'week' ? 7 : 1)));
  const label = view === 'month' ? fmtMonth(cursor.slice(0, 7), f.settings.language) : view === 'week' ? `${fmtDate(weekStart(cursor))} – ${fmtDate(addDays(weekStart(cursor), 6))}` : fmtDate(cursor);
  const evOf = (d: string) => (events.get(d) ?? []).sort((a, b) => a.kind.localeCompare(b.kind));
  const open = (e: Ev) => { if (e.txn) openTxn({ edit: e.txn }); };
  const toggle = (k: Kind) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const EvLine = ({ e }: { e: Ev }) => (
    <button onClick={() => open(e)} className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm', CHIP[e.kind])}>
      <span className="truncate">{e.title}{e.status && <> <Badge tone={STATUS_META[e.status as keyof typeof STATUS_META].tone}>{STATUS_META[e.status as keyof typeof STATUS_META].label}</Badge></>}</span>
      <span className="shrink-0 tabular-nums">{formatRM(e.amount)}</span>
    </button>
  );

  const ms = monthStart(cursor); const gridStart = weekStart(ms);
  const cells = Array.from({ length: Math.ceil((daysBetween(gridStart, monthEnd(ms)) + 1) / 7) * 7 }, (_, i) => addDays(gridStart, i));
  const selEvents = evOf(cursor);

  return (
    <>
      <PageHeader title={t('Financial Calendar')} />
      <Tabs value={view} onChange={setView} items={[{ v: 'month', label: 'Month' }, { v: 'week', label: 'Week' }, { v: 'day', label: 'Day' }]} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-36 text-center font-semibold">{label}</span>
        <Button variant="secondary" aria-label="Next" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => setCursor(today)}>Today</Button>
        <div className="flex flex-wrap gap-2 text-xs sm:ml-auto">{LEGEND.map((l) => <button key={l.k} onClick={() => toggle(l.k)} className={cn('flex items-center gap-1', hidden.has(l.k) && 'opacity-40 line-through')}><span className={cn('h-2.5 w-2.5 rounded-full', DOT[l.k])} />{l.label}</button>)}</div>
      </div>

      {view === 'month' && <>
        <Card className="p-2">
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
            {cells.map((d) => {
              const ev = evOf(d); const inM = d.slice(0, 7) === ms.slice(0, 7);
              return (
                <button key={d} onClick={() => setCursor(d)} className={cn('min-h-16 bg-white p-1 text-left align-top sm:min-h-24 dark:bg-slate-900', !inM && 'opacity-40', d === cursor && 'ring-2 ring-inset ring-teal-600')}>
                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', d === today && 'bg-teal-700 font-bold text-white')}>{Number(d.slice(8))}</span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">{ev.slice(0, 6).map((e) => <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', DOT[e.kind])} />)}</div>
                  <div className="hidden space-y-0.5 sm:block">{ev.slice(0, 3).map((e) => <div key={e.id} className={cn('truncate rounded px-1 text-[11px]', CHIP[e.kind])}>{e.title}</div>)}{ev.length > 3 && <div className="text-[11px] text-slate-500">+{ev.length - 3} more</div>}</div>
                </button>);
            })}
          </div>
        </Card>
        <Card title={fmtDate(cursor)} className="mt-4">{selEvents.length ? <div className="space-y-1">{selEvents.map((e) => <EvLine key={e.id} e={e} />)}</div> : <p className="text-sm text-slate-500">Nothing on this day.</p>}</Card>
      </>}

      {view === 'week' && <div className="grid gap-3 md:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)).map((d) => (
          <Card key={d} title={<span className={d === today ? 'text-teal-700 dark:text-teal-400' : ''}>{new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} {fmtDate(d).slice(0, 5)}</span>} className="p-2 md:min-h-40">
            <div className="space-y-1">{evOf(d).map((e) => <EvLine key={e.id} e={e} />)}</div>
          </Card>))}
      </div>}

      {view === 'day' && <Card title={fmtDate(cursor)}>{selEvents.length ? <div className="space-y-1">{selEvents.map((e) => <EvLine key={e.id} e={e} />)}</div> : <p className="text-sm text-slate-500">Nothing on this day.</p>}</Card>}
      <p className="mt-3 text-xs text-slate-500">Savings goals and financial tasks will appear here once those modules are added (Phase 3).</p>
    </>
  );
}
