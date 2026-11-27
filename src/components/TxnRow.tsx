import { ArrowLeftRight } from 'lucide-react';
import type { Transaction } from '@/db/types';
import type { Finance } from '@/hooks/useData';
import { IconBadge } from './Icon';
import { Badge } from './ui';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { txnLabel, txnSign } from '@/lib/labels';
import { cn } from '@/lib/cn';

export function TxnRow({ t, f, onClick, action, hideDate }: { t: Transaction; f: Finance; onClick?: () => void; action?: React.ReactNode; hideDate?: boolean }) {
  const cat = t.categoryId ? f.catMap.get(t.categoryId) : undefined;
  const from = t.accountId ? f.accMap.get(t.accountId)?.name : undefined;
  const to = t.toAccountId ? f.accMap.get(t.toAccountId)?.name : undefined;
  const sign = txnSign(t.type, t.amount);
  // Calm colours: money in is green, spending stays ink, internal moves are muted. Red is reserved for warnings.
  const color = t.status === 'expected' || t.type === 'transfer' || (t.type === 'debt_repayment' && t.toAccountId) ? 'text-slate-500' : sign > 0 ? 'text-income' : 'text-slate-900 dark:text-white';
  const catName = cat ? (f.settings.language === 'ms' && cat.nameMs ? cat.nameMs : cat.name) : null;
  return (
    <div className="flex items-center gap-2 py-1">
    <Wrap onClick={onClick} className={cn('flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left', onClick && '-mx-2 rounded-xl px-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
      {cat ? <IconBadge name={cat.icon} color={cat.color} /> : <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800"><ArrowLeftRight className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100"><span className="truncate">{t.name}</span>{t.status === 'expected' && <Badge tone="orange">Expected</Badge>}</p>
        <p className="truncate text-xs text-slate-500">{[!hideDate && fmtDate(t.date), catName ?? txnLabel(t.type), to ? `${from ?? '—'} → ${to}` : from].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="text-right">
        <p className={cn('text-sm font-semibold tabular-nums', color)}>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{formatRM(Math.abs(t.amount))}</p>
        {t.fee > 0 && <p className="text-[11px] text-slate-500">fee {formatRM(t.fee)}</p>}
      </div>
    </Wrap>
      {action}
    </div>
  );
}
function Wrap({ onClick, className, children }: { onClick?: () => void; className: string; children: React.ReactNode }) {
  return onClick ? <button type="button" onClick={onClick} className={className}>{children}</button> : <div className={className}>{children}</div>;
}
