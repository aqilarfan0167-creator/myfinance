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
  { to: '/salary', label: 'Salary & OT', icon: Briefcase },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/scan', label: 'Smart Receipt Scanner', icon: ScanLine },
  { to: '/receipts', label: 'Receipt Library', icon: Images },
  { to: '/accounts', label: 'Bank Accounts', icon: Landmark },
  { to: '/commitments', label: 'Commitments', icon: CalendarClock },
  { to: '/budget', label: 'Budget Planner', icon: PieChart },
  { to: '/savings', label: 'Savings Goals', icon: PiggyBank },
  { to: '/debts', label: 'Debt & Credit Cards', icon: CreditCard },
  { to: '/simulator', label: 'Financial Simulator', icon: FlaskConical },
  { to: '/calendar', label: 'Financial Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Financial Tasks', icon: ListTodo },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/backup', label: 'Backup & Restore', icon: DatabaseBackup },
];
