import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useFinance } from '@/hooks/useData';
import { useT } from '@/lib/i18n';
import { useUI } from '@/components/UIContext';
import { Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Badge } from '@/components/ui';
import { IconBadge, ICONS } from '@/components/Icon';
import { saveCategory, updateSettings } from '@/db/repo';
import { loadDemo, clearDemo } from '@/db/demo';
import type { Category } from '@/db/types';
import { APP_VERSION, SCHEMA_VERSION } from '@/db/db';

export default function SettingsPage() {
  const f = useFinance(); const t = useT(); const { toast, confirm } = useUI();
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null); const [busy, setBusy] = useState(false);
  if (!f) return <Loading />;
  const s = f.settings;

  return (
    <>
      <PageHeader title={t('Settings')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Preferences">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Language')}><Select value={s.language} onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'ms' })}><option value="en">English</option><option value="ms">Bahasa Melayu</option></Select></Field>
            <Field label={t('Theme')}><Select value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'light' })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field>
            <Field label="Salary day of month" hint="Used for days-to-salary and daily allowance"><Input type="number" min={1} max={31} value={s.payDay} onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 31) updateSettings({ payDay: v }); }} /></Field>
            <div className="text-sm text-slate-500"><p>Currency: <b>MYR (RM)</b></p><p>Date format: <b>DD/MM/YYYY</b></p><p>Timezone: <b>Asia/Kuala_Lumpur</b></p></div>
          </div>
        </Card>
        <Card title="Demo data">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Your database starts empty. Demo data is optional, labelled “[Demo]”, and can be removed without affecting your own records.</p>
          {s.demoLoaded
            ? <Button variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: 'Remove demo data?', message: 'Only demo accounts and transactions will be removed.', danger: true })) { setBusy(true); try { await clearDemo(); toast('Demo data removed'); } catch (e) { toast((e as Error).message, 'err'); } setBusy(false); } }}>Remove demo data</Button>
            : <Button disabled={busy} onClick={async () => { setBusy(true); await loadDemo(); setBusy(false); toast('Demo data loaded'); }}>{busy ? 'Loading…' : 'Load demo data'}</Button>}
        </Card>
        <Card title="Categories" className="lg:col-span-2" action={<Button variant="secondary" onClick={() => setEditCat({ kind: 'expense', color: '#0f766e', icon: 'Tag', needWant: null, archived: false, name: '' })}><Plus className="h-4 w-4" />Custom category</Button>}>
          {(['expense', 'income'] as const).map((k) => (
            <div key={k} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{k}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {f.cats.filter((c) => c.kind === k).map((c) => (
                  <button key={c.id} onClick={() => setEditCat(c)} className={`flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${c.archived ? 'opacity-50' : ''}`}>
                    <IconBadge name={c.icon} color={c.color} /><span className="flex-1 truncate">{s.language === 'ms' && c.nameMs ? c.nameMs : c.name}</span>
                    {c.needWant && <Badge tone={c.needWant === 'need' ? 'green' : 'orange'}>{c.needWant}</Badge>}{!c.system && <Badge tone="blue">custom</Badge>}{c.archived && <Badge>archived</Badge>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <Card title="Receipt scanning (OCR)">
          <p className="text-sm text-slate-600 dark:text-slate-400">Receipts and payslips are read <b>on this device</b> with Tesseract.js (English + Bahasa Melayu) and PDF.js. Files and text are never sent to a server. Free, no account needed.</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400"><b>AI Vision (optional): not enabled.</b> Cloud AI can read difficult receipts more accurately, but it requires a secure backend you control, has per-image costs, and would send your financial documents to a third party. It will only be offered with an explicit opt-in and cost disclosure; no keys are ever stored in this app.</p>
        </Card>
        <Card title="About"><p className="text-sm text-slate-500">MyFinance v{APP_VERSION} · database schema v{SCHEMA_VERSION} · storage: this device (IndexedDB). Cloud sync via Supabase is planned for Phase 6.</p></Card>
      </div>
      {editCat && <CategoryModal c={editCat} onClose={() => setEditCat(null)} />}
    </>
  );
}

function CategoryModal({ c, onClose }: { c: Partial<Category>; onClose: () => void }) {
  const { toast } = useUI(); const [v, setV] = useState(c); const [err, setErr] = useState('');
  const set = <K extends keyof Category>(k: K, x: Category[K]) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Modal open onClose={onClose} title={c.id ? 'Edit category' : 'New category'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English)"><Input value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={60} /></Field>
        <Field label="Name (Bahasa Melayu)"><Input value={v.nameMs ?? ''} onChange={(e) => set('nameMs', e.target.value)} maxLength={60} /></Field>
        <Field label="Kind"><Select value={v.kind} disabled={!!c.id} onChange={(e) => set('kind', e.target.value as Category['kind'])}><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
        <Field label="Default Needs/Wants"><Select value={v.needWant ?? ''} onChange={(e) => set('needWant', (e.target.value || null) as Category['needWant'])}><option value="">None</option><option value="need">Need</option><option value="want">Want</option></Select></Field>
        <Field label="Icon"><Select value={v.icon} onChange={(e) => set('icon', e.target.value)}>{Object.keys(ICONS).map((i) => <option key={i}>{i}</option>)}</Select></Field>
        <Field label="Colour"><Input type="color" value={v.color} onChange={(e) => set('color', e.target.value)} className="h-10 p-1" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.archived} onChange={(e) => set('archived', e.target.checked)} />Archived (hidden from new transactions)</label>
        {err && <p className="text-sm text-red-600 sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { try { const { id, createdAt: _c, updatedAt: _u, system: _s, ...rest } = v as Category; await saveCategory({ ...rest, nameMs: rest.nameMs ?? '' }, id); toast('Category saved'); onClose(); } catch (e) { setErr((e as Error).message); } }}>Save</Button></div>
      </div>
    </Modal>
  );
}
