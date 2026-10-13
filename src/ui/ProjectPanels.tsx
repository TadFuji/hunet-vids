// Inspector panels for project-wide things: media library, music, video settings.
import { useEffect, useState } from 'react';
import type { EditorApi } from './api';
import { PRICES } from '../lib/gemini';
import { makeScene, THEMES, themeById } from '../lib/model';
import type { Aspect, AssetMeta, Project } from '../lib/model';
import { addAsset } from '../lib/assets';
import { assetUrl } from '../lib/media';
import { genMusic } from '../lib/generate';
import { forgetBuffer } from '../lib/mix';
import { captionCues, toSrt } from '../lib/timeline';
import { download } from './download';

function AssetTile({ a, onPick }: { a: AssetMeta; onPick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    assetUrl(a.id).then(setUrl);
  }, [a.id]);
  const badge = { upload: 'アップロード', record: '録画', veo: 'AI動画', 'image-ai': 'AI画像', tts: '音声', 'music-ai': 'AI音楽', stock: '素材' }[a.source];
  return (
    <div className="asset" onClick={onPick} title={`${a.name}${a.prompt ? '\n' + a.prompt : ''}`}>
      {url && a.kind === 'image' && <img src={url} loading="lazy" />}
      {url && a.kind === 'video' && <video src={url} muted preload="metadata" />}
      {a.kind === 'audio' && <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 22 }}>♪</div>}
      <span className="badge">
        {badge}
        {a.duration ? ` ${a.duration.toFixed(1)}s` : ''}
      </span>
    </div>
  );
}

export function MediaPanel({ api }: { api: EditorApi }) {
  const [filter, setFilter] = useState<'visual' | 'audio'>('visual');
  const [error, setError] = useState('');
  const { scene } = api;

  const upload = async (files: FileList | null) => {
    setError('');
    for (const f of Array.from(files ?? [])) {
      try {
        await addAsset(f, { name: f.name, source: 'upload' });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    api.refreshAssets();
  };

  const pick = (a: AssetMeta) => {
    if (a.kind === 'audio') {
      api.update((p) => ({ ...p, music: { assetId: a.id, volume: 0.35, fadeIn: 1, fadeOut: 2, duck: true, prompt: a.name } }));
      return;
    }
    if (!scene) return;
    api.updateScene(scene.id, (s) => ({
      ...s,
      background: a.kind === 'image' ? { kind: 'image', assetId: a.id, fit: 'cover' } : { kind: 'video', assetId: a.id, fit: 'cover', trimStart: 0, volume: 0.8, loop: false },
      // fit the scene to an uploaded clip's length
      duration: a.kind === 'video' && a.duration && s.background.kind !== 'video' ? Math.max(s.duration, Math.min(60, Math.round(a.duration * 10) / 10)) : s.duration,
    }));
  };

  const list = api.assets.filter((a) => (filter === 'audio' ? a.kind === 'audio' && a.source !== 'tts' : a.kind !== 'audio')).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <div className="row wrap">
        <label className="row" style={{ margin: 0 }}>
          <span className="button-like">
            <input type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => upload(e.target.files)} style={{ maxWidth: 220 }} />
          </span>
        </label>
        <button className="small" onClick={api.openRecorder}>
          ● カメラ・画面を録画
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="tabs" style={{ marginTop: 12, position: 'static' }}>
        <button className={filter === 'visual' ? 'on' : ''} onClick={() => setFilter('visual')}>
          画像・動画
        </button>
        <button className={filter === 'audio' ? 'on' : ''} onClick={() => setFilter('audio')}>
          音楽・音声
        </button>
      </div>
      <p className="small-text muted">{filter === 'visual' ? 'クリックすると、選択中のシーンの背景になります。' : 'クリックすると BGM になります。'}</p>
      <div className="asset-grid">
        {list.map((a) => (
          <AssetTile key={a.id} a={a} onPick={() => pick(a)} />
        ))}
      </div>
      {list.length === 0 && <p className="muted small-text">まだ素材がありません。</p>}
    </>
  );
}

export function MusicPanel({ api }: { api: EditorApi }) {
  const { project } = api;
  const [prompt, setPrompt] = useState(project.music?.prompt ?? '');
  const [kind, setKind] = useState<'clip' | 'song'>('clip');
  const [url, setUrl] = useState<string | null>(null);
  const m = project.music;
  useEffect(() => {
    if (m) assetUrl(m.assetId).then(setUrl);
    else setUrl(null);
  }, [m?.assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setM = (p: Partial<NonNullable<Project['music']>>) => api.update((pr) => (pr.music ? { ...pr, music: { ...pr.music, ...p } } : pr));
  const label = 'BGM 生成';

  return (
    <>
      <div className="section">
        <h3>AI で BGM を作る（Lyria）</h3>
        <label>曲の雰囲気（英語がおすすめ）</label>
        <textarea rows={3} value={prompt} placeholder="例: uplifting acoustic guitar, 100 bpm, warm and hopeful" onChange={(e) => setPrompt(e.target.value)} />
        <div className="chip-row" style={{ marginTop: 6 }}>
          {['calm lo-fi piano, 80 bpm', 'uplifting corporate pop, 110 bpm', 'cinematic orchestral, epic', 'playful ukulele, cheerful', 'ambient synth pads, focus'].map((s) => (
            <button key={s} className="chip small" onClick={() => setPrompt(s)}>
              {s}
            </button>
          ))}
        </div>
        <label>長さ</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as 'clip' | 'song')}>
          <option value="clip">30 秒のループ素材（約${PRICES.musicClip.toFixed(2)}）</option>
          <option value="song">2〜3 分の曲（約${PRICES.musicSong.toFixed(2)}）</option>
        </select>
        <button
          className="primary"
          style={{ marginTop: 10 }}
          disabled={!prompt.trim() || api.isBusy(label)}
          onClick={() =>
            api.runJob(label, async (signal) => {
              api.update(await genMusic(api.gemini, prompt, kind, signal));
              api.refreshAssets();
            })
          }
        >
          {api.isBusy(label) && <span className="busy" />}BGM を生成
        </button>
        <p className="small-text muted">動画より短い曲は繰り返し再生します。手持ちの曲は「素材」タブからアップロードできます。</p>
      </div>
      {m && (
        <div className="section">
          <h3>いまの BGM</h3>
          <div className="small-text muted">{m.prompt}</div>
          {url && <audio src={url} controls style={{ width: '100%', marginTop: 6 }} />}
          <label>音量 {Math.round(m.volume * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05} value={m.volume} onChange={(e) => setM({ volume: Number(e.target.value) })} />
          <div className="grid2">
            <div>
              <label>フェードイン（秒）</label>
              <input type="number" min={0} max={10} step={0.5} value={m.fadeIn} onChange={(e) => setM({ fadeIn: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label>フェードアウト（秒）</label>
              <input type="number" min={0} max={10} step={0.5} value={m.fadeOut} onChange={(e) => setM({ fadeOut: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <label className="row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={m.duck} onChange={(e) => setM({ duck: e.target.checked })} /> ナレーション中は BGM を小さくする
          </label>
          <button
            className="small danger"
            style={{ marginTop: 10 }}
            onClick={() => {
              forgetBuffer(m.assetId);
              api.update((p) => ({ ...p, music: null }));
            }}
          >
            BGM を外す
          </button>
        </div>
      )}
    </>
  );
}

export function SettingsPanel({ api }: { api: EditorApi }) {
  const { project } = api;
  const set = (p: Partial<Project>) => api.update((pr) => ({ ...pr, ...p }));
  const c = project.captions;
  const setC = (p: Partial<typeof c>) => set({ captions: { ...c, ...p } });

  const applyTheme = (id: string) => {
    const t = themeById(id);
    const old = themeById(project.themeId);
    api.update((p) => ({
      ...p,
      themeId: id,
      scenes: p.scenes.map((s) => ({
        ...s,
        // only replace backgrounds that still use the old theme's look
        background: s.background.kind === 'color' || s.background.kind === 'gradient' ? (JSON.stringify(s.background) === JSON.stringify(old.bg) ? t.bg : s.background) : s.background,
        texts: s.texts.map((x) => ({ ...x, font: t.font, color: x.color === old.titleColor ? t.titleColor : x.color === old.bodyColor ? t.bodyColor : x.color })),
      })),
    }));
  };

  return (
    <>
      <div className="section">
        <h3>動画全体</h3>
        <label>画面の形</label>
        <select value={project.aspect} onChange={(e) => set({ aspect: e.target.value as Aspect })}>
          <option value="16:9">横長 16:9（YouTube など）</option>
          <option value="9:16">縦長 9:16（ショート・リール）</option>
          <option value="1:1">正方形 1:1</option>
        </select>
        <label>テーマ</label>
        <select value={project.themeId} onChange={(e) => applyTheme(e.target.value)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="section">
        <h3>字幕（ナレーションから自動作成）</h3>
        <label className="row">
          <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ enabled: e.target.checked })} /> 字幕を表示する
        </label>
        {c.enabled && (
          <>
            <div className="grid3">
              <div>
                <label>位置</label>
                <select value={c.position} onChange={(e) => setC({ position: e.target.value as typeof c.position })}>
                  <option value="bottom">下</option>
                  <option value="middle">中央</option>
                  <option value="top">上</option>
                </select>
              </div>
              <div>
                <label>文字色</label>
                <input type="color" value={c.color} onChange={(e) => setC({ color: e.target.value })} />
              </div>
              <div>
                <label>帯</label>
                <select value={c.bg} onChange={(e) => setC({ bg: e.target.value })}>
                  <option value="rgba(0,0,0,0.55)">半透明の黒</option>
                  <option value="rgba(0,0,0,0)">なし</option>
                  <option value="rgba(255,255,255,0.85)">白</option>
                  <option value="rgba(79,125,255,0.85)">青</option>
                </select>
              </div>
            </div>
            <label>大きさ</label>
            <input type="range" min={0.025} max={0.08} step={0.005} value={c.size} onChange={(e) => setC({ size: Number(e.target.value) })} />
          </>
        )}
        <button className="small" style={{ marginTop: 10 }} onClick={() => download(new Blob([toSrt(captionCues(project))], { type: 'text/plain' }), `${project.title}.srt`)}>
          字幕ファイル（.srt）を保存
        </button>
      </div>
      <div className="section">
        <h3>シーンを追加</h3>
        <button className="small" onClick={() => api.update((p) => ({ ...p, scenes: [...p.scenes, makeScene(themeById(p.themeId), { narration: { text: '', voice: p.defaultVoice, style: '', assetId: null, duration: null } })] }))}>
          ＋ 空のシーンを最後に追加
        </button>
      </div>
    </>
  );
}
