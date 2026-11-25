import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus, RotateCcw, CheckCircle2, X } from 'lucide-react';
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
import { fmtDate, todayKL } from '@/lib/date';
import { toCSV, download } from '@/lib/csv';
import { summarize } from '@/domain/ledger';

export default function Transactions({ fixedType }: { fixedType?: 'income' | 'expense' }) {
  const f = useFinance(); const t = useT(); const { openTxn, toast } = useUI();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(''); const [type, setType] = useState<TxnType | ''>(fixedType ?? '');
  const [cat, setCat] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [status, setStatus] = useState(''); const [nw, setNw] = useState(''); const [showDeleted, setShowDeleted] = useState(false);
  const [limit, setLimit] = useState(100); const [receive, setReceive] = useState<Transaction | null>(null);
  const account = params.get('account') ?? '';
  const setAccount = (v: string) => { const p = new URLSearchParams(params); if (v) p.set('account', v); else p.delete('account'); setParams(p, { replace: true }); };

  const rows = useMemo(() => {
    if (!f) return [];
    const s = q.trim().toLowerCase();
    return f.txns.filter((x) => (showDeleted ? !!x.deletedAt : !x.deletedAt)
      && (!type || x.type === type || (fixedType === 'expense' && x.type === 'refund'))
      && (!account || x.accountId === account || x.toAccountId === account)
      && (!cat || x.categoryId === cat) && (!from || x.date >= from) && (!to || x.date <= to)
      && (!status || x.status === status) && (!nw || x.needWant === nw)
      && (!s || [x.name, x.merchant, x.remarks, f.catMap.get(x.categoryId ?? '')?.name].some((v) => v?.toLowerCase().includes(s)) || (x.amount / 100).toFixed(2).includes(s)))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [f, q, type, account, cat, from, to, status, nw, showDeleted, fixedType]);

  if (!f) return <Loading />;
  const title = fixedType === 'income' ? t('Income') : fixedType === 'expense' ? t('Expenses') : t('Transactions');
  const tot = summarize(rows, f.accounts, { from: '0000-01-01', to: '9999-12-31' });
  const catOpts = f.cats.filter((c) => !fixedType || c.kind === fixedType);
  const anyFilter = q || (type && !fixedType) || account || cat || from || to || status || nw;

  function exportCSV() {
    const data = rows.map((x) => ({ id: x.id, date: fmtDate(x.date), time: x.time, type: txnLabel(x.type), status: x.status, name: x.name, merchant: x.merchant,
      category: f!.catMap.get(x.categoryId ?? '')?.name ?? '', amount: (x.amount / 100).toFixed(2), fee: (x.fee / 100).toFixed(2),
      account: f!.accMap.get(x.accountId ?? '')?.name ?? '', to_account: f!.accMap.get(x.toAccountId ?? '')?.name ?? '',
      payment_method: PAYMENT_METHODS.find((p) => p.v === x.paymentMethod)?.label ?? '', need_want: x.needWant ?? '', remarks: x.remarks }));
    if (!data.length) return toast('Nothing to export', 'err');
    download(`myfinance-${fixedType ?? 'transactions'}-${todayKL()}.csv`, '﻿' + toCSV(data), 'text/csv');
  }

  return (
    <>
      <PageHeader title={title} actions={<>
        <Button variant="secondary" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
        <Button onClick={() => openTxn({ type: fixedType ?? 'expense' })}><Plus className="h-4 w-4" />Add</Button>
      </>} />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
          <Input className="col-span-2" placeholder={`${t('Search')} name, merchant, amount…`} value={q} onChange={(e) => setQ(e.target.value)} />
          {!fixedType && <Select value={type} onChange={(e) => setType(e.target.value as TxnType)} aria-label="Type"><option value="">All types</option>{TXN_TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</Select>}
          <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account"><option value="">All accounts</option>{f.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{catOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          {fixedType !== 'expense' && <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Actual & expected</option><option value="actual">Actual</option><option value="expected">Expected</option></Select>}
          {fixedType !== 'income' && <Select value={nw} onChange={(e) => setNw(e.target.value)} aria-label="Needs/Wants"><option value="">Needs & wants</option><option value="need">Needs</option><option value="want">Wants</option></Select>}
          <DateInput value={from} onChange={setFrom} /><DateInput value={to} onChange={setTo} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{rows.length} record(s) · In <b className="text-income">{formatRM(tot.income + tot.refunds)}</b> · Out <b className="text-expense">{formatRM(tot.expenses + tot.fees)}</b>{tot.expectedIncome > 0 && <> · Expected <b>{formatRM(tot.expectedIncome)}</b></>}</span>
          <span className="flex gap-3">
            {anyFilter && <button className="flex items-center gap-1 hover:underline" onClick={() => { setQ(''); if (!fixedType) setType(''); setAccount(''); setCat(''); setFrom(''); setTo(''); setStatus(''); setNw(''); }}><X className="h-3 w-3" />Clear filters</button>}
            <label className="flex items-center gap-1"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />Recently deleted</label>
          </span>
        </div>
      </Card>
      <Card>
        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.slice(0, limit).map((x) => (
              <TxnRow key={x.id} t={x} f={f} onClick={showDeleted ? undefined : () => openTxn({ edit: x })}
                action={showDeleted ? <Button variant="ghost" onClick={async () => { await restoreTransaction(x.id); toast('Restored'); }}><RotateCcw className="h-4 w-4" />Restore</Button>
                  : x.status === 'expected' ? <Button variant="ghost" className="text-income" onClick={(e) => { e.stopPropagation(); setReceive(x); }}><CheckCircle2 className="h-4 w-4" /><span className="hidden sm:inline">{x.type === 'income' ? 'Received' : 'Confirm'}</span></Button> : undefined} />
            ))}
            {rows.length > limit && <div className="pt-3 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 200)}>Load more ({rows.length - limit} remaining)</Button></div>}
          </div>
        ) : <Empty title={showDeleted ? 'No deleted transactions' : 'No transactions found'}>{anyFilter ? 'Try clearing filters.' : 'Use the Add button to record one.'}</Empty>}
      </Card>
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
