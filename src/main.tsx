import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { db, requestPersistence } from './db/db';
import { snapshotBeforeUpgrade } from './db/preUpgrade';
import { autoBackupIfDue } from './db/backup';
import { runGenerators } from './db/commitmentRepo';
import { initCloud } from './lib/cloud';
import { runFolderBackup } from './lib/folderBackup';
import { todayKL } from './lib/date';

// Boot order matters: (1) save a pre-upgrade copy of the data, (2) open/upgrade the database, (3) only then render.
// Rendering earlier would let live queries open (and upgrade) the database before the safety copy exists.
async function boot() {
  const root = document.getElementById('root')!;
  try { await snapshotBeforeUpgrade(); } catch (e) { console.error('Pre-upgrade snapshot failed (upgrade is additive and continues)', e); }
  try { await db.open(); }
  catch (e) { root.innerHTML = `<p style="padding:2rem;font-family:sans-serif">Could not open local database: ${String((e as Error)?.message ?? e).replace(/</g, '&lt;')}. Your data has not been modified. Close other MyFinance tabs and reload.</p>`; return; }
  // Another tab installed a newer version: release the database and ask to reload (never block the upgrade).
  db.on('versionchange', () => { db.close(); root.innerHTML = '<p style="padding:2rem;font-family:sans-serif">MyFinance was updated in another tab. <a href="" style="color:#0f766e">Reload</a> to continue – your data is safe.</p>'; return false; });
  createRoot(root).render(<StrictMode><App /></StrictMode>);
  requestPersistence();
  autoBackupIfDue().catch(console.error);
  runFolderBackup().catch(console.error);
  initCloud().catch((e) => console.error('Cloud init failed', e));
  // Generate recurring records (idempotent) now and whenever the app regains focus on a new day.
  let lastRun = todayKL();
  runGenerators().catch(console.error);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayKL() !== lastRun) { lastRun = todayKL(); runGenerators().catch(console.error); autoBackupIfDue().catch(console.error); }
  });
}
void boot();
