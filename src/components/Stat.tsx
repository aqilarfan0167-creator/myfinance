import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
/** Compact figure: muted label, one strong number, optional muted note. Colour only when it carries meaning. */
export function Stat({ label, value, sub, tone, icon, className }: { label: string; value: string; sub?: ReactNode; tone?: 'green' | 'red' | 'blue' | 'orange' | 'purple'; icon?: ReactNode; className?: string }) {
  const c = { green: 'text-income', red: 'text-expense', blue: 'text-slate-900 dark:text-white', orange: 'text-warn', purple: 'text-saving' }[tone ?? 'blue'];
  return (
    <div className={cn('rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon}{label}</p>
      <p className={cn('mt-1.5 truncate text-xl font-bold tracking-tight tabular-nums', tone ? c : 'text-slate-900 dark:text-white')}>{value}</p>
      {sub && <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
