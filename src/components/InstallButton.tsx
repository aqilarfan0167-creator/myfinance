import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui';

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event('mf-installable')); });

/** "Install app" where the browser supports it; instructions for iOS Safari. */
export function InstallButton() {
  const [can, setCan] = useState(!!deferred);
  const standalone = typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => { const f = () => setCan(true); window.addEventListener('mf-installable', f); return () => window.removeEventListener('mf-installable', f); }, []);
  if (standalone) return <p className="mt-2 text-xs text-income">Installed as an app ✓</p>;
  if (can) return <Button className="mt-3" variant="secondary" onClick={async () => { await deferred?.prompt(); deferred = null; setCan(false); }}><Download className="h-4 w-4" />Install MyFinance app</Button>;
  if (ios) return <p className="mt-2 text-xs text-slate-500">To install on iPhone/iPad: tap Share → “Add to Home Screen”.</p>;
  return <p className="mt-2 text-xs text-slate-500">To install, use your browser’s “Install app” / “Add to Home screen” option (Chrome, Edge, Samsung Internet).</p>;
}
