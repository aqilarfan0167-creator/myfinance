import type { Account, Transaction } from '@/db/types';
import type { Cents } from '@/lib/money';
import { addMonths, daysInMonth } from '@/lib/date';
import { computeBalances } from './ledger';
import { cardMinimumPayment } from './loan';

const onDay = (ym: string, day: number) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`; };

/** Most recent statement date on or before today. */
export function lastStatementDate(today: string, statementDay: number): string {
  const thisM = onDay(today.slice(0, 7), statementDay);
  return thisM <= today ? thisM : onDay(addMonths(today.slice(0, 7) + '-01', -1).slice(0, 7), statementDay);
}
/** First due date after the statement date. */
export function dueDateAfter(statementDate: string, dueDay: number): string {
  const same = onDay(statementDate.slice(0, 7), dueDay);
  return same > statementDate ? same : onDay(addMonths(statementDate.slice(0, 7) + '-01', 1).slice(0, 7), dueDay);
}

export interface CardStatus { used: Cents; available: Cents | null; utilisation: number | null; statementDate: string | null; dueDate: string | null; statementBalance: Cents | null; paidSinceStatement: Cents; remainingDue: Cents | null; minimumDue: Cents | null }

export function cardStatus(card: Account, accounts: Account[], txns: Transaction[], today: string): CardStatus {
  const bal = computeBalances(accounts, txns).get(card.id) ?? 0;
  const used = Math.max(0, -bal);
  const limit = card.creditLimit ?? null;
  const out: CardStatus = { used, available: limit != null ? limit - used : null, utilisation: limit ? used / limit : null, statementDate: null, dueDate: null, statementBalance: null, paidSinceStatement: 0, remainingDue: null, minimumDue: null };
  if (!card.statementDay) return out;
  const sd = lastStatementDate(today, card.statementDay);
  const stmt = Math.max(0, -(computeBalances(accounts, txns, sd).get(card.id) ?? 0));
  const paid = txns.filter((t) => !t.deletedAt && t.status === 'actual' && t.date > sd && t.date <= today &&
    ((t.type === 'debt_repayment' || t.type === 'transfer') && t.toAccountId === card.id)).reduce((a, t) => a + t.amount, 0);
  return { ...out, statementDate: sd, dueDate: card.dueDay ? dueDateAfter(sd, card.dueDay) : null, statementBalance: stmt, paidSinceStatement: paid,
    remainingDue: Math.max(0, stmt - paid), minimumDue: Math.max(0, cardMinimumPayment(stmt) - paid) };
}
