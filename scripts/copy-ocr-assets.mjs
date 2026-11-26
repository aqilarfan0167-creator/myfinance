// Copies the OCR engine, WASM cores and language data into public/ocr so OCR runs fully on-device (no CDN).
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
const out = 'public/ocr';
mkdirSync(`${out}/core`, { recursive: true }); mkdirSync(`${out}/lang`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of readdirSync('node_modules/tesseract.js-core')) if (/lstm\.wasm\.js$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
for (const l of ['eng', 'msa']) {
  const src = `node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`;
  if (!existsSync(src)) throw new Error(`Missing language data ${src}`);
  cpSync(src, `${out}/lang/${l}.traineddata.gz`);
}
mkdirSync('public/heic', { recursive: true });
cpSync('node_modules/heic2any/dist/heic2any.min.js', 'public/heic/heic2any.min.js'); // run inside the sandboxed converter frame only
console.log('OCR & HEIC assets copied');
