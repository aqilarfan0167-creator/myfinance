import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Upload, ClipboardPaste, ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { useReceipts, useFileUrl, useAttachment } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Loading, PageHeader } from '@/components/ui';
import { CameraCapture } from '@/components/Camera';
import { ReceiptReview } from '@/components/ReceiptReview';
import { addReceiptFiles, interruptedReceipts } from '@/db/receiptRepo';
import { enqueue, subscribe } from '@/lib/scanQueue';
import { isPdf } from '@/lib/files';
import type { Receipt, ReceiptStatus } from '@/db/types';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/cn';

export const STATUS: Record<ReceiptStatus, { label: string; tone: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'slate' }> = {
  processing: { label: 'Processing', tone: 'blue' }, review: { label: 'Needs review', tone: 'orange' }, draft: { label: 'Draft', tone: 'slate' },
  recorded: { label: 'Recorded', tone: 'green' }, duplicate: { label: 'Possible duplicate', tone: 'purple' }, failed: { label: 'Failed', tone: 'red' },
};

export default function ScannerPage() {
  const t = useT(); const receipts = useReceipts(); const { toast } = useUI();
  const [cam, setCam] = useState(false); const [sel, setSel] = useState<string | null>(null); const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<Record<string, { stage: string; pct: number }>>({});
  const [sessionIds, setSessionIds] = useState<string[]>([]); const [filter, setFilter] = useState<ReceiptStatus | 'inbox'>('inbox');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => subscribe(setProgress), []);
  useEffect(() => { interruptedReceipts().then((ids) => ids.length && enqueue(ids)); }, []);

  const add = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const { ids, errors } = await addReceiptFiles(files);
    errors.forEach((e) => toast(e, 'err'));
    if (ids.length) { setSessionIds((s) => [...ids, ...s]); enqueue(ids); toast(`${ids.length} receipt(s) added – reading on this device…`); if (ids.length === 1) setSel(ids[0]); }
  }, [toast]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); add(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}-${i}.${f.type.split('/')[1] || 'png'}`, { type: f.type })))); }
    };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  const pasteButton = async () => {
    try {
      const items = await navigator.clipboard.read(); const files: File[] = [];
      for (const it of items) for (const type of it.types) if (type.startsWith('image/')) files.push(new File([await it.getType(type)], `pasted-${Date.now()}.png`, { type }));
      files.length ? add(files) : toast('No image on the clipboard', 'err');
    } catch { toast('Clipboard access blocked – press Ctrl+V / ⌘V instead', 'err'); }
  };

  if (!receipts) return <Loading />;
  const inbox = receipts.filter((r) => r.status !== 'recorded' || sessionIds.includes(r.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = inbox.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const list = filter === 'inbox' ? inbox : inbox.filter((r) => r.status === filter);

  if (sel) return (
    <>
      <div className="mb-3 flex items-center gap-2"><Button variant="ghost" onClick={() => setSel(null)}><ArrowLeft className="h-4 w-4" />Back to scans</Button>
        {list.length > 1 && <span className="ml-auto text-xs text-slate-500">{list.findIndex((r) => r.id === sel) + 1} of {list.length}</span>}</div>
      <Card><ReceiptReview id={sel} onDone={() => { const next = list.find((r) => r.id !== sel && ['review', 'draft', 'duplicate', 'failed'].includes(r.status)); setSel(next?.id ?? null); }} onRetake={() => { setSel(null); setCam(true); }} /></Card>
      <CameraCapture open={cam} onClose={() => setCam(false)} onCapture={add} />
    </>
  );

  return (
    <>
      <PageHeader title={t('Smart Receipt Scanner')} actions={<Link to="/receipts"><Button variant="secondary">Receipt library</Button></Link>} />
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add([...e.dataTransfer.files]); }}
        className={cn('mb-4 rounded-xl border-2 border-dashed p-6 text-center transition', drag ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900')}>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setCam(true)} className="px-5 py-3 text-base"><Camera className="h-5 w-5" />Take photo</Button>
          <Button variant="secondary" onClick={() => input.current?.click()} className="px-5 py-3 text-base"><Upload className="h-5 w-5" />Upload files</Button>
          <Button variant="secondary" onClick={pasteButton} className="px-5 py-3 text-base"><ClipboardPaste className="h-5 w-5" />Paste</Button>
        </div>
        <p className="mt-3 text-sm text-slate-500">or drag & drop / paste (Ctrl+V) receipts here · JPG, PNG, WEBP, HEIC, PDF · several at once</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-income" />Text is read on this device (Tesseract.js & PDF.js). Nothing is uploaded.</p>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" className="hidden" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['inbox', 'processing', 'review', 'draft', 'duplicate', 'failed', 'recorded'] as const).map((s) => (s === 'inbox' || counts[s]) ? (
          <button key={s} onClick={() => setFilter(s)} className={cn('rounded-full border px-3 py-1 text-xs', filter === s ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300')}>
            {s === 'inbox' ? `All (${inbox.length})` : `${STATUS[s].label} (${counts[s]})`}</button>) : null)}
      </div>
      {list.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{list.map((r) => <ScanRow key={r.id} r={r} p={progress[r.id]} onOpen={() => setSel(r.id)} />)}</div>
        : <Empty title="No receipts waiting">Take a photo or upload receipts to get started. Recorded receipts are in the <Link className="underline" to="/receipts">Receipt Library</Link>.</Empty>}
      <p className="mt-4 text-xs text-slate-500">Expenses are only created after you review and press <b>Confirm & save expense</b>. Can't scan? Open any item and type the details manually.</p>
      <CameraCapture open={cam} onClose={() => setCam(false)} onCapture={add} />
    </>
  );
}

export function ReceiptThumb({ attachmentId, className = 'h-16 w-12' }: { attachmentId: string; className?: string }) {
  const { url } = useFileUrl(attachmentId, 'thumb'); const a = useAttachment(attachmentId);
  return <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-800', className)}>{url ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : a && isPdf(a.mimeType, a.fileName) ? <FileText className="h-5 w-5 text-slate-400" /> : null}</div>;
}

function ScanRow({ r, p, onOpen }: { r: Receipt; p?: { stage: string; pct: number }; onOpen: () => void }) {
  const a = useAttachment(r.attachmentId); const s = STATUS[r.status];
  return (
    <button onClick={onOpen} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
      <ReceiptThumb attachmentId={r.attachmentId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.merchant || a?.fileName || 'Receipt'}</p>
        <p className="truncate text-xs text-slate-500">{r.date ? fmtDate(r.date) : 'No date'} · {r.total != null ? formatRM(r.total) : 'No total'}</p>
        {r.status === 'processing' || p ? <div className="mt-1"><div className="h-1.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"><div className="h-full bg-transfer transition-all" style={{ width: `${p?.pct ?? 5}%` }} /></div><p className="mt-0.5 truncate text-[10px] text-slate-500">{p?.stage ?? 'waiting'}</p></div>
          : <Badge tone={s.tone}>{s.label}</Badge>}
      </div>
    </button>
  );
}
