import { useMemo, useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { useFinance } from '@/hooks/useData';
import { useUI } from './UIContext';
import { Badge, Button, Field, Modal, Select } from './ui';
import { buildImport, FIELD_LABELS, guessMapping, parseCsv, type Field as F, type ImportOptions, type Mapping } from '@/domain/csvImport';
import { findDuplicates, importTransactions, ValidationError } from '@/db/repo';
import { snapshot } from '@/db/backup';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { txnLabel } from '@/lib/labels';

/** CSV → transactions: column mapping, preview with validation and duplicate checks, atomic import (snapshot first). */
export function CsvImport({ onClose }: { onClose: () => void }) {
  const f = useFinance(); const { toast } = useUI();
  const [rows, setRows] = useState<string[][] | null>(null); const [name, setName] = useState('');
  const [map, setMap] = useState<Mapping>({}); const [busy, setBusy] = useState(false);
  const [o, setO] = useState<Omit<ImportOptions, 'learned'>>({ dateOrder: 'dmy', defaultAccountId: null, positiveIs: 'income', skipHeader: true });
  const [dups, setDups] = useState<Set<number>>(new Set()); const [include, setInclude] = useState<Set<number>>(new Set());
  const res = useMemo(() => (rows && f ? buildImport(rows, map, { ...o, learned: f.settings.merchantCategory }, f.cats, f.accounts) : []), [rows, map, o, f]);
  const valid = res.filter((r) => r.txn);

  async function load(file: File) {
    if (file.size > 10 * 1048576) return toast('CSV larger than 10 MB', 'err');
    const r = parseCsv(await file.text()); if (r.length < 2) return toast('The file has no data rows', 'err');
    setRows(r); setName(file.name); setMap(guessMapping(r[0])); setDups(new Set()); setInclude(new Set());
  }
  async function check() {
    setBusy(true); const d = new Set<number>(); const ids = new Set((f?.txns ?? []).filter((t) => !t.deletedAt).map((t) => t.id)); const seen = new Set<string>();
    for (const [i, r] of res.entries()) {
      if (!r.txn) continue;
      const k = `${r.txn.date}|${r.txn.amount}|${r.txn.type}|${r.txn.name.toLowerCase()}`;
      if ((r.existingId && ids.has(r.existingId)) || seen.has(k) || (await findDuplicates(r.txn)).length) d.add(i);
      seen.add(k);
    }
    setDups(d); setInclude(new Set(res.map((_, i) => i).filter((i) => res[i].txn && !d.has(i)))); setBusy(false);
  }
  async function run() {
    const items = res.filter((_, i) => include.has(i)).map((r) => r.txn!);
    if (!items.length) return toast('Nothing selected to import', 'err');
    setBusy(true);
    try { await snapshot(`Before CSV import (${name})`); const n = await importTransactions(items, `CSV ${name}`); toast(`${n} transaction(s) imported`); onClose(); }
    catch (e) { toast(e instanceof ValidationError ? e.errors[0] : (e as Error).message, 'err'); } finally { setBusy(false); }
  }
  if (!f) return null;
  const headers = rows?.[0] ?? []; const checked = dups.size > 0 || include.size > 0;
  return (
    <Modal open onClose={onClose} title="Import transactions from CSV" wide="xl">
      {!rows ? <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-10 text-sm text-slate-600 dark:border-slate-700">
        <Upload className="h-6 w-6" />Choose a CSV file (bank statement export, spreadsheet, or a MyFinance transactions export)
        <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) load(x); }} />
      </label> : <>
        <p className="mb-3 text-sm">{name} · {rows.length - (o.skipHeader ? 1 : 0)} row(s)</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Date format"><Select value={o.dateOrder} onChange={(e) => setO({ ...o, dateOrder: e.target.value as ImportOptions['dateOrder'] })}><option value="dmy">DD/MM/YYYY</option><option value="ymd">YYYY-MM-DD</option><option value="mdy">MM/DD/YYYY</option></Select></Field>
          <Field label="Account (if no column)"><Select value={o.defaultAccountId ?? ''} onChange={(e) => setO({ ...o, defaultAccountId: e.target.value || null })}><option value="">—</option>{f.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Positive amounts are"><Select value={o.positiveIs} onChange={(e) => setO({ ...o, positiveIs: e.target.value as 'income' | 'expense' })}><option value="income">Money in (income)</option><option value="expense">Money out (expenses)</option></Select></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={o.skipHeader} onChange={(e) => setO({ ...o, skipHeader: e.target.checked })} />First row is a header</label>
        </div>
        <details className="mt-3" open={!map.date || (map.amount == null && map.debit == null && map.credit == null)}><summary className="cursor-pointer text-sm font-medium">Column mapping</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{(Object.keys(FIELD_LABELS) as F[]).map((k) => (
            <Field key={k} label={FIELD_LABELS[k]}><Select value={map[k] ?? ''} onChange={(e) => setMap({ ...map, [k]: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">—</option>{headers.map((h, i) => <option key={i} value={i}>{o.skipHeader ? h || `Column ${i + 1}` : `Column ${i + 1} (${h})`}</option>)}</Select></Field>))}</div></details>
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr className="text-left"><th className="p-1.5">{checked && <input type="checkbox" aria-label="Select all" checked={include.size === valid.length - [...dups].length && include.size > 0} onChange={(e) => setInclude(new Set(e.target.checked ? res.map((_, i) => i).filter((i) => res[i].txn && !dups.has(i)) : []))} />}</th><th>Line</th><th>Date</th><th>Type</th><th>Name</th><th>Category</th><th className="text-right">Amount</th><th>Account</th><th>Status</th></tr></thead>
            <tbody>{res.slice(0, 500).map((r, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              <td className="p-1.5">{checked && r.txn && <input type="checkbox" aria-label={`Import line ${r.line}`} checked={include.has(i)} onChange={(e) => { const s = new Set(include); e.target.checked ? s.add(i) : s.delete(i); setInclude(s); }} />}</td>
              <td>{r.line}</td><td>{r.txn ? fmtDate(r.txn.date) : ''}</td><td>{r.txn ? txnLabel(r.txn.type) : ''}</td><td className="max-w-48 truncate">{r.txn?.name}</td><td>{f.catMap.get(r.txn?.categoryId ?? '')?.name ?? ''}</td>
              <td className="text-right tabular-nums">{r.txn ? formatRM(r.txn.amount) : ''}</td><td>{f.accMap.get(r.txn?.accountId ?? '')?.name}</td>
              <td>{r.errors.length ? <span className="text-red-600">{r.errors.join('; ')}</span> : dups.has(i) ? <Badge tone="orange">possible duplicate</Badge> : r.warnings.length ? <span className="text-warn" title={r.warnings.join('\n')}><AlertTriangle className="inline h-3 w-3" /> {r.warnings[0]}</span> : <Badge tone="green">ok</Badge>}</td></tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">{valid.length} valid · {res.length - valid.length} with errors (skipped){checked && ` · ${dups.size} possible duplicate(s) unticked`}. A snapshot is saved before importing, and the import is all-or-nothing.</p>
        <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!checked ? <Button disabled={busy || !valid.length} onClick={check}>{busy ? 'Checking…' : 'Check for duplicates'}</Button> : <Button disabled={busy || !include.size} onClick={run}>{busy ? 'Importing…' : `Import ${include.size} transaction(s)`}</Button>}</div>
      </>}
    </Modal>
  );
}
