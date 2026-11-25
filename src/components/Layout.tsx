import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, ArrowLeftRight, ScanLine, PieChart, Menu, Moon, Sun, Plus, TrendingUp, TrendingDown, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { NotificationRunner } from './NotificationRunner';
import { useEffect, useState } from 'react';
import { NAV } from './nav';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useUI } from './UIContext';
import { useSettings } from '@/hooks/useData';
import { updateSettings } from '@/db/repo';

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('mf-theme', theme === 'system' ? '' : theme); } catch { /* ignore */ }
}

export function Layout() {
  const t = useT(); const { openTxn } = useUI(); const s = useSettings(); const loc = useLocation();
  const [fab, setFab] = useState(false);
  const unread = useLiveQuery(() => db.notifications.filter((n) => !n.readAt && !n.dismissedAt && !n.resolvedAt).count(), []) ?? 0;
  // Print reports in light mode
  useEffect(() => {
    const before = () => { document.documentElement.dataset.wasDark = String(document.documentElement.classList.contains('dark')); document.documentElement.classList.remove('dark'); };
    const after = () => { if (document.documentElement.dataset.wasDark === 'true') document.documentElement.classList.add('dark'); };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  useEffect(() => { if (s) applyTheme(s.theme); }, [s?.theme]); // eslint-disable-line
  useEffect(() => { setFab(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const toggleTheme = () => updateSettings({ theme: isDark ? 'light' : 'dark' });

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 items-center gap-2 px-4 font-bold text-teal-700 dark:text-teal-400"><img src="/icon.svg" className="h-7 w-7" alt="" />MyFinance</div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800')}>
              <n.icon className="h-4 w-4 shrink-0" /><span className="truncate">{t(n.label)}</span>{n.phase && <span className="ml-auto text-[10px] text-slate-400">soon</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <span className="font-bold text-teal-700 lg:hidden dark:text-teal-400">MyFinance</span>
          <div className="hidden gap-2 lg:flex">
            <QA onClick={() => openTxn({ type: 'income' })} icon={TrendingUp} label={t('Add Income')} cls="text-income" />
            <QA onClick={() => openTxn({ type: 'expense' })} icon={TrendingDown} label={t('Add Expense')} cls="text-expense" />
            <QA onClick={() => openTxn({ type: 'transfer' })} icon={ArrowLeftRight} label={t('Transfer')} cls="text-transfer" />
          </div>
          <div className="flex items-center gap-1">
          <Link to="/notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-expense px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}</Link>
          <button onClick={toggleTheme} aria-label="Toggle dark mode" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 pb-28 lg:pb-8 print:p-0"><Outlet /></main>
        <NotificationRunner />
      </div>

      {/* Mobile quick-add */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:hidden">
        {fab && (<>
          <QA onClick={() => openTxn({ type: 'income' })} icon={TrendingUp} label={t('Add Income')} cls="text-income" />
          <QA onClick={() => openTxn({ type: 'expense' })} icon={TrendingDown} label={t('Add Expense')} cls="text-expense" />
          <QA onClick={() => openTxn({ type: 'transfer' })} icon={ArrowLeftRight} label={t('Transfer')} cls="text-transfer" />
        </>)}
        <button onClick={() => setFab(!fab)} aria-label="Quick actions" className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg"><Plus className={cn('h-6 w-6 transition', fab && 'rotate-45')} /></button>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900">
        {[{ to: '/', l: 'Home', i: Home }, { to: '/transactions', l: 'Transactions', i: ArrowLeftRight }, { to: '/scan', l: 'Scan Receipt', i: ScanLine }, { to: '/budget', l: 'Budget', i: PieChart }, { to: '/more', l: 'More', i: Menu }].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500')}>
            <n.i className="h-5 w-5" /><span className="truncate">{t(n.l)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function QA({ onClick, icon: I, label, cls }: { onClick: () => void; icon: typeof Plus; label: string; cls: string }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><I className={cn('h-4 w-4', cls)} />{label}</button>;
}

export function MorePage() {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs dark:border-slate-800 dark:bg-slate-900">
          <n.icon className="h-6 w-6 text-teal-700 dark:text-teal-400" />{t(n.label)}
        </NavLink>
      ))}
    </div>
  );
}
