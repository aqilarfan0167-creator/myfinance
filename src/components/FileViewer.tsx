import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { useAttachment, useFileUrl } from '@/hooks/useData';
import { Button } from './ui';
import { downloadBlob, isPdf } from '@/lib/files';
import { renderPdfPage, openPdf } from '@/lib/ocr';

/** Shows the original document: images with zoom, PDFs rendered page by page with PDF.js. */
export function FileViewer({ attachmentId, showProcessed = true, className = 'h-[60vh]' }: { attachmentId: string; showProcessed?: boolean; className?: string }) {
  const a = useAttachment(attachmentId);
  const { url, file } = useFileUrl(attachmentId, showProcessed ? 'display' : 'original');
  const [zoom, setZoom] = useState(1); const [page, setPage] = useState(1); const [pages, setPages] = useState(1);
  const ref = useRef<HTMLDivElement>(null); const [err, setErr] = useState('');
  const pdf = a ? isPdf(a.mimeType, a.fileName) : false;
  useEffect(() => {
    if (!pdf || !file) return; let cancel = false; setErr('');
    (async () => {
      try {
        const doc = await openPdf(file.blob); setPages(doc.numPages); await doc.destroy();
        const c = await renderPdfPage(file.blob, page, 1.5 * zoom); if (cancel || !ref.current) return;
        c.className = 'mx-auto max-w-none shadow'; ref.current.replaceChildren(c);
      } catch (e) { if (!cancel) setErr((e as Error).message); }
    })();
    return () => { cancel = true; };
  }, [pdf, file, page, zoom]);
  if (a === undefined) return <div className={`flex items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500 dark:bg-slate-800 ${className}`}>Loading…</div>;
  if (!a || (!file && a)) return <div className={`flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm text-slate-500 dark:bg-slate-800 ${className}`}><FileWarning className="h-6 w-6" />File not available on this device{a?.deletedAt ? ' (deleted)' : ' – restore it from a full (ZIP) backup'}.</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className={`overflow-auto rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`}>
        {pdf ? (err ? <p className="p-4 text-sm text-red-600">Could not render PDF: {err}</p> : <div ref={ref} className="p-2" />)
          : url && <img src={url} alt={a.fileName} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} className="mx-auto block" />}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
        <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
        {pdf && pages > 1 && <><Button variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs">Page {page}/{pages}</span><Button variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></>}
        <Button variant="ghost" className="ml-auto" onClick={() => file && downloadBlob(file.blob, a.fileName)}><Download className="h-4 w-4" />Original</Button>
      </div>
    </div>
  );
}
