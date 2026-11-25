import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useAttachments } from '@/hooks/useData';
import { useUI } from './UIContext';
import { Button, Modal } from './ui';
import { FileViewer } from './FileViewer';
import { attachFileToTransaction, detachFromTransaction } from '@/db/receiptRepo';
import { ValidationError } from '@/db/repo';
import { ReceiptThumb } from '@/pages/Scanner';

/** Attachments of a saved transaction. Removing one never deletes the transaction. */
export function AttachmentList({ txnId }: { txnId: string }) {
  const txn = useLiveQuery(() => db.transactions.get(txnId), [txnId]);
  const atts = useAttachments(txn?.attachmentIds ?? []) ?? [];
  const { toast, confirm } = useUI(); const input = useRef<HTMLInputElement>(null); const [view, setView] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-slate-600 dark:text-slate-400">Attachments</span>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => input.current?.click()}><Paperclip className="h-4 w-4" />{busy ? 'Adding…' : 'Attach file'}</Button></div>
      {atts.length ? <div className="flex flex-wrap gap-2">{atts.map((a) => (
        <div key={a.id} className="relative">
          <button type="button" onClick={() => setView(a.id)} title={a.fileName}><ReceiptThumb attachmentId={a.id} className="h-16 w-14" /></button>
          <button type="button" aria-label={`Remove ${a.fileName}`} className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600 dark:bg-slate-800"
            onClick={async () => { if (await confirm({ title: 'Remove attachment?', message: 'The transaction is kept. Receipts stay in the Receipt Library.', confirmText: 'Remove' })) await detachFromTransaction(txnId, a.id); }}><X className="h-3 w-3" /></button>
        </div>))}</div> : <p className="text-xs text-slate-500">No files attached.</p>}
      <input ref={input} type="file" multiple accept="image/*,.heic,.heif,application/pdf" className="hidden" onChange={async (e) => {
        const files = [...(e.target.files ?? [])]; e.target.value = ''; setBusy(true);
        for (const f of files) { try { await attachFileToTransaction(txnId, f); } catch (er) { toast(er instanceof ValidationError ? er.errors[0] : (er as Error).message, 'err'); } }
        setBusy(false);
      }} />
      <Modal open={!!view} onClose={() => setView(null)} title="Attachment" wide>{view && <FileViewer attachmentId={view} />}</Modal>
    </div>
  );
}
