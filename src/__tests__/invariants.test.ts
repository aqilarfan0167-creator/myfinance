/** Randomised ledgers (seeded, reproducible): the books must always balance, in integer sen. */
import { describe, it, expect } from 'vitest';
import type { Account, Transaction, TxnType } from '@/db/types';
import { computeBalances, computePosition, summarize } from '@/domain/ledger';
import { buildReport, periodRange } from '@/domain/report';
import { addDays, monthEnd, todayKL, fmtDate, parseDMY, nextPayday } from '@/lib/date';

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const asset = ['bank', 'cash', 'sav'];
const TYPES: TxnType[] = ['income', 'expense', 'expense', 'expense', 'transfer', 'debt_repayment', 'refund', 'adjustment'];

function scenario(seed: number) {
  const r = rng(seed); const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]; const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const mk = (id: string, type: Account['type'], opening: number): Account => ({ id, name: id, type, openingBalance: opening, openingDate: '2026-01-01', icon: '', color: '', status: 'active', lowBalanceThreshold: null,
    includeInAvailable: !['credit_card', 'loan', 'savings'].includes(type), includeInNetWorth: true, createdAt: '', updatedAt: '', deletedAt: null });
  const accounts = [mk('bank', 'bank', int(0, 10_000_00)), mk('cash', 'cash', int(0, 50_000)), mk('sav', 'savings', int(0, 5_000_00)), mk('cc', 'credit_card', -int(0, 2_000_00)), mk('loan', 'loan', -int(0, 50_000_00))];

  const txns: Transaction[] = [];
  for (let i = 0; i < int(20, 150); i++) {
    const type = pick(TYPES); const amount = type === 'adjustment' ? int(-50_000, 50_000) || 1 : int(1, 300_000);
    let accountId = pick(type === 'expense' ? [...asset, 'cc', 'loan'] : asset), toAccountId: string | null = null, fee = 0;
    if (type === 'transfer') { toAccountId = pick(asset.filter((x) => x !== accountId)); fee = r() < 0.3 ? int(1, 500) : 0; }
    if (type === 'debt_repayment') { accountId = pick(asset); toAccountId = pick(['cc', 'loan', null]); }
    txns.push({ id: `t${i}`, date: addDays('2026-01-01', int(0, 330)), time: '12:00', name: 'x', merchant: pick(['A', 'B', '']), type, categoryId: type === 'income' ? 'inc-salary' : pick(['exp-food', 'exp-petrol', 'exp-loan']),
      amount, fee, accountId, toAccountId, paymentMethod: null, needWant: pick(['need', 'want', null]), remarks: '', status: r() < 0.1 ? 'expected' : 'actual',
      attachmentIds: [], related: [], createdAt: '', updatedAt: '', deletedAt: r() < 0.08 ? '2026-12-01' : null });
  }
  return { accounts, txns };
}

describe('financial invariants (300 random ledgers)', () => {
  it('balances, net worth, cash flow, categories, needs/wants and reports always reconcile', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { accounts, txns } = scenario(seed);
      const live = txns.filter((t) => !t.deletedAt && t.status === 'actual');
      const bal = computeBalances(accounts, txns);
      // 1. Every balance is an integer number of sen
      for (const v of bal.values()) expect(Number.isSafeInteger(v)).toBe(true);
      // 2. Total change across ALL accounts = money that entered/left the household (internal moves net to zero)
      const external = live.reduce((a, t) => a + ({ income: t.amount, refund: t.amount, expense: -t.amount, adjustment: t.amount, transfer: -t.fee, debt_repayment: t.toAccountId ? 0 : -t.amount } as Record<TxnType, number>)[t.type], 0);
      const change = accounts.reduce((a, x) => a + (bal.get(x.id)! - x.openingBalance), 0);
      expect(change).toBe(external);
      // 3. Net worth = sum of balances (all accounts count)
      const pos = computePosition(accounts, bal);
      expect(pos.netWorth).toBe([...bal.values()].reduce((a, b) => a + b, 0));
      expect(pos.total + 0).toBe(['bank', 'cash', 'sav'].reduce((a, id) => a + bal.get(id)!, 0));
      // 4. Summary identities
      const s = summarize(txns, accounts, { from: '2026-01-01', to: '2026-12-31' });
      expect(s.netExpenses).toBe(s.expenses + s.fees - s.refunds);
      expect(s.byCategory.reduce((a, c) => a + c.amount, 0)).toBe(s.netExpenses);
      expect(s.needs + s.wants + s.unclassified).toBe(s.netExpenses);
      expect([...s.daily.values()].reduce((a, b) => a + b, 0)).toBe(s.netExpenses);
      expect(s.cashFlow).toBe(s.income - s.netExpenses - s.debtRepayments + s.loanCharges);
      expect(s.income).toBe(live.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0));
      // 5. Liquid (non-liability) cash flow check: change of asset accounts = income + refunds + adjustments(asset) − expenses paid from assets − fees − all repayments
      const assetChange = asset.reduce((a, id) => a + bal.get(id)! - accounts.find((x) => x.id === id)!.openingBalance, 0);
      const assetFlow = live.reduce((a, t) => a + (asset.includes(t.accountId!) ? ({ income: t.amount, refund: t.amount, adjustment: t.amount, expense: -t.amount, transfer: -t.fee, debt_repayment: -t.amount } as Record<TxnType, number>)[t.type] : 0), 0);
      expect(assetChange).toBe(assetFlow);
      // 6. Monthly reports add up to the yearly figures
      const months = Array.from({ length: 12 }, (_, i) => periodRange('monthly', `2026-${String(i + 1).padStart(2, '0')}-01`));
      const inp = { accounts, txns, cats: [], occ: [], goals: [], goalEntries: [], salaries: [], ot: [], budgets: [], receipts: [], today: '2026-12-31' };
      const year = buildReport(inp, 'yearly', periodRange('yearly', '2026-06-01'));
      expect(months.reduce((a, m) => a + buildReport(inp, 'monthly', m).cur.netExpenses, 0)).toBe(year.cur.netExpenses);
      expect(months.reduce((a, m) => a + buildReport(inp, 'monthly', m).cur.income, 0)).toBe(year.cur.income);
      // 7. Report account start/end agree with the ledger
      const end = year.accounts.reduce((a, x) => a + x.end, 0); expect(end).toBe([...computeBalances(accounts, txns, '2026-12-31').values()].reduce((a, b) => a + b, 0));
      expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    }
  }, 60000);
});

describe('dates follow Malaysia time on any device timezone', () => {
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kuala_Lumpur']) {
    it(`TZ=${tz}`, () => {
      const old = process.env.TZ; process.env.TZ = tz;
      try {
        expect(todayKL(new Date('2026-11-25T15:59:00Z'))).toBe('2026-11-25');   // 23:59 in KL
        expect(todayKL(new Date('2026-11-25T16:00:00Z'))).toBe('2026-11-26');   // midnight in KL
        expect(todayKL(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01');
        expect(fmtDate('2026-03-01')).toBe('01/03/2026'); expect(parseDMY('29/02/2028')).toBe('2028-02-29');
        expect(addDays('2026-03-08', 1)).toBe('2026-03-09');                    // across US DST change
        expect(nextPayday('2026-11-30', 31)).toBe('2026-12-31');
      } finally { process.env.TZ = old; }
    });
  }
});
