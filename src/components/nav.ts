import {
  Home, ArrowLeftRight, Briefcase, ScanLine, Receipt, Landmark, CalendarClock, PieChart, PiggyBank, CreditCard, FlaskConical,
  CalendarDays, ListTodo, Lightbulb, FileBarChart, Bell, Settings, DatabaseBackup, TrendingUp, TrendingDown, UserRound, type LucideIcon,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; phase?: number }
export interface NavGroup { label: string | null; items: NavItem[] }

/** Sidebar: few, grouped, short labels. Everything else is reachable from Settings / the More page. */
export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ to: '/', label: 'Home', icon: Home }] },
  { label: 'Money', items: [{ to: '/transactions', label: 'Transactions', icon: ArrowLeftRight }, { to: '/receipts', label: 'Receipts', icon: Receipt }, { to: '/accounts', label: 'Accounts', icon: Landmark }] },
  { label: 'Planning', items: [{ to: '/budget', label: 'Budget', icon: PieChart }, { to: '/commitments', label: 'Bills', icon: CalendarClock }, { to: '/savings', label: 'Savings', icon: PiggyBank }, { to: '/debts', label: 'Debts', icon: CreditCard }, { to: '/salary', label: 'Salary', icon: Briefcase }] },
  { label: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: FileBarChart }, { to: '/insights', label: 'Insights', icon: Lightbulb }, { to: '/calendar', label: 'Calendar', icon: CalendarDays }] },
];
export const NAV_FOOTER: NavItem[] = [{ to: '/tasks', label: 'Tasks', icon: ListTodo }, { to: '/simulator', label: 'Simulator', icon: FlaskConical }, { to: '/settings', label: 'Settings', icon: Settings }];
/** Every page (used by the More page and page titles). */
export const NAV: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOTER,
  { to: '/scan', label: 'Scan receipt', icon: ScanLine }, { to: '/income', label: 'Income', icon: TrendingUp }, { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/backup', label: 'Backup & Restore', icon: DatabaseBackup }, { to: '/account', label: 'Account & Sync', icon: UserRound },
];
