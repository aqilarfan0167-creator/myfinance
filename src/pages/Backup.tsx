import { useEffect, useState } from 'react';
import { Download, Upload, History, FolderSync, FileArchive, FileJson, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, PageHeader, Badge, Modal } from '@/components/ui';
import { useUI } from '@/components/UIContext';
import { useT } from '@/lib/i18n';
import { CsvImport } from '@/components/CsvImport';
import { exportAll, getSnapshot, listSnapshots, previewRestore, restore, snapshot, validateBackup, type BackupFile } from '@/db/backup';
import { buildZip, logBackup, previewZip, readZip, restoreZip, type BackupLog, type ParsedZip } from '@/db/zipBackup';
import { listPreUpgradeSnapshots } from '@/db/preUpgrade';
import { chooseBackupFolder, folderBackupSupported, folderStatus, forgetFolder, reconnectFolder, runFolderBackup } from '@/lib/folderBackup';
import { db, requestPersistence } from '@/db/db';
import { download } from '@/lib/csv';
import { downloadBlob } from '@/lib/files';
import { fmtDateTime, todayKL } from '@/lib/date';

type Pending = { kind: 'json'; file: BackupFile } | { kind: 'zip'; zip: ParsedZip };
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export default function BackupPage() {
  const t = useT(); const { toast, confirm } = useUI();
  const snaps = useLiveQuery(() => listSnapshots(), []) ?? [];
  const history = (useLiveQuery(() => db.meta.get('backupHistory'), [])?.value as BackupLog[] | undefined) ?? [];
  const [pre, setPre] = useState<Awaited<ReturnType<typeof listPreUpgradeSnapshots>>>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null); const [usage, setUsage] = useState('');
  const [pending, setPending] = useState<(Pending & { mode: 'merge' | 'replace'; preview: ReturnType<typeof previewRestore>; files?: { inBackup: number; new: number } }) | null>(null);
  const [errors, setErrors] = useState<string[]>([]); const [busy, setBusy] = useState(''); const [csv, setCsv] = useState(false);
  const [folder, setFolder] = useState<Awaited<ReturnType<typeof folderStatus>>>(null);
  const refreshFolder = () => folderStatus().then(setFolder).catch(() => setFolder(null));

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage(`${size(e.usage ?? 0)} used of ${size(e.quota ?? 0)}`)).catch(() => {});
    listPreUpgradeSnapshots().then(setPre); refreshFolder();
  }, []);

  const exportZip = async () => { setBusy('zip'); try { const { bytes, manifest, fileName } = await buildZip(); downloadBlob(new Blob([bytes as unknown as ArrayBuffer], { type: 'application/zip' }), fileName);
    await logBackup({ at: new Date().toISOString(), kind: 'zip', fileName, size: bytes.byteLength, records: Object.entries(manifest.counts).filter(([k]) => k !== 'files').reduce((a, [, v]) => a + v, 0), files: manifest.counts.files }); toast('Full backup downloaded'); }
    catch (e) { toast(`Backup failed: ${(e as Error).message}`, 'err'); } finally { setBusy(''); } };
  const exportJSON = async () => { const d = await exportAll(); const s = JSON.stringify(d, null, 1); const fileName = `myfinance-data-${todayKL()}.json`; download(fileName, s, 'application/json');
    await logBackup({ at: d.exportedAt, kind: 'json', fileName, size: s.length, records: Object.values(d.data).reduce((a, v) => a + (v as unknown[]).length, 0), files: 0 }); toast('Data backup downloaded (without files)'); };

  async function onFile(file: File) {
    setErrors([]); if (file.size > 1024 * 1048576) return setErrors(['File too large (max 1 GB).']);
    setBusy('read');
    try {
      if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
        const zip = await readZip(new Uint8Array(await file.arrayBuffer())); if (zip.problems.length) setErrors(zip.problems);
        const pv = await previewZip(zip, 'merge'); setPending({ kind: 'zip', zip, mode: 'merge', preview: pv.rows, files: pv.files });
      } else {
        let parsed: unknown; try { parsed = JSON.parse(await file.text()); } catch { throw new Error('File is not a valid MyFinance JSON or ZIP backup.'); }
        const v = validateBackup(parsed); if (!v.ok || !v.file) { setErrors(v.errors); return; }
        setPending({ kind: 'json', file: v.file, mode: 'merge', preview: previewRestore(v.file, await exportAll(), 'merge') });
      }
    } catch (e) { setErrors([(e as Error).message]); } finally { setBusy(''); }
  }
  async function setMode(mode: 'merge' | 'replace') {
    if (!pending) return;
    if (pending.kind === 'zip') { const pv = await previewZip(pending.zip, mode); setPending({ ...pending, mode, preview: pv.rows, files: pv.files }); }
    else setPending({ ...pending, mode, preview: previewRestore(pending.file, await exportAll(), mode) });
  }
  async function doRestore() {
    if (!pending) return;
    if (pending.mode === 'replace' && !(await confirm({ title: 'Replace all data?', message: 'Records on this device will be replaced by the backup. A safety snapshot is saved first (Backup history). Files already on this device are kept.', danger: true, confirmText: 'Replace' }))) return;
    setBusy('restore');
    try { if (pending.kind === 'zip') { const r = await restoreZip(pending.zip, pending.mode); toast(`Restore complete · ${r.restoredFiles} file(s) restored`); } else { await restore(pending.file, pending.mode); toast('Restore complete'); } setPending(null); }
    catch (e) { toast(`Restore failed – nothing was changed: ${(e as Error).message}`, 'err'); } finally { setBusy(''); }
  }
  const backupFile = (pending?.kind === 'zip' ? pending.zip.file : pending?.file);

  return (
    <>
      <PageHeader title={t('Backup & Restore')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><FileArchive className="h-4 w-4" />Back up</span>}>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400"><b>Full backup (ZIP)</b> contains every record, setting and file – receipt images, PDFs and payslips – with checksums. Keep it somewhere safe (e.g. Google Drive).</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportZip} disabled={!!busy}><Download className="h-4 w-4" />{busy === 'zip' ? 'Creating…' : 'Download full backup (ZIP)'}</Button>
            <Button variant="secondary" onClick={exportJSON}><FileJson className="h-4 w-4" />Data only (JSON)</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Spreadsheet exports (Excel/CSV/PDF) are in Reports.</p>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Upload className="h-4 w-4" />Restore</span>}>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Choose a MyFinance <b>.zip</b> or <b>.json</b> backup. It is checked and previewed before anything changes. <b>Merge</b> keeps the newer version of each record; <b>Replace</b> makes this device match the backup.</p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700"><Upload className="h-4 w-4" />{busy === 'read' ? 'Checking…' : 'Choose backup file'}<input type="file" accept=".zip,application/zip,application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} /></label>
          {errors.length > 0 && <ul className="mt-3 text-sm text-red-600">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Import transactions (CSV)</span>}>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Import a bank statement or spreadsheet. You map the columns, see every row validated, and possible duplicates are unticked before anything is saved.</p>
          <Button variant="secondary" onClick={() => setCsv(true)}><Upload className="h-4 w-4" />Import CSV</Button>
        </Card>
        <Card title={<span className="flex items-center gap-2"><FolderSync className="h-4 w-4" />Automatic backup to a folder</span>}>
          {!folderBackupSupported() ? <p className="text-sm text-slate-600 dark:text-slate-400">Not supported in this browser (needs Chrome or Edge on a computer). MyFinance still keeps a daily snapshot on this device and reminds you to download backups.</p>
            : !folder ? <><p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Pick a folder (e.g. inside Google Drive or OneDrive). A full ZIP is saved there once a day when MyFinance is open; the newest 10 are kept.</p>
              <Button variant="secondary" onClick={async () => { try { const n = await chooseBackupFolder(); toast(`Backups will be saved to "${n}"`); await runFolderBackup(true); refreshFolder(); } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'err'); } }}>Choose folder</Button></>
              : <div className="space-y-2 text-sm"><p>Folder: <b>{folder.name}</b> · {folder.permission === 'granted' ? <Badge tone="green">active</Badge> : <Badge tone="orange">needs permission</Badge>}</p>
                <p className="text-xs text-slate-500">Last automatic backup: {folder.last ? fmtDateTime(folder.last) : 'never'} · every {folder.everyDays} day(s)</p>
                <div className="flex flex-wrap gap-2">
                  {folder.permission !== 'granted' && <Button onClick={async () => { if (await reconnectFolder()) { toast('Folder reconnected'); await runFolderBackup(); } refreshFolder(); }}>Allow access</Button>}
                  <Button variant="secondary" disabled={!!busy} onClick={async () => { setBusy('folder'); const r = await runFolderBackup(true).catch((e) => { toast((e as Error).message, 'err'); return null; }); setBusy(''); if (r === 'written') toast('Backup saved to folder'); if (r === 'needs-permission') toast('Allow access to the folder first', 'err'); refreshFolder(); }}>Back up now</Button>
                  <Button variant="ghost" onClick={async () => { await forgetFolder(); refreshFolder(); }}>Stop</Button>
                </div></div>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Storage & update safety</span>}>
          <p className="text-sm">Persistent storage: {persisted ? <Badge tone="green">Granted</Badge> : <Badge tone="orange">Not granted</Badge>} <span className="text-slate-500">{usage}</span></p>
          {!persisted && <Button variant="secondary" className="mt-2" onClick={async () => { const ok = await requestPersistence(); setPersisted(ok); toast(ok ? 'Persistent storage granted' : 'Browser declined; install the app or keep regular backups', ok ? 'ok' : 'err'); }}>Request persistent storage</Button>}
          <p className="mt-2 text-xs text-slate-500">App updates never delete data: database changes are additive, and before any database upgrade a full copy of your records is saved on this device.</p>
          {pre.length > 0 && <ul className="mt-2 text-xs">{pre.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-1">Before upgrade v{s.fromVersion} → v{s.toVersion} · {fmtDateTime(s.at)}
            <Button variant="ghost" onClick={() => download(`myfinance-pre-upgrade-v${s.fromVersion}-${s.at.slice(0, 10)}.json`, JSON.stringify(s), 'application/json')}>Download</Button></li>)}</ul>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4" />Backup history</span>} action={<Button variant="secondary" onClick={async () => { await snapshot('Manual snapshot'); toast('Snapshot saved'); }}>Snapshot now</Button>}>
          <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Downloaded backups</h3>
          {history.length ? <ul className="mb-3 max-h-40 overflow-auto text-xs">{history.map((h, i) => <li key={i} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800"><span>{fmtDateTime(h.at)} · {h.kind === 'folder' ? 'auto (folder)' : h.kind.toUpperCase()} · {h.records} records{h.files ? ` · ${h.files} files` : ''}</span><span>{size(h.size)}</span></li>)}</ul> : <p className="mb-3 text-xs text-slate-500">No backups downloaded yet.</p>}
          <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Snapshots on this device (records only)</h3>
          <p className="mb-2 text-xs text-slate-500">Taken daily and before every restore or import. The last 5 are kept.</p>
          {snaps.length ? <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{snaps.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{fmtDateTime(s.at)}</b> · {s.reason}<br /><span className="text-xs text-slate-500">{s.counts.accounts} accounts · {s.counts.transactions} transactions</span></span>
              <span className="flex gap-1">
                <Button variant="ghost" onClick={async () => { const d = await getSnapshot(s.id); if (d) download(`myfinance-snapshot-${s.at.slice(0, 10)}.json`, JSON.stringify(d), 'application/json'); }}>Download</Button>
                <Button variant="ghost" onClick={async () => { const d = await getSnapshot(s.id); if (d) setPending({ kind: 'json', file: d, mode: 'replace', preview: previewRestore(d, await exportAll(), 'replace') }); }}>Restore</Button>
              </span></li>))}</ul> : <p className="text-sm text-slate-500">No snapshots yet.</p>}
        </Card>
      </div>

      <Modal open={!!pending} onClose={() => setPending(null)} title="Restore preview" wide>
        {pending && backupFile && <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{pending.kind === 'zip' ? 'Full backup' : 'Data backup'} from {fmtDateTime(backupFile.exportedAt)} (app v{backupFile.appVersion}, schema {pending.kind === 'zip' ? pending.zip.manifest.schemaVersion : backupFile.schemaVersion}).{pending.kind === 'zip' && pending.zip.problems.length === 0 && ' All checksums verified.'}</p>
          <div className="mb-3 flex gap-2">{(['merge', 'replace'] as const).map((m) => <Button key={m} variant={pending.mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>{m === 'merge' ? 'Merge' : 'Replace'}</Button>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Data</th><th>In backup</th><th>New</th><th>Updated</th><th>Kept (newer here)</th><th>Removed</th></tr></thead>
            <tbody>{pending.preview.filter((r) => r.incoming || r.remove).map((r) => <tr key={r.table} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">{r.table}</td><td>{r.incoming}</td><td className="text-income">{r.add}</td><td className="text-transfer">{r.update}</td><td>{r.keep}</td><td className="text-expense">{r.remove}</td></tr>)}
              {pending.files && <tr className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">files</td><td>{pending.files.inBackup}</td><td className="text-income">{pending.files.new}</td><td colSpan={3} className="text-xs text-slate-500">{pending.mode === 'merge' ? 'existing files kept' : 'backup copies overwrite; extra local files kept'}</td></tr>}</tbody></table></div>
          <p className="mt-3 text-xs text-slate-500">A safety snapshot of your current records is saved automatically before restoring. If anything fails, nothing is changed.</p>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button><Button variant={pending.mode === 'replace' ? 'danger' : 'primary'} disabled={busy === 'restore'} onClick={doRestore}>{busy === 'restore' ? 'Restoring…' : `Restore (${pending.mode})`}</Button></div>
        </>}
      </Modal>
      {csv && <CsvImport onClose={() => setCsv(false)} />}
    </>
  );
}
