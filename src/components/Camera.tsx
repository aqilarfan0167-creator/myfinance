import { useEffect, useRef, useState } from 'react';
import { Camera as CamIcon, RefreshCw, SwitchCamera, Check, X } from 'lucide-react';
import { Button, Modal } from './ui';

/**
 * Live camera capture (rear camera preferred on phones, webcam on laptops). Shows a preview of each shot with
 * Retake / Use photo. Falls back to the system camera picker if live capture isn't available (e.g. not HTTPS).
 */
export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (files: File[]) => void }) {
  const video = useRef<HTMLVideoElement>(null); const fallback = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null); const [err, setErr] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]); const [devIdx, setDevIdx] = useState(-1);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null); const [taken, setTaken] = useState<File[]>([]); const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return; let s: MediaStream | null = null; let cancelled = false;
    (async () => {
      setErr('');
      if (!navigator.mediaDevices?.getUserMedia) { setErr('Live camera is not available in this browser (it requires HTTPS). Use the system camera instead.'); return; }
      try {
        const constraints: MediaStreamConstraints = { audio: false, video: devIdx >= 0 && devices[devIdx] ? { deviceId: { exact: devices[devIdx].deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
        s = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s); if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); setDevices(list);
      } catch (e) {
        const n = (e as DOMException).name;
        setErr(n === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or use the system camera / upload instead.' : n === 'NotFoundError' ? 'No camera found. Use upload instead.' : `Camera error: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; s?.getTracks().forEach((t) => t.stop()); setStream(null); setReady(false); };
  }, [open, devIdx]); // eslint-disable-line

  useEffect(() => { if (!shot && stream && video.current && video.current.srcObject !== stream) { video.current.srcObject = stream; video.current.play().catch(() => {}); } }, [shot, stream]);
  const capture = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && setShot({ blob: b, url: URL.createObjectURL(b) }), 'image/jpeg', 0.92);
  };
  const keep = () => { if (!shot) return; setTaken((t) => [...t, new File([shot.blob], `receipt-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' })]); URL.revokeObjectURL(shot.url); setShot(null); };
  const finish = (extra: File[] = []) => { const all = [...taken, ...extra]; setTaken([]); if (shot) URL.revokeObjectURL(shot.url); setShot(null); onClose(); if (all.length) onCapture(all); };

  return (
    <Modal open={open} onClose={() => finish()} title={`Scan receipt${taken.length ? ` · ${taken.length} taken` : ''}`} wide>
      {err ? <div className="space-y-3 text-sm"><p className="rounded-lg bg-orange-50 p-3 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">{err}</p>
        <Button onClick={() => fallback.current?.click()}><CamIcon className="h-4 w-4" />Open system camera</Button></div>
        : <div className="relative overflow-hidden rounded-lg bg-black">
          {shot ? <img src={shot.url} alt="Captured receipt" className="mx-auto max-h-[65vh]" /> : <video ref={video} playsInline muted onLoadedData={() => setReady(true)} onPlaying={() => setReady(true)} className="mx-auto max-h-[65vh] w-full object-contain" />}
          {!shot && (!stream || !ready) && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting camera…</p>}
          {!shot && stream && <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/60" />}
        </div>}
      <input ref={fallback} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; finish(f); }} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">{devices.length > 1 && !shot && <Button variant="secondary" onClick={() => setDevIdx((i) => (i + 1) % devices.length)}><SwitchCamera className="h-4 w-4" />Switch camera</Button>}</div>
        <div className="flex gap-2">
          {shot ? <><Button variant="secondary" onClick={() => { URL.revokeObjectURL(shot.url); setShot(null); }}><RefreshCw className="h-4 w-4" />Retake</Button><Button onClick={keep}><Check className="h-4 w-4" />Use photo</Button></>
            : <>{!err && <Button onClick={capture} disabled={!stream || !ready}><CamIcon className="h-4 w-4" />Capture</Button>}<Button variant={taken.length ? 'primary' : 'secondary'} onClick={() => finish()}>{taken.length ? `Done (${taken.length})` : <><X className="h-4 w-4" />Close</>}</Button></>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Tip: flat surface, good light, fill the frame. You can take several receipts in a row.</p>
    </Modal>
  );
}
