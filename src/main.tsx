import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { db, requestPersistence } from './db/db';
import { autoBackupIfDue } from './db/backup';

db.open()
  .then(() => { requestPersistence(); autoBackupIfDue().catch(console.error); })
  .catch((e) => { document.getElementById('root')!.innerHTML = `<p style="padding:2rem;font-family:sans-serif">Could not open local database: ${String(e?.message ?? e).replace(/</g, '&lt;')}. Your data has not been modified. Try closing other MyFinance tabs and reload.</p>`; });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
