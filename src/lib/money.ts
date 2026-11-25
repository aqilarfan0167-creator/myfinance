/** All money is stored as integer cents (sen). */
export type Cents = number;

const fmt = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatRM(cents: Cents, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const s = fmt.format(Math.abs(cents) / 100);
  const prefix = neg ? '-' : opts.sign && cents > 0 ? '+' : '';
  return `${prefix}RM ${s}`;
}

/** Parse user input like "1,234.56" or "RM 12.3" into cents. Returns null if invalid. */
export function parseRM(input: string): Cents | null {
  const clean = input.replace(/rm/gi, '').replace(/[,\s]/g, '');
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === '' || clean === '-' || clean === '.') return null;
  const neg = clean.startsWith('-');
  const [i, d = ''] = clean.replace('-', '').split('.');
  const cents = Number(i || '0') * 100 + Number((d + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

export const centsToInput = (c: Cents) => (c / 100).toFixed(2);
export const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);
