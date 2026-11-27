import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus, RotateCcw, CheckCircle2, X, Search, SlidersHorizontal } from 'lucide-react';
import { useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { DateInput, MoneyInput } from '@/components/inputs';
import { TxnRow } from '@/components/TxnRow';
import { confirmExpected, restoreTransaction } from '@/db/repo';
import { confirmSalaryReceived } from '@/db/salaryRepo';
import type { Transaction, TxnType } from '@/db/types';
import { TXN_TYPES, txnLabel, PAYMENT_METHODS } from '@/lib/labels';
import { formatRM } from '@/lib/money';
import { addDays, fmtDate, todayKL } from '@/lib/date';
import { cn } from '@/lib/cn';
import { toCSV, download } from '@/lib/csv';
import { summarize } from '@/domain/ledger';

export default function Transactions({ fixedType }: { fixedType?: 'income' | 'expense' }) {
  const f = useFinance(); const t = useT(); const { openTxn, toast } = useUI();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(''); const [type, setType] = useState<TxnType | ''>(fixedType ?? '');
  const [cat, setCat] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [status, setStatus] = useState(''); const [nw, setNw] = useState(''); const [showDeleted, setShowDeleted] = useState(false);
  const [limit, setLimit] = useState(100); const [receive, setReceive] = useState<Transaction | null>(null);
  const [group, setGroup] = useState<'' | 'in' | 'out' | 'move'>(''); const [showFilters, setShowFilters] = useState(false);
  const account = params.get('account') ?? '';
  const setAccount = (v: string) => { const p = new URLSearchParams(params); if (v) p.set('account', v); else p.delete('account'); setParams(p, { replace: true }); };

  const rows = useMemo(() => {
    if (!f) return [];
    const s = q.trim().toLowerCase();
    return f.txns.filter((x) => (showDeleted ? !!x.deletedAt : !x.deletedAt)
      && (!type || x.type === type || (fixedType === 'expense' && x.type === 'refund'))
      && (!group || (group === 'in' ? x.type === 'income' || x.type === 'refund' : group === 'out' ? x.type === 'expense' : ['transfer', 'debt_repayment', 'adjustment'].includes(x.type)))
      && (!account || x.accountId === account || x.toAccountId === account)
      && (!cat || x.categoryId === cat) && (!from || x.date >= from) && (!to || x.date <= to)
      && (!status || x.status === status) && (!nw || x.needWant === nw)
      && (!s || [x.name, x.merchant, x.remarks, f.catMap.get(x.categoryId ?? '')?.name].some((v) => v?.toLowerCase().includes(s)) || (x.amount / 100).toFixed(2).includes(s)))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [f, q, type, group, account, cat, from, to, status, nw, showDeleted, fixedType]);

  if (!f) return <Loading />;
  const title = fixedType === 'income' ? t('Income') : fixedType === 'expense' ? t('Expenses') : t('Transactions');
  const tot = summarize(rows, f.accounts, { from: '0000-01-01', to: '9999-12-31' });
  const catOpts = f.cats.filter((c) => !fixedType || c.kind === fixedType);
  const anyFilter = q || (type && !fixedType) || group || account || cat || from || to || status || nw || showDeleted;

  function exportCSV() {
    const data = rows.map((x) => ({ id: x.id, date: fmtDate(x.date), time: x.time, type: txnLabel(x.type), status: x.status, name: x.name, merchant: x.merchant,
      category: f!.catMap.get(x.categoryId ?? '')?.name ?? '', amount: (x.amount / 100).toFixed(2), fee: (x.fee / 100).toFixed(2),
      account: f!.accMap.get(x.accountId ?? '')?.name ?? '', to_account: f!.accMap.get(x.toAccountId ?? '')?.name ?? '',
      payment_method: PAYMENT_METHODS.find((p) => p.v === x.paymentMethod)?.label ?? '', need_want: x.needWant ?? '', remarks: x.remarks }));
    if (!data.length) return toast('Nothing to export', 'err');
    download(`myfinance-${fixedType ?? 'transactions'}-${todayKL()}.csv`, '﻿' + toCSV(data), 'text/csv');
  }

  const filterCount = [type && !fixedType, account, cat, from, to, status, nw, showDeleted].filter(Boolean).length;
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const x of rows.slice(0, limit)) { const g = groups[groups.length - 1]; if (g && g.date === x.date) g.items.push(x); else groups.push({ date: x.date, items: [x] }); }
  const today = todayKL();
  const dayLabel = (d: string) => d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z'));
  const TABS: { v: '' | 'in' | 'out' | 'move'; label: string }[] = [{ v: '', label: 'All' }, { v: 'in', label: 'Money in' }, { v: 'out', label: 'Spending' }, { v: 'move', label: 'Transfers' }];

  return (
    <>
      <PageHeader title={title} subtitle={`${rows.length} transaction${rows.length === 1 ? '' : 's'} · in ${formatRM(tot.income + tot.refunds)} · out ${formatRM(tot.expenses + tot.fees)}`} actions={<>
        <Button variant="ghost" onClick={exportCSV} aria-label="Export CSV"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></Button>
        <Button onClick={() => openTxn({ type: fixedType ?? 'expense' })}><Plus className="h-4 w-4" />Add</Button>
      </>} />
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-10" placeholder={`${t('Search')} name, merchant or amount`} aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button variant={showFilters || filterCount ? 'secondary' : 'ghost'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filters</span>{filterCount > 0 && <span className="rounded-full bg-teal-700 px-1.5 text-[11px] text-white dark:bg-teal-300 dark:text-slate-950">{filterCount}</span>}</Button>
        </div>
        {!fixedType && <div role="tablist" aria-label="Type" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">{TABS.map((x) => (
          <button key={x.v} role="tab" aria-selected={group === x.v} onClick={() => setGroup(x.v)} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition', group === x.v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400')}>{x.label}</button>))}</div>}
        {showFilters && <Card className="p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Field label="Account"><Select value={account} onChange={(e) => setAccount(e.target.value)}><option value="">All accounts</option>{f.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="Category"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{catOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            {!fixedType && <Field label="Exact type"><Select value={type} onChange={(e) => setType(e.target.value as TxnType)}><option value="">Any</option>{TXN_TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</Select></Field>}
            {fixedType !== 'income' && <Field label="Needs / wants"><Select value={nw} onChange={(e) => setNw(e.target.value)}><option value="">Both</option><option value="need">Needs</option><option value="want">Wants</option></Select></Field>}
            {fixedType !== 'expense' && <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Actual & expected</option><option value="actual">Actual</option><option value="expected">Expected</option></Select></Field>}
            <Field label="From"><DateInput value={from} onChange={setFrom} /></Field>
            <Field label="To"><DateInput value={to} onChange={setTo} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />Show recently deleted</label>
            {anyFilter && <button className="flex items-center gap-1 font-medium text-teal-700 hover:underline dark:text-teal-300" onClick={() => { setQ(''); if (!fixedType) setType(''); setGroup(''); setAccount(''); setCat(''); setFrom(''); setTo(''); setStatus(''); setNw(''); setShowDeleted(false); }}><X className="h-3.5 w-3.5" />Clear all</button>}
          </div>
        </Card>}
      </div>
      {rows.length ? (
        <div className="space-y-5">
          {groups.map((g) => {
            const net = g.items.reduce((a, x) => a + (x.status !== 'actual' || x.deletedAt ? 0 : x.type === 'income' || x.type === 'refund' ? x.amount : x.type === 'expense' ? -x.amount : x.type === 'transfer' ? -x.fee : 0), 0);
            return (
              <section key={g.date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs font-semibold text-slate-500"><h2>{dayLabel(g.date)}</h2>{net !== 0 && <span className="tabular-nums">{formatRM(net, { sign: true })}</span>}</div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white px-3 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {g.items.map((x) => (
                    <TxnRow key={x.id} t={x} f={f} hideDate onClick={showDeleted ? undefined : () => openTxn({ edit: x })}
                      action={showDeleted ? <Button variant="ghost" onClick={async () => { await restoreTransaction(x.id); toast('Restored'); }}><RotateCcw className="h-4 w-4" />Restore</Button>
                        : x.status === 'expected' ? <Button variant="ghost" className="text-income" onClick={(e) => { e.stopPropagation(); setReceive(x); }}><CheckCircle2 className="h-4 w-4" /><span className="hidden sm:inline">{x.type === 'income' ? 'Received' : 'Confirm'}</span></Button> : undefined} />))}
                </div>
              </section>);
          })}
          {rows.length > limit && <div className="text-center"><Button variant="secondary" onClick={() => setLimit(limit + 200)}>Show more ({rows.length - limit} remaining)</Button></div>}
        </div>
      ) : <Empty title={showDeleted ? 'No deleted transactions' : anyFilter ? 'No matches' : 'No transactions yet'}>{anyFilter ? 'Try a different search or clear the filters.' : 'Tap Add to record your first one.'}</Empty>}
      {receive && <ReceiveModal t={receive} onClose={() => setReceive(null)} />}
    </>
  );
}

function ReceiveModal({ t, onClose }: { t: Transaction; onClose: () => void }) {
  const f = useFinance(); const { toast } = useUI();
  const [acc, setAcc] = useState(t.accountId ?? ''); const [date, setDate] = useState(todayKL()); const [amt, setAmt] = useState<number | null>(t.amount);
  const [err, setErr] = useState('');
  return (
    <Modal open onClose={onClose} title={t.type === 'income' ? 'Confirm income received' : `Confirm ${txnLabel(t.type).toLowerCase()}`}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t.name} · expected {formatRM(t.amount)} on {fmtDate(t.date)}. This converts the same record to an actual transaction (no duplicate).</p>
      <div className="grid gap-3">
        <Field label={t.type === 'income' ? 'Received into' : 'Account'}><Select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">— Select —</option>{f?.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Actual amount"><MoneyInput value={amt} onChange={setAmt} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { if (!acc || !date || !amt) return setErr('Account, date and amount are required.'); try { const sal = t.related.find((r) => r.kind === 'salary'); if (sal) await confirmSalaryReceived(sal.id, { actualNet: amt, date, accountId: acc }); else await confirmExpected(t.id, acc, date, amt); toast('Recorded'); onClose(); } catch (e) { setErr((e as Error).message); } }}>Confirm</Button></div>
      </div>
    </Modal>
  );
}
