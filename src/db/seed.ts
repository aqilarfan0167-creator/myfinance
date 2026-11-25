import type { Category } from './types';

const ts = '2026-01-01T00:00:00.000Z';
type Def = [id: string, name: string, ms: string, color: string, icon: string, nw: 'need' | 'want' | null];

const income: Def[] = [
  ['inc-salary', 'Salary', 'Gaji', '#16a34a', 'Briefcase', null],
  ['inc-ot', 'Overtime (OT)', 'Kerja Lebih Masa', '#22c55e', 'Clock', null],
  ['inc-allowance', 'Allowance', 'Elaun', '#4ade80', 'Gift', null],
  ['inc-bonus', 'Bonus', 'Bonus', '#15803d', 'Award', null],
  ['inc-claims', 'Claims', 'Tuntutan', '#65a30d', 'Receipt', null],
  ['inc-side', 'Side Income', 'Pendapatan Sampingan', '#84cc16', 'Store', null],
  ['inc-invest', 'Investments', 'Pelaburan', '#0d9488', 'TrendingUp', null],
  ['inc-other', 'Other Income', 'Pendapatan Lain', '#14b8a6', 'Plus', null],
];
const expense: Def[] = [
  ['exp-food', 'Food & Drinks', 'Makanan & Minuman', '#f97316', 'Utensils', 'need'],
  ['exp-groceries', 'Groceries', 'Barangan Runcit', '#84cc16', 'ShoppingBasket', 'need'],
  ['exp-petrol', 'Petrol', 'Petrol', '#eab308', 'Fuel', 'need'],
  ['exp-toll', 'Toll', 'Tol', '#a16207', 'Milestone', 'need'],
  ['exp-transport', 'Transport & Parking', 'Pengangkutan & Parkir', '#0ea5e9', 'Bus', 'need'],
  ['exp-rental', 'Rental', 'Sewa', '#6366f1', 'Home', 'need'],
  ['exp-utilities', 'Utilities', 'Utiliti', '#06b6d4', 'Zap', 'need'],
  ['exp-phone', 'Phone & Internet', 'Telefon & Internet', '#3b82f6', 'Smartphone', 'need'],
  ['exp-family', 'Family', 'Keluarga', '#ec4899', 'Users', 'need'],
  ['exp-shopping', 'Shopping', 'Membeli-belah', '#d946ef', 'ShoppingBag', 'want'],
  ['exp-medical', 'Medical', 'Perubatan', '#ef4444', 'HeartPulse', 'need'],
  ['exp-education', 'Education', 'Pendidikan', '#8b5cf6', 'GraduationCap', 'need'],
  ['exp-insurance', 'Insurance', 'Insurans', '#64748b', 'Shield', 'need'],
  ['exp-entertainment', 'Entertainment', 'Hiburan', '#f43f5e', 'Film', 'want'],
  ['exp-subscriptions', 'Subscriptions', 'Langganan', '#a855f7', 'Repeat', 'want'],
  ['exp-vehicle', 'Vehicle Maintenance', 'Penyelenggaraan Kenderaan', '#78716c', 'Wrench', 'need'],
  ['exp-loan', 'Loan Interest & Fees', 'Faedah & Caj Pinjaman', '#b91c1c', 'Landmark', 'need'],
  ['exp-fees', 'Bank & Transfer Fees', 'Caj Bank & Pindahan', '#9ca3af', 'Banknote', 'need'],
  ['exp-other', 'Other Expenses', 'Perbelanjaan Lain', '#94a3b8', 'MoreHorizontal', 'want'],
];

export const FEE_CATEGORY_ID = 'exp-fees';

export function defaultCategories(): Category[] {
  const mk = (kind: 'income' | 'expense') => ([id, name, nameMs, color, icon, needWant]: Def): Category => ({
    id, name, nameMs, kind, color, icon, needWant, system: true, archived: false, createdAt: ts, updatedAt: ts,
  });
  return [...income.map(mk('income')), ...expense.map(mk('expense'))];
}
