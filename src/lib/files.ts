/** Browser file utilities: validation, hashing, HEIC conversion, thumbnails and simple image editing. */
export const MAX_FILE_MB = 20;
const EXT = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;
const MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

export function validateFile(f: File): string | null {
  if (!MIME.test(f.type) && !EXT.test(f.name)) return `${f.name}: unsupported type. Use JPG, PNG, WEBP, HEIC or PDF.`;
  if (f.size > MAX_FILE_MB * 1048576) return `${f.name}: larger than ${MAX_FILE_MB} MB.`;
  if (f.size === 0) return `${f.name}: file is empty.`;
  return null;
}
export const isPdf = (type: string, name = '') => type === 'application/pdf' || /\.pdf$/i.test(name);
export const isHeic = (type: string, name = '') => /image\/hei[cf]/.test(type) || /\.hei[cf]$/i.test(name);
export function mimeFor(f: File) {
  if (f.type) return f.type;
  const e = f.name.split('.').pop()?.toLowerCase();
  return e === 'pdf' ? 'application/pdf' : e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : e === 'heic' || e === 'heif' ? 'image/heic' : 'image/jpeg';
}

export async function sha256(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HEIC/HEIF → JPEG (browsers other than Safari can't display HEIC). Loaded on demand. */
export async function heicToJpeg(blob: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

async function bitmap(blob: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch { return await createImageBitmap(blob); }
}
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const toBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.9) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed'))), type, q));

export async function imageSize(blob: Blob) { const b = await bitmap(blob); const s = { width: b.width, height: b.height }; b.close(); return s; }

export async function thumbnail(blob: Blob, max = 360): Promise<Blob> {
  const b = await bitmap(blob); const k = Math.min(1, max / Math.max(b.width, b.height));
  const c = canvas(Math.round(b.width * k), Math.round(b.height * k)); c.getContext('2d')!.drawImage(b, 0, 0, c.width, c.height); b.close();
  return toBlob(c, 'image/jpeg', 0.75);
}

export interface Edit { rotate: 0 | 90 | 180 | 270; crop: { x: number; y: number; w: number; h: number } | null /* fractions 0–1 of the rotated image */; enhance: boolean }
export const NO_EDIT: Edit = { rotate: 0, crop: null, enhance: false };

/**
 * Applies rotation, crop and optional enhancement (greyscale + contrast stretch + light sharpening),
 * and limits the long side to 2400 px – a good size for OCR.
 */
export async function applyEdits(blob: Blob, e: Edit, maxSide = 2400): Promise<Blob> {
  const b = await bitmap(blob);
  const rot = e.rotate % 180 !== 0; const rw = rot ? b.height : b.width, rh = rot ? b.width : b.height;
  const r = canvas(rw, rh); const rc = r.getContext('2d')!;
  rc.translate(rw / 2, rh / 2); rc.rotate((e.rotate * Math.PI) / 180); rc.drawImage(b, -b.width / 2, -b.height / 2); b.close();
  const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(cr.x * rw), sy = Math.round(cr.y * rh), sw = Math.max(1, Math.round(cr.w * rw)), sh = Math.max(1, Math.round(cr.h * rh));
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const out = canvas(Math.round(sw * k), Math.round(sh * k)); const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(r, sx, sy, sw, sh, 0, 0, out.width, out.height);
  if (e.enhance) enhance(ctx, out.width, out.height);
  return toBlob(out, 'image/jpeg', 0.92);
}

function enhance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data; const g = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; g[j] = v; hist[g[j]]++; }
  // contrast stretch between 2nd and 98th percentile
  const total = w * h; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let j = 0; j < g.length; j++) g[j] = Math.max(0, Math.min(255, ((g[j] - lo) * 255) / span));
  // light unsharp mask (3×3)
  const o = new Uint8ClampedArray(g);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const blur = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
    o[i] = g[i] + (g[i] - blur) * 0.6;
  }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = o[j]; }
  ctx.putImageData(img, 0, 0);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
