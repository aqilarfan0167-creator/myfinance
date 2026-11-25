import { db } from './db';
import type { Account, Attachment, AttachmentKind, Receipt, ReceiptData, ReceiptForm, Settings, Transaction } from './types';
import { blankTxn, saveTransaction, ValidationError } from './repo';
import { uid } from '@/lib/cn';
import { addDays, todayKL } from '@/lib/date';
import { applyEdits, heicToJpeg, imageSize, isHeic, isPdf, mimeFor, sha256, thumbnail, validateFile, type Edit } from '@/lib/files';
import { canvasToBlob, extractText, renderPdfPage, type Progress } from '@/lib/ocr';
import { normMerchant, parseReceipt, suggestCategory } from '@/domain/receipt';

const now = () => new Date().toISOString();
const audit = (entity: string, entityId: string, action: 'create' | 'update' | 'delete', before?: unknown, after?: unknown) =>
  db.audit.add({ id: uid(), at: now(), entity, entityId, action, before, after });

export class DuplicateError extends Error { constructor(public receipts: Receipt[], public txns: Transaction[]) { super('Possible duplicate'); } }

/* ---------------- Storing files ---------------- */
/** Stores the original file untouched, plus a display/OCR copy (HEIC→JPEG, PDF page 1) and a thumbnail. */
export async function storeFile(file: File, kind: AttachmentKind): Promise<Attachment> {
  const err = validateFile(file); if (err) throw new ValidationError([err]);
  const type = mimeFor(file); const hash = await sha256(file);
  let processed: Blob | null = null, thumb: Blob | null = null, pages: number | undefined, size: { width: number; height: number } | undefined;
  try {
    if (isPdf(type, file.name)) { const c = await renderPdfPage(file, 1, 0.6); thumb = await canvasToBlob(c); }
    else {
      if (isHeic(type, file.name)) processed = await heicToJpeg(file);
      const img = processed ?? file; size = await imageSize(img); thumb = await thumbnail(img);
    }
  } catch (e) {
    if (isHeic(type, file.name)) throw new ValidationError([`${file.name}: this HEIC image could not be converted. Export it as JPEG and try again.`]);
    if (!isPdf(type, file.name)) throw new ValidationError([`${file.name}: the image could not be read (${(e as Error).message}).`]);
  }
  const t = now();
  const a: Attachment = { id: uid(), kind, fileName: file.name || `capture-${Date.now()}.jpg`, mimeType: type, size: file.size, hash, width: size?.width, height: size?.height, pages, createdAt: t, updatedAt: t, deletedAt: null };
  await db.transaction('rw', db.attachments, db.files, db.audit, async () => {
    await db.attachments.add(a); await db.files.put({ id: a.id, blob: file, thumb, processed });
    await audit('attachment', a.id, 'create', undefined, { fileName: a.fileName, size: a.size, hash });
  });
  return a;
}

/** Adds receipt files to the library (status "processing"). Exact file duplicates are flagged immediately. */
export async function addReceiptFiles(files: File[]): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = [], errors: string[] = [];
  for (const f of files) {
    try {
      const a = await storeFile(f, 'receipt');
      const same = (await db.attachments.where('hash').equals(a.hash).toArray()).filter((x) => x.id !== a.id && !x.deletedAt).map((x) => x.id);
      const dupReceipts = same.length ? (await db.receipts.where('attachmentId').anyOf(same).toArray()).filter((r) => !r.deletedAt).map((r) => r.id) : [];
      const r: Receipt = { id: uid(), attachmentId: a.id, status: 'processing', ocrText: '', ocrConfidence: null, ocrEngine: '', textSource: null, data: null, form: null, txnIds: [],
        duplicateOf: dupReceipts, error: null, merchant: '', date: null, total: null, receiptNo: '', createdAt: now(), updatedAt: now(), deletedAt: null };
      await db.receipts.add(r); ids.push(r.id);
    } catch (e) { errors.push(e instanceof ValidationError ? e.errors[0] : `${f.name}: ${(e as Error).message}`); }
  }
  return { ids, errors };
}

/* ---------------- OCR & extraction ---------------- */
export function buildForm(d: ReceiptData | null, text: string, s: Settings, accounts: Account[]): ReceiptForm {
  const sug = suggestCategory(d?.merchant.value ?? null, text, s.merchantCategory);
  const cat = sug?.categoryId ?? null;
  // Suggest an account only when the payment method points to exactly one active account of that kind.
  const kind = d?.paymentMethod.value === 'cash' ? 'cash' : d?.paymentMethod.value === 'ewallet' ? 'ewallet' : d?.paymentMethod.value === 'credit_card' ? 'credit_card' : null;
  const matches = kind ? accounts.filter((a) => a.type === kind && a.status === 'active' && !a.deletedAt) : [];
  return {
    merchant: d?.merchant.value ?? '', address: d?.address.value ?? '', date: d?.date.value ?? '', time: d?.time.value ?? '', receiptNo: d?.receiptNo.value ?? '',
    items: d?.items ?? [], subtotal: d?.subtotal.value ?? null, discount: d?.discount.value ?? null, sst: d?.sst.value ?? null, serviceCharge: d?.serviceCharge.value ?? null, total: d?.total.value ?? null,
    paymentMethod: d?.paymentMethod.value ?? null, accountId: matches.length === 1 ? matches[0].id : null, categoryId: cat, needWant: null, remarks: '', splits: [],
  };
}

export async function getProcessingBlob(attachmentId: string): Promise<{ blob: Blob; pdf: boolean } | null> {
  const [a, f] = await Promise.all([db.attachments.get(attachmentId), db.files.get(attachmentId)]);
  if (!a || !f) return null;
  const pdf = isPdf(a.mimeType, a.fileName);
  return { blob: pdf ? f.blob : f.processed ?? f.blob, pdf };
}

export async function processReceipt(id: string, onProgress?: Progress): Promise<Receipt> {
  const r = await db.receipts.get(id); if (!r) throw new Error('Receipt not found');
  await db.receipts.update(id, { status: 'processing', error: null, updatedAt: now() });
  try {
    const src = await getProcessingBlob(r.attachmentId); if (!src) throw new Error('The original file is missing from this device.');
    const res = await extractText(src.blob, src.pdf, onProgress);
    const today = todayKL(); const data = parseReceipt(res.text, today);
    if (!res.text.trim()) data.warnings.unshift('No text could be read. Try retaking the photo with better light, or enter the details manually.');
    else if (res.confidence < 60 && res.source === 'ocr') data.warnings.unshift(`Low OCR confidence (${Math.round(res.confidence)}%) – check all fields carefully.`);
    const [settings, accounts] = await Promise.all([db.settings.get('app'), db.accounts.toArray()]);
    const form = r.form && r.status === 'draft' ? r.form : buildForm(data, res.text, settings!, accounts);
    const upd: Partial<Receipt> = { ocrText: res.text, ocrConfidence: Math.round(res.confidence), ocrEngine: res.source === 'pdf-text' ? 'PDF.js text layer' : 'Tesseract.js (eng+msa)', textSource: res.source, data, form,
      merchant: form.merchant, date: form.date || null, total: form.total, receiptNo: form.receiptNo, updatedAt: now() };
    const dup = await findReceiptDuplicates({ ...r, ...upd } as Receipt);
    upd.duplicateOf = [...new Set([...r.duplicateOf, ...dup.receipts.map((x) => x.id)])];
    upd.status = r.txnIds.length ? 'recorded' : upd.duplicateOf.length ? 'duplicate' : 'review';
    await db.receipts.update(id, upd);
  } catch (e) {
    await db.receipts.update(id, { status: 'failed', error: (e as Error).message || 'OCR failed', updatedAt: now() });
  }
  return (await db.receipts.get(id))!;
}

/** Re-runs OCR after editing the image (rotate/crop/enhance). The original file is never modified. */
export async function saveEditedImage(id: string, edit: Edit) {
  const r = await db.receipts.get(id); if (!r) return;
  const f = await db.files.get(r.attachmentId); const a = await db.attachments.get(r.attachmentId); if (!f || !a) throw new Error('File missing');
  // Edits build on the current working image; the original stays untouched (see resetEdits).
  const source = f.processed ?? (isHeic(a.mimeType, a.fileName) ? await heicToJpeg(f.blob) : f.blob);
  const processed = await applyEdits(source, edit);
  await db.files.update(r.attachmentId, { processed, thumb: await thumbnail(processed) });
}
export async function resetEdits(id: string) {
  const r = await db.receipts.get(id); if (!r) return;
  const f = await db.files.get(r.attachmentId); const a = await db.attachments.get(r.attachmentId); if (!f || !a) return;
  const processed = isHeic(a.mimeType, a.fileName) ? await heicToJpeg(f.blob) : null;
  await db.files.update(r.attachmentId, { processed, thumb: await thumbnail(processed ?? f.blob) });
}

/* ---------------- Duplicates ---------------- */
export async function findReceiptDuplicates(r: Pick<Receipt, 'id' | 'attachmentId' | 'merchant' | 'receiptNo' | 'date' | 'total' | 'txnIds'>): Promise<{ receipts: Receipt[]; txns: Transaction[] }> {
  const a = await db.attachments.get(r.attachmentId);
  const all = (await db.receipts.toArray()).filter((x) => !x.deletedAt && x.id !== r.id);
  const nm = r.merchant ? normMerchant(r.merchant) : '';
  const hashIds = a ? new Set((await db.attachments.where('hash').equals(a.hash).toArray()).filter((x) => x.id !== a.id && !x.deletedAt).map((x) => x.id)) : new Set<string>();
  const receipts = all.filter((x) => hashIds.has(x.attachmentId)
    || (!!r.receiptNo && x.receiptNo === r.receiptNo && (!nm || normMerchant(x.merchant) === nm))
    || (!!nm && normMerchant(x.merchant) === nm && !!r.date && x.date === r.date && r.total != null && x.total === r.total));
  let txns: Transaction[] = [];
  if (r.total != null && r.date) {
    txns = (await db.transactions.where('date').between(addDays(r.date, -2), addDays(r.date, 2), true, true).toArray()).filter((t) => !t.deletedAt && !r.txnIds.includes(t.id) && t.type === 'expense' && t.amount === r.total
      && (!nm || !t.merchant || normMerchant(t.merchant).includes(nm.slice(0, 8)) || nm.includes(normMerchant(t.merchant).slice(0, 8))));
  }
  return { receipts, txns };
}

/* ---------------- Saving ---------------- */
export function validateForm(f: ReceiptForm): string[] {
  const e: string[] = [];
  if (!f.merchant.trim()) e.push('Merchant is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.push('A valid date is required.');
  if (f.total == null || f.total <= 0) e.push('Total must be more than zero.');
  if (!f.accountId) e.push('Select the account you paid from.');
  if (f.splits.length) {
    const sum = f.splits.reduce((a, s) => a + s.amount, 0);
    if (f.splits.some((s) => !s.categoryId || s.amount <= 0)) e.push('Each split needs a category and an amount.');
    if (f.total != null && sum !== f.total) e.push(`Split amounts (${(sum / 100).toFixed(2)}) must equal the total (${(f.total / 100).toFixed(2)}).`);
  } else if (!f.categoryId) e.push('Choose a category.');
  return e;
}

export async function saveDraft(id: string, form: ReceiptForm) {
  const r = await db.receipts.get(id); if (!r) return;
  await db.receipts.update(id, { form, status: r.status === 'recorded' ? 'recorded' : 'draft', merchant: form.merchant, date: form.date || null, total: form.total, receiptNo: form.receiptNo, updatedAt: now() });
}

/**
 * Creates the expense (or one expense per split – the splits add up to the receipt total, so nothing is counted twice),
 * links the original receipt, and marks the receipt as recorded. All in one atomic transaction.
 */
export async function confirmReceipt(id: string, form: ReceiptForm, opts: { force?: boolean } = {}): Promise<string[]> {
  const errs = validateForm(form); if (errs.length) throw new ValidationError(errs);
  const r = await db.receipts.get(id); if (!r || r.deletedAt) throw new Error('Receipt not found');
  if (r.status === 'recorded' && r.txnIds.length) throw new ValidationError(['This receipt is already recorded. Edit its transaction instead.']);
  if (!opts.force) {
    const d = await findReceiptDuplicates({ ...r, merchant: form.merchant, receiptNo: form.receiptNo, date: form.date, total: form.total });
    const recorded = d.receipts.filter((x) => x.status === 'recorded');
    if (recorded.length || d.txns.length) throw new DuplicateError(recorded, d.txns);
  }
  return db.transaction('rw', [db.receipts, db.transactions, db.audit, db.settings], async () => {
    const parts = form.splits.length ? form.splits : [{ categoryId: form.categoryId!, amount: form.total!, needWant: form.needWant, note: '' }];
    const ids: string[] = [];
    for (const [i, p] of parts.entries()) {
      ids.push(await saveTransaction({ ...blankTxn('expense'), date: form.date, time: form.time || '12:00', name: parts.length > 1 ? `${form.merchant} (${i + 1}/${parts.length})` : form.merchant, merchant: form.merchant,
        categoryId: p.categoryId, amount: p.amount, accountId: form.accountId, paymentMethod: form.paymentMethod, needWant: p.needWant ?? form.needWant,
        remarks: [form.receiptNo && `Receipt ${form.receiptNo}`, p.note, form.remarks].filter(Boolean).join(' · '), attachmentIds: [r.attachmentId], related: [{ kind: 'receipt', id }] }));
    }
    if (ids.length > 1) for (const tid of ids) { const t = await db.transactions.get(tid); await db.transactions.update(tid, { related: [...t!.related, ...ids.filter((x) => x !== tid).map((x) => ({ kind: 'split', id: x }))] }); }
    await db.receipts.update(id, { form, status: 'recorded', txnIds: ids, merchant: form.merchant, date: form.date, total: form.total, receiptNo: form.receiptNo, updatedAt: now() });
    await audit('receipt', id, 'update', { status: r.status }, { status: 'recorded', txnIds: ids });
    return ids;
  });
}

/** Links the receipt to a transaction that already exists instead of creating a new one. */
export async function attachToTransaction(id: string, txnId: string, form?: ReceiptForm) {
  await db.transaction('rw', db.receipts, db.transactions, db.audit, async () => {
    const r = await db.receipts.get(id); const t = await db.transactions.get(txnId);
    if (!r || !t || t.deletedAt) throw new Error('Not found');
    await db.transactions.update(txnId, { attachmentIds: [...new Set([...t.attachmentIds, r.attachmentId])], related: [...t.related, { kind: 'receipt', id }], updatedAt: now() });
    await db.receipts.update(id, { status: 'recorded', txnIds: [...new Set([...r.txnIds, txnId])], ...(form ? { form, merchant: form.merchant, date: form.date || null, total: form.total, receiptNo: form.receiptNo } : {}), updatedAt: now() });
    await audit('receipt', id, 'update', { status: r.status }, { attachedTo: txnId });
  });
}

/** Deletes the receipt and its stored file. Linked transactions are KEPT (only the attachment reference is removed). */
export async function deleteReceipt(id: string) {
  await db.transaction('rw', [db.receipts, db.attachments, db.files, db.transactions, db.audit], async () => {
    const r = await db.receipts.get(id); if (!r) return;
    await db.receipts.update(id, { deletedAt: now(), updatedAt: now() });
    await removeAttachmentEverywhere(r.attachmentId);
    await audit('receipt', id, 'delete', r);
  });
}
async function removeAttachmentEverywhere(attachmentId: string) {
  const linked = await db.transactions.filter((t) => t.attachmentIds.includes(attachmentId)).toArray();
  for (const t of linked) await db.transactions.update(t.id, { attachmentIds: t.attachmentIds.filter((x) => x !== attachmentId), updatedAt: now() });
  await db.attachments.update(attachmentId, { deletedAt: now(), updatedAt: now() });
  await db.files.delete(attachmentId);
}

/* ---------------- Generic attachments (transactions, payslips) ---------------- */
export async function attachFileToTransaction(txnId: string, file: File): Promise<string> {
  const a = await storeFile(file, 'other');
  await db.transaction('rw', db.transactions, db.audit, async () => {
    const t = await db.transactions.get(txnId); if (!t) throw new Error('Transaction not found');
    await db.transactions.update(txnId, { attachmentIds: [...t.attachmentIds, a.id], updatedAt: now() });
    await audit('transaction', txnId, 'update', undefined, { attachmentAdded: a.id });
  });
  return a.id;
}
/** Removes an attachment from a transaction. The transaction stays. Receipt files stay in the library. */
export async function detachFromTransaction(txnId: string, attachmentId: string) {
  await db.transaction('rw', [db.transactions, db.attachments, db.files, db.receipts, db.audit], async () => {
    const t = await db.transactions.get(txnId); if (!t) return;
    await db.transactions.update(txnId, { attachmentIds: t.attachmentIds.filter((x) => x !== attachmentId), updatedAt: now() });
    const a = await db.attachments.get(attachmentId);
    const stillUsed = await db.transactions.filter((x) => x.id !== txnId && x.attachmentIds.includes(attachmentId)).count();
    const isReceipt = (await db.receipts.where('attachmentId').equals(attachmentId).filter((r) => !r.deletedAt).count()) > 0;
    if (a && !stillUsed && !isReceipt && a.kind !== 'payslip') { await db.attachments.update(attachmentId, { deletedAt: now() }); await db.files.delete(attachmentId); }
    await audit('transaction', txnId, 'update', undefined, { attachmentRemoved: attachmentId });
  });
}
export async function deleteAttachment(attachmentId: string) {
  await db.transaction('rw', [db.transactions, db.attachments, db.files, db.salaries, db.audit], async () => {
    await removeAttachmentEverywhere(attachmentId);
    const sal = await db.salaries.filter((s) => s.attachmentIds.includes(attachmentId)).toArray();
    for (const s of sal) await db.salaries.update(s.id, { attachmentIds: s.attachmentIds.filter((x) => x !== attachmentId) });
    await audit('attachment', attachmentId, 'delete');
  });
}

/** Receipts left "processing" when the app was closed are re-queued. */
export async function interruptedReceipts() { return (await db.receipts.where('status').equals('processing').toArray()).filter((r) => !r.deletedAt).map((r) => r.id); }

/* ---------------- Payslips ---------------- */
import { parsePayslip, type PayslipData } from '@/domain/receipt';
/** Stores the payslip (kept as an attachment) and extracts values on-device. Nothing is applied until the user confirms. */
export async function scanPayslip(file: File, onProgress?: Progress): Promise<{ attachmentId: string; data: PayslipData; text: string; confidence: number; source: string }> {
  const a = await storeFile(file, 'payslip');
  const src = await getProcessingBlob(a.id); if (!src) throw new Error('File missing');
  const res = await extractText(src.blob, src.pdf, onProgress);
  return { attachmentId: a.id, data: parsePayslip(res.text, todayKL()), text: res.text, confidence: Math.round(res.confidence), source: res.source };
}
