import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, FileText, Printer, Table } from 'lucide-react';
import { Bar, CartesianGrid, Cell as PieCell, Legend, Line, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReportInput } from '@/hooks/useReportInput';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Loading, PageHeader, Select } from '@/components/ui';
import { DateInput } from '@/components/inputs';
import { Progress } from '@/components/Progress';
import { buildReport, periodRange, shiftAnchor, type PeriodKind, type Report } from '@/domain/report';
import { reportCsv, reportPdf, reportXlsx, reportTables } from '@/lib/reportExport';
import { download, toCSV } from '@/lib/csv';
import { downloadBlob } from '@/lib/files';
import { formatRM } from '@/lib/money';
import { addDays, fmtDate, fmtDateTime, fmtMonth, todayKL } from '@/lib/date';
import { cn } from '@/lib/cn';

const rm = (c: number) => formatRM(c);
const short = (c: number) => { const v = c / 100; return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0); };
function Change({ v, goodUp, pts }: { v: number | null; goodUp: boolean; pts?: boolean }) {
  if (v == null) return <span className="text-xs text-slate-400">new</span>;
  if (Math.abs(v) < 0.0005) return <span className="text-xs text-slate-400">no change</span>;
  const good = v > 0 === goodUp;
  return <span className={cn('text-xs font-medium', good ? 'text-income' : 'text-expense')}>{v > 0 ? '▲' : '▼'} {pts ? `${Math.abs(v * 100).toFixed(1)} pts` : `${Math.abs(v * 100).toFixed(1)}%`}</span>;
}

export default function ReportsPage() {
  const t = useT(); const d = useReportInput(); const { toast } = useUI(); const today = todayKL();
  const [kind, setKind] = useState<PeriodKind>('monthly'); const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today }); const [busy, setBusy] = useState('');
  const range = periodRange(kind, anchor, custom);
  const r = useMemo(() => (d ? buildReport(d, kind, range) : null), [d, kind, range.from, range.to]); // eslint-disable-line
  if (!d || !r) return <Loading />;
  const file = `myfinance-report-${r.range.from}_${r.range.to}`;
  const run = async (label: string, fn: () => Promise<void> | void) => { setBusy(label); try { await fn(); } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'err'); } finally { setBusy(''); } };

  return (
    <div className="report">
      <div className="print:hidden"><PageHeader title={t('Reports')} subtitle={`${r.range.label} · compared with ${r.prevRange.label}`} actions={<div className="no-print flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={() => run('pdf', async () => downloadBlob(await reportPdf(r, d.accounts, d.cats), `${file}.pdf`))}><FileText className="h-4 w-4" />{busy === 'pdf' ? 'Creating…' : 'PDF'}</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run('xlsx', () => downloadBlob(new Blob([reportXlsx(r, d.accounts, d.cats)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${file}.xlsx`))}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run('csv', () => download(`${file}.csv`, reportCsv(r, d.accounts, d.cats), 'text/csv'))}><FileDown className="h-4 w-4" />CSV</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run('tx', () => { const rows = reportTables(r, d.accounts, d.cats).txns; download(`myfinance-transactions-${r.range.from}_${r.range.to}.csv`, '﻿' + toCSV(rows.slice(1).map((row) => Object.fromEntries((rows[0] as string[]).map((h, i) => { const c = row[i]; return [h, c == null ? '' : typeof c === 'object' ? (c.f === 'money' ? (c.v as number).toFixed(2) : c.v) : c]; })))), 'text/csv'); })}><Table className="h-4 w-4" />Transactions CSV</Button>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
      </div>} /></div>

      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-36" value={kind} onChange={(e) => { setKind(e.target.value as PeriodKind); setAnchor(today); }} aria-label="Report period">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom">Custom range</option></Select>
          {kind !== 'custom' ? <>
            <Button variant="secondary" aria-label="Previous period" onClick={() => setAnchor(shiftAnchor(kind, anchor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-40 text-center text-sm font-semibold">{r.range.label}</span>
            <Button variant="secondary" aria-label="Next period" onClick={() => setAnchor(shiftAnchor(kind, anchor, 1))}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" onClick={() => setAnchor(today)}>Current</Button>
          </> : <div className="grid grid-cols-2 gap-2"><DateInput value={custom.from} onChange={(v) => v && setCustom({ ...custom, from: v })} /><DateInput value={custom.to} onChange={(v) => v && setCustom({ ...custom, to: v })} /></div>}
        </div>
      </Card>
      <div className="mb-3 hidden print:block"><h1 className="text-xl font-bold">MyFinance report – {r.range.label}</h1><p className="text-xs">{fmtDate(r.range.from)} – {fmtDate(r.range.to)} · compared with {r.prevRange.label} · generated {fmtDateTime(r.generatedAt)}</p></div>
      {r.transactions.length === 0 && r.prev.income === 0 && r.prev.netExpenses === 0 ? <Empty title="No transactions in this period">Choose another period, or record some transactions.</Empty> : <ReportBody r={r} />}
      <ul className="mt-4 space-y-1 text-xs text-slate-500">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

function ReportBody({ r }: { r: Report }) {
  const nw = [{ n: 'Needs', v: r.needsWants.needs, c: '#0f766e' }, { n: 'Wants', v: r.needsWants.wants, c: '#f43f5e' }, { n: 'Unclassified', v: r.needsWants.unclassified, c: '#94a3b8' }].filter((x) => x.v > 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        {r.totals.map((t) => (
          <div key={t.key} className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className={cn('text-lg font-bold tabular-nums', t.key === 'income' && 'text-income', t.key === 'expenses' && 'text-expense', t.key === 'savings' && 'text-saving', t.key === 'cashflow' && (t.cur >= 0 ? 'text-income' : 'text-expense'))}>{t.kind === 'pct' ? `${(t.cur * 100).toFixed(1)}%` : rm(t.cur)}</p>
            <p className="flex items-center justify-between gap-1 text-xs text-slate-500"><span>prev {t.kind === 'pct' ? `${(t.prev * 100).toFixed(1)}%` : rm(t.prev)}</span><Change v={t.change} goodUp={t.goodUp} pts={t.kind === 'pct'} /></p>
          </div>))}
        <div className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Net worth</p><p className="text-lg font-bold tabular-nums text-saving">{rm(r.position.end.netWorth)}</p><p className="text-xs text-slate-500">{formatRM(r.position.end.netWorth - r.position.start.netWorth, { sign: true })} in period</p></div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0 print:block">
        <Card title="Income, expenses and net" className="break-inside-avoid lg:col-span-2">
          <div role="img" aria-label="Chart – the same figures are listed in the cards and tables on this page"><div aria-hidden="true"><ResponsiveContainer width="100%" height={240}><ComposedChart data={r.series}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="label" fontSize={10} interval="preserveStartEnd" /><YAxis tickFormatter={short} fontSize={11} width={40} /><Tooltip formatter={(v: number) => rm(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" fill="#16a34a" isAnimationActive={false} /><Bar dataKey="expenses" name="Expenses" fill="#dc2626" isAnimationActive={false} /><Line dataKey="net" name="Net" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></div>
        </Card>
        <CatTable title="Expenses by category" rows={r.expenseCats} total={r.cur.netExpenses} goodUp={false} />
        <CatTable title="Income by category" rows={r.incomeCats} total={r.cur.income} goodUp />
        <Card title="Needs vs Wants" className="break-inside-avoid">{nw.length ? <div className="flex items-center gap-4"><div role="img" aria-label="Chart – the same figures are listed in the cards and tables on this page"><div aria-hidden="true"><ResponsiveContainer width="50%" height={160}><PieChart><Pie rootTabIndex={-1} data={nw} dataKey="v" nameKey="n" outerRadius={65} isAnimationActive={false}>{nw.map((x) => <PieCell key={x.n} fill={x.c} />)}</Pie><Tooltip formatter={(v: number) => rm(v)} /></PieChart></ResponsiveContainer></div></div>
          <ul className="text-sm">{nw.map((x) => <li key={x.n} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />{x.n}: <b>{rm(x.v)}</b> ({Math.round((x.v / nw.reduce((a, y) => a + y.v, 0)) * 100)}%)</li>)}</ul></div> : <p className="text-sm text-slate-500">No spending.</p>}</Card>
        <Card title="Top merchants" className="break-inside-avoid">{r.merchants.length ? <table className="w-full text-sm"><tbody>{r.merchants.slice(0, 8).map((m) => <tr key={m.merchant} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{m.merchant}</td><td className="text-right text-xs text-slate-500">{m.count}×</td><td className="text-right tabular-nums">{rm(m.amount)}</td></tr>)}</tbody></table> : <p className="text-sm text-slate-500">No expenses.</p>}</Card>
        <Card title="Account balances" className="break-inside-avoid">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Account</th><th className="text-right">Start</th><th className="text-right">End</th><th className="text-right">Change</th></tr></thead>
            <tbody>{r.accounts.map((a) => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{a.name}{a.openedInPeriod && <span className="ml-1 text-[10px] text-slate-500">(added)</span>}</td><td className="text-right tabular-nums">{rm(a.start)}</td><td className="text-right tabular-nums">{rm(a.end)}</td><td className={cn('text-right tabular-nums', a.change >= 0 ? 'text-income' : 'text-expense')}>{formatRM(a.change, { sign: true })}</td></tr>)}</tbody></table>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span>Debt: <b>{rm(r.position.start.liabilities)} → {rm(r.position.end.liabilities)}</b></span><span>Cards: <b>{rm(r.position.end.creditDebt)}</b></span><span>Loans: <b>{rm(r.position.end.loanDebt)}</b></span></div>
        </Card>
        <Card title="Commitments" className="break-inside-avoid">{r.commitments.items.length ? <>
          <p className="mb-2 text-sm">{rm(r.commitments.paid)} paid of {rm(r.commitments.total)} · <span className={r.commitments.outstanding ? 'text-expense' : 'text-income'}>{rm(r.commitments.outstanding)} outstanding</span></p>
          <ul className="max-h-56 overflow-auto text-xs print:max-h-none">{r.commitments.items.map((c, i) => <li key={i} className="flex justify-between border-t border-slate-100 py-1 dark:border-slate-800"><span>{fmtDate(c.due)} · {c.name}</span><span>{rm(c.amount)} <Badge tone={c.status === 'paid' ? 'green' : c.status === 'overdue' ? 'red' : 'slate'}>{c.status}</Badge></span></li>)}</ul></> : <p className="text-sm text-slate-500">No commitments due in this period.</p>}</Card>
        <Card title="Savings" className="break-inside-avoid">
          <p className="text-sm">Moved to savings accounts: <b className="text-saving">{rm(r.savings.transfers)}</b> · goal contributions {rm(r.savings.contributed)}{r.savings.withdrawn ? ` · withdrawals ${rm(r.savings.withdrawn)}` : ''}</p>
          <ul className="mt-2 space-y-2">{r.savings.goals.map((g) => <li key={g.name} className="text-xs"><div className="flex justify-between"><span>{g.name}</span><span>{rm(g.saved)} / {rm(g.target)}</span></div><Progress value={g.progress} tone="purple" label={`${g.name} progress`} /></li>)}</ul>
        </Card>
        <Card title="Salary & OT" className="break-inside-avoid">{r.salary.records.length || r.salary.otEntries ? <>
          <table className="w-full text-sm"><tbody>{r.salary.records.map((s) => <tr key={s.month + s.company} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{fmtMonth(s.month)}</td><td className="text-right tabular-nums">gross {rm(s.gross)}</td><td className="text-right tabular-nums">net {rm(s.actualNet ?? s.expectedNet)}</td><td className="text-right"><Badge tone={s.status === 'received' ? 'green' : 'orange'}>{s.status}</Badge></td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-slate-500">OT worked in period: {r.salary.otEntries} entries · {r.salary.otHours} h · {rm(r.salary.otAmount)}</p></> : <p className="text-sm text-slate-500">No salary records in this period.</p>}</Card>
        <Card title="Budget performance" className="break-inside-avoid">{r.budgets.length ? r.budgets.map((b) => (
          <div key={b.month} className="mb-3"><p className="mb-1 text-xs font-semibold">{fmtMonth(b.month)} · {rm(b.spent)} of {rm(b.allocated)}</p>
            {b.lines.map((l) => <div key={l.categoryId} className="mb-1 text-xs"><div className="flex justify-between"><span>{l.name}</span><span>{rm(l.spent)} / {rm(l.allocated)}</span></div><Progress value={l.pct} tone={l.level as 'ok'} /></div>)}</div>)) : <p className="text-sm text-slate-500">No budgets set for these months.</p>}</Card>
        <Card title="Receipts" className="break-inside-avoid"><p className="text-sm">{r.receipts.recorded} receipt(s) recorded · {rm(r.receipts.recordedTotal)}{r.receipts.pending ? <> · <span className="text-warn">{r.receipts.pending} waiting for review</span></> : null}</p>
          {r.receipts.topMerchants.length > 0 && <ul className="mt-2 text-xs">{r.receipts.topMerchants.slice(0, 5).map((m) => <li key={m.merchant} className="flex justify-between"><span>{m.merchant} ({m.count})</span><span>{rm(m.total)}</span></li>)}</ul>}</Card>
      </div>
    </div>
  );
}

function CatTable({ title, rows, total, goodUp }: { title: string; rows: Report['expenseCats']; total: number; goodUp: boolean }) {
  return (
    <Card title={`${title} · ${rm(total)}`} className="break-inside-avoid">{rows.length ? <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Category</th><th className="text-right">Amount</th><th className="text-right">Share</th><th className="text-right">vs prev</th></tr></thead>
      <tbody>{rows.map((c) => <tr key={c.categoryId} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{c.name}</td><td className="text-right tabular-nums">{rm(c.amount)}</td><td className="text-right text-xs">{Math.round(c.share * 100)}%</td><td className="text-right"><Change v={c.change} goodUp={goodUp} /></td></tr>)}</tbody></table>
      : <p className="text-sm text-slate-500">Nothing recorded.</p>}</Card>
  );
}
