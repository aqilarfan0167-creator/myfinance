import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, Pencil, RefreshCw, Trash2, ScanLine } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useFinance, useReceipts } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { DateInput } from '@/components/inputs';
import { Tabs } from '@/components/Tabs';
import { FileViewer } from '@/components/FileViewer';
import { ReceiptReview } from '@/components/ReceiptReview';
import { ReceiptThumb, STATUS } from './Scanner';
import { deleteAttachment, deleteReceipt } from '@/db/receiptRepo';
import { db } from '@/db/db';
import { enqueue } from '@/lib/scanQueue';
import { downloadBlob } from '@/lib/files';
import type { Receipt, ReceiptStatus } from '@/db/types';
import { formatRM } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/date';

export default function ReceiptsPage() {
  const t = useT(); const f = useFinance(); const receipts = useReceipts(); const { confirm, toast } = useUI();
  const [tab, setTab] = useState<'receipts' | 'files'>('receipts');
  const [q, setQ] = useState(''); const [status, setStatus] = useState<ReceiptStatus | ''>(''); const [cat, setCat] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [linked, setLinked] = useState('');
  const [view, setView] = useState<Receipt | null>(null); const [edit, setEdit] = useState<string | null>(null);
  const files = useLiveQuery(() => db.attachments.filter((a) => !a.deletedAt && a.kind !== 'receipt').toArray(), []);

  const list = useMemo(() => {
    if (!receipts || !f) return [];
    const s = q.trim().toLowerCase();
    return receipts.filter((r) => {
      const catIds = r.txnIds.map((id) => f.txns.find((x) => x.id === id)?.categoryId).filter(Boolean) as string[];
      if (r.form?.categoryId) catIds.push(r.form.categoryId);
      return (!status || r.status === status) && (!from || (r.date ?? '') >= from) && (!to || (r.date ?? '9999') <= to)
        && (!cat || catIds.includes(cat)) && (!linked || (linked === 'yes' ? r.txnIds.length > 0 : r.txnIds.length === 0))
        && (!s || [r.merchant, r.receiptNo, r.ocrText, r.form?.address, ...(r.form?.items.map((i) => i.name) ?? [])].some((v) => v?.toLowerCase().includes(s)) || (r.total != null && (r.total / 100).toFixed(2).includes(s)));
    }).sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  }, [receipts, f, q, status, cat, from, to, linked]);
  if (!receipts || !f) return <Loading />;
  const total = list.filter((r) => r.status === 'recorded').reduce((a, r) => a + (r.total ?? 0), 0);

  const download = async (attachmentId: string) => { const [a, fl] = await Promise.all([db.attachments.get(attachmentId), db.files.get(attachmentId)]); if (a && fl) downloadBlob(fl.blob, a.fileName); else toast('File not available on this device', 'err'); };
  const remove = async (r: Receipt) => {
    if (await confirm({ title: 'Delete receipt?', danger: true, confirmText: 'Delete', message: r.txnIds.length ? 'The receipt image/PDF is deleted. The linked transaction is kept – only its attachment is removed.' : 'The receipt and its file will be deleted.' })) { await deleteReceipt(r.id); toast('Receipt deleted'); setView(null); }
  };

  return (
    <>
      <PageHeader title={t('Receipt Library')} actions={<Link to="/scan"><Button><ScanLine className="h-4 w-4" />Scan receipts</Button></Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ v: 'receipts', label: `Receipts (${receipts.length})` }, { v: 'files', label: `Payslips & other files (${files?.length ?? 0})` }]} />
      {tab === 'receipts' && <>
        <Card className="mb-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
            <Input className="col-span-2" placeholder="Search merchant, receipt no., item, text…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={status} onChange={(e) => setStatus(e.target.value as ReceiptStatus)} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{f.cats.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select value={linked} onChange={(e) => setLinked(e.target.value)} aria-label="Linked"><option value="">Linked & unlinked</option><option value="yes">Linked to transaction</option><option value="no">Not linked</option></Select>
            <DateInput value={from} onChange={setFrom} /><DateInput value={to} onChange={setTo} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{list.length} receipt(s){total ? ` · recorded total ${formatRM(total)}` : ''}</p>
        </Card>
        {list.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{list.map((r) => (
          <div key={r.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button className="block w-full" onClick={() => setView(r)} aria-label={`Preview ${r.merchant || 'receipt'}`}><ReceiptThumb attachmentId={r.attachmentId} className="h-36 w-full rounded-none" /></button>
            <div className="p-2">
              <p className="truncate text-sm font-medium">{r.merchant || 'Unnamed receipt'}</p>
              <p className="truncate text-xs text-slate-500">{r.date ? fmtDate(r.date) : '—'} · {r.total != null ? formatRM(r.total) : '—'}</p>
              <div className="mt-1 flex items-center justify-between"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                <span className="flex">
                  <button aria-label="Download" className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={() => download(r.attachmentId)}><Download className="h-4 w-4" /></button>
                  <button aria-label="Edit" className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={() => setEdit(r.id)}><Pencil className="h-4 w-4" /></button>
                  <button aria-label="Delete" className="p-1 text-slate-500 hover:text-red-600" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
                </span></div>
            </div>
          </div>))}</div> : <Empty title={receipts.length ? 'No receipts match your filters' : 'No receipts yet'}>{!receipts.length && <Link to="/scan" className="underline">Scan your first receipt</Link>}</Empty>}
      </>}
      {tab === 'files' && <Card>{files?.length ? <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{files.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-2"><ReceiptThumb attachmentId={a.id} className="h-12 w-10" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{a.fileName}</p><p className="text-xs text-slate-500">{a.kind === 'payslip' ? 'Payslip' : 'Attachment'} · {(a.size / 1024).toFixed(0)} KB · {fmtDateTime(a.createdAt)}</p></div>
          <Button variant="ghost" aria-label="Download" onClick={() => download(a.id)}><Download className="h-4 w-4" /></Button>
          <Button variant="ghost" aria-label="Delete file" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Delete file?', message: 'Linked transactions and salary records are kept; only the file is removed.', danger: true, confirmText: 'Delete' })) await deleteAttachment(a.id); }}><Trash2 className="h-4 w-4" /></Button></li>))}</ul>
        : <Empty title="No other files">Files attached to transactions and payslips appear here.</Empty>}</Card>}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.merchant || 'Receipt'} wide>
        {view && <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <FileViewer attachmentId={view.attachmentId} className="h-[60vh]" />
          <div className="space-y-2 text-sm">
            <Badge tone={STATUS[view.status].tone}>{STATUS[view.status].label}</Badge>
            <p><span className="text-slate-500">Date:</span> {view.date ? fmtDate(view.date) : '—'} {view.form?.time}</p>
            <p><span className="text-slate-500">Total:</span> <b>{view.total != null ? formatRM(view.total) : '—'}</b></p>
            {view.receiptNo && <p><span className="text-slate-500">Receipt no.:</span> {view.receiptNo}</p>}
            {view.form?.address && <p className="text-xs text-slate-500">{view.form.address}</p>}
            {view.txnIds.length > 0 && <div><p className="text-slate-500">Transactions:</p>{view.txnIds.map((id) => { const tx = f.txns.find((x) => x.id === id); return <p key={id} className="text-xs">{tx && !tx.deletedAt ? `${fmtDate(tx.date)} · ${tx.name} · ${formatRM(tx.amount)}` : 'deleted transaction'}</p>; })}</div>}
            <div className="flex flex-wrap gap-1 pt-2">
              <Button variant="secondary" onClick={() => { setEdit(view.id); setView(null); }}><Eye className="h-4 w-4" />Open</Button>
              {view.status !== 'recorded' && <Button variant="secondary" onClick={() => { enqueue([view.id]); toast('Rescanning…'); }}><RefreshCw className="h-4 w-4" />Rescan</Button>}
              <Button variant="secondary" onClick={() => download(view.attachmentId)}><Download className="h-4 w-4" />Download</Button>
              <Button variant="ghost" className="text-red-600" onClick={() => remove(view)}><Trash2 className="h-4 w-4" />Delete</Button>
            </div>
          </div>
        </div>}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Receipt" wide="xl">{edit && <ReceiptReview id={edit} onDone={() => setEdit(null)} />}</Modal>
    </>
  );
}
