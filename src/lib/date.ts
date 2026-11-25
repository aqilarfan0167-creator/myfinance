export const TZ = 'Asia/Kuala_Lumpur';

/** Local KL date as YYYY-MM-DD */
export function todayKL(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p; // en-CA yields YYYY-MM-DD
}
export function nowTimeKL(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}
/** YYYY-MM-DD -> DD/MM/YYYY */
export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDateTime(isoTs: string): string {
  const d = new Date(isoTs);
  return `${fmtDate(todayKL(d))} ${nowTimeKL(d)}`;
}
/** DD/MM/YYYY -> YYYY-MM-DD or null */
export function parseDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]); if (y < 100) y += 2000;
  const mo = Number(m[2]), d = Number(m[1]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return toISO(dt);
}
const pad = (n: number) => String(n).padStart(2, '0');
function toISO(d: Date) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function fromISO(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }

export function addDays(iso: string, n: number): string { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
export function daysBetween(a: string, b: string): number { return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000); }
export function monthKey(iso: string) { return iso.slice(0, 7); }
export function monthStart(iso: string) { return iso.slice(0, 7) + '-01'; }
export function daysInMonth(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function monthEnd(iso: string) { const [y, m] = iso.split('-').map(Number); return `${iso.slice(0, 7)}-${pad(daysInMonth(y, m))}`; }
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = daysInMonth(t.getUTCFullYear(), t.getUTCMonth() + 1);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, dim))}`;
}
export function fmtMonth(key: string, lang = 'en') {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'ms' ? 'ms-MY' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}
/** Next payday (day-of-month, clamped to month length) strictly after today. */
export function nextPayday(today: string, payDay: number): string {
  const [y, m] = today.split('-').map(Number);
  const thisMonth = `${today.slice(0, 7)}-${pad(Math.min(payDay, daysInMonth(y, m)))}`;
  if (thisMonth > today) return thisMonth;
  const nm = addMonths(today.slice(0, 7) + '-01', 1);
  const [y2, m2] = nm.split('-').map(Number);
  return `${nm.slice(0, 7)}-${pad(Math.min(payDay, daysInMonth(y2, m2)))}`;
}
