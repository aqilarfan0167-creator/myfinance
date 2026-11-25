import { useEffect, useState } from 'react';
import { Download, Upload, History } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, PageHeader, Badge, Modal } from '@/components/ui';
import { useUI } from '@/components/UIContext';
import { useT } from '@/lib/i18n';
import { exportAll, getSnapshot, listSnapshots, previewRestore, restore, snapshot, validateBackup, type BackupFile } from '@/db/backup';
import { db, requestPersistence } from '@/db/db';
import { download } from '@/lib/csv';
import { fmtDateTime, todayKL } from '@/lib/date';

export default function BackupPage() {
  const t = useT(); const { toast, confirm } = useUI();
  const snaps = useLiveQuery(() => listSnapshots(), []) ?? [];
  const [persisted, setPersisted] = useState<boolean | null>(null); const [usage, setUsage] = useState('');
  const [pending, setPending] = useState<{ file: BackupFile; preview: ReturnType<typeof previewRestore>; mode: 'merge' | 'replace' } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB used`)).catch(() => {}); }, []);

  const exportJSON = async () => { const d = await exportAll(); download(`myfinance-backup-${todayKL()}.json`, JSON.stringify(d, null, 1), 'application/json'); await db.meta.put({ key: 'lastManualBackup', value: d.exportedAt }); toast('Backup downloaded'); };

  async function onFile(file: File) {
    setErrors([]);
    if (file.size > 200 * 1048576) return setErrors(['File too large (max 200 MB).']);
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { return setErrors(['File is not valid JSON.']); }
    const v = validateBackup(parsed);
    if (!v.ok || !v.file) return setErrors(v.errors);
    setPending({ file: v.file, preview: previewRestore(v.file, await exportAll(), 'merge'), mode: 'merge' });
  }
  async function setMode(mode: 'merge' | 'replace') { if (pending) setPending({ ...pending, mode, preview: previewRestore(pending.file, await exportAll(), mode) }); }
  async function doRestore() {
    if (!pending) return;
    if (pending.mode === 'replace' && !(await confirm({ title: 'Replace all data?', message: 'Current data will be replaced. A safety snapshot is saved first and can be restored from Backup History.', danger: true, confirmText: 'Replace' }))) return;
    await restore(pending.file, pending.mode); setPending(null); toast('Restore complete');
  }

  return (
    <>
      <PageHeader title={t('Backup & Restore')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Manual backup">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Download all accounts, transactions, categories and settings as a JSON file. Keep it somewhere safe (e.g. Google Drive). ZIP backups with receipt images & payslips will be added with the receipt features (Phase 4/6).</p>
          <Button onClick={exportJSON}><Download className="h-4 w-4" />Download JSON backup</Button>
        </Card>
        <Card title="Restore / import">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Backups are validated and previewed before anything changes. <b>Merge</b> keeps the newer version of each record; <b>Replace</b> makes this device match the backup.</p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700"><Upload className="h-4 w-4" />Choose backup file<input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} /></label>
          {errors.length > 0 && <ul className="mt-3 text-sm text-red-600">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        </Card>
        <Card title="Storage">
          <p className="text-sm">Persistent storage: {persisted ? <Badge tone="green">Granted</Badge> : <Badge tone="orange">Not granted</Badge>} <span className="text-slate-500">{usage}</span></p>
          {!persisted && <Button variant="secondary" className="mt-2" onClick={async () => { const ok = await requestPersistence(); setPersisted(ok); toast(ok ? 'Persistent storage granted' : 'Browser declined; install the app or back up regularly', ok ? 'ok' : 'err'); }}>Request persistent storage</Button>}
          <p className="mt-2 text-xs text-slate-500">Data lives in this browser. Clearing site data deletes it — keep regular downloaded backups. Cloud sync arrives in Phase 6.</p>
        </Card>
        <Card title={<span className="flex items-center gap-1"><History className="h-4 w-4" />Backup history (on this device)</span>} action={<Button variant="secondary" onClick={async () => { await snapshot('Manual snapshot'); toast('Snapshot saved'); }}>Snapshot now</Button>}>
          <p className="mb-2 text-xs text-slate-500">A snapshot is taken automatically once a day and before every restore. The last 5 are kept.</p>
          {snaps.length ? <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{snaps.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{fmtDateTime(s.at)}</b> · {s.reason}<br /><span className="text-xs text-slate-500">{s.counts.accounts} accounts · {s.counts.transactions} transactions</span></span>
              <span className="flex gap-1">
                <Button variant="ghost" onClick={async () => { const d = await getSnapshot(s.id); if (d) download(`myfinance-snapshot-${s.at.slice(0, 10)}.json`, JSON.stringify(d), 'application/json'); }}>Download</Button>
                <Button variant="ghost" onClick={async () => { const d = await getSnapshot(s.id); if (d) setPending({ file: d, preview: previewRestore(d, await exportAll(), 'replace'), mode: 'replace' }); }}>Restore</Button>
              </span>
            </li>))}</ul> : <p className="text-sm text-slate-500">No snapshots yet.</p>}
        </Card>
      </div>

      <Modal open={!!pending} onClose={() => setPending(null)} title="Restore preview" wide>
        {pending && <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Backup from {fmtDateTime(pending.file.exportedAt)} (app v{pending.file.appVersion}).</p>
          <div className="mb-3 flex gap-2">{(['merge', 'replace'] as const).map((m) => <Button key={m} variant={pending.mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>{m === 'merge' ? 'Merge' : 'Replace'}</Button>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Table</th><th>In backup</th><th>New</th><th>Updated</th><th>Kept (newer here)</th><th>Removed</th></tr></thead>
            <tbody>{pending.preview.map((r) => <tr key={r.table} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5 capitalize">{r.table}</td><td>{r.incoming}</td><td className="text-income">{r.add}</td><td className="text-transfer">{r.update}</td><td>{r.keep}</td><td className="text-expense">{r.remove}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-xs text-slate-500">A safety snapshot of your current data is saved automatically before restoring.</p>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button><Button variant={pending.mode === 'replace' ? 'danger' : 'primary'} onClick={doRestore}>Restore ({pending.mode})</Button></div>
        </>}
      </Modal>
    </>
  );
}
