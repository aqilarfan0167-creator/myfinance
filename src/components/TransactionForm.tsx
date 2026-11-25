import { useMemo, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { DateInput, MoneyInput } from './inputs';
import { useFinance } from '@/hooks/useData';
import { useUI } from './UIContext';
import { blankTxn, deleteTransaction, findDuplicates, saveTransaction, ValidationError, type TxnInput } from '@/db/repo';
import type { Transaction, TxnType } from '@/db/types';
import { PAYMENT_METHODS, TXN_TYPES } from '@/lib/labels';
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/cn';

export function TransactionForm({ initialType = 'expense', edit, onClose }: { initialType?: TxnType; edit?: Transaction; onClose: () => void }) {
  const f = useFinance();
  const { toast, confirm } = useUI();
  const [t, setT] = useState<TxnInput>(() => (edit ? { ...edit } : blankTxn(initialType)));
  const [amount, setAmount] = useState<number | null>(edit ? edit.amount : null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dupes, setDupes] = useState<Transaction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TxnInput>(k: K, v: TxnInput[K]) => setT((p) => ({ ...p, [k]: v }));

  const merchants = useMemo(() => [...new Set((f?.txns ?? []).filter((x) => !x.deletedAt && x.merchant).map((x) => x.merchant))].slice(0, 300), [f?.txns]);
  if (!f) return null;
  const activeAccs = f.accounts.filter((a) => a.status === 'active' || a.id === t.accountId || a.id === t.toAccountId);
  const catKind = t.type === 'income' ? 'income' : 'expense';
  const cats = f.cats.filter((c) => c.kind === catKind && (!c.archived || c.id === t.categoryId));
  const needsCat = ['income', 'expense', 'refund'].includes(t.type);
  const acc = t.accountId ? f.accMap.get(t.accountId) : undefined;
  const beforeOpening = acc && t.date && t.date < acc.openingDate;

  const onMerchant = (m: string) => {
    set('merchant', m);
    const learned = f.settings.merchantCategory[m.trim().toLowerCase()];
    if (learned && !t.categoryId && f.catMap.get(learned)?.kind === catKind) onCategory(learned);
  };
  const onCategory = (id: string) => { setT((p) => ({ ...p, categoryId: id || null, needWant: p.needWant ?? f.catMap.get(id)?.needWant ?? null })); };

  async function submit(force = false) {
    if (amount == null) { setErrors(['Please enter a valid amount (max 2 decimal places).']); return; }
    const data = { ...t, amount, categoryId: needsCat ? t.categoryId : null };
    if (!force) {
      const d = await findDuplicates(data, edit?.id);
      if (d.length) { setDupes(d); return; }
    }
    setBusy(true);
    try { await saveTransaction(data, edit?.id); toast(edit ? 'Transaction updated' : 'Transaction saved'); onClose(); }
    catch (e) { setErrors(e instanceof ValidationError ? e.errors : [String((e as Error).message)]); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!edit) return;
    if (await confirm({ title: 'Delete transaction?', message: `"${edit.name}" (${formatRM(edit.amount)}) will be removed and balances recalculated.`, confirmText: 'Delete', danger: true })) {
      await deleteTransaction(edit.id); toast('Transaction deleted'); onClose();
    }
  }

  return (
    <Modal open onClose={onClose} title={edit ? 'Edit Transaction' : 'New Transaction'} wide>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TXN_TYPES.map((x) => (
          <button key={x.v} type="button" onClick={() => setT((p) => ({ ...p, type: x.v, categoryId: null, status: x.v === 'income' ? p.status : 'actual' }))}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', t.type === x.v ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300')}>{x.label}</button>
        ))}
      </div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t.type === 'adjustment' ? 'Amount (use - to decrease)' : 'Amount'}><MoneyInput value={amount} onChange={setAmount} allowNegative={t.type === 'adjustment'} /></Field>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Date"><DateInput value={t.date} onChange={(v) => set('date', v)} /></Field>
          <Field label="Time"><Input type="time" value={t.time} onChange={(e) => set('time', e.target.value)} /></Field>
        </div>
        {t.type === 'income' && (
          <Field label="Status" hint="Expected income does not affect balances until confirmed received." className="sm:col-span-2">
            <Select value={t.status} onChange={(e) => set('status', e.target.value as 'actual' | 'expected')}>
              <option value="actual">Received (actual)</option><option value="expected">Expected (not yet received)</option>
            </Select>
          </Field>
        )}
        <Field label={t.type === 'income' || t.type === 'refund' || t.type === 'adjustment' ? 'Account (received into)' : 'From account'}
          error={beforeOpening ? `Date is before this account's opening date (${fmtDate(acc!.openingDate)}); it won't affect the balance.` : undefined}>
          <Select value={t.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}>
            <option value="">— Select account —</option>
            {activeAccs.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatRM(f.balances.get(a.id) ?? 0)})</option>)}
          </Select>
        </Field>
        {(t.type === 'transfer' || t.type === 'debt_repayment') && (
          <Field label={t.type === 'transfer' ? 'To account' : 'Credit card / liability account (optional)'} hint={t.type === 'debt_repayment' ? 'Leave empty for external loans (e.g. PTPTN). Card repayments are not counted as expenses again.' : 'Internal transfers are not income or expenses.'}>
            <Select value={t.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value || null)}>
              <option value="">{t.type === 'transfer' ? '— Select account —' : '— External lender —'}</option>
              {activeAccs.filter((a) => a.id !== t.accountId && (t.type === 'transfer' || a.type === 'credit_card')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        {t.type === 'transfer' && <Field label="Transfer fee (optional)"><MoneyInput value={t.fee || null} onChange={(c) => set('fee', c ?? 0)} /></Field>}
        <Field label="Merchant / Payer">
          <Input list="mf-merchants" value={t.merchant} onChange={(e) => onMerchant(e.target.value)} maxLength={120} />
          <datalist id="mf-merchants">{merchants.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Name / Description"><Input value={t.name} onChange={(e) => set('name', e.target.value)} maxLength={200} placeholder="Optional" /></Field>
        {needsCat && (
          <Field label="Category">
            <Select value={t.categoryId ?? ''} onChange={(e) => onCategory(e.target.value)}>
              <option value="">— Select category —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{f.settings.language === 'ms' && c.nameMs ? c.nameMs : c.name}</option>)}
            </Select>
          </Field>
        )}
        {(t.type === 'expense' || t.type === 'refund') && (
          <Field label="Needs / Wants">
            <Select value={t.needWant ?? ''} onChange={(e) => set('needWant', (e.target.value || null) as TxnInput['needWant'])}>
              <option value="">Unclassified</option><option value="need">Need</option><option value="want">Want</option>
            </Select>
          </Field>
        )}
        {t.type !== 'adjustment' && (
          <Field label="Payment method">
            <Select value={t.paymentMethod ?? ''} onChange={(e) => set('paymentMethod', (e.target.value || null) as TxnInput['paymentMethod'])}>
              <option value="">—</option>{PAYMENT_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={t.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={2000} /></Field>

        {errors.length > 0 && <ul className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2 dark:bg-red-950/40 dark:text-red-300">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {dupes && (
          <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 sm:col-span-2 dark:bg-orange-950/40 dark:text-orange-200">
            <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" /> Possible duplicate</p>
            <ul className="mt-1">{dupes.map((d) => <li key={d.id}>{fmtDate(d.date)} · {d.name} · {formatRM(d.amount)}</li>)}</ul>
            <div className="mt-2 flex gap-2"><Button type="button" variant="secondary" onClick={() => setDupes(null)}>Review</Button><Button type="button" onClick={() => submit(true)}>Save anyway</Button></div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2 sm:col-span-2">
          {edit ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
        </div>
      </form>
    </Modal>
  );
}
