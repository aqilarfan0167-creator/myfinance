import type { Cents } from '@/lib/money';
import { addMonths } from '@/lib/date';

/** Reducing-balance instalment: P·r / (1 − (1+r)^−n), r = monthly rate. */
export function reducingInstalment(principal: Cents, annualRatePct: number, months: number): Cents {
  if (months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.ceil(principal / months);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}
/** Flat-rate (hire purchase) instalment: (P + P·rate·years) / months. */
export function flatInstalment(principal: Cents, annualRatePct: number, months: number): Cents {
  if (months <= 0) return 0;
  return Math.round((principal + (principal * annualRatePct * (months / 12)) / 100) / months);
}

export interface ScheduleRow { n: number; date: string; payment: Cents; interest: Cents; principal: Cents; balance: Cents }
export interface Projection { rows: ScheduleRow[]; months: number; totalInterest: Cents; totalPaid: Cents; payoffDate: string | null; feasible: boolean }

/**
 * Project repayment of an outstanding balance.
 * - reducing: monthly interest = balance × rate/12; payment covers interest first.
 * - flat: balance already includes interest, so each payment reduces it directly.
 * extraMonthly is added to every payment; lumpSum is paid in month 1.
 */
export function project(p: { balance: Cents; annualRatePct: number; payment: Cents; rateType: 'reducing' | 'flat'; startDate: string; extraMonthly?: Cents; lumpSum?: Cents; maxMonths?: number }): Projection {
  const rows: ScheduleRow[] = [];
  let bal = Math.max(0, p.balance - (p.lumpSum ?? 0));
  const pay = p.payment + (p.extraMonthly ?? 0);
  const r = p.rateType === 'reducing' ? p.annualRatePct / 100 / 12 : 0;
  let totalInterest = 0, totalPaid = p.lumpSum ?? 0;
  const max = p.maxMonths ?? 600;
  if (pay <= 0 && bal > 0) return { rows, months: Infinity, totalInterest: 0, totalPaid: 0, payoffDate: null, feasible: false };
  for (let n = 1; bal > 0 && n <= max; n++) {
    const interest = Math.round(bal * r);
    if (pay <= interest) return { rows, months: Infinity, totalInterest, totalPaid, payoffDate: null, feasible: false };
    const payment = Math.min(pay, bal + interest);
    const principal = payment - interest;
    bal -= principal; totalInterest += interest; totalPaid += payment;
    rows.push({ n, date: addMonths(p.startDate, n - 1), payment, interest, principal, balance: bal });
  }
  if (bal > 0) return { rows, months: Infinity, totalInterest, totalPaid, payoffDate: null, feasible: false };
  return { rows, months: rows.length, totalInterest, totalPaid, payoffDate: rows.at(-1)?.date ?? p.startDate, feasible: true };
}

/** Malaysian credit cards: minimum payment is typically 5% of the statement balance or RM50, whichever is higher (estimate). */
export function cardMinimumPayment(statementBalance: Cents): Cents {
  if (statementBalance <= 0) return 0;
  return Math.min(statementBalance, Math.max(5000, Math.ceil(statementBalance * 0.05)));
}
