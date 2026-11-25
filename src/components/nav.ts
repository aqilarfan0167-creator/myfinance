import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Briefcase, TrendingDown, ScanLine, Images, Landmark, CalendarClock, PieChart, PiggyBank,
  CreditCard, FlaskConical, CalendarDays, ListTodo, Lightbulb, FileBarChart, Bell, Settings, DatabaseBackup, type LucideIcon,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; phase?: number }
/** phase = planned delivery phase for features not yet built. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/income', label: 'Income', icon: TrendingUp },
  { to: '/salary', label: 'Salary & OT', icon: Briefcase, phase: 2 },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/scan', label: 'Smart Receipt Scanner', icon: ScanLine, phase: 4 },
  { to: '/receipts', label: 'Receipt Library', icon: Images, phase: 4 },
  { to: '/accounts', label: 'Bank Accounts', icon: Landmark },
  { to: '/commitments', label: 'Commitments', icon: CalendarClock, phase: 2 },
  { to: '/budget', label: 'Budget Planner', icon: PieChart, phase: 3 },
  { to: '/savings', label: 'Savings Goals', icon: PiggyBank, phase: 3 },
  { to: '/debts', label: 'Debt & Credit Cards', icon: CreditCard, phase: 3 },
  { to: '/simulator', label: 'Financial Simulator', icon: FlaskConical, phase: 3 },
  { to: '/calendar', label: 'Financial Calendar', icon: CalendarDays, phase: 2 },
  { to: '/tasks', label: 'Financial Tasks', icon: ListTodo, phase: 3 },
  { to: '/insights', label: 'Insights', icon: Lightbulb, phase: 5 },
  { to: '/reports', label: 'Reports', icon: FileBarChart, phase: 5 },
  { to: '/notifications', label: 'Notifications', icon: Bell, phase: 5 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/backup', label: 'Backup & Restore', icon: DatabaseBackup },
];
