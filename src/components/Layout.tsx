import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, ArrowLeftRight, ScanLine, PieChart, Menu, Moon, Sun, Plus, Bell, Cloud, CloudOff, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { NotificationRunner } from './NotificationRunner';
import { UpdatePrompt } from './UpdatePrompt';
import { useCloud } from '@/hooks/useCloud';
import { NAV, NAV_FOOTER, NAV_GROUPS, type NavItem } from './nav';
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

const iconBtn = 'rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-[11px] font-extrabold text-white dark:bg-teal-300 dark:text-slate-950">RM</span>
      <span className="text-[17px]">MyFinance</span>
    </Link>
  );
}

function SideLink({ n }: { n: NavItem }) {
  const t = useT();
  return (
    <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cn('group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition',
      isActive ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white')}>
      {({ isActive }) => <><n.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300')} strokeWidth={isActive ? 2.2 : 1.8} /><span className="truncate">{t(n.label)}</span></>}
    </NavLink>
  );
}

/** One "New" button instead of many quick actions. */
function NewMenu({ compact }: { compact?: boolean }) {
  const t = useT(); const { openTxn } = useUI(); const nav = useNavigate();
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const items = [
    { label: t('Add Expense'), icon: TrendingDown, run: () => openTxn({ type: 'expense' }) },
    { label: t('Add Income'), icon: TrendingUp, run: () => openTxn({ type: 'income' }) },
    { label: t('Transfer'), icon: ArrowLeftRight, run: () => openTxn({ type: 'transfer' }) },
    { label: t('Scan receipt'), icon: ScanLine, run: () => nav('/scan') },
  ];
  return (
    <div className="relative" ref={ref}>
      <button aria-label={t('New')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={cn('inline-flex items-center gap-1.5 rounded-xl bg-teal-700 font-semibold text-white shadow-sm transition hover:bg-teal-800 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200', compact ? 'p-2' : 'px-3.5 py-2 text-sm')}>
        <Plus className="h-4 w-4" strokeWidth={2.5} />{!compact && t('New')}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.run(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
              <it.icon className="h-4 w-4 text-slate-500" />{it.label}
            </button>))}
        </div>)}
    </div>
  );
}

export function Layout() {
  const t = useT(); const s = useSettings(); const loc = useLocation(); const cloud = useCloud();
  const unread = useLiveQuery(() => db.notifications.filter((n) => !n.readAt && !n.dismissedAt && !n.resolvedAt).count(), []) ?? 0;
  useEffect(() => { // print reports in light mode
    const before = () => { document.documentElement.dataset.wasDark = String(document.documentElement.classList.contains('dark')); document.documentElement.classList.remove('dark'); };
    const after = () => { if (document.documentElement.dataset.wasDark === 'true') document.documentElement.classList.add('dark'); };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  useEffect(() => { if (s) applyTheme(s.theme); }, [s?.theme]); // eslint-disable-line
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200/80 bg-slate-50 px-4 py-5 lg:flex dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-6 px-2"><Logo /></div>
        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto">
          {NAV_GROUPS.map((g, i) => (
            <div key={i}>
              {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(g.label)}</p>}
              <div className="space-y-0.5">{g.items.map((n) => <SideLink key={n.to} n={n} />)}</div>
            </div>))}
        </nav>
        <div className="space-y-0.5 border-t border-slate-200/80 pt-4 dark:border-slate-800">{NAV_FOOTER.map((n) => <SideLink key={n.to} n={n} />)}</div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-slate-50/85 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800/80 dark:bg-slate-950/85">
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            {cloud.config && <Link to="/account" title={cloud.session ? (cloud.status === 'error' ? `Sync problem: ${cloud.error}` : cloud.status === 'syncing' ? 'Syncing…' : 'Synced') : 'Not signed in – sync off'} aria-label="Cloud sync status" className={iconBtn}>
              {!cloud.session ? <CloudOff className="h-5 w-5 text-slate-400" /> : cloud.status === 'syncing' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Cloud className={cloud.status === 'error' || cloud.needsBinding ? 'h-5 w-5 text-warn' : 'h-5 w-5 text-income'} />}</Link>}
            <Link to="/notifications" className={cn(iconBtn, 'relative')}><Bell className="h-5 w-5" aria-hidden /><span className="sr-only">Notifications</span>
              {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c2362f] px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}<span className="sr-only"> unread</span></span>}</Link>
            <button onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })} aria-label="Toggle dark mode" className={iconBtn}>{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
            <div className="ml-1 hidden sm:block"><NewMenu /></div>
            <div className="ml-1 sm:hidden"><NewMenu compact /></div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-12 print:p-0"><Outlet /></main>
        <NotificationRunner />
        <UpdatePrompt />
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-slate-200/80 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        {[{ to: '/', l: 'Home', i: Home }, { to: '/transactions', l: 'Transactions', i: ArrowLeftRight }, { to: '/scan', l: 'Scan Receipt', i: ScanLine, main: true }, { to: '/budget', l: 'Budget', i: PieChart }, { to: '/more', l: 'More', i: Menu }].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-1 py-1 text-[11px] font-medium', isActive ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500')}>
            {n.main ? <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-lg ring-4 ring-slate-50 dark:bg-teal-300 dark:text-slate-950 dark:ring-slate-950"><n.i className="h-5 w-5" /></span> : <n.i className="h-5 w-5" />}
            <span className="truncate">{t(n.l)}</span>
          </NavLink>))}
      </nav>
    </div>
  );
}

export function MorePage() {
  const t = useT();
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t('More')}</h1>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {NAV.filter((n) => n.to !== '/').map((n) => (
          <NavLink key={n.to} to={n.to} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-2 py-4 text-center text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <n.icon className="h-5 w-5 text-teal-700 dark:text-teal-300" />{t(n.label)}
          </NavLink>))}
      </div>
    </>
  );
}
