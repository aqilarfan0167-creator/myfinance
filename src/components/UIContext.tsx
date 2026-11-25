import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Button, Modal } from './ui';
import { TransactionForm } from './TransactionForm';
import { AccountForm } from './AccountForm';
import type { Account, Transaction, TxnType } from '@/db/types';

interface ConfirmOpts { title: string; message: ReactNode; confirmText?: string; danger?: boolean }
interface UI {
  toast: (msg: string, tone?: 'ok' | 'err') => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  openTxn: (o: { type?: TxnType; edit?: Transaction }) => void;
  openAccount: (edit?: Account) => void;
}
const Ctx = createContext<UI>(null!);
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: string }[]>([]);
  const [conf, setConf] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null);
  const [txn, setTxn] = useState<{ type?: TxnType; edit?: Transaction } | null>(null);
  const [acc, setAcc] = useState<{ edit?: Account } | null>(null);

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConf({ ...o, resolve })), []);
  const close = (v: boolean) => { conf?.resolve(v); setConf(null); };

  return (
    <Ctx.Provider value={{ toast, confirm, openTxn: setTxn, openAccount: (edit) => setAcc({ edit }) }}>
      {children}
      {txn && <TransactionForm key={txn.edit?.id ?? txn.type} initialType={txn.type} edit={txn.edit} onClose={() => setTxn(null)} />}
      {acc && <AccountForm edit={acc.edit} onClose={() => setAcc(null)} />}
      <Modal open={!!conf} onClose={() => close(false)} title={conf?.title ?? ''}>
        <div className="text-sm text-slate-600 dark:text-slate-300">{conf?.message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
          <Button variant={conf?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{conf?.confirmText ?? 'Confirm'}</Button>
        </div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm text-white shadow-lg ${t.tone === 'err' ? 'bg-red-600' : 'bg-slate-800'}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
