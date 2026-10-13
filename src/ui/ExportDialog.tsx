import { useRef, useState } from 'react';
import type { Project } from '../lib/model';
import { ASPECT_SIZES } from '../lib/model';
import { exportMp4 } from '../lib/exporter';
import { captionCues, formatTime, layout, needsVoice, toSrt } from '../lib/timeline';
import { download } from './download';

export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [quality, setQuality] = useState<'1080' | '720'>('1080');
  const [fps, setFps] = useState(30);
  const [progress, setProgress] = useState<{ f: number; label: string } | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const { w, h } = ASPECT_SIZES[project.aspect];
  const scale = quality === '1080' ? 1 : 2 / 3;
  const total = layout(project).total;
  const missingVoice = project.scenes.filter((s) => needsVoice(s)).length;

  const run = async () => {
    setError('');
    setResult(null);
    abort.current = new AbortController();
    const started = Date.now();
    try {
      const blob = await exportMp4(project, { scale, fps, signal: abort.current.signal, onProgress: (f, label) => setProgress({ f, label }) });
      setResult({ blob, url: URL.createObjectURL(blob) });
      console.info(`export done in ${((Date.now() - started) / 1000).toFixed(1)}s, ${(blob.size / 1e6).toFixed(1)}MB`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-back">
      <div className="modal">
        <h2>動画を書き出す（MP4）</h2>
        <p className="muted small-text">
          長さ {formatTime(total)}・{project.scenes.length} シーン。書き出しはこのブラウザの中で行われ、どこにもアップロードされません。透かしは入りません。
        </p>
        {missingVoice > 0 && <p className="small-text" style={{ color: 'var(--warn)' }}>音声がまだ作られていないナレーションが {missingVoice} 件あります（その部分は無音になります）。</p>}
        <div className="grid2">
          <div>
            <label>画質</label>
            <select aria-label="画質" value={quality} disabled={!!progress} onChange={(e) => setQuality(e.target.value as '1080' | '720')}>
              <option value="1080">
                フル HD（{w}×{h}）
              </option>
              <option value="720">
                HD（{Math.round((w * 2) / 3)}×{Math.round((h * 2) / 3)}）
              </option>
            </select>
          </div>
          <div>
            <label>フレームレート</label>
            <select aria-label="フレームレート" value={fps} disabled={!!progress} onChange={(e) => setFps(Number(e.target.value))}>
              <option value={30}>30 fps</option>
              <option value={24}>24 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
        </div>
        {progress && (
          <div style={{ marginTop: 14 }}>
            <div className="small-text muted" style={{ marginBottom: 6 }}>
              {progress.label}… {Math.round(progress.f * 100)}%
            </div>
            <div className="progress">
              <div style={{ width: `${progress.f * 100}%` }} />
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {result && (
          <div style={{ marginTop: 14 }}>
            <video src={result.url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            <div className="small-text muted">{(result.blob.size / 1e6).toFixed(1)} MB</div>
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 14 }}>
          {!progress && !result && (
            <button className="primary" onClick={run}>
              書き出し開始
            </button>
          )}
          {progress && <button onClick={() => abort.current?.abort()}>中止</button>}
          {result && (
            <button className="primary" onClick={() => download(result.blob, `${project.title}.mp4`)}>
              MP4 を保存
            </button>
          )}
          {result && <button onClick={run}>もう一度書き出す</button>}
          <button className="small" onClick={() => download(new Blob([toSrt(captionCues(project))], { type: 'text/plain' }), `${project.title}.srt`)}>
            字幕 .srt を保存
          </button>
          <span className="grow" />
          <button disabled={!!progress} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
