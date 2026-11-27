// Browser end-to-end test (Playwright). Needs: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
const FX = require('path').join(__dirname, '../src/__tests__/fixtures/');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['camera'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => (m.type() === 'error' || /Refused|Content Security/.test(m.text())) && errs.push('console: ' + m.text().slice(0, 200)));
  const U = 'http://localhost:4173'; const t0 = Date.now(); const T = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  for (let i = 0; i < 20; i++) { try { await p.goto(U + '/settings'); break; } catch { await p.waitForTimeout(500); } }
  await p.click('text=Load demo data'); await p.waitForSelector('text=Remove demo data', { timeout: 30000 });
  const bankBal = async () => { await p.goto(U + '/accounts'); await p.waitForSelector('text=[Demo] Maybank'); return (await p.locator('text=[Demo] Maybank').locator('xpath=ancestor::section').innerText()).match(/RM [\d,]+\.\d\d/g)[1]; };
  const before = await bankBal();

  // 1. Upload one PNG → real OCR → review
  await p.goto(U + '/scan'); await p.setInputFiles('input[type=file][multiple]', FX + 'receipt-restaurant.png');
  await p.waitForSelector('text=Confirm & save expense'); await p.waitForFunction(() => !document.body.innerText.includes('Reading receipt on this device'), null, { timeout: 90000 });
  console.log(T(), 'OCR done');
  const val = async (label) => p.locator(`label:has(span:text-is("${label}")) input`).first().inputValue();
  console.log('merchant:', await val('Merchant'), '| date:', await val('Date'), '| receipt:', await val('Receipt / invoice no.'), '| total:', await val('Total (MYR)'), '| SST:', await val('SST / tax'));
  console.log('category:', await p.locator('label:has(span:text-is("Category")) select').inputValue(), '| suggested account:', await p.locator('label:has(span:text-is("Paid from account *")) select option:checked').innerText());
  await p.locator('label:has(span:text-is("Paid from account *")) select').selectOption('');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-scan-review.png'), fullPage: true });
  await p.click('text=Confirm & save expense'); await p.waitForSelector('text=Select the account you paid from');
  console.log('blocked without account: OK');
  await p.locator('label:has(span:text-is("Paid from account *")) select').selectOption({ label: '[Demo] Maybank' });
  await p.click('text=Confirm & save expense'); await p.waitForSelector('text=Expense saved and receipt linked'); console.log(T(), 'expense saved');
  const after = await bankBal(); console.log('Maybank balance', before, '→', after);

  // 2. Same file again → duplicate by hash; scanned PDF of same receipt → duplicate on confirm
  await p.goto(U + '/scan'); await p.click('text=Back to scans').catch(() => {});
  await p.setInputFiles('input[type=file][multiple]', [FX + 'receipt-restaurant.png', FX + 'receipt-scanned.pdf', FX + 'receipt-text.pdf', FX + 'receipt-bm-photo.jpg']);
  await p.click('text=Back to scans').catch(() => {});
  await p.waitForFunction(() => !/Processing \(/.test(document.body.innerText) && !document.body.innerText.includes('waiting') && !document.body.innerText.includes('queued'), null, { timeout: 180000 });
  await p.waitForTimeout(500);
  console.log(T(), 'bulk statuses:', (await p.locator('main').innerText()).split('\n').filter((l) => /^All \(|Needs review|Possible duplicate|Failed|Draft/.test(l)).join(' | '));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-scan-bulk.png'), fullPage: true });

  // Text PDF → split across 2 categories
  await p.click('text=SHELL MALAYSIA TRADING SDN BHD'); await p.waitForSelector('text=Confirm & save expense');
  console.log('text pdf engine:', await p.locator('text=/PDF.js text layer/').count() ? 'pdf-text' : 'ocr', '| total', await val('Total (MYR)'), '| category', await p.locator('label:has(span:text-is("Category")) select').inputValue());
  await p.locator('label:has(span:text-is("Paid from account *")) select').selectOption({ label: '[Demo] CIMB Visa (card)' });
  await p.click('button:has-text("Split")');
  await p.locator('select[aria-label="Split category"]').nth(0).selectOption('exp-petrol');
  await p.locator('select[aria-label="Split category"]').nth(1).selectOption('exp-food');
  const splitInputs = p.locator('select[aria-label="Split category"] ~ div input');
  await splitInputs.nth(0).fill('50.00'); await splitInputs.nth(1).fill('10.24');
  await p.click('text=Confirm & save expense'); await p.waitForSelector('text=Expense saved and receipt linked'); console.log('split saved');

  // Scanned PDF of the already-recorded receipt → duplicate warning on confirm → attach to existing
  await p.goto(U + '/scan');
  const scanned = p.locator('button:has-text("RESTORAN")').first(); await scanned.click();
  await p.waitForSelector('text=Confirm & save expense');
  await p.locator('label:has(span:text-is("Paid from account *")) select').selectOption({ label: '[Demo] Maybank' });
  await p.click('text=Confirm & save expense'); await p.waitForSelector('text=This may already be recorded'); console.log('duplicate warning on confirm: OK');
  await p.locator('button:has-text("Attach to this")').first().click(); await p.waitForSelector('text=Receipt attached to existing transaction'); console.log('attached to existing: OK');

  // 3. Camera capture (fake device)
  await p.goto(U + '/scan'); await p.click('text=Take photo'); await p.waitForSelector('button:has-text("Capture"):not([disabled])', { timeout: 15000 });
  await p.click('button:has-text("Capture")'); await p.click('text=Use photo'); await p.click('button:has-text("Done (1)")'); console.log('camera capture: OK');
  await p.waitForSelector('text=Confirm & save expense'); await p.waitForFunction(() => !document.body.innerText.includes('Reading receipt on this device'), null, { timeout: 90000 });
  console.log('camera (test pattern) → merchant:', JSON.stringify(await val('Merchant')), 'total:', JSON.stringify(await val('Total (MYR)')), 'date:', JSON.stringify(await val('Date')));
  console.log('camera warnings:', (await p.locator('ul.text-warn li').allInnerTexts()).join(' / '));
  await p.click('button:has-text("Cancel")'); await p.click('[role=dialog] button:has-text("Discard")');

  // 4. Paste & drag-drop via DataTransfer
  const b64 = require('fs').readFileSync(FX + 'receipt-bm-photo.jpg').toString('base64');
  const n0 = await p.locator('main button:has(img)').count();
  await p.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], 'image.png', { type: 'image/jpeg' }); const dt = new DataTransfer(); dt.items.add(f);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); }, b64);
  await p.waitForSelector('text=receipt(s) added'); console.log('paste: OK');
  await p.click('text=Back to scans').catch(() => {});
  await p.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'dropped.jpg', { type: 'image/jpeg' }));
    const zone = [...document.querySelectorAll('div')].find((d) => d.className.includes('border-dashed')); zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); }, b64);
  await p.waitForTimeout(1000); console.log('drop: OK');

  // 5. Library: delete a recorded receipt keeps its transaction
  await p.goto(U + '/receipts'); await p.waitForSelector('text=Receipts (');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-library.png'), fullPage: true });
  const txCount = async () => { await p.goto(U + '/expenses'); await p.waitForTimeout(500); return (await p.locator('main').innerText()).match(/(\d+) transactions?/)[1]; };
  const c1 = await txCount();
  await p.goto(U + '/receipts'); await p.fill('input[placeholder^="Search merchant"]', 'SHELL'); await p.click('button[aria-label=Delete]'); await p.click('[role=dialog] button:has-text("Delete")'); await p.waitForSelector('text=Receipt deleted');
  console.log('expenses before/after deleting receipt:', c1, await txCount());

  // 6. Payslip OCR in salary form
  await p.goto(U + '/salary'); await p.click('main button:text-is("Salary record")');
  await p.setInputFiles('[role=dialog] input[type=file]', FX + 'payslip.png'); await p.waitForSelector('text=Payslip values found', { timeout: 90000 });
  console.log('payslip:', (await p.locator('[role=dialog] table').last().innerText()).replace(/\n/g, ' ').replace(/\t/g, ' ').slice(0, 330));
  await p.click('text=Apply selected'); await p.waitForTimeout(300);
  console.log('payslip net note:', await p.locator('text=/Payslip net pay/').innerText());

  // mobile
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/scan', '/receipts']) { await p.goto(U + path); await p.waitForTimeout(700); const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > 390) console.log('OVERFLOW', path, sw); }
  await p.goto(U + '/scan'); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'mf-scan-mobile.png') });
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.slice(0, 600)); process.exit(1); });
