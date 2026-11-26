/** Only allow in-app paths like "/budget" or "/transactions?account=x" – blocks "//evil.com", "\\evil", "javascript:" etc. */
export function safeLink(link: unknown, fallback = '/'): string {
  return typeof link === 'string' && /^\/(?![/\\])[A-Za-z0-9\-/?=&._~%]*$/.test(link) && link.length < 300 ? link : fallback;
}

/* ---------- Record validation for data coming from backups or the cloud ---------- */
const isStr = (v: unknown, max = 500) => typeof v === 'string' && v.length <= max;
const isOptStr = (v: unknown, max = 500) => v == null || isStr(v, max);
const isInt = (v: unknown) => Number.isSafeInteger(v);
const isOptInt = (v: unknown) => v == null || isInt(v);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isBool = (v: unknown) => typeof v === 'boolean';
const isArr = (v: unknown) => Array.isArray(v);
const oneOf = (v: unknown, xs: readonly string[]) => typeof v === 'string' && xs.includes(v);
type Rule = (r: Record<string, unknown>) => string | null;
const need = (cond: boolean, msg: string) => (cond ? null : msg);

const RULES: Record<string, Rule[]> = {
  accounts: [(r) => need(isStr(r.name, 200), 'name'), (r) => need(oneOf(r.type, ['bank', 'cash', 'ewallet', 'savings', 'investment', 'credit_card', 'loan']), 'type'), (r) => need(isInt(r.openingBalance), 'openingBalance'), (r) => need(isDate(r.openingDate), 'openingDate'), (r) => need(isOptInt(r.creditLimit) && isOptInt(r.lowBalanceThreshold), 'limits')],
  transactions: [(r) => need(isDate(r.date), 'date'), (r) => need(oneOf(r.type, ['income', 'expense', 'transfer', 'debt_repayment', 'refund', 'adjustment']), 'type'), (r) => need(isInt(r.amount) && (r.fee == null || isInt(r.fee)), 'amount'),
    (r) => need(isOptStr(r.accountId, 200) && isOptStr(r.toAccountId, 200) && isOptStr(r.categoryId, 200), 'references'), (r) => need(oneOf(r.status ?? 'actual', ['actual', 'expected']), 'status'), (r) => need(isStr(r.name ?? '', 1000) && isStr(r.remarks ?? '', 5000), 'text'),
    (r) => need(r.attachmentIds == null || isArr(r.attachmentIds), 'attachmentIds'), (r) => need(r.related == null || isArr(r.related), 'related')],
  categories: [(r) => need(isStr(r.name, 200), 'name'), (r) => need(oneOf(r.kind, ['income', 'expense']), 'kind')],
  settings: [(r) => need(r.id === 'app', 'id'), (r) => need(r.payDay == null || (isInt(r.payDay) && (r.payDay as number) >= 1 && (r.payDay as number) <= 31), 'payDay')],
  salaries: [(r) => need(typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month as string), 'month'), (r) => need(['basic', 'gross', 'expectedNet'].every((k) => isInt(r[k])), 'amounts')],
  otEntries: [(r) => need(isDate(r.date) && isInt(r.amount), 'date/amount')],
  commitments: [(r) => need(isStr(r.name, 200) && isInt(r.amount) && isDate(r.startDate), 'fields')],
  occurrences: [(r) => need(isStr(r.commitmentId, 200) && isDate(r.dueDate) && isInt(r.amount), 'fields')],
  recurring: [(r) => need(isStr(r.name, 200) && isDate(r.startDate) && !!r.template && isInt((r.template as Record<string, unknown>).amount), 'fields')],
  budgets: [(r) => need(isStr(r.categoryId, 200) && isInt(r.amount) && /^\d{4}-\d{2}$/.test(String(r.month)), 'fields')],
  goals: [(r) => need(isStr(r.name, 200) && isInt(r.target) && isInt(r.startingAmount ?? 0), 'fields')],
  goalEntries: [(r) => need(isStr(r.goalId, 200) && isDate(r.date) && isInt(r.amount), 'fields')],
  tasks: [(r) => need(isStr(r.name, 300) && (r.dueDate == null || isDate(r.dueDate)), 'fields')],
  attachments: [(r) => need(isStr(r.fileName, 300) && isStr(r.mimeType, 100) && isInt(r.size), 'fields')],
  receipts: [(r) => need(isStr(r.attachmentId, 200) && isOptInt(r.total) && isArr(r.txnIds ?? []), 'fields')],
};
/** Returns a problem description, or null when the record is safe to store. */
export function checkRecord(table: string, r: unknown): string | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'not an object';
  const rec = r as Record<string, unknown>;
  if (!isStr(rec.id, 200) || !(rec.id as string).length) return 'invalid id';
  if (rec.deletedAt != null && !isStr(rec.deletedAt, 40)) return 'invalid deletedAt';
  for (const rule of RULES[table] ?? []) { const p = rule(rec); if (p) return `invalid ${p}`; }
  return null;
}
export { isBool };
