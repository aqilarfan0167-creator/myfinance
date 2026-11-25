import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeftRight, Pencil, Plus, Scale, Trash2, ArchiveRestore } from 'lucide-react';
import { useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, Input } from '@/components/ui';
import { MoneyInput } from '@/components/inputs';
import { Icon } from '@/components/Icon';
import { Stat } from '@/components/Stat';
import { deleteAccount, reconcileAccount, saveAccount, ValidationError } from '@/db/repo';
import type { Account } from '@/db/types';
import { ACCOUNT_TYPES } from '@/lib/labels';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';

export default function Accounts() {
  const f = useFinance(); const t = useT(); const { openAccount, openTxn, confirm, toast } = useUI();
  const [rec, setRec] = useState<Account | null>(null); const [showArchived, setShowArchived] = useState(false);
  if (!f) return <Loading />;
  const list = f.accounts.filter((a) => (showArchived ? a.status === 'archived' : a.status === 'active'));
  const groups = ACCOUNT_TYPES.map((g) => ({ ...g, items: list.filter((a) => a.type === g.v) })).filter((g) => g.items.length);
  const p = f.position;

  const toggleArchive = async (a: Account) => { const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = a; await saveAccount({ ...rest, status: a.status === 'active' ? 'archived' : 'active' }, id); toast(a.status === 'active' ? 'Archived' : 'Restored'); };
  const remove = async (a: Account) => {
    if (!(await confirm({ title: 'Delete account?', message: `Delete "${a.name}"? Only accounts without transactions can be deleted.`, danger: true, confirmText: 'Delete' }))) return;
    try { await deleteAccount(a.id); toast('Account deleted'); } catch (e) { toast(e instanceof ValidationError ? e.errors[0] : String(e), 'err'); }
  };

  return (
    <>
      <PageHeader title={t('Bank Accounts')} actions={<>
        <Button variant="secondary" onClick={() => openTxn({ type: 'transfer' })}><ArrowLeftRight className="h-4 w-4" />Transfer</Button>
        <Button onClick={() => openAccount()}><Plus className="h-4 w-4" />{t('Add Account')}</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('Total Balance')} value={formatRM(p.total)} /><Stat label={t('Available to Spend')} value={formatRM(p.available)} tone="blue" />
        <Stat label="Credit card debt" value={formatRM(p.creditDebt)} tone="red" /><Stat label={t('Net Worth')} value={formatRM(p.netWorth)} tone="purple" />
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived accounts</label>
      {!groups.length && <Empty title={showArchived ? 'No archived accounts' : 'No accounts yet'}>{!showArchived && <Button className="mt-2" onClick={() => openAccount()}>Add account</Button>}</Empty>}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.v}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">{g.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((a) => {
                const bal = f.balances.get(a.id) ?? 0; const cc = a.type === 'credit_card';
                const used = cc ? Math.max(0, -bal) : 0; const limit = a.creditLimit ?? 0;
                const low = !cc && a.lowBalanceThreshold != null && bal < a.lowBalanceThreshold;
                return (
                  <Card key={a.id} className="relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ background: a.color }} />
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: a.color + '22' }}><Icon name={a.icon} color={a.color} className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/transactions?account=${a.id}`} className="block truncate font-semibold hover:underline">{a.name}</Link>
                        <p className="text-xs text-slate-500">Opened {fmtDate(a.openingDate)} · {formatRM(cc ? -a.openingBalance : a.openingBalance)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">{low && <Badge tone="orange">Low balance</Badge>}{!a.includeInAvailable && !cc && <Badge>Not in available</Badge>}{!a.includeInNetWorth && <Badge>Excl. net worth</Badge>}</div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold tabular-nums ${bal < 0 ? 'text-expense' : ''}`}>{cc ? formatRM(used) : formatRM(bal)}</p>
                        {cc && <p className="text-xs text-slate-500">owed{limit ? ` · avail ${formatRM(limit - used)}` : ''}</p>}
                      </div>
                    </div>
                    {cc && limit > 0 && <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-2 rounded-full ${used / limit >= 1 ? 'bg-red-500' : used / limit >= 0.7 ? 'bg-orange-500' : 'bg-green-600'}`} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>}
                    <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <Button variant="ghost" onClick={() => openAccount(a)}><Pencil className="h-4 w-4" />Edit</Button>
                      <Button variant="ghost" onClick={() => setRec(a)}><Scale className="h-4 w-4" />Reconcile</Button>
                      <Button variant="ghost" onClick={() => toggleArchive(a)}>{a.status === 'active' ? <><Archive className="h-4 w-4" />Archive</> : <><ArchiveRestore className="h-4 w-4" />Unarchive</>}</Button>
                      <Button variant="ghost" className="text-red-600" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {rec && <Reconcile a={rec} onClose={() => setRec(null)} />}
    </>
  );
}

function Reconcile({ a, onClose }: { a: Account; onClose: () => void }) {
  const f = useFinance()!; const { toast } = useUI();
  const cc = a.type === 'credit_card'; const current = f.balances.get(a.id) ?? 0;
  const [actual, setActual] = useState<number | null>(cc ? -current : current); const [remarks, setRemarks] = useState('');
  const history = f.txns.filter((x) => !x.deletedAt && x.type === 'adjustment' && x.accountId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  const target = actual == null ? null : cc ? -actual : actual;
  return (
    <Modal open onClose={onClose} title={`Reconcile ${a.name}`}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Calculated {cc ? 'amount owed' : 'balance'}: <b>{formatRM(cc ? -current : current)}</b>. Enter the real {cc ? 'amount owed per your statement' : 'balance shown by your bank/app'}; an adjustment transaction will record the difference.</p>
      <div className="mt-3 grid gap-3">
        <Field label={cc ? 'Actual amount owed' : 'Actual balance'}><MoneyInput value={actual} onChange={setActual} allowNegative={!cc} /></Field>
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={200} /></Field>
        {target != null && <p className="text-sm">Adjustment: <b className={target - current >= 0 ? 'text-income' : 'text-expense'}>{formatRM(target - current, { sign: true })}</b></p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={target == null} onClick={async () => { const id = await reconcileAccount(a.id, target!, remarks); toast(id ? 'Balance reconciled' : 'Already matches – no adjustment needed'); onClose(); }}>Reconcile</Button></div>
      </div>
      {history.length > 0 && <div className="mt-4"><h4 className="mb-1 text-xs font-semibold text-slate-500">Adjustment history</h4>
        <ul className="max-h-40 overflow-y-auto text-xs">{history.map((h) => <li key={h.id} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800"><span>{fmtDate(h.date)} · {h.remarks || h.name}</span><span className="tabular-nums">{formatRM(h.amount, { sign: true })}</span></li>)}</ul></div>}
    </Modal>
  );
}
