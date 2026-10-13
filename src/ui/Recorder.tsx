import { useEffect, useRef, useState } from 'react';
import { addAsset } from '../lib/assets';
import type { AssetMeta } from '../lib/model';

type Mode = 'camera' | 'screen' | 'both';

/** Camera / screen / screen+camera recording with a teleprompter showing the scene's script. */
export function Recorder({ script, onClose, onSaved }: { script: string; onClose: () => void; onSaved: (a: AssetMeta) => void }) {
  const [mode, setMode] = useState<Mode>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [prompter, setPrompter] = useState(script);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStreamTrack[]>([]);
  const stopDraw = useRef<() => void>(() => {});

  const release = () => {
    stopDraw.current();
    tracks.current.forEach((t) => t.stop());
    tracks.current = [];
    setStream(null);
  };
  useEffect(() => release, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const start = async () => {
    setError('');
    release();
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      tracks.current.push(...mic.getTracks());
      let videoTrack: MediaStreamTrack;
      if (mode === 'camera') {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 } });
        tracks.current.push(...cam.getTracks());
        videoTrack = cam.getVideoTracks()[0];
      } else {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
        tracks.current.push(...scr.getTracks());
        videoTrack = scr.getVideoTracks()[0];
        if (mode === 'both') {
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
          tracks.current.push(...cam.getTracks());
          videoTrack = composite(scr, cam);
        }
      }
      // the browser's "Stop sharing" button ends the screen track: finish the recording instead of freezing
      tracks.current.forEach((t) => t.kind === 'video' && t.addEventListener('ended', () => recRef.current?.state === 'recording' && stop()));
      tracks.current.push(videoTrack);
      setStream(new MediaStream([videoTrack, ...mic.getAudioTracks()]));
    } catch (e) {
      release();
      setError(`カメラ・マイク・画面の利用が許可されませんでした。ブラウザのアドレスバー横の設定から許可してください。\n${e instanceof Error ? e.message : e}`);
    }
  };

  /** Screen with the camera as a picture-in-picture bubble, drawn into a canvas stream. */
  const composite = (scr: MediaStream, cam: MediaStream): MediaStreamTrack => {
    const s = document.createElement('video');
    const c = document.createElement('video');
    s.srcObject = scr;
    c.srcObject = cam;
    s.muted = c.muted = true;
    s.play();
    c.play();
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    let on = true;
    const tick = () => {
      if (!on) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1920, 1080);
      if (s.videoWidth) {
        const k = Math.min(1920 / s.videoWidth, 1080 / s.videoHeight);
        ctx.drawImage(s, (1920 - s.videoWidth * k) / 2, (1080 - s.videoHeight * k) / 2, s.videoWidth * k, s.videoHeight * k);
      }
      if (c.videoWidth) {
        const r = 170;
        const cx = 1920 - r - 40;
        const cy = 1080 - r - 40;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const k = Math.max((2 * r) / c.videoWidth, (2 * r) / c.videoHeight);
        ctx.drawImage(c, cx - (c.videoWidth * k) / 2, cy - (c.videoHeight * k) / 2, c.videoWidth * k, c.videoHeight * k);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    };
    tick();
    stopDraw.current = () => (on = false);
    return canvas.captureStream(30).getVideoTracks()[0];
  };

  const record = () => {
    if (!stream) return;
    const type = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: Blob[] = [];
    const t0 = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] });
      try {
        const meta = await addAsset(blob, { name: `録画 ${new Date().toLocaleString('ja-JP')}`, source: 'record', duration: (Date.now() - t0) / 1000 });
        release();
        onSaved(meta);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    rec.start(1000);
    recRef.current = rec;
    setRecording(true);
    setElapsed(0);
  };

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="modal-back">
      <div className="modal" style={{ width: 'min(860px, 100%)' }}>
        <h2>録画</h2>
        <div className="row wrap">
          {(
            [
              ['camera', 'カメラ'],
              ['screen', '画面'],
              ['both', '画面＋カメラ'],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button key={m} className={`chip small ${mode === m ? 'on' : ''}`} disabled={recording} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
          <button className="small" disabled={recording} onClick={start}>
            {stream ? '入力を選び直す' : '準備する'}
          </button>
        </div>
        <div style={{ position: 'relative', marginTop: 12, background: '#000', borderRadius: 8, aspectRatio: '16/9', overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          {prompter && stream && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '10px 16px', background: 'rgba(0,0,0,0.6)', fontSize: 20, lineHeight: 1.6, maxHeight: '40%', overflowY: 'auto' }}>{prompter}</div>
          )}
          {recording && <div style={{ position: 'absolute', left: 12, bottom: 12, color: '#ff6b6b', fontWeight: 700 }}>● 録画中 {elapsed} 秒</div>}
        </div>
        <label>プロンプター（録画中に画面上部に表示される原稿。録画には映りません）</label>
        <textarea rows={2} value={prompter} onChange={(e) => setPrompter(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          {!recording ? (
            <button className="primary" disabled={!stream} onClick={record}>
              ● 録画開始
            </button>
          ) : (
            <button className="primary" onClick={stop}>
              ■ 停止して保存
            </button>
          )}
          <span className="grow" />
          <button
            disabled={recording}
            onClick={() => {
              release();
              onClose();
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
