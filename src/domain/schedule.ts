import type { Frequency } from '@/db/types';
import { addDays, addMonths } from '@/lib/date';

const MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const DAYS: Partial<Record<Frequency, number>> = { weekly: 7, biweekly: 14 };
export const FREQUENCIES: { v: Frequency; label: string }[] = [
  { v: 'weekly', label: 'Weekly' }, { v: 'biweekly', label: 'Every 2 weeks' }, { v: 'monthly', label: 'Monthly' },
  { v: 'quarterly', label: 'Quarterly' }, { v: 'half_yearly', label: 'Every 6 months' }, { v: 'yearly', label: 'Yearly' },
];

/** The n-th date of a schedule. Always computed from the anchor, so month-end dates don't drift (31 Jan → 28 Feb → 31 Mar). */
export function nthDate(anchor: string, f: Frequency, n: number): string {
  return MONTHS[f] ? addMonths(anchor, MONTHS[f]! * n) : addDays(anchor, DAYS[f]! * n);
}

/** All scheduled dates within [from, to], respecting the schedule's start and optional end. */
export function scheduleDates(start: string, end: string | null, f: Frequency, from: string, to: string, max = 1000): string[] {
  const out: string[] = [];
  for (let n = 0; n < 100000 && out.length < max; n++) {
    const d = nthDate(start, f, n);
    if (d > to || (end && d > end)) break;
    if (d >= from) out.push(d);
  }
  return out;
}
