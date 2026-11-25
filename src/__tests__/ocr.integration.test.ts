/** Real OCR (Tesseract.js, eng+msa, self-hosted models) on generated receipt images → parser. No mocks. */
import { describe, it, expect, afterAll } from 'vitest';
import { createWorker, type Worker } from 'tesseract.js';
import { readFileSync, mkdirSync } from 'node:fs';
import { parseReceipt, suggestCategory } from '@/domain/receipt';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
let worker: Worker | null = null;
const getWorker = async () => {
  if (!worker) { mkdirSync('node_modules/.cache/tess', { recursive: true }); worker = await createWorker(['eng', 'msa'], 1, { langPath: 'public/ocr/lang', cachePath: 'node_modules/.cache/tess', gzip: true }); }
  return worker;
};
afterAll(async () => { await worker?.terminate(); });

describe('real OCR → parser', () => {
  it('clean restaurant receipt', async () => {
    const { data } = await (await getWorker()).recognize(fx('receipt-restaurant.png'));
    const r = parseReceipt(data.text, '2026-11-25');
    expect(data.confidence).toBeGreaterThan(70);
    expect(r.merchant.value).toMatch(/NASI KANDAR PELITA/);
    expect(r.date.value).toBe('2026-11-23');
    expect(r.receiptNo.value).toBe('INV-0045821');
    expect(r.total.value).toBe(3060);
    expect(r.sst.value).toBe(158); expect(r.serviceCharge.value).toBe(264);
    expect(suggestCategory(r.merchant.value, data.text, {})?.categoryId).toBe('exp-food');
  }, 60000);
  it('noisy rotated BM photo', async () => {
    const { data } = await (await getWorker()).recognize(fx('receipt-bm-photo.jpg'));
    const r = parseReceipt(data.text, '2026-11-25');
    console.log('BM photo OCR confidence', Math.round(data.confidence), '\n' + data.text);
    expect(r.total.value).toBe(3260);
    expect(r.date.value).toBe('2026-11-05');
    expect(r.paymentMethod.value).toBe('cash');
    expect(suggestCategory(r.merchant.value, data.text, {})?.categoryId).toBe('exp-groceries');
  }, 60000);
});
