/**
 * Complete backup: all records + every stored file (receipt images, PDFs, payslips, edited copies, thumbnails)
 * in one ZIP with a manifest and SHA-256 checksums.
 */
import { unzipSync, zipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { db, APP_VERSION, SCHEMA_VERSION } from './db';
import { exportAll, previewRestore, restore, snapshot, validateBackup, type BackupFile } from './backup';

export interface ZipManifest {
  app: 'MyFinance'; format: 'myfinance-zip'; formatVersion: 1; appVersion: string; schemaVersion: number; exportedAt: string;
  dataSha256: string; counts: Record<string, number>;
  files: { path: string; attachmentId: string; part: 'original' | 'processed' | 'thumb'; size: number; sha256: string; type: string }[];
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (u: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', u as unknown as ArrayBuffer));
const ext = (type: string, name: string) => (name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? (type === 'application/pdf' ? '.pdf' : type === 'image/png' ? '.png' : '.jpg')).toLowerCase();

export async function buildZip(): Promise<{ bytes: Uint8Array; manifest: ZipManifest; fileName: string }> {
  const data = await exportAll();
  const dataBytes = strToU8(JSON.stringify(data));
  const zip: Zippable = { 'data.json': [dataBytes, { level: 6 }] };
  const files: ZipManifest['files'] = [];
  const atts = new Map(data.data.attachments.map((a) => [a.id, a]));
  for (const f of await db.files.toArray()) {
    const a = atts.get(f.id); if (!a || a.deletedAt) continue; // only files that belong to live attachments
    const parts: [ZipManifest['files'][number]['part'], Blob | null, string][] = [['original', f.blob, ext(a.mimeType, a.fileName)], ['processed', f.processed, '.jpg'], ['thumb', f.thumb, '.jpg']];
    for (const [part, blob, e] of parts) {
      if (!blob) continue;
      const u = new Uint8Array(await blob.arrayBuffer()); const path = `files/${f.id}/${part}${e}`;
      zip[path] = [u, { level: 0 }]; // images/PDFs are already compressed
      files.push({ path, attachmentId: f.id, part, size: u.byteLength, sha256: await sha(u), type: part === 'original' ? a.mimeType : 'image/jpeg' });
    }
  }
  const manifest: ZipManifest = { app: 'MyFinance', format: 'myfinance-zip', formatVersion: 1, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: data.exportedAt,
    dataSha256: await sha(dataBytes), counts: { ...Object.fromEntries(Object.entries(data.data).map(([k, v]) => [k, (v as unknown[]).length])), files: files.length }, files };
  zip['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 1)), { level: 6 }];
  zip['README.txt'] = [strToU8(`MyFinance full backup\nCreated: ${data.exportedAt}\nApp ${APP_VERSION}, database schema ${SCHEMA_VERSION}\n\nRestore it in MyFinance → Backup & Restore → Restore.\ndata.json holds all records (amounts in sen/cents). files/ holds your original receipts, PDFs and payslips.\n`), { level: 6 }];
  return { bytes: zipSync(zip), manifest, fileName: `myfinance-full-backup-${data.exportedAt.slice(0, 10)}.zip` };
}

export interface ParsedZip { file: BackupFile; manifest: ZipManifest; blobs: Map<string, Uint8Array>; problems: string[] }
/** Opens and verifies a ZIP backup (checksums, structure, schema) without changing anything. */
export async function readZip(bytes: Uint8Array): Promise<ParsedZip> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(bytes); } catch { throw new Error('This is not a valid ZIP file.'); }
  if (!entries['manifest.json'] || !entries['data.json']) throw new Error('Not a MyFinance backup (manifest.json or data.json missing).');
  let manifest: ZipManifest; try { manifest = JSON.parse(strFromU8(entries['manifest.json'])); } catch { throw new Error('Backup manifest is damaged.'); }
  if (manifest.app !== 'MyFinance' || manifest.format !== 'myfinance-zip') throw new Error('Not a MyFinance backup.');
  const problems: string[] = [];
  if ((await sha(entries['data.json'])) !== manifest.dataSha256) throw new Error('data.json checksum does not match – the backup is damaged.');
  let parsed: unknown; try { parsed = JSON.parse(strFromU8(entries['data.json'])); } catch { throw new Error('data.json is damaged.'); }
  const v = validateBackup(parsed); if (!v.ok || !v.file) throw new Error(v.errors.join(' '));
  const blobs = new Map<string, Uint8Array>();
  for (const f of manifest.files) {
    const u = entries[f.path];
    if (!u) { problems.push(`Missing file ${f.path}`); continue; }
    if ((await sha(u)) !== f.sha256) { problems.push(`Checksum mismatch: ${f.path} (skipped)`); continue; }
    blobs.set(f.path, u);
  }
  return { file: v.file, manifest, blobs, problems };
}

export async function previewZip(p: ParsedZip, mode: 'merge' | 'replace') {
  const rows = previewRestore(p.file, await exportAll(), mode);
  const have = new Set(await db.files.toCollection().primaryKeys());
  const originals = p.manifest.files.filter((f) => f.part === 'original' && p.blobs.has(f.path));
  return { rows, files: { inBackup: originals.length, new: originals.filter((f) => !have.has(f.attachmentId)).length } };
}

/**
 * Restores records (merge or replace, same rules as JSON restore – a safety snapshot is taken first) and then files.
 * Files already on this device are never deleted; in merge mode existing files are kept, in replace mode they are overwritten by the backup's copy.
 */
export async function restoreZip(p: ParsedZip, mode: 'merge' | 'replace') {
  await restore(p.file, mode);
  const byAtt = new Map<string, Partial<Record<'original' | 'processed' | 'thumb', { u: Uint8Array; type: string }>>>();
  for (const f of p.manifest.files) { const u = p.blobs.get(f.path); if (!u) continue; const e = byAtt.get(f.attachmentId) ?? {}; e[f.part] = { u, type: f.type }; byAtt.set(f.attachmentId, e); }
  let restored = 0;
  await db.transaction('rw', db.files, async () => {
    for (const [id, parts] of byAtt) {
      if (!parts.original) continue;
      if (mode === 'merge' && (await db.files.get(id))) continue;
      const blob = (x?: { u: Uint8Array; type: string }) => (x ? new Blob([x.u as unknown as ArrayBuffer], { type: x.type }) : null);
      await db.files.put({ id, blob: blob(parts.original)!, processed: blob(parts.processed), thumb: blob(parts.thumb) }); restored++;
    }
  });
  return { restoredFiles: restored };
}

/* ---------------- Backup history ---------------- */
export interface BackupLog { at: string; kind: 'zip' | 'json' | 'folder'; fileName: string; size: number; records: number; files: number }
export async function logBackup(e: BackupLog) {
  await db.transaction('rw', db.meta, async () => {
    const h = ((await db.meta.get('backupHistory'))?.value as BackupLog[] | undefined) ?? [];
    await db.meta.put({ key: 'backupHistory', value: [e, ...h].slice(0, 30) });
    await db.meta.put({ key: 'lastManualBackup', value: e.at });
  });
}
export { snapshot };
