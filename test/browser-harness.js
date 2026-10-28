import { createBrowserMedia } from '/browser-media.js';
const byId = id => document.getElementById(id);
const phases = new Set(['idle', 'checking', 'loading', 'ready', 'probing', 'preparing', 'trimming', 'composing', 'processing', 'cancelled', 'error']);
const media = createBrowserMedia({ onState: state => { byId('phase').textContent = phases.has(state?.phase) ? state.phase : 'processing'; } });
let source = null;
let busy = false;
const urls = [];
function display(value) { byId('result').textContent = JSON.stringify(value, null, 2); }
function output(blob, operation) {
  const url = URL.createObjectURL(blob); urls.push(url);
  const a = document.createElement('a'); a.href = url; a.download = `fixture-${operation}.mp4`; a.textContent = `Download ${operation} (${blob.size} bytes)`;
  const p = document.createElement('p'); p.append(a); byId('downloads').append(p);
}
async function dimensions(blob) {
  const url = URL.createObjectURL(blob); const video = document.createElement('video'); video.preload = 'metadata';
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('metadata')), 15000);
      video.onloadedmetadata = () => { clearTimeout(timer); if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0) resolve({ seconds: video.duration, width: video.videoWidth, height: video.videoHeight }); else reject(new Error('metadata')); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('metadata')); }; video.src = url;
    });
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
async function run(operation) {
  if (busy) return; busy = true;
  for (const button of document.querySelectorAll('[data-operation]')) button.disabled = true;
  const start = performance.now(); display({ operation, status: 'running' });
  try {
    let blob;
    if (operation === 'ready') await media.ensureReady();
    else if (operation === 'prepare') {
      const file = byId('source').files[0]; if (!file) throw new Error('fixture');
      source = await media.prepareSource(file); blob = source.tailBlob;
    } else if (operation === 'trim1' || operation === 'trim2') {
      const file = byId('ending').files[0] || source?.tailBlob; if (!file) throw new Error('fixture');
      const info = await dimensions(file); const aspectRatio = info.width > info.height ? '16:9' : '9:16';
      blob = (await media.trimVideo(file, operation === 'trim1' ? 1 : 2, { aspectRatio })).blob;
    } else if (operation === 'compose') {
      const ending = byId('ending').files[0]; if (!source || !ending) throw new Error('fixture');
      const info = await dimensions(ending); blob = (await media.composeSource(source, ending, source.prefixSeconds + info.seconds)).blob;
    }
    const result = { operation, status: 'ok', elapsedMs: Math.round(performance.now() - start) };
    if (blob) { Object.assign(result, { bytes: blob.size, ...await dimensions(blob) }); output(blob, operation); }
    if (operation === 'prepare') Object.assign(result, { sourceSeconds: source.sourceSeconds, prefixSeconds: source.prefixSeconds, tailSeconds: source.tailSeconds, hasAudio: !!source.hasAudio, sourceWidth: source.sourceWidth, sourceHeight: source.sourceHeight, aspectRatio: source.settings?.aspectRatio, resolution: source.settings?.resolution });
    display(result);
  } catch { display({ operation, status: 'failed-or-cancelled', elapsedMs: Math.round(performance.now() - start) }); }
  finally { busy = false; for (const button of document.querySelectorAll('[data-operation]')) button.disabled = false; }
}
for (const button of document.querySelectorAll('[data-operation]')) button.addEventListener('click', () => run(button.dataset.operation));
byId('cancel').addEventListener('click', () => { media.cancel(); byId('phase').textContent = 'cancelled'; });
byId('source').addEventListener('change', () => { source = null; });
window.addEventListener('pagehide', () => { media.dispose(); for (const url of urls) URL.revokeObjectURL(url); });
