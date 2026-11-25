/**
 * On-device OCR. Tesseract.js (English + Bahasa Melayu) and PDF.js are self-hosted under /ocr and loaded on demand –
 * no document ever leaves the device.
 */
import type { Worker } from 'tesseract.js';

export type Progress = (p: { stage: string; pct: number }) => void;
let workerP: Promise<Worker> | null = null; let idle: ReturnType<typeof setTimeout> | undefined; let listener: Progress | null = null;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

async function getWorker(): Promise<Worker> {
  clearTimeout(idle);
  if (!workerP) workerP = (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker(['eng', 'msa'], 1, {
      workerPath: `${base}/ocr/worker.min.js`, corePath: `${base}/ocr/core`, langPath: `${base}/ocr/lang`, gzip: true,
      logger: (m) => listener?.({ stage: m.status, pct: Math.round((m.progress ?? 0) * 100) }),
    });
  })().catch((e) => { workerP = null; throw e; });
  return workerP;
}
function scheduleIdle() { clearTimeout(idle); idle = setTimeout(async () => { const w = workerP; workerP = null; (await w)?.terminate(); }, 120000); }

export async function recognize(img: Blob | HTMLCanvasElement, onProgress?: Progress): Promise<{ text: string; confidence: number }> {
  const w = await getWorker(); listener = onProgress ?? null;
  try { const { data } = await w.recognize(img); return { text: data.text, confidence: data.confidence }; }
  finally { listener = null; scheduleIdle(); }
}

/* ---------------- PDF ---------------- */
async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}
export async function openPdf(blob: Blob) { const lib = await pdfjs(); return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise; }

/** Embedded text, rebuilt into lines by y-position. */
export async function pdfText(blob: Blob, maxPages = 5): Promise<{ text: string; pages: number }> {
  const doc = await openPdf(blob); const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3; const r = rows.get(y) ?? []; r.push({ x: it.transform[4], s: it.str }); rows.set(y, r);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((t) => t.s).join('  ')));
  }
  const pages = doc.numPages; await doc.destroy();
  return { text: out.join('\n'), pages };
}
export async function renderPdfPage(blob: Blob, pageNo = 1, scale = 2): Promise<HTMLCanvasElement> {
  const doc = await openPdf(blob); const page = await doc.getPage(pageNo); const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise; await doc.destroy();
  return c;
}
export const canvasToBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/jpeg', 0.9));

/**
 * Text for a document: PDFs use embedded text when present (exact), otherwise the pages are rendered and OCR'd.
 * Images are OCR'd directly (use the edited/converted image when available).
 */
export async function extractText(file: Blob, isPdfFile: boolean, onProgress?: Progress, maxOcrPages = 3): Promise<{ text: string; confidence: number; source: 'ocr' | 'pdf-text'; pages?: number }> {
  if (isPdfFile) {
    onProgress?.({ stage: 'reading PDF text', pct: 10 });
    const { text, pages } = await pdfText(file);
    if ((text.match(/[A-Za-z0-9]/g)?.length ?? 0) >= 30 && /\d/.test(text)) return { text, confidence: 99, source: 'pdf-text', pages };
    const parts: string[] = []; let conf = 0; const n = Math.min(pages, maxOcrPages);
    for (let p = 1; p <= n; p++) {
      onProgress?.({ stage: `rendering page ${p}/${n}`, pct: 0 });
      const c = await renderPdfPage(file, p, 2);
      const r = await recognize(c, (x) => onProgress?.({ stage: `page ${p}/${n}: ${x.stage}`, pct: x.pct }));
      parts.push(r.text); conf += r.confidence;
    }
    return { text: parts.join('\n'), confidence: n ? conf / n : 0, source: 'ocr', pages };
  }
  const r = await recognize(file, onProgress);
  return { ...r, source: 'ocr' };
}
