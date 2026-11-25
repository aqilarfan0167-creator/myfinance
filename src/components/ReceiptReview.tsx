import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Copy, Crop, Link2, RotateCcw, RotateCw, ScanLine, Save, Sparkles, Trash2, Wand2, X, Plus } from 'lucide-react';
import { useFinance, useReceipt, useAttachment, type Finance } from '@/hooks/useData';
import { useUI } from './UIContext';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from './ui';
import { DateInput, MoneyInput } from './inputs';
import { FileViewer } from './FileViewer';
import { attachToTransaction, confirmReceipt, deleteReceipt, DuplicateError, findReceiptDuplicates, resetEdits, saveDraft, saveEditedImage, validateForm } from '@/db/receiptRepo';
import { ValidationError } from '@/db/repo';
import { db } from '@/db/db';
import type { Field as F, ReceiptForm, Transaction } from '@/db/types';
import { isLiability } from '@/db/types';
import { enqueue } from '@/lib/scanQueue';
import { isPdf, NO_EDIT, type Edit } from '@/lib/files';
import { PAYMENT_METHODS } from '@/lib/labels';
import { formatRM } from '@/lib/money';
import { addDays, fmtDate } from '@/lib/date';
import { cn } from '@/lib/cn';

const rm = (c: number) => formatRM(c);
type Key = 'merchant' | 'address' | 'date' | 'time' | 'receiptNo' | 'subtotal' | 'discount' | 'sst' | 'serviceCharge' | 'total' | 'paymentMethod';

export function ReceiptReview({ id, onDone, onRetake }: { id: string; onDone: () => void; onRetake?: () => void }) {
  const f = useFinance(); const r = useReceipt(id); const att = useAttachment(r?.attachmentId); const { toast, confirm, openTxn } = useUI();
  const [form, setForm] = useState<ReceiptForm | null>(null); const [touched, setTouched] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]); const [dup, setDup] = useState<{ receipts: { id: string; merchant: string; date: string | null; total: number | null; status: string }[]; txns: Transaction[] } | null>(null);
  const [edit, setEdit] = useState<Edit>(NO_EDIT); const [cropMode, setCropMode] = useState(false); const [attachOpen, setAttachOpen] = useState(false); const [busy, setBusy] = useState(false);

  useEffect(() => { if (r?.form && (!form || r.status === 'recorded')) setForm(r.form); }, [r?.form, r?.status]); // eslint-disable-line
  useEffect(() => { setForm(r?.form ?? null); setTouched(new Set()); setErrors([]); setDup(null); setEdit(NO_EDIT); }, [id]); // eslint-disable-line
  const d = r?.data;
  const set = <K extends keyof ReceiptForm>(k: K, v: ReceiptForm[K]) => { setForm((p) => (p ? { ...p, [k]: v } : p)); setTouched((t) => new Set(t).add(k)); };
  const flag = (k: Key): { cls: string; note: string | null } => {
    if (!d || touched.has(k)) return { cls: '', note: null };
    const fld = d[k] as F<unknown>; const missing = form ? (form[k as keyof ReceiptForm] === '' || form[k as keyof ReceiptForm] == null) : true;
    if (missing && ['merchant', 'date', 'total'].includes(k)) return { cls: 'border-red-400 ring-1 ring-red-300', note: 'Missing – please enter' };
    if (fld?.confidence === 'low') return { cls: 'border-orange-400 ring-1 ring-orange-300', note: 'Uncertain – please check' };
    if (fld?.confidence === 'medium') return { cls: 'border-amber-300', note: 'Check' };
    return { cls: '', note: null };
  };
  const recorded = r?.status === 'recorded';
  const pdf = att ? isPdf(att.mimeType, att.fileName) : false;
  const itemsSum = useMemo(() => form?.items.reduce((a, i) => a + (i.amount ?? 0), 0) ?? 0, [form?.items]);
  const splitSum = form?.splits.reduce((a, s) => a + s.amount, 0) ?? 0;

  if (!f || !r) return <p className="p-4 text-sm text-slate-500">Loading…</p>;
  const processing = r.status === 'processing';

  async function doConfirm(force = false) {
    if (!form) return; setErrors([]); setBusy(true);
    try { await confirmReceipt(id, form, { force }); toast('Expense saved and receipt linked'); onDone(); }
    catch (e) {
      if (e instanceof DuplicateError) setDup({ receipts: e.receipts, txns: e.txns });
      else setErrors(e instanceof ValidationError ? e.errors : [(e as Error).message]);
    } finally { setBusy(false); }
  }
  async function applyEditAndRescan() { setBusy(true); try { await saveEditedImage(id, edit); enqueue([id]); setEdit(NO_EDIT); setCropMode(false); toast('Image updated – rescanning'); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); } }
  async function cancel() {
    if (recorded) return onDone();
    if (await confirm({ title: 'Discard this receipt?', message: 'The scan and its file will be deleted. Nothing has been recorded.', danger: true, confirmText: 'Discard' })) { await deleteReceipt(id); onDone(); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Original */}
      <div className="min-w-0">
        {cropMode && att && !pdf ? <CropBox attachmentId={att.id} edit={edit} onChange={setEdit} /> : <FileViewer attachmentId={r.attachmentId} className="h-[45vh] lg:h-[62vh]" />}
        {!pdf && !recorded && <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" aria-label="Rotate left" onClick={() => setEdit((e) => ({ ...e, rotate: (((e.rotate + 270) % 360) as Edit['rotate']), crop: null }))}><RotateCcw className="h-4 w-4" /></Button>
          <Button variant="ghost" aria-label="Rotate right" onClick={() => setEdit((e) => ({ ...e, rotate: (((e.rotate + 90) % 360) as Edit['rotate']), crop: null }))}><RotateCw className="h-4 w-4" /></Button>
          <Button variant={cropMode ? 'secondary' : 'ghost'} onClick={() => setCropMode(!cropMode)}><Crop className="h-4 w-4" />Crop</Button>
          <Button variant={edit.enhance ? 'secondary' : 'ghost'} onClick={() => setEdit((e) => ({ ...e, enhance: !e.enhance }))}><Wand2 className="h-4 w-4" />Enhance</Button>
          {(edit.rotate || edit.crop || edit.enhance) ? <Button onClick={applyEditAndRescan} disabled={busy}><ScanLine className="h-4 w-4" />Apply & rescan</Button> : null}
          {edit.rotate ? <span className="self-center text-xs text-slate-500">rotation {edit.rotate}° (applied on rescan)</span> : null}
          <EditedBadge attachmentId={r.attachmentId} onReset={async () => { await resetEdits(id); enqueue([id]); toast('Back to the original image – rescanning'); }} />
        </div>}
        <p className="mt-2 text-xs text-slate-500">{att?.fileName} · {r.ocrEngine || 'not scanned yet'}{r.ocrConfidence != null && r.textSource === 'ocr' ? ` · OCR confidence ${r.ocrConfidence}%` : ''}. The original file is kept unchanged.</p>
        {r.ocrText && <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Recognised text</summary><pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 dark:bg-slate-800">{r.ocrText}</pre></details>}
      </div>

      {/* Extracted data */}
      <div className="min-w-0">
        {processing && <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />Reading receipt on this device…</div>}
        {r.status === 'failed' && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">Scanning failed: {r.error}. You can rescan, retake, or enter the details manually below.</div>}
        {recorded && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200"><CheckCircle2 className="mr-1 inline h-4 w-4" />Recorded. Linked transaction(s):
          <ul className="mt-1">{r.txnIds.map((tid) => { const t = f.txns.find((x) => x.id === tid); return <li key={tid}>{t ? <button className="underline" onClick={() => openTxn({ edit: t })}>{fmtDate(t.date)} · {t.name} · {rm(t.amount)}</button> : 'deleted transaction'}</li>; })}</ul></div>}
        {r.status === 'duplicate' && <div className="mb-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          <p className="font-medium"><Copy className="mr-1 inline h-4 w-4" />Possible duplicate of {r.duplicateOf.length} receipt(s) already in your library.</p>
          <div className="mt-2 flex gap-2"><Button variant="secondary" onClick={async () => { await db.receipts.update(id, { status: 'review', duplicateOf: [] }); }}>Not a duplicate</Button><Button variant="ghost" className="text-red-600" onClick={async () => { await deleteReceipt(id); onDone(); }}>Delete this copy</Button></div></div>}
        {d?.warnings.length ? <ul className="mb-3 space-y-1 text-xs text-warn">{d.warnings.map((w) => <li key={w} className="flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</li>)}</ul> : null}

        {form ? <fieldset disabled={recorded || processing} className="grid gap-3 sm:grid-cols-2">
          <FField label="Merchant" fl={flag('merchant')} className="sm:col-span-2"><Input className={flag('merchant').cls} value={form.merchant} onChange={(e) => set('merchant', e.target.value)} maxLength={120} /></FField>
          <FField label="Address" fl={flag('address')} className="sm:col-span-2"><Input className={flag('address').cls} value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={250} /></FField>
          <FField label="Date" fl={flag('date')}><div className={cn('rounded-lg', flag('date').cls)}><DateInput value={form.date} onChange={(v) => set('date', v)} /></div></FField>
          <div className="grid grid-cols-2 gap-2">
            <FField label="Time" fl={flag('time')}><Input type="time" className={flag('time').cls} value={form.time} onChange={(e) => set('time', e.target.value)} /></FField>
            <FField label="Receipt / invoice no." fl={flag('receiptNo')}><Input className={flag('receiptNo').cls} value={form.receiptNo} onChange={(e) => set('receiptNo', e.target.value)} maxLength={40} /></FField>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-slate-600 dark:text-slate-400">Items {form.items.length > 0 && <span className="font-normal">({rm(itemsSum)})</span>}</span>
              <button type="button" className="text-xs text-teal-700 hover:underline dark:text-teal-400" onClick={() => set('items', [...form.items, { name: '', qty: null, unitPrice: null, amount: null }])}>+ Add item</button></div>
            {form.items.length ? <div className="max-h-56 space-y-1 overflow-y-auto">{form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_3.5rem_6.5rem_auto] gap-1">
                <Input value={it.name} aria-label="Item name" onChange={(e) => set('items', form.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input type="number" min={0} step="any" aria-label="Quantity" placeholder="Qty" value={it.qty ?? ''} onChange={(e) => set('items', form.items.map((x, j) => (j === i ? { ...x, qty: e.target.value ? Number(e.target.value) : null } : x)))} />
                <MoneyInput value={it.amount} onChange={(c) => set('items', form.items.map((x, j) => (j === i ? { ...x, amount: c } : x)))} />
                <button type="button" aria-label="Remove item" className="px-1 text-slate-400 hover:text-red-600" onClick={() => set('items', form.items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
              </div>))}</div> : <p className="text-xs text-slate-500">No line items detected (optional).</p>}
          </div>

          <FField label="Subtotal" fl={flag('subtotal')}><MoneyInput value={form.subtotal} onChange={(c) => set('subtotal', c)} /></FField>
          <FField label="Discount" fl={flag('discount')}><MoneyInput value={form.discount} onChange={(c) => set('discount', c)} /></FField>
          <FField label="SST / tax" fl={flag('sst')}><MoneyInput value={form.sst} onChange={(c) => set('sst', c)} /></FField>
          <FField label="Service charge" fl={flag('serviceCharge')}><MoneyInput value={form.serviceCharge} onChange={(c) => set('serviceCharge', c)} /></FField>
          <FField label="Total (MYR)" fl={flag('total')}><div className={cn('rounded-lg', flag('total').cls)}><MoneyInput value={form.total} onChange={(c) => set('total', c)} /></div></FField>
          <FField label="Payment method" fl={flag('paymentMethod')}><Select className={flag('paymentMethod').cls} value={form.paymentMethod ?? ''} onChange={(e) => set('paymentMethod', (e.target.value || null) as ReceiptForm['paymentMethod'])}><option value="">—</option>{PAYMENT_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</Select></FField>
          <Field label="Paid from account *" error={!form.accountId ? 'Required – choose the account or card used' : undefined} hint={form.accountId && r.form?.accountId === form.accountId && !touched.has('accountId') && r.status !== 'recorded' ? <span className="text-warn">Suggested from the payment method – check</span> : undefined}>
            <Select className={!form.accountId ? 'border-red-400' : ''} value={form.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}><option value="">— Select account —</option>{f.accounts.filter((a) => a.status === 'active' && a.type !== 'loan').map((a) => <option key={a.id} value={a.id}>{a.name}{isLiability(a.type) ? ' (card)' : ''}</option>)}</Select></Field>
          <Field label="Needs / Wants"><Select value={form.needWant ?? ''} onChange={(e) => set('needWant', (e.target.value || null) as ReceiptForm['needWant'])}><option value="">Unclassified</option><option value="need">Need</option><option value="want">Want</option></Select></Field>

          {!form.splits.length ? <Field label="Category" className="sm:col-span-2" hint={r.form?.categoryId && !touched.has('categoryId') && form.categoryId ? (f.settings.merchantCategory[form.merchant.trim().toLowerCase()] ? 'Remembered from your previous choice for this merchant' : 'Suggested from the receipt – check it') : undefined}>
            <div className="flex gap-2"><Select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}><option value="">— Select category —</option>{f.cats.filter((c) => c.kind === 'expense' && !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Button type="button" variant="secondary" onClick={() => set('splits', [{ categoryId: form.categoryId ?? '', amount: form.total ?? 0, needWant: form.needWant, note: '' }, { categoryId: '', amount: 0, needWant: null, note: '' }])}>Split</Button></div></Field>
            : <div className="sm:col-span-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Split across categories</span><span className={splitSum === form.total ? 'text-income' : 'text-expense'}>{rm(splitSum)} of {rm(form.total ?? 0)}{splitSum !== form.total && ` (${formatRM((form.total ?? 0) - splitSum, { sign: true })} left)`}</span></div>
              {form.splits.map((s, i) => (
                <div key={i} className="mb-1 grid grid-cols-[1fr_7rem_auto] gap-1">
                  <Select value={s.categoryId} aria-label="Split category" onChange={(e) => set('splits', form.splits.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}><option value="">Category…</option>{f.cats.filter((c) => c.kind === 'expense' && !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                  <MoneyInput value={s.amount || null} onChange={(c) => set('splits', form.splits.map((x, j) => (j === i ? { ...x, amount: c ?? 0 } : x)))} />
                  <button type="button" aria-label="Remove split" className="px-1 text-slate-400 hover:text-red-600" onClick={() => set('splits', form.splits.length <= 2 ? [] : form.splits.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </div>))}
              <button type="button" className="text-xs text-teal-700 hover:underline dark:text-teal-400" onClick={() => set('splits', [...form.splits, { categoryId: '', amount: Math.max(0, (form.total ?? 0) - splitSum), needWant: null, note: '' }])}><Plus className="inline h-3 w-3" />Add split</button>
              <p className="mt-1 text-xs text-slate-500">One expense per category is created; together they equal the receipt total (not counted twice).</p>
            </div>}
          <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={500} /></Field>
        </fieldset> : !processing && <p className="text-sm text-slate-500">No data yet.</p>}

        {errors.length > 0 && <ul className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {dup && <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          <p className="font-medium"><AlertTriangle className="mr-1 inline h-4 w-4" />This may already be recorded:</p>
          <ul className="mt-1 text-xs">{dup.receipts.map((x) => <li key={x.id}>Receipt · {x.merchant} · {x.date ? fmtDate(x.date) : '—'} · {x.total != null ? rm(x.total) : '—'}</li>)}
            {dup.txns.map((t) => <li key={t.id} className="flex items-center justify-between gap-2">Transaction · {fmtDate(t.date)} · {t.name} · {rm(t.amount)} <Button variant="secondary" onClick={async () => { await attachToTransaction(id, t.id, form!); toast('Receipt attached to existing transaction'); onDone(); }}><Link2 className="h-3.5 w-3.5" />Attach to this</Button></li>)}</ul>
          <div className="mt-2 flex gap-2"><Button variant="secondary" onClick={() => setDup(null)}>Review</Button><Button onClick={() => doConfirm(true)}>Save as new anyway</Button></div></div>}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {!recorded && <>
            <Button onClick={() => doConfirm()} disabled={busy || processing || !form}><CheckCircle2 className="h-4 w-4" />Confirm & save expense</Button>
            <Button variant="secondary" disabled={!form || processing} onClick={async () => { await saveDraft(id, form!); toast('Draft saved'); }}><Save className="h-4 w-4" />Save draft</Button>
            <Button variant="secondary" disabled={!form || processing} onClick={() => setAttachOpen(true)}><Link2 className="h-4 w-4" />Attach to existing</Button>
            <Button variant="ghost" disabled={processing} onClick={() => enqueue([id])}><Sparkles className="h-4 w-4" />Rescan</Button>
            {onRetake && <Button variant="ghost" disabled={processing} onClick={async () => { await deleteReceipt(id); onRetake(); }}><RotateCcw className="h-4 w-4" />Retake</Button>}
          </>}
          <Button variant="ghost" className={recorded ? '' : 'text-red-600'} onClick={cancel}>{recorded ? 'Close' : <><Trash2 className="h-4 w-4" />Cancel</>}</Button>
        </div>
        {!recorded && form && validateForm(form).length > 0 && <p className="mt-2 text-xs text-slate-500">Before saving: {validateForm(form).join(' ')}</p>}
      </div>
      {attachOpen && form && <AttachModal f={f} receiptId={id} form={form} onClose={() => setAttachOpen(false)} onDone={onDone} />}
    </div>
  );
}

function FField({ label, fl, children, className }: { label: string; fl: { cls: string; note: string | null }; children: React.ReactNode; className?: string }) {
  return <Field label={label} className={className} hint={fl.note ? <span className={fl.note.startsWith('Missing') ? 'text-red-600' : 'text-warn'}>{fl.note}</span> : undefined}>{children}</Field>;
}

function AttachModal({ f, receiptId, form, onClose, onDone }: { f: Finance; receiptId: string; form: ReceiptForm; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI(); const [q, setQ] = useState('');
  const [suggested, setSuggested] = useState<Transaction[]>([]);
  useEffect(() => { (async () => { const r = await db.receipts.get(receiptId); if (r) setSuggested((await findReceiptDuplicates({ ...r, merchant: form.merchant, date: form.date, total: form.total, receiptNo: form.receiptNo })).txns); })(); }, [receiptId, form]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return f.txns.filter((t) => !t.deletedAt && t.type === 'expense' && t.status === 'actual' && (s ? [t.name, t.merchant].some((x) => x.toLowerCase().includes(s)) || (t.amount / 100).toFixed(2).includes(s)
      : form.total != null && Math.abs(t.amount - form.total) <= Math.max(100, form.total * 0.1) && (!form.date || (t.date >= addDays(form.date, -7) && t.date <= addDays(form.date, 7)))))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [f.txns, q, form]);
  const ids = new Set(suggested.map((t) => t.id));
  return (
    <Modal open onClose={onClose} title="Attach receipt to an existing transaction">
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Use this if you already recorded the expense. No new transaction is created.</p>
      <Input placeholder="Search name, merchant or amount…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {[...suggested.filter((t) => !list.includes(t)), ...list].map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate">{ids.has(t.id) && <Badge tone="green">match</Badge>} {fmtDate(t.date)} · {t.name} · {f.accMap.get(t.accountId ?? '')?.name}</span>
            <span className="flex items-center gap-2"><b className="tabular-nums">{rm(t.amount)}</b><Button variant="secondary" onClick={async () => { await attachToTransaction(receiptId, t.id, form); toast('Receipt attached'); onClose(); onDone(); }}>Attach</Button></span></li>))}
        {!list.length && !suggested.length && <li className="py-4 text-center text-sm text-slate-500">No similar expenses within 7 days. Try searching.</li>}
      </ul>
      <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}

/** Drag a rectangle over the (rotated) image to crop. Values are stored as fractions. */
function CropBox({ attachmentId, edit, onChange }: { attachmentId: string; edit: Edit; onChange: (e: Edit) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { let u: string | null = null; (async () => { const fl = await db.files.get(attachmentId); if (!fl) return; const { applyEdits } = await import('@/lib/files'); const b = await applyEdits(fl.processed ?? fl.blob, { ...edit, crop: null, enhance: false }, 1400); u = URL.createObjectURL(b); setUrl(u); })(); return () => { if (u) URL.revokeObjectURL(u); }; }, [attachmentId, edit.rotate]); // eslint-disable-line
  const pos = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const c = edit.crop;
  return (
    <div className="h-[45vh] overflow-auto rounded-lg bg-slate-100 p-2 lg:h-[62vh] dark:bg-slate-800">
      <p className="mb-1 text-xs text-slate-500">Drag over the receipt to select the area to keep.</p>
      {url && <div className="relative inline-block touch-none select-none" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setStart(pos(e)); }}
        onPointerMove={(e) => { if (!start) return; const p = pos(e); onChange({ ...edit, crop: { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) } }); }}
        onPointerUp={() => { setStart(null); if (edit.crop && (edit.crop.w < 0.05 || edit.crop.h < 0.05)) onChange({ ...edit, crop: null }); }}>
        <img src={url} alt="Crop preview" className="max-h-[56vh] max-w-full" draggable={false} />
        {c && <div className="pointer-events-none absolute border-2 border-teal-500 bg-teal-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }} />}
      </div>}
    </div>
  );
}

function EditedBadge({ attachmentId, onReset }: { attachmentId: string; onReset: () => void }) {
  const att = useAttachment(attachmentId);
  const hasProcessed = useLiveQuery(() => db.files.get(attachmentId).then((f) => !!f?.processed), [attachmentId]);
  const edited = !!hasProcessed && !(att && /hei[cf]/i.test(att.mimeType + att.fileName));
  return edited ? <Button variant="ghost" onClick={onReset}>Reset to original</Button> : null;
}
