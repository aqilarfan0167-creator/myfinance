import type { Confidence, Field, PaymentMethod, ReceiptData, ReceiptItem } from '@/db/types';

/* ---------- helpers ---------- */
const F = <T,>(value: T | null, confidence: Confidence | null = value == null ? null : 'medium', source?: string): Field<T> => ({ value, confidence, source });
const AMT = String.raw`-?(?:RM|MYR)?\s?-?\d{1,3}(?:[,\s]\d{3})*[.,]\d{2}(?!\d)|-?(?:RM|MYR)?\s?-?\d+[.,]\d{2}(?!\d)`;
const AMT_RE = new RegExp(AMT, 'gi');

/** Fixes common OCR confusions inside numbers (O→0, l/I→1, S→5, B→8) and parses to integer cents. */
export function toCents(raw: string): number | null {
  let s = raw.toUpperCase().replace(/RM|MYR/g, '').replace(/\s/g, '');
  s = s.replace(/(?<=\d|^|[.,])O/g, '0').replace(/[LI|]/g, '1').replace(/(?<=\d)S|S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8');
  const neg = s.startsWith('-') || s.endsWith('-');
  s = s.replace(/-/g, '');
  const m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})$/);
  if (!m) return null;
  const cents = Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]);
  return Number.isSafeInteger(cents) ? (neg ? -cents : cents) : null;
}
/** Amounts found in a line, left to right. */
export function amountsIn(line: string): number[] {
  const fixed = line.replace(/(\d)\s+([.,])\s*(\d{2})\b/g, '$1$2$3') // "12 .50" → "12.50"
    .replace(/(?<=[\d][.,]?\d?)[Oo](?=[\d.,]|\b)/g, '0').replace(/(?<=\d[.,]?)[lI](?=\d|\b)/g, '1'); // "16.5O" → "16.50"
  return [...fixed.matchAll(AMT_RE)].map((m) => toCents(m[0])).filter((x): x is number => x != null);
}
const lastAmount = (line: string) => { const a = amountsIn(line); return a.length ? a[a.length - 1] : null; };
const clean = (s: string) => s.replace(/[|_~`^*=]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, MAC: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, OGO: 8, OGOS: 8, SEP: 9, SEPT: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DIS: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
function validDate(y: number, m: number, d: number, today: string): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCMonth() !== m - 1) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return iso <= nextYear(today) ? iso : null;
}
const nextYear = (today: string) => `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

/* ---------- keyword sets ---------- */
const K = {
  grand: /\b(GRAND\s*TOTAL|JUMLAH\s*BESAR|AMOUNT\s*DUE|TOTAL\s*(?:AMOUNT\s*)?(?:DUE|PAYABLE)|JUMLAH\s*(?:PERLU\s*)?(?:DI)?BAYAR(?:AN)?|NET+\s*TOTAL|TOTAL\s*(?:INCL|INC)\b\.?|TOTAL\s*\(?\s*(?:RM|MYR)\s*\)?)/,
  total: /\b(TOTAL|JUMLAH|JUMLAH\s*RM)\b/,
  notTotal: /\b(SUB\s*-?\s*TOTAL|SUBTOTAL|TOTAL\s*(?:QTY|QUANTITY|ITEMS?|DISC(?:OUNT)?|SAVINGS?|TAX|SST|GST|EXCL|BEFORE|UNITS?)|JUMLAH\s*(?:KECIL|KUANTITI|ITEM|DISKAUN|CUKAI)|NO\.?\s*OF\s*ITEMS?)\b/,
  subtotal: /\b(SUB\s*-?\s*TOTAL|SUBTOTAL|JUMLAH\s*KECIL|TOTAL\s*(?:EXCL|BEFORE)\w*)\b/,
  discount: /\b(DISCOUNT|DISC\.?|DISKAUN|POTONGAN|VOUCHER|PROMO(?:TION)?|SAVINGS?)\b/,
  sst: /\b(SST|SERVICE\s*TAX|SALES\s*TAX|CUKAI(?:\s*PERKHIDMATAN|\s*JUALAN)?|GST|TAX)\b/,
  sstNotAmount: /\b(SST|GST|TAX)\s*(?:ID|REG(?:ISTRATION)?|NO\.?|NUMBER|#)\b/,
  service: /\b(SERVICE\s*CHARGE|SVC\.?\s*(?:CHG|CHARGE)?|S\/C|CAJ\s*PERKHIDMATAN)\b/,
  rounding: /\b(ROUNDING(?:\s*ADJ\w*)?|ROUND\s*ADJ\w*|PELARASAN(?:\s*PEMBUNDARAN)?|PEMBUNDARAN)\b/,
  tender: /\b(CASH\s*(?:TENDERED|PAID|RECEIVED)?|TUNAI|TENDER(?:ED)?|CHANGE|BAKI|PAID|DIBAYAR|AMOUNT\s*PAID|BALANCE)\b/,
  header: /\b(TAX\s*INVOICE|INVOICE|RECEIPT|RESIT|BIL|WELCOME|SELAMAT|THANK|TERIMA\s*KASIH|TEL|PHONE|FAX|EMAIL|WWW|HTTP|CO\.?\s*REG|ROC|SST\s*(?:ID|REG|NO)|GST\s*(?:ID|REG|NO)|CASHIER|JURUWANG|COUNTER|POS|TABLE|MEJA|PAX)\b/,
  address: /\b(JALAN|JLN|LORONG|LRG|TAMAN|TMN|LOT|NO\.?\s*\d|BLOK|BLOCK|LEVEL|ARAS|TINGKAT|PLAZA|MALL|KOMPLEKS|BANDAR|SEKSYEN|SECTION|PERSIARAN|KUALA\s*LUMPUR|SELANGOR|JOHOR|PULAU\s*PINANG|PENANG|PERAK|PAHANG|KEDAH|KELANTAN|TERENGGANU|MELAKA|NEGERI\s*SEMBILAN|SABAH|SARAWAK|PERLIS|PUTRAJAYA|LABUAN|SHAH\s*ALAM|PETALING\s*JAYA|SUBANG|KLANG|CYBERJAYA)\b|\b\d{5}\b/,
  company: /\b(SDN\.?\s*BHD|BHD|BERHAD|ENTERPRISE|TRADING|RESOURCES|HOLDINGS|RESTORAN|RESTAURANT|CAFE|KAFE|MART|STORE|KEDAI|PHARMACY|FARMASI|KLINIK|CLINIC|STATION|HYPERMARKET|SUPERMARKET|BAKERY|PLT)\b/,
  receiptNo: /\b(?:RECEIPT|RESIT|INVOICE|INV|BILL|BIL|DOC(?:UMENT)?|TRANS(?:ACTION)?|TRX|TXN|ORDER|REF(?:ERENCE)?|CHECK|CHK|SLIP|NO\.?\s*(?:RESIT|BIL|INVOIS))\s*(?:NO|NUM(?:BER)?|ID|#)?\.?\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/]{2,24})/,
  regNo: /\(?\b(\d{6,12}-?[A-Z]|\d{12})\b\)?|(?:CO\.?\s*(?:REG|NO)|ROC|SSM)\.?\s*(?:NO)?\.?\s*[:.]?\s*([A-Z0-9-]{5,15})/,
};
const PAYMENT: [RegExp, PaymentMethod][] = [
  [/\b(DUITNOW|DUIT\s*NOW|QR\s*PAY|MAYBANK\s*QR|MAEQR|QRPAY)\b/, 'duitnow_qr'],
  [/\b(TNG|TOUCH\s*['’]?\s*N\s*['’]?\s*GO|GRABPAY|GRAB\s*PAY|BOOST|SHOPEE\s*PAY|SHOPEEPAY|BIGPAY|SETEL|E-?WALLET|MAE\b)/, 'ewallet'],
  [/\b(VISA|MASTER\s*CARD|MASTERCARD|MASTER|AMEX|CREDIT\s*CARD|KAD\s*KREDIT|UNIONPAY)\b/, 'credit_card'],
  [/\b(DEBIT|MYDEBIT|KAD\s*DEBIT|ATM\s*CARD)\b/, 'debit_card'],
  [/\b(FPX|ONLINE\s*BANKING|IBG|INSTANT\s*TRANSFER|JOMPAY)\b/, 'online_banking'],
  [/\b(CASH|TUNAI)\b/, 'cash'],
];

/* ---------- main parser ---------- */
export function parseReceipt(text: string, today: string): ReceiptData {
  const lines = text.split(/\r?\n/).map(clean).filter((l) => l.length > 0);
  const U = lines.map((l) => l.toUpperCase());
  const warnings: string[] = [];

  // Merchant: prefer a company-like line near the top, else first meaningful text line.
  let merchant: Field<string> = F<string>(null), merchantIdx = -1;
  const top = Math.min(8, lines.length);
  for (let i = 0; i < top; i++) if (K.company.test(U[i]) && !K.address.test(U[i]) && /[A-Z]{3}/.test(U[i])) { merchant = F(tidyMerchant(lines[i]), 'high'); merchantIdx = i; break; }
  if (merchantIdx < 0) for (let i = 0; i < top; i++) {
    const u = U[i];
    if (K.header.test(u) || K.address.test(u) || amountsIn(u).length || !/[A-Z]{3}/.test(u) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(u)) continue;
    merchant = F(tidyMerchant(lines[i]), 'medium'); merchantIdx = i; break;
  }

  // Registration number & address (lines just after the merchant).
  let registrationNo = F<string>(null);
  const addr: string[] = [];
  for (let i = Math.max(0, merchantIdx); i < Math.min(lines.length, merchantIdx + 7); i++) {
    if (!registrationNo.value) { const r = U[i].match(K.regNo); if (r) registrationNo = F(r[1] ?? r[2], 'medium'); }
    if (i > merchantIdx && K.address.test(U[i]) && !K.header.test(U[i]) && !amountsIn(U[i]).length) addr.push(lines[i]);
  }
  const address = F(addr.length ? addr.map((x) => x.replace(/[,\s]+$/, '')).join(', ') : null, addr.length ? 'medium' : null);

  // Date & time
  let date = F<string>(null), time = F<string>(null);
  for (let i = 0; i < U.length && !date.value; i++) {
    const u = U[i]; const labelled = /\b(DATE|TARIKH|TKH)\b/.test(u);
    let iso: string | null = null, conf: Confidence = labelled ? 'high' : 'medium';
    let m = u.match(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/);
    if (m) iso = validDate(+m[1], +m[2], +m[3], today);
    if (!iso && (m = u.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/))) {
      const a = +m[1], b = +m[2];
      iso = validDate(+m[3], b, a, today);                       // Malaysian DD/MM/YYYY
      if (!iso && b > 12 && a <= 12) { iso = validDate(+m[3], a, b, today); conf = 'low'; } // MM/DD fallback
      else if (iso && a <= 12 && b <= 12 && a !== b && !labelled) conf = 'medium';
    }
    if (!iso && (m = u.match(/\b(\d{1,2})[\s.-]*(JAN|FEB|MAR|MAC|APR|MAY|MEI|JUN|JUL|AUG|OGOS|OGO|SEPT?|OCT|OKT|NOV|DEC|DIS)[A-Z]*[\s.,-]*(\d{2,4})\b/)))
      iso = validDate(+m[3], MONTHS[m[2]], +m[1], today);
    if (iso) { date = F(iso, conf, lines[i]); if (iso > today) { date.confidence = 'low'; warnings.push('Receipt date is in the future – please check.'); } }
  }
  for (const u of U) {
    const m = u.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(AM|PM)?\b/);
    if (m && !/\d[.,]\d{2}\s*$/.test(u.slice(m.index! + m[0].length - 1, m.index! + m[0].length + 1)) && (m[3] || m[4] || /\b(TIME|MASA|WAKTU)\b/.test(u) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(u))) {
      let h = +m[1]; if (m[4] === 'PM' && h < 12) h += 12; if (m[4] === 'AM' && h === 12) h = 0;
      time = F(`${pad(h)}:${m[2]}`, m[3] || m[4] ? 'high' : 'medium'); break;
    }
  }

  // Receipt / invoice number
  let receiptNo = F<string>(null);
  for (const u of U) {
    const m = u.match(K.receiptNo);
    if (m && /\d/.test(m[1]) && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(m[1])) { receiptNo = F(m[1], /\b(NO|#|NUM)/.test(u) ? 'high' : 'medium'); break; }
  }

  // Amount lines. A label line without an amount takes the amount from the next line.
  const amountFor = (i: number) => lastAmount(U[i]) ?? (i + 1 < U.length && !/[A-Z]{3}/.test(U[i + 1]) ? lastAmount(U[i + 1]) : null);
  type Cand = { i: number; v: number; p: number };
  const grand: Cand[] = []; let subtotal = F<number>(null), discount = F<number>(null), sst = F<number>(null), service = F<number>(null), rounding = F<number>(null);
  let firstSummary = U.length;
  U.forEach((u, i) => {
    const v = amountFor(i);
    const isSub = K.subtotal.test(u);
    if (isSub && v != null) { subtotal = F(v, 'high', lines[i]); firstSummary = Math.min(firstSummary, i); return; }
    if (K.rounding.test(u) && v != null) { rounding = F(v, 'high', lines[i]); return; }
    if (K.service.test(u) && v != null) { service = F(Math.abs(v), 'high', lines[i]); firstSummary = Math.min(firstSummary, i); return; }
    if (K.sst.test(u) && !K.sstNotAmount.test(u) && !K.total.test(u.replace(/TOTAL\s*(TAX|SST|GST)/, '')) && v != null) { sst = F(Math.abs(v), 'high', lines[i]); firstSummary = Math.min(firstSummary, i); return; }
    if (K.discount.test(u) && !K.total.test(u) && v != null) { discount = F((discount.value ?? 0) + Math.abs(v), 'high', lines[i]); return; }
    if (K.tender.test(u) && !K.grand.test(u)) return;
    if (v != null && !K.notTotal.test(u)) {
      if (K.grand.test(u)) grand.push({ i, v, p: 3 });
      else if (K.total.test(u)) grand.push({ i, v, p: 2 });
    }
    if (K.total.test(u)) firstSummary = Math.min(firstSummary, i);
  });

  let total = F<number>(null);
  if (grand.length) {
    const best = Math.max(...grand.map((g) => g.p));
    const pick = grand.filter((g) => g.p === best).at(-1)!;
    total = F(pick.v, 'high', lines[pick.i]);
  } else {
    const all = U.flatMap((u) => (K.tender.test(u) ? [] : amountsIn(u))).filter((x) => x > 0);
    if (all.length) { total = F(Math.max(...all), 'low', 'largest amount'); warnings.push('No “TOTAL” label found – the largest amount was used. Please verify the total.'); }
    else warnings.push('No total amount found – please enter it manually.');
  }
  // Consistency check: subtotal − discount + SST + service + rounding ≈ total
  if (total.value != null && subtotal.value != null) {
    const calc = subtotal.value - (discount.value ?? 0) + (sst.value ?? 0) + (service.value ?? 0) + (rounding.value ?? 0);
    if (Math.abs(calc - total.value) > 2) {
      // Some receipts print subtotal after discount/tax; accept if subtotal alone (+rounding) matches.
      if (Math.abs(subtotal.value + (rounding.value ?? 0) - total.value) > 2) { total.confidence = total.confidence === 'high' ? 'medium' : total.confidence; warnings.push('Subtotal, discount and tax do not add up to the total – please check.'); }
    }
  }

  // Items: lines above the first summary line that end with an amount.
  const items: ReceiptItem[] = [];
  const startAt = Math.max(merchantIdx + 1, 0);
  for (let i = startAt; i < firstSummary; i++) {
    const u = U[i];
    if (K.header.test(u) && !/\d+[.,]\d{2}\s*[A-Z]?$/.test(u)) continue;
    if (K.address.test(u) && !/[.,]\d{2}\s*[A-Z]?$/.test(u)) continue;
    if (K.tender.test(u) || K.discount.test(u) || /\b(DATE|TARIKH|TIME|MASA)\b/.test(u)) continue;
    const qtyLine = u.match(/^(\d+(?:\.\d+)?)\s*(?:X|@|PCS?\s*X?)\s*(?:RM\s*)?(\d+[.,]\d{2})(?:\s+(-?\d+[.,]\d{2}))?/);
    if (qtyLine && items.length && !/[A-Z]{3}/.test(u.replace(/RM|PCS?/g, ''))) {
      const it = items[items.length - 1]; it.qty = +qtyLine[1]; it.unitPrice = toCents(qtyLine[2]); if (qtyLine[3]) it.amount = toCents(qtyLine[3]); continue;
    }
    const am = amountsIn(u);
    if (!am.length) {
      if (/[A-Z]{3}/.test(u) && i + 1 < firstSummary && /^\d+(?:\.\d+)?\s*(?:X|@)/.test(U[i + 1])) items.push({ name: lines[i], qty: null, unitPrice: null, amount: null });
      continue;
    }
    const name = lines[i].replace(new RegExp(`(${AMT})\\s*[A-Z]?\\s*$`, 'i'), '').replace(/\s+(\d+[.,]\d{2}\s*)+$/, '').trim();
    if (!/[A-Za-z]{2}/.test(name)) continue;
    // Quantity forms: "2 x Item", "Item x 2", "Item 2 x 9.50" (unit price already stripped → "Item 2 x")
    const q = name.match(/^(\d{1,3})\s*[xX@]\s+(.+)$/) ?? name.match(/^(.+?)\s+[xX@]\s*(\d{1,3})$/) ?? name.match(/^(.+?)\s+(\d{1,3})\s*[xX@]$/);
    let qty: number | null = null, nm = name;
    if (q) { if (/^\d+$/.test(q[1])) { qty = +q[1]; nm = q[2]; } else { nm = q[1]; qty = +q[2]; } }
    const amount = am[am.length - 1]; const unit = am.length >= 2 ? am[am.length - 2] : qty ? Math.round(amount / qty) : null;
    items.push({ name: nm.replace(/\s{2,}/g, ' '), qty, unitPrice: unit, amount });
  }
  const itemSum = items.reduce((a, it) => a + (it.amount ?? 0), 0);
  if (items.length && subtotal.value != null && Math.abs(itemSum - subtotal.value) > 2) warnings.push('Item amounts do not add up to the subtotal – some items may be misread.');

  // Payment method & currency
  let paymentMethod = F<PaymentMethod>(null);
  const joined = U.join('\n');
  for (const [re, pm] of PAYMENT) if (re.test(joined)) { paymentMethod = F(pm, pm === 'cash' ? 'medium' : 'high'); break; }
  const currency = /\b(RM|MYR)\b|RM\s?\d/.test(joined) ? F('MYR', 'high') : F('MYR', 'low', 'assumed');

  if (!merchant.value) warnings.push('Merchant name not found.');
  if (!date.value) warnings.push('Date not found – please enter it.');
  return { merchant, address, registrationNo, date, time, receiptNo, items, subtotal, discount, sst, serviceCharge: service, rounding, total, currency, paymentMethod, warnings };
}

function tidyMerchant(s: string) {
  return s.replace(/\(?\b\d{6,12}-?[A-Z]\)?/g, '').replace(/\s{2,}/g, ' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9).]+$/g, '').trim();
}

/* ---------- categorisation ---------- */
const RULES: [RegExp, string][] = [
  [/PETRONAS|SHELL|PETRON|CALTEX|\bBHP\b|BHPETROL|RON\s*9[57]|DIESEL|PETROL|FUEL/, 'exp-petrol'],
  [/\bTOLL?\b|\bTOL\b|PLUS\s*MALAYSIA|LITRAK|SPRINT|DUKE|SMART\s*TAG|\bRFID\b/, 'exp-toll'],
  [/PARKING|PARKIR|LETAK\s*KERETA|\bGRAB\b(?!\s*FOOD)|\bLRT\b|\bMRT\b|RAPID\s*KL|\bKTM|\bETS\b|MYCAR|AIRASIA\s*RIDE|TAXI|TEKSI/, 'exp-transport'],
  [/SPEED\s*MART|LOTUS|TESCO|AEON\s*BIG|\bAEON\b|MYDIN|GIANT|JAYA\s*GROCER|VILLAGE\s*GROCER|\bNSK\b|ECONSAVE|HERO\s*MARKET|COLD\s*STORAGE|MERCATO|BILLION|SUPERMARKET|HYPERMARKET|PASAR\s*RAYA|GROCER|7-?\s?ELEVEN|FAMILYMART|KK\s*MART|MYNEWS/, 'exp-groceries'],
  [/MCDONALD|\bKFC\b|MAMAK|RESTORAN|RESTAURANT|NASI|\bCAFE\b|KAFE|KOPITIAM|STARBUCKS|PIZZA|SUSHI|BAKERY|\bZUS\b|TEALIVE|SECRET\s*RECIPE|OLDTOWN|PAPPARICH|FOOD|MAKAN|BURGER|DOMINO|SUBWAY|TEXAS\s*CHICKEN|MARRYBROWN|CHATIME|KOPI|NOODLE|MEE\b|ROTI|GERAI|WARUNG|BISTRO|DINER|GRAB\s*FOOD|FOODPANDA/, 'exp-food'],
  [/GUARDIAN|WATSONS|CARING|\bAA\s*PHARMACY|BIG\s*PHARMACY|KLINIK|CLINIC|HOSPITAL|PHARMACY|FARMASI|DENTAL|PERGIGIAN|MEDICAL|UBAT/, 'exp-medical'],
  [/TENAGA|\bTNB\b|SYABAS|AIR\s*SELANGOR|INDAH\s*WATER|SAJ\b|BEKALAN\s*AIR|ELECTRIC|ELEKTRIK/, 'exp-utilities'],
  [/UNIFI|MAXIS|CELCOM|\bDIGI\b|U\s*MOBILE|\bYES\b|TIME\s*DOTCOM|TM\s*NET|HOTLINK|XOX|TUNETALK|PREPAID\s*RELOAD/, 'exp-phone'],
  [/NETFLIX|SPOTIFY|YOUTUBE\s*PREMIUM|DISNEY|ASTRO|ICLOUD|GOOGLE\s*(ONE|STORAGE)|SUBSCRIPTION|LANGGANAN/, 'exp-subscriptions'],
  [/\bGSC\b|\bTGV\b|MBO|CINEMA|PAWAGAM|BOWLING|KARAOKE|THEME\s*PARK|SUNWAY\s*LAGOON|GENTING/, 'exp-entertainment'],
  [/WORKSHOP|BENGKEL|TYRE|TAYAR|SERVIS|SERVICE\s*CENTRE|AUTO\s*PARTS|BATTERY|BATERI|CAR\s*WASH|CUCI\s*KERETA|PUSPAKOM/, 'exp-vehicle'],
  [/POPULAR|\bMPH\b|BOOK|BUKU|STATIONERY|ALAT\s*TULIS|TUITION|YURAN|SEKOLAH|UNIVERSITI|COLLEGE/, 'exp-education'],
  [/INSURAN|INSURANCE|TAKAFUL|ETIQA|PRUDENTIAL|\bAIA\b|ALLIANZ|GREAT\s*EASTERN|ZURICH/, 'exp-insurance'],
  [/SHOPEE|LAZADA|UNIQLO|\bH&M\b|\bZARA\b|PARKSON|IKEA|MR\.?\s*DIY|DAISO|ECO\s*SHOP|PADINI|BATA|NIKE|ADIDAS|SENHENG|SENQ|HARVEY\s*NORMAN|COURTS|ELECTRONIC|FASHION|BOUTIQUE/, 'exp-shopping'],
];
/** Learned merchant category first (exact match), then keyword rules. Returns null if unsure – never guesses blindly. */
export function suggestCategory(merchant: string | null, text: string, learned: Record<string, string>): { categoryId: string; source: 'learned' | 'rule' } | null {
  if (merchant) {
    const key = merchant.trim().toLowerCase();
    if (learned[key]) return { categoryId: learned[key], source: 'learned' };
    const norm = normMerchant(merchant);
    for (const [k, v] of Object.entries(learned)) if (normMerchant(k) === norm && norm.length >= 4) return { categoryId: v, source: 'learned' };
  }
  // Merchant first, then the receipt header (top lines), and only then the full text – item words like "ROTI" are weak signals.
  const lines = text.toUpperCase().split(/\n/);
  for (const hay of [merchant?.toUpperCase() ?? '', lines.slice(0, 5).join('\n'), lines.join('\n')])
    for (const [re, cat] of RULES) if (hay && re.test(hay)) return { categoryId: cat, source: 'rule' };
  return null;
}
/** Normalised merchant key for duplicate/learning matches: drops company suffixes, branch codes and punctuation. */
export function normMerchant(s: string) {
  return s.toUpperCase().replace(/\b(SDN\.?\s*BHD|BHD|BERHAD|PLT|ENTERPRISE|TRADING|\(M\)|MALAYSIA|THE)\b/g, '').replace(/\(.*?\)/g, '').replace(/[^A-Z0-9]/g, '');
}

/* ---------- payslips ---------- */
export interface PayslipData {
  month: Field<string>; company: Field<string>; basic: Field<number>; overtime: Field<number>; allowances: { name: string; amount: number }[];
  bonus: Field<number>; epf: Field<number>; socso: Field<number>; eis: Field<number>; pcb: Field<number>; gross: Field<number>; totalDeductions: Field<number>; net: Field<number>; warnings: string[];
}
export function parsePayslip(text: string, today: string): PayslipData {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean); const U = lines.map((l) => l.toUpperCase());
  const warnings: string[] = [];
  const find = (re: RegExp, exclude = /EMPLOYER|MAJIKAN|\bER\b|YTD|YEAR\s*TO\s*DATE|TAHUN\s*SEMASA|CUMULATIVE/): Field<number> => {
    for (let i = 0; i < U.length; i++) if (re.test(U[i]) && !exclude.test(U[i])) {
      const a = amountsIn(U[i]); const v = a.length ? a[0] : i + 1 < U.length && !/[A-Z]{3}/.test(U[i + 1]) ? amountsIn(U[i + 1])[0] ?? null : null;
      if (v != null) return F(Math.abs(v), a.length === 1 ? 'high' : 'medium', lines[i]);
    }
    return F<number>(null);
  };
  const basic = find(/\b(BASIC(?:\s*(?:SALARY|PAY))?|GAJI\s*POKOK|GAJI\s*ASAS)\b/);
  const overtime = find(/\b(OVERTIME|O\.?T\.?|KERJA\s*LEBIH\s*MASA|KLM)\b/);
  const bonus = find(/\b(BONUS|INSENTIF|INCENTIVE)\b/);
  const epf = find(/\b(EPF|KWSP)\b/);
  const socso = find(/\b(SOCSO|PERKESO|SOCSO\s*\(?EMPLOYEE\)?)\b/);
  const eis = find(/\b(EIS|SIP)\b/);
  const pcb = find(/\b(PCB|MTD|CUKAI\s*PENDAPATAN|INCOME\s*TAX|POTONGAN\s*CUKAI)\b/);
  const gross = find(/\b(GROSS(?:\s*(?:PAY|SALARY|EARNINGS|WAGES))?|GAJI\s*KASAR|TOTAL\s*EARNINGS|JUMLAH\s*PENDAPATAN|TOTAL\s*INCOME)\b/);
  const totalDeductions = find(/\b(TOTAL\s*DEDUCTIONS?|JUMLAH\s*POTONGAN)\b/);
  const net = find(/\b(NET\s*(?:PAY|SALARY|WAGES|INCOME|AMOUNT)|GAJI\s*BERSIH|TAKE\s*HOME|NETT?\s*PAY|JUMLAH\s*BERSIH)\b/);
  const allowances: { name: string; amount: number }[] = [];
  U.forEach((u, i) => { if (/\b(ALLOWANCE|ELAUN)\b/.test(u) && !/TOTAL|JUMLAH/.test(u)) { const a = amountsIn(u)[0]; if (a != null) allowances.push({ name: lines[i].replace(new RegExp(`${AMT}.*$`, 'i'), '').trim() || 'Allowance', amount: a }); } });
  let month = F<string>(null);
  for (const u of U) {
    let m = u.match(/\b(JAN|FEB|MAR|MAC|APR|MAY|MEI|JUN|JUL|AUG|OGOS|SEPT?|OCT|OKT|NOV|DEC|DIS)[A-Z]*[\s,/-]*(\d{4})\b/);
    if (m) { month = F(`${m[2]}-${pad(MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)])}`, /MONTH|BULAN|PERIOD|TEMPOH/.test(u) ? 'high' : 'medium'); break; }
    m = u.match(/\b(?:MONTH|BULAN|PERIOD|TEMPOH)\b[^0-9]*(\d{1,2})[/.-](\d{4})\b/);
    if (m && +m[1] >= 1 && +m[1] <= 12) { month = F(`${m[2]}-${pad(+m[1])}`, 'high'); break; }
  }
  if (month.value && month.value > today.slice(0, 7)) month.confidence = 'low';
  const company = F(lines.slice(0, 5).find((l) => K.company.test(l.toUpperCase())) ?? null, 'medium');
  if (gross.value != null && net.value != null && totalDeductions.value != null && Math.abs(gross.value - totalDeductions.value - net.value) > 2) warnings.push('Gross − deductions ≠ net pay – please check the extracted values.');
  if (net.value == null) warnings.push('Net pay not found.');
  return { month, company, basic, overtime, allowances, bonus, epf, socso, eis, pcb, gross, totalDeductions, net, warnings };
}
