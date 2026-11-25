import { useState } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { DateInput, MoneyInput } from './inputs';
import { useUI } from './UIContext';
import { saveAccount, ValidationError, type AccountInput } from '@/db/repo';
import { isLiability, type Account, type AccountType, type LoanInfo } from '@/db/types';
import { ACCOUNT_TYPES } from '@/lib/labels';
import { todayKL } from '@/lib/date';

const COLORS = ['#0f766e', '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#ca8a04', '#0891b2', '#db2777', '#475569'];

export function AccountForm({ edit, onClose }: { edit?: Account; onClose: () => void }) {
  const { toast } = useUI();
  const [a, setA] = useState<AccountInput>(() => edit ? { ...edit } : { name: '', type: 'bank', openingBalance: 0, openingDate: todayKL(), icon: 'Landmark', color: COLORS[0], status: 'active', lowBalanceThreshold: null, includeInAvailable: true, includeInNetWorth: true, creditLimit: null, statementDay: null, dueDay: null, notes: '' });
  const isCC = a.type === 'credit_card'; const isLoan = a.type === 'loan'; const isLiab = isLiability(a.type);
  // credit card opening is entered as positive outstanding, stored negative
  const [opening, setOpening] = useState<number | null>(edit ? (isLiab ? -edit.openingBalance : edit.openingBalance) : 0);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => setA((p) => ({ ...p, [k]: v }));

  const onType = (type: AccountType) => setA((p) => ({ ...p, type, icon: ACCOUNT_TYPES.find((x) => x.v === type)!.icon,
    includeInAvailable: type === 'bank' || type === 'cash' || type === 'ewallet' }));
  const [loan, setLoan] = useState<LoanInfo>(() => edit?.loan ?? { lender: '', loanType: 'car', originalAmount: 0, annualRate: 0, rateType: 'reducing', instalment: 0, targetDate: null });
  const setL = <K extends keyof LoanInfo>(k: K, v: LoanInfo[K]) => setLoan((p) => ({ ...p, [k]: v }));

  async function submit() {
    if (opening == null) return setErrors(['Opening balance is invalid.']);
    try { await saveAccount({ ...a, openingBalance: isLiab ? -Math.abs(opening) : opening, loan: isLoan ? loan : null }, edit?.id); toast(edit ? 'Account updated' : 'Account created'); onClose(); }
    catch (e) { setErrors(e instanceof ValidationError ? e.errors : [(e as Error).message]); }
  }

  return (
    <Modal open onClose={onClose} title={edit ? 'Edit Account' : 'Add Account'}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Account name" className="sm:col-span-2"><Input value={a.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Maybank Savings, Touch 'n Go" autoFocus /></Field>
        <Field label="Type"><Select value={a.type} onChange={(e) => onType(e.target.value as AccountType)}>{ACCOUNT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</Select></Field>
        <Field label="Status"><Select value={a.status} onChange={(e) => set('status', e.target.value as Account['status'])}><option value="active">Active</option><option value="archived">Archived</option></Select></Field>
        <Field label={isLiab ? 'Outstanding balance at opening' : 'Opening balance'} hint={isCC ? 'Amount owed on the card' : isLoan ? (loan.rateType === 'flat' ? 'Remaining total payable (incl. interest) from your statement' : 'Remaining principal from your statement') : 'Can be negative for overdrafts'}>
          <MoneyInput value={opening} onChange={setOpening} allowNegative={!isLiab} />
        </Field>
        <Field label="Opening date" hint="Transactions before this date don't affect the balance"><DateInput value={a.openingDate} onChange={(v) => set('openingDate', v)} /></Field>
        {isCC ? (<>
          <Field label="Credit limit"><MoneyInput value={a.creditLimit ?? null} onChange={(c) => set('creditLimit', c)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Statement day"><Input type="number" min={1} max={31} value={a.statementDay ?? ''} onChange={(e) => set('statementDay', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Due day"><Input type="number" min={1} max={31} value={a.dueDay ?? ''} onChange={(e) => set('dueDay', e.target.value ? Number(e.target.value) : null)} /></Field>
          </div>
        </>) : isLoan ? (<>
          <Field label="Lender"><Input value={loan.lender} onChange={(e) => setL('lender', e.target.value)} maxLength={80} placeholder="e.g. Maybank, PTPTN" /></Field>
          <Field label="Loan type"><Select value={loan.loanType} onChange={(e) => setL('loanType', e.target.value as LoanInfo['loanType'])}>{[['car', 'Car / hire purchase'], ['housing', 'Housing'], ['ptptn', 'PTPTN'], ['mara', 'MARA'], ['personal', 'Personal'], ['other', 'Other']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Original loan amount"><MoneyInput value={loan.originalAmount || null} onChange={(c) => setL('originalAmount', c ?? 0)} /></Field>
          <Field label="Monthly instalment"><MoneyInput value={loan.instalment || null} onChange={(c) => setL('instalment', c ?? 0)} /></Field>
          <Field label="Interest / profit rate (% p.a.)"><Input type="number" step="0.01" min={0} max={100} value={loan.annualRate} onChange={(e) => setL('annualRate', Math.max(0, Number(e.target.value)))} /></Field>
          <Field label="Rate type" hint={loan.rateType === 'flat' ? 'Balance already includes all interest (typical car hire purchase).' : 'Interest is charged monthly on the remaining principal.'}>
            <Select value={loan.rateType} onChange={(e) => setL('rateType', e.target.value as LoanInfo['rateType'])}><option value="reducing">Reducing balance</option><option value="flat">Flat rate (total payable)</option></Select></Field>
          <Field label="Target settlement date (optional)"><DateInput value={loan.targetDate ?? ''} onChange={(v) => setL('targetDate', v || null)} /></Field>
          <Field label="Due day of month"><Input type="number" min={1} max={31} value={a.dueDay ?? ''} onChange={(e) => set('dueDay', e.target.value ? Number(e.target.value) : null)} /></Field>
        </>) : (
          <Field label="Low balance alert below"><MoneyInput value={a.lowBalanceThreshold} onChange={(c) => set('lowBalanceThreshold', c)} placeholder="None" /></Field>
        )}
        <Field label="Colour" className={isCC || isLoan ? 'sm:col-span-2' : ''}>
          <div className="flex flex-wrap gap-2 py-1">{COLORS.map((c) => <button type="button" key={c} aria-label={c} onClick={() => set('color', c)} className={`h-7 w-7 rounded-full ${a.color === c ? 'ring-2 ring-offset-2 ring-slate-500' : ''}`} style={{ background: c }} />)}</div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={a.includeInAvailable && !isLiab} disabled={isLiab} onChange={(e) => set('includeInAvailable', e.target.checked)} /> Include in available spending balance</label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={a.includeInNetWorth} onChange={(e) => set('includeInNetWorth', e.target.checked)} /> Include in net worth</label>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={1000} /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">MyFinance never asks for online banking credentials and does not connect to banks. Balances are calculated from transactions you record.</p>
        {errors.length > 0 && <ul className="text-sm text-red-600 sm:col-span-2">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
      </form>
    </Modal>
  );
}
