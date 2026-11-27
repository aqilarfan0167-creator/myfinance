import { useMemo, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { DateInput, MoneyInput } from './inputs';
import { useFinance } from '@/hooks/useData';
import { useUI } from './UIContext';
import { blankTxn, deleteTransaction, findDuplicates, saveTransaction, ValidationError, type TxnInput } from '@/db/repo';
import { saveRule } from '@/db/commitmentRepo';
import { AttachmentList } from './AttachmentList';
import { FREQUENCIES } from '@/domain/schedule';
import type { Frequency } from '@/db/types';
import type { Transaction, TxnType } from '@/db/types';
import { PAYMENT_METHODS } from '@/lib/labels';
import { ChevronDown } from 'lucide-react';
const MAIN_TYPES: { v: TxnType; label: string }[] = [{ v: 'expense', label: 'Expense' }, { v: 'income', label: 'Income' }, { v: 'transfer', label: 'Transfer' }];
const OTHER_TYPES: { v: TxnType; label: string }[] = [{ v: 'debt_repayment', label: 'Debt repayment' }, { v: 'refund', label: 'Refund' }, { v: 'adjustment', label: 'Adjustment' }];
import { formatRM } from '@/lib/money';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/cn';

export function TransactionForm({ initialType = 'expense', edit, preset, onClose }: { initialType?: TxnType; edit?: Transaction; preset?: Partial<TxnInput>; onClose: () => void }) {
  const f = useFinance();
  const { toast, confirm } = useUI();
  const [t, setT] = useState<TxnInput>(() => (edit ? { ...edit } : { ...blankTxn(initialType), ...preset }));
  const [amount, setAmount] = useState<number | null>(edit ? edit.amount : preset?.amount ?? null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dupes, setDupes] = useState<Transaction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(() => !!edit && !!(edit.remarks || edit.needWant || edit.paymentMethod || edit.fee || edit.attachmentIds.length || (edit.merchant && edit.merchant !== edit.name)));
  const [showOtherTypes, setShowOtherTypes] = useState(false);
  const setType = (v: TxnType) => setT((p) => ({ ...p, type: v, categoryId: null, status: v === 'income' ? p.status : 'actual' }));
  const [repeat, setRepeat] = useState<{ on: boolean; frequency: Frequency; endDate: string; autoPost: boolean }>({ on: false, frequency: 'monthly', endDate: '', autoPost: true });
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
    try {
      if (!edit && repeat.on) {
        // The rule's generator creates this first entry (and future ones) with deterministic IDs – no duplicates.
        const { type, amount: a, fee, categoryId, accountId, toAccountId, merchant, paymentMethod, needWant, remarks } = data;
        await saveRule({ name: data.name || data.merchant || 'Recurring', template: { type, amount: a, fee, categoryId, accountId, toAccountId, merchant, paymentMethod, needWant, remarks },
          frequency: repeat.frequency, startDate: data.date, endDate: repeat.endDate || null, autoPost: repeat.autoPost, active: true });
        toast('Recurring transaction created'); onClose(); return;
      }
      await saveTransaction(data, edit?.id); toast(edit ? 'Transaction updated' : 'Transaction saved'); onClose(); }
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
    <Modal open onClose={onClose} title={edit ? 'Edit transaction' : 'New transaction'}>
      <div className="mb-4 space-y-2">
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {MAIN_TYPES.map((x) => (
            <button key={x.v} type="button" role="radio" aria-checked={t.type === x.v} onClick={() => setType(x.v)}
              className={cn('rounded-lg py-2 text-sm font-semibold transition', t.type === x.v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400')}>{x.label}</button>))}
        </div>
        {(showOtherTypes || OTHER_TYPES.some((x) => x.v === t.type)) ? (
          <div className="flex flex-wrap gap-1.5">{OTHER_TYPES.map((x) => (
            <button key={x.v} type="button" aria-pressed={t.type === x.v} onClick={() => setType(x.v)} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', t.type === x.v ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-slate-950' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300')}>{x.label}</button>))}</div>
        ) : <button type="button" onClick={() => setShowOtherTypes(true)} className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Debt repayment, refund or adjustment…</button>}
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <MoneyInput large autoFocus={!edit} label={t.type === 'adjustment' ? 'Amount (use − to decrease)' : 'Amount'} value={amount} onChange={setAmount} allowNegative={t.type === 'adjustment'} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.type === 'income' || t.type === 'refund' || t.type === 'adjustment' ? 'Into account' : 'From account'}
            error={beforeOpening ? `Date is before this account's opening date (${fmtDate(acc!.openingDate)}); it won't affect the balance.` : undefined}>
            <Select value={t.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}>
              <option value="">Choose account</option>
              {activeAccs.map((a) => <option key={a.id} value={a.id}>{a.name} · {formatRM(f.balances.get(a.id) ?? 0)}</option>)}
            </Select>
          </Field>
          {needsCat && (
            <Field label="Category">
              <Select value={t.categoryId ?? ''} onChange={(e) => onCategory(e.target.value)}>
                <option value="">Choose category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{f.settings.language === 'ms' && c.nameMs ? c.nameMs : c.name}</option>)}
              </Select>
            </Field>
          )}
          {(t.type === 'transfer' || t.type === 'debt_repayment') && (
            <Field label={t.type === 'transfer' ? 'To account' : 'Card or loan (optional)'} hint={t.type === 'debt_repayment' ? 'Repayments are never counted as spending.' : 'Moving money between your accounts isn’t income or spending.'}>
              <Select value={t.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value || null)}>
                <option value="">{t.type === 'transfer' ? 'Choose account' : 'Other lender (not tracked)'}</option>
                {activeAccs.filter((a) => a.id !== t.accountId && (t.type === 'transfer' || a.type === 'credit_card' || a.type === 'loan')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Date"><DateInput value={t.date} onChange={(v) => set('date', v)} /></Field>
          <Field label="Note"><Input list="mf-merchants" value={t.merchant || t.name} placeholder="e.g. Mydin, lunch with team" onChange={(e) => { onMerchant(e.target.value); set('name', e.target.value); }} maxLength={120} />
            <datalist id="mf-merchants">{merchants.map((m) => <option key={m} value={m} />)}</datalist></Field>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            More details <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', more && 'rotate-180')} />
          </button>
          {more && <div className="grid gap-4 border-t border-slate-200/80 p-4 sm:grid-cols-2 dark:border-slate-800">
            <Field label="Time"><Input type="time" value={t.time} onChange={(e) => set('time', e.target.value)} /></Field>
            {t.type === 'income' && (
              <Field label="Status" hint="Expected income doesn’t count until you mark it received.">
                <Select value={t.status} onChange={(e) => set('status', e.target.value as 'actual' | 'expected')}><option value="actual">Received</option><option value="expected">Expected (not yet received)</option></Select>
              </Field>)}
            {(t.type === 'expense' || t.type === 'refund') && (
              <Field label="Need or want?">
                <Select value={t.needWant ?? ''} onChange={(e) => set('needWant', (e.target.value || null) as TxnInput['needWant'])}><option value="">Not set</option><option value="need">Need</option><option value="want">Want</option></Select>
              </Field>)}
            {t.type !== 'adjustment' && (
              <Field label="Paid with">
                <Select value={t.paymentMethod ?? ''} onChange={(e) => set('paymentMethod', (e.target.value || null) as TxnInput['paymentMethod'])}><option value="">Not set</option>{PAYMENT_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</Select>
              </Field>)}
            {t.type === 'transfer' && <Field label="Transfer fee"><MoneyInput value={t.fee || null} onChange={(c) => set('fee', c ?? 0)} /></Field>}
            <Field label="Merchant (if different from note)"><Input value={t.merchant} onChange={(e) => onMerchant(e.target.value)} maxLength={120} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={t.remarks} onChange={(e) => set('remarks', e.target.value)} maxLength={2000} /></Field>
            {!edit && ['income', 'expense', 'transfer', 'debt_repayment'].includes(t.type) && t.status === 'actual' && (
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={repeat.on} onChange={(e) => setRepeat({ ...repeat, on: e.target.checked })} />Repeat this transaction</label>
                {repeat.on && <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Select value={repeat.frequency} onChange={(e) => setRepeat({ ...repeat, frequency: e.target.value as Frequency })} aria-label="Frequency">{FREQUENCIES.map((q) => <option key={q.v} value={q.v}>{q.label}</option>)}</Select>
                  <DateInput value={repeat.endDate} onChange={(v) => setRepeat({ ...repeat, endDate: v })} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={repeat.autoPost} onChange={(e) => setRepeat({ ...repeat, autoPost: e.target.checked })} />Record automatically</label>
                  <p className="text-xs text-slate-500 sm:col-span-3">End date is optional. Turn off “record automatically” to confirm each one yourself.</p>
                </div>}
              </div>)}
            {edit && <div className="sm:col-span-2"><AttachmentList txnId={edit.id} /></div>}
          </div>}
        </div>

        {t.related.some((r) => r.kind === 'occurrence') && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">Linked to a commitment payment – it will be marked as paid.{!edit && <button type="button" className="ml-2 underline" onClick={() => set('related', t.related.filter((r) => r.kind !== 'occurrence' && r.kind !== 'commitment'))}>Unlink</button>}</p>}
        {errors.length > 0 && <ul className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {dupes && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
            <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" /> Possible duplicate</p>
            <ul className="mt-1">{dupes.map((d) => <li key={d.id}>{fmtDate(d.date)} · {d.name} · {formatRM(d.amount)}</li>)}</ul>
            <div className="mt-2 flex gap-2"><Button type="button" variant="secondary" onClick={() => setDupes(null)}>Review</Button><Button type="button" onClick={() => submit(true)}>Save anyway</Button></div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {edit ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
        </div>
      </form>
    </Modal>
  );
}
