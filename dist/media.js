import { verifyDuration, verifyAspectRatio } from './core.js';

// A new detached element is used for every Blob. Unknown metadata may settle on
// durationchange; a timeout/error remains recoverable through Studio.recheck().
export async function validateVideo(blob, expected, {
  createVideo = () => document.createElement('video'),
  createUrl = value => URL.createObjectURL(value),
  revokeUrl = value => URL.revokeObjectURL(value),
  aspectRatio = null, timeoutMs = 15000, maxSeconds = 40, tolerance = 0.1,
} = {}) {
  const video = createVideo(); const url = createUrl(blob);
  try {
    return await new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const result = (actualSeconds, width, height) => {
        const durationValid = Number.isFinite(actualSeconds) && actualSeconds > 0 && (maxSeconds === 40 && tolerance === 0.1 ? verifyDuration(actualSeconds, expected) : Math.abs(actualSeconds - expected) <= tolerance && actualSeconds <= maxSeconds);
        if (!aspectRatio) return { valid: durationValid, actualSeconds };
        const aspectValid = verifyAspectRatio(width, height, aspectRatio);
        return { valid: durationValid && aspectValid, actualSeconds, width, height, durationValid, aspectValid };
      };
      const dimensions = () => ({ width: Number.isSafeInteger(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : null, height: Number.isSafeInteger(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : null });
      const timer = setTimeout(() => { const {width,height} = dimensions(); finish(result(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null, width, height)); }, timeoutMs);
      const measure = () => {
        const {width,height} = dimensions();
        if (Number.isFinite(video.duration) && video.duration > 0 && (!aspectRatio || (width && height))) finish(result(video.duration, width, height));
      };
      video.onloadedmetadata = measure; video.ondurationchange = measure; video.onresize = measure;
      video.onerror = () => finish(result(null, null, null));
      video.preload = 'metadata'; video.src = url;
    });
  } finally {
    video.onloadedmetadata = null; video.ondurationchange = null; video.onresize = null; video.onerror = null;
    video.removeAttribute('src'); video.load(); revokeUrl(url);
  }
}
