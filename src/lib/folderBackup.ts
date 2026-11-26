/**
 * Automatic backups to a folder the user picks (File System Access API – Chrome/Edge on desktop).
 * The browser only lets us write after the user has granted access in this session, so the app asks again when needed.
 */
import { db } from '@/db/db';
import { buildZip, logBackup } from '@/db/zipBackup';

type Perm = 'granted' | 'denied' | 'prompt';
interface DirHandle { name: string; queryPermission(o: { mode: 'readwrite' }): Promise<Perm>; requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;
  removeEntry(n: string): Promise<void>; keys(): AsyncIterable<string> }
declare global { interface Window { showDirectoryPicker?: (o?: { mode?: 'readwrite'; id?: string }) => Promise<DirHandle> } }

export const folderBackupSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const KEEP = 10;

export async function chooseBackupFolder(): Promise<string> {
  const h = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'myfinance-backups' });
  await db.meta.put({ key: 'backupDir', value: h }); await db.meta.put({ key: 'backupDirEvery', value: 1 });
  return h.name;
}
export async function folderStatus(): Promise<{ name: string; permission: Perm; last: string | null; everyDays: number } | null> {
  const h = (await db.meta.get('backupDir'))?.value as DirHandle | undefined; if (!h) return null;
  return { name: h.name, permission: await h.queryPermission({ mode: 'readwrite' }), last: ((await db.meta.get('lastFolderBackup'))?.value as string) ?? null, everyDays: ((await db.meta.get('backupDirEvery'))?.value as number) ?? 1 };
}
export async function reconnectFolder() { const h = (await db.meta.get('backupDir'))?.value as DirHandle | undefined; return h ? (await h.requestPermission({ mode: 'readwrite' })) === 'granted' : false; }
export async function forgetFolder() { await db.meta.delete('backupDir'); }

/** Writes a ZIP to the folder if due (or forced) and keeps the newest 10. Returns what happened. */
export async function runFolderBackup(force = false): Promise<'written' | 'not-due' | 'no-folder' | 'needs-permission'> {
  const st = await folderStatus(); if (!st) return 'no-folder';
  if (!force && st.last && Date.now() - Date.parse(st.last) < st.everyDays * 86400000) return 'not-due';
  if (st.permission !== 'granted') return 'needs-permission';
  const h = (await db.meta.get('backupDir'))!.value as DirHandle;
  const { bytes, manifest, fileName } = await buildZip();
  const name = fileName.replace('.zip', `-${new Date().toISOString().slice(11, 16).replace(':', '')}.zip`);
  const w = await (await h.getFileHandle(name, { create: true })).createWritable(); await w.write(new Blob([bytes as unknown as ArrayBuffer], { type: 'application/zip' })); await w.close();
  const names: string[] = []; for await (const k of h.keys()) if (/^myfinance-full-backup-.*\.zip$/.test(k)) names.push(k);
  for (const old of names.sort().reverse().slice(KEEP)) await h.removeEntry(old).catch(() => {});
  const at = new Date().toISOString(); await db.meta.put({ key: 'lastFolderBackup', value: at });
  await logBackup({ at, kind: 'folder', fileName: name, size: bytes.byteLength, records: Object.entries(manifest.counts).filter(([k]) => k !== 'files').reduce((a, [, v]) => a + v, 0), files: manifest.counts.files });
  return 'written';
}
