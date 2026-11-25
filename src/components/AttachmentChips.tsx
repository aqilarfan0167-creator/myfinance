import { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useAttachments } from '@/hooks/useData';
import { Modal } from './ui';
import { FileViewer } from './FileViewer';

/** Compact list of attached files (e.g. payslips) with view/unlink. Unlinking keeps the file in the library. */
export function AttachmentChips({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const atts = useAttachments(ids) ?? []; const [view, setView] = useState<string | null>(null);
  if (!atts.length) return null;
  return (
    <>
      {atts.map((a) => <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
        <button type="button" className="flex items-center gap-1 hover:underline" onClick={() => setView(a.id)}><Paperclip className="h-3 w-3" />{a.fileName}</button>
        {onRemove && <button type="button" aria-label={`Unlink ${a.fileName}`} onClick={() => onRemove(a.id)}><X className="h-3 w-3" /></button>}</span>)}
      <Modal open={!!view} onClose={() => setView(null)} title="Attachment" wide>{view && <FileViewer attachmentId={view} />}</Modal>
    </>
  );
}
