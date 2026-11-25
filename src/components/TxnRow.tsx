import { ArrowLeftRight } from 'lucide-react';
import type { Transaction } from '@/db/types';
import type { Finance } from '@/hooks/useData';
import { IconBadge } from './Icon';
import { Badge } from './ui';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { txnLabel, txnSign } from '@/lib/labels';
import { cn } from '@/lib/cn';

export function TxnRow({ t, f, onClick, action }: { t: Transaction; f: Finance; onClick?: () => void; action?: React.ReactNode }) {
  const cat = t.categoryId ? f.catMap.get(t.categoryId) : undefined;
  const from = t.accountId ? f.accMap.get(t.accountId)?.name : undefined;
  const to = t.toAccountId ? f.accMap.get(t.toAccountId)?.name : undefined;
  const sign = txnSign(t.type, t.amount);
  const color = t.status === 'expected' ? 'text-slate-400' : t.type === 'transfer' ? 'text-transfer' : sign > 0 ? 'text-income' : 'text-expense';
  const catName = cat ? (f.settings.language === 'ms' && cat.nameMs ? cat.nameMs : cat.name) : null;
  return (
    <div className={cn('flex items-center gap-3 py-2.5', onClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded-lg')} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
      {cat ? <IconBadge name={cat.icon} color={cat.color} /> : <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transfer-soft text-transfer dark:bg-blue-900/30"><ArrowLeftRight className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.name}{t.status === 'expected' && <Badge tone="orange">Expected</Badge>}</p>
        <p className="truncate text-xs text-slate-500">{fmtDate(t.date)} · {catName ?? txnLabel(t.type)} · {from ?? '—'}{to ? ` → ${to}` : ''}{t.merchant && t.merchant !== t.name ? ` · ${t.merchant}` : ''}</p>
      </div>
      <div className="text-right">
        <p className={cn('text-sm font-semibold tabular-nums', color)}>{sign > 0 ? '+' : sign < 0 ? '-' : ''}{formatRM(Math.abs(t.amount))}</p>
        {t.fee > 0 && <p className="text-[11px] text-slate-500">fee {formatRM(t.fee)}</p>}
      </div>
      {action}
    </div>
  );
}
