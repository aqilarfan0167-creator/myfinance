// Receives {id, blob} from the parent app, returns {id, ok, blob|error}. Only Blobs are accepted.
addEventListener('message', function (e) {
  var d = e.data || {};
  if (e.source !== parent || !(d.blob instanceof Blob) || typeof d.id !== 'string') return;
  heic2any({ blob: d.blob, toType: 'image/jpeg', quality: 0.92 })
    .then(function (out) { parent.postMessage({ id: d.id, ok: true, blob: Array.isArray(out) ? out[0] : out }, '*'); })
    .catch(function (err) { parent.postMessage({ id: d.id, ok: false, error: String((err && (err.message || err.code)) || err) }, '*'); });
});
parent.postMessage({ heicBridgeReady: true }, '*');
