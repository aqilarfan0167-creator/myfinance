import type { DayType, SalaryProfile, SalaryRecord } from '@/db/types';
import type { Cents } from '@/lib/money';

/** Minutes between HH:mm times; an end earlier than the start means it ran past midnight. */
export function otHours(start: string, end: string, breakMinutes = 0): number {
  const m = (s: string) => { const [h, mi] = s.split(':').map(Number); return h * 60 + mi; };
  let mins = m(end) - m(start); if (mins <= 0) mins += 1440;
  return Math.max(0, Math.round(((mins - breakMinutes) / 60) * 100) / 100);
}

/** Employment Act 1955: ORP = monthly rate ÷ 26; hourly rate = ORP ÷ normal hours per day. */
export function hourlyRate(p: Pick<SalaryProfile, 'basic' | 'hourlyRateOverride' | 'workDaysPerMonth' | 'hoursPerDay'>): Cents {
  if (p.hourlyRateOverride) return p.hourlyRateOverride;
  if (!p.basic || !p.workDaysPerMonth || !p.hoursPerDay) return 0;
  return Math.round(p.basic / p.workDaysPerMonth / p.hoursPerDay);
}

export const otAmount = (hours: number, rate: Cents, multiplier: number): Cents => Math.round(hours * rate * multiplier);

export const DAY_TYPES: { v: DayType; label: string }[] = [
  { v: 'normal', label: 'Normal working day' }, { v: 'rest', label: 'Rest day' }, { v: 'public_holiday', label: 'Public holiday' },
];

/**
 * ESTIMATES of employee statutory contributions (age < 60, Malaysian citizen). Always verify against the payslip.
 * - EPF 11%: wages ≤ RM5,000 use RM20 bands (rate × upper band limit); above that, 11% of wages. Both rounded up to the next ringgit.
 * - SOCSO 0.5% (Category 1) & EIS 0.2%: RM100 wage bands (midpoint × rate), insured wages capped at RM6,000.
 */
export function estimateEPF(wages: Cents, rate = 0.11): Cents {
  if (wages <= 0) return 0;
  const base = wages <= 500000 ? Math.ceil(wages / 2000) * 2000 : wages;
  return Math.ceil((base * rate) / 100) * 100;
}
function bandMid(wages: Cents) {
  const capped = Math.min(wages, 600000);
  const upper = Math.ceil(capped / 10000) * 10000;
  return upper - 5000;
}
export function estimateSOCSO(wages: Cents): Cents { return wages <= 0 ? 0 : Math.round(bandMid(wages) * 0.005); }
export function estimateEIS(wages: Cents): Cents { return wages <= 0 ? 0 : Math.round(bandMid(wages) * 0.002); }

const sum = (xs: { amount: Cents }[]) => xs.reduce((a, b) => a + b.amount, 0);

/** Wages subject to each scheme (simplified): EPF excludes OT & claims; SOCSO/EIS include OT, exclude bonus & claims. */
export function statutoryBases(r: Pick<SalaryRecord, 'basic' | 'allowances' | 'bonus' | 'incentives' | 'ot' | 'unpaidLeave'>) {
  const fixed = r.basic + sum(r.allowances) + r.incentives - r.unpaidLeave;
  return { epf: fixed + r.bonus, socso: fixed + r.ot };
}

export function salaryTotals(r: Pick<SalaryRecord, 'basic' | 'allowances' | 'bonus' | 'claims' | 'incentives' | 'ot' | 'epf' | 'socso' | 'eis' | 'pcb' | 'unpaidLeave' | 'otherDeductions'>) {
  const gross = r.basic + sum(r.allowances) + r.bonus + r.claims + r.incentives + r.ot;
  const totalDeductions = r.epf + r.socso + r.eis + r.pcb + r.unpaidLeave + sum(r.otherDeductions);
  return { gross, totalDeductions, expectedNet: gross - totalDeductions };
}
