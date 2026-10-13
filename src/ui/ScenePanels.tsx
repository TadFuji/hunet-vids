// Inspector panels that edit the selected scene: scene/background, texts, narration.
import { useEffect, useState } from 'react';
import type { EditorApi } from './api';
import { PRICES, VOICES } from '../lib/gemini';
import { makeText, themeById } from '../lib/model';
import type { Background, Motion, Scene, TextAnim, TextItem, Transition } from '../lib/model';
import { editImage, genImage, genNarration, genPresenter, genVideo } from '../lib/generate';
import { minDurationFor, needsVoice } from '../lib/timeline';
import { rewrite } from '../lib/storyboard';
import { assetUrl } from '../lib/media';

const TRANSITIONS: { v: Transition; l: string }[] = [
  { v: 'cut', l: 'なし（カット）' },
  { v: 'fade', l: 'フェード' },
  { v: 'slide-left', l: 'スライド（左へ）' },
  { v: 'slide-up', l: 'スライド（上へ）' },
  { v: 'wipe', l: 'ワイプ' },
  { v: 'zoom', l: 'ズーム' },
];
const MOTIONS: { v: Motion; l: string }[] = [
  { v: 'none', l: '動きなし' },
  { v: 'zoom-in', l: 'ゆっくりズームイン' },
  { v: 'zoom-out', l: 'ゆっくりズームアウト' },
  { v: 'pan-left', l: '左へパン' },
  { v: 'pan-right', l: '右へパン' },
];
const ANIMS: { v: TextAnim; l: string }[] = [
  { v: 'none', l: 'なし' },
  { v: 'fade', l: 'フェード' },
  { v: 'rise', l: '下から' },
  { v: 'pop', l: 'ポップ' },
  { v: 'typewriter', l: 'タイプ' },
];
const STYLE_PRESETS = ['落ち着いて親しみやすく', '明るく元気に', 'ニュースのように明瞭に', 'ゆっくり優しく', 'ワクワクした調子で', 'ささやくように'];

/** runJob with the job key first, so the key stays visible next to the label. */
const runner = (api: EditorApi) => (label: string, key: string, fn: Parameters<EditorApi['runJob']>[1]) => api.runJob(label, fn, key);

export function ScenePanel({ api }: { api: EditorApi }) {
  const runFor = runner(api);
  const { scene, project } = api;
  const [secs, setSecs] = useState(8);
  const [res, setRes] = useState<'720p' | '1080p'>('720p');
  const [fromImage, setFromImage] = useState(true);
  const [editPrompt, setEditPrompt] = useState('');
  const [presenter, setPresenter] = useState('');
  if (!scene) return <p className="muted">シーンを選んでください。</p>;
  const up = (fn: (s: Scene) => Scene) => api.updateScene(scene.id, fn);
  const set = (p: Partial<Scene>) => up((s) => ({ ...s, ...p }));
  const setBg = (b: Background) => set({ background: b });
  const bg = scene.background;
  const theme = themeById(project.themeId);
  const imgLabel = `画像生成: ${scene.title}`;
  const vidLabel = `動画生成: ${scene.title}`;
  const editLabel = `画像編集: ${scene.title}`;
  const presLabel = `人物動画: ${scene.title}`;
  const videoCost = secs * PRICES.videoPerSecond720; // 1080p is upscaled; Google lists only the 720p rate
  const square = project.aspect === '1:1';

  return (
    <>
      <div className="section">
        <label>シーン名</label>
        <input value={scene.title} onChange={(e) => set({ title: e.target.value })} />
        <div className="grid2">
          <div>
            <label>長さ（秒）</label>
            <input type="number" min={1} max={120} step={0.1} value={scene.duration} onChange={(e) => set({ duration: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="small" disabled={!scene.narration.duration} onClick={() => set({ duration: minDurationFor(scene) })} title="ナレーションの長さに合わせます">
              ナレーションに合わせる
            </button>
          </div>
        </div>
        <div className="grid2">
          <div>
            <label>前のシーンからの切り替え</label>
            <select value={scene.transition} onChange={(e) => set({ transition: e.target.value as Transition })}>
              {TRANSITIONS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>背景の動き</label>
            <select value={scene.motion} onChange={(e) => set({ motion: e.target.value as Motion })}>
              {MOTIONS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>背景</h3>
        <select
          value={bg.kind}
          onChange={(e) => {
            const k = e.target.value;
            if (k === 'color') setBg({ kind: 'color', color: theme.bg.kind === 'color' ? theme.bg.color : '#111827' });
            if (k === 'gradient') setBg({ kind: 'gradient', from: '#1e3a8a', to: '#7c3aed', angle: 135 });
          }}
        >
          <option value="color">単色</option>
          <option value="gradient">グラデーション</option>
          {bg.kind === 'image' && <option value="image">画像</option>}
          {bg.kind === 'video' && <option value="video">動画</option>}
        </select>
        {bg.kind === 'color' && (
          <div className="row" style={{ marginTop: 8 }}>
            <input type="color" value={bg.color} onChange={(e) => setBg({ ...bg, color: e.target.value })} />
          </div>
        )}
        {bg.kind === 'gradient' && (
          <div className="row" style={{ marginTop: 8 }}>
            <input type="color" value={bg.from} onChange={(e) => setBg({ ...bg, from: e.target.value })} />
            <input type="color" value={bg.to} onChange={(e) => setBg({ ...bg, to: e.target.value })} />
            <input type="range" min={0} max={360} value={bg.angle} onChange={(e) => setBg({ ...bg, angle: Number(e.target.value) })} />
          </div>
        )}
        {(bg.kind === 'image' || bg.kind === 'video') && (
          <div className="grid2">
            <div>
              <label>表示のしかた</label>
              <select value={bg.fit} onChange={(e) => setBg({ ...bg, fit: e.target.value as 'cover' | 'contain' })}>
                <option value="cover">画面いっぱい</option>
                <option value="contain">全体を表示</option>
              </select>
            </div>
            <BgPreview id={bg.assetId} kind={bg.kind} />
          </div>
        )}
        {bg.kind === 'video' && (
          <>
            <div className="grid2">
              <div>
                <label>開始位置（秒）</label>
                <input type="number" min={0} step={0.1} value={bg.trimStart} onChange={(e) => setBg({ ...bg, trimStart: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label>動画の音量 {Math.round(bg.volume * 100)}%</label>
                <input type="range" min={0} max={1} step={0.05} value={bg.volume} onChange={(e) => setBg({ ...bg, volume: Number(e.target.value) })} />
              </div>
            </div>
            <label className="row" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={bg.loop} onChange={(e) => setBg({ ...bg, loop: e.target.checked })} /> シーンより短いときは繰り返す
            </label>
          </>
        )}
        <p className="small-text muted">素材タブから画像・動画を選ぶか、下の AI 生成を使ってください。</p>
      </div>

      <div className="section">
        <h3>AI で背景を生成</h3>
        <label>映像の説明（英語がおすすめ。文字は入れない指示に）</label>
        <textarea rows={4} value={scene.visualPrompt} placeholder="例: aerial view of a misty forest at sunrise, cinematic" onChange={(e) => set({ visualPrompt: e.target.value })} />
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button
            disabled={api.isBusy(`image:${scene.id}`)}
            onClick={() =>
              runFor(imgLabel, `image:${scene.id}`, async (signal) => {
                const fn = await genImage(api.gemini, project.aspect, scene, signal);
                api.updateScene(scene.id, fn);
                api.refreshAssets();
              })
            }
          >
            {api.isBusy(`image:${scene.id}`) && <span className="busy" />}画像を生成（約${PRICES.image2K.toFixed(2)}）
          </button>
        </div>
        <div className="grid3">
          <div>
            <label>動画の長さ</label>
            <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
              {[4, 6, 8, 10].map((s) => (
                <option key={s} value={s}>
                  {s} 秒
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>画質</label>
            <select value={res} onChange={(e) => setRes(e.target.value as '720p' | '1080p')}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <label className="row small-text" style={{ margin: 0 }} title="いまの背景画像を最初のコマにして動かします">
              <input type="checkbox" disabled={bg.kind !== 'image'} checked={fromImage && bg.kind === 'image'} onChange={(e) => setFromImage(e.target.checked)} />
              画像を動かす
            </label>
          </div>
        </div>
        <button
          style={{ marginTop: 8 }}
          disabled={api.isBusy(`video:${scene.id}`)}
          onClick={() =>
            runFor(vidLabel, `video:${scene.id}`, async (signal, progress) => {
              const fn = await genVideo(api.gemini, project.aspect, scene, { seconds: secs, resolution: res, fromImage, onWait: (s) => progress(`生成中… ${s} 秒経過`) }, signal);
              api.updateScene(scene.id, fn);
              api.refreshAssets();
            })
          }
        >
          {api.isBusy(`video:${scene.id}`) && <span className="busy" />}音声つき動画を生成（約${videoCost.toFixed(2)}）
        </button>
        <p className="small-text muted">
          動画は Gemini Omni で生成します（1〜数分かかります）。セリフや効果音も説明に書けば入ります。長さの指定は目安で、実際の長さと費用は前後することがあります。1080p の料金は Google が公表していないため、720p の料金で表示しています。{square && '正方形の動画は 16:9 で生成して中央を切り抜きます。'}
        </p>
        {bg.kind === 'image' && (
          <>
            <label>いまの画像を指示で編集（例: 背景を消して白に / 夜の景色に / 人物を笑顔に）</label>
            <div className="row">
              <input className="grow" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
              <button
                disabled={!editPrompt.trim() || api.isBusy(`edit:${scene.id}`)}
                onClick={() =>
                  runFor(editLabel, `edit:${scene.id}`, async (signal) => {
                    const fn = await editImage(api.gemini, project.aspect, scene, editPrompt, signal);
                    api.updateScene(scene.id, fn);
                    api.refreshAssets();
                  })
                }
              >
                {api.isBusy(`edit:${scene.id}`) && <span className="busy" />}編集
              </button>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h3>人物が話す動画（アバター風）</h3>
        <p className="small-text muted">「音声」タブの文章を、動画の中の人物がセリフとして話します。生成後はナレーション音声の代わりに動画の声を使います。日本語のセリフは英語より不自然になることがあります。</p>
        <label>人物と場所の説明（英語がおすすめ）</label>
        <input value={presenter} onChange={(e) => setPresenter(e.target.value)} placeholder="例: a Japanese woman in her 30s in a bright office" />
        <button
          style={{ marginTop: 8 }}
          disabled={!scene.narration.text.trim() || api.isBusy(`presenter:${scene.id}`)}
          onClick={() =>
            runFor(presLabel, `presenter:${scene.id}`, async (signal, progress) => {
              const fn = await genPresenter(api.gemini, project.aspect, scene, presenter, { seconds: secs, resolution: res, onWait: (s) => progress(`生成中… ${s} 秒経過`) }, signal);
              api.updateScene(scene.id, fn);
              api.refreshAssets();
            })
          }
        >
          {api.isBusy(`presenter:${scene.id}`) && <span className="busy" />}話す人物の動画を生成（約${videoCost.toFixed(2)}）
        </button>
        {scene.narration.inVideo && (
          <div className="small-text" style={{ marginTop: 8 }}>
            このシーンは動画の人物の声を使っています。{' '}
            <button className="small" onClick={() => set({ narration: { ...scene.narration, inVideo: false } })}>
              ナレーション音声に戻す
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <label>メモ</label>
        <textarea rows={2} value={scene.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </>
  );
}

function BgPreview({ id, kind }: { id: string; kind: 'image' | 'video' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    assetUrl(id).then(setUrl);
  }, [id]);
  if (!url) return <div />;
  const style = { width: '100%', height: 64, objectFit: 'cover' as const, borderRadius: 6, marginTop: 8 };
  return kind === 'image' ? <img src={url} style={style} /> : <video src={url} style={style} muted />;
}

export function TextPanel({ api }: { api: EditorApi }) {
  const { scene, project } = api;
  if (!scene) return <p className="muted">シーンを選んでください。</p>;
  const theme = themeById(project.themeId);
  const setTexts = (fn: (t: TextItem[]) => TextItem[]) => api.updateScene(scene.id, (s) => ({ ...s, texts: fn(s.texts) }));
  const setItem = (id: string, p: Partial<TextItem>) => setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const add = (p: Partial<TextItem>) => {
    const t = makeText(theme, p);
    setTexts((ts) => [...ts, t]);
    api.setSelectedTextId(t.id);
  };

  return (
    <>
      <div className="row wrap">
        <button className="small" onClick={() => add({ text: '見出し', size: 0.08, weight: 900, y: 0.4 })}>
          ＋ 見出し
        </button>
        <button className="small" onClick={() => add({ text: '本文テキスト', size: 0.045, weight: 400, color: theme.bodyColor, y: 0.58, anim: 'fade' })}>
          ＋ 本文
        </button>
        <button className="small" onClick={() => add({ text: 'ラベル', size: 0.035, weight: 700, bg: theme.accent, color: '#ffffff', y: 0.15, x: 0.5, shadow: false, anim: 'pop' })}>
          ＋ ラベル
        </button>
        <button className="small" onClick={() => add({ text: '字幕風テキスト', size: 0.045, weight: 700, bg: 'rgba(0,0,0,0.6)', y: 0.85, shadow: false, anim: 'none' })}>
          ＋ 下部テロップ
        </button>
      </div>
      <p className="small-text muted">プレビュー上のテキストはドラッグで移動できます。</p>
      {scene.texts.map((t) => (
        <div key={t.id} className="text-item" style={{ borderColor: api.selectedTextId === t.id ? 'var(--accent)' : undefined }} onClick={() => api.setSelectedTextId(t.id)}>
          <textarea rows={2} value={t.text} onChange={(e) => setItem(t.id, { text: e.target.value })} />
          <div className="grid3">
            <div>
              <label>大きさ</label>
              <input type="range" min={0.015} max={0.2} step={0.005} value={t.size} onChange={(e) => setItem(t.id, { size: Number(e.target.value) })} />
            </div>
            <div>
              <label>文字色</label>
              <input type="color" value={t.color.startsWith('#') ? t.color : '#ffffff'} onChange={(e) => setItem(t.id, { color: e.target.value })} />
            </div>
            <div>
              <label className="row" style={{ margin: '10px 0 4px' }}>
                <input type="checkbox" checked={!!t.bg} onChange={(e) => setItem(t.id, { bg: e.target.checked ? theme.accent : null })} />
                背景
              </label>
              {t.bg && <input type="color" value={t.bg.startsWith('#') ? t.bg : '#000000'} onChange={(e) => setItem(t.id, { bg: e.target.value })} />}
            </div>
          </div>
          <div className="grid3">
            <div>
              <label>太さ</label>
              <select value={t.weight} onChange={(e) => setItem(t.id, { weight: Number(e.target.value) as TextItem['weight'] })}>
                <option value={400}>標準</option>
                <option value={700}>太字</option>
                <option value={900}>極太</option>
              </select>
            </div>
            <div>
              <label>揃え</label>
              <select value={t.align} onChange={(e) => setItem(t.id, { align: e.target.value as TextItem['align'] })}>
                <option value="left">左</option>
                <option value="center">中央</option>
                <option value="right">右</option>
              </select>
            </div>
            <div>
              <label>登場</label>
              <select value={t.anim} onChange={(e) => setItem(t.id, { anim: e.target.value as TextAnim })}>
                {ANIMS.map((a) => (
                  <option key={a.v} value={a.v}>
                    {a.l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid3">
            <div>
              <label>表示開始（秒）</label>
              <input type="number" min={0} step={0.1} value={t.start} onChange={(e) => setItem(t.id, { start: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
            <div>
              <label>表示終了（秒）</label>
              <input type="number" min={0} step={0.1} value={t.end ?? ''} placeholder="最後まで" onChange={(e) => setItem(t.id, { end: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label>配置</label>
              <select value="" onChange={(e) => setItem(t.id, { y: Number(e.target.value) })}>
                <option value="">選ぶ…</option>
                <option value={0.15}>上</option>
                <option value={0.5}>中央</option>
                <option value={0.85}>下</option>
              </select>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="row small-text" style={{ margin: 0 }}>
              <input type="checkbox" checked={t.shadow} onChange={(e) => setItem(t.id, { shadow: e.target.checked })} /> 影
            </label>
            <span className="grow" />
            <button className="small danger" onClick={() => setTexts((ts) => ts.filter((x) => x.id !== t.id))}>
              削除
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export function VoicePanel({ api }: { api: EditorApi }) {
  const runFor = runner(api);
  const { scene, project } = api;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (scene?.narration.assetId) assetUrl(scene.narration.assetId).then(setUrl);
    else setUrl(null);
  }, [scene?.narration.assetId]);
  if (!scene) return <p className="muted">シーンを選んでください。</p>;
  const n = scene.narration;
  const setN = (p: Partial<typeof n>) => api.updateScene(scene.id, (s) => ({ ...s, narration: { ...s.narration, ...p } }));
  const label = `ナレーション: ${scene.title}`;
  const rwLabel = `書き換え: ${scene.title}`;
  const doRewrite = (instruction: string) =>
    runFor(rwLabel, `rewrite:${scene.id}`, async (signal) => {
      const text = await rewrite(api.gemini, n.text, instruction, signal);
      api.updateScene(scene.id, (s) => ({ ...s, narration: { ...s.narration, text, assetId: null, duration: null } }));
    });
  const missing = project.scenes.filter((s) => needsVoice(s));

  return (
    <>
      <div className="section">
        <label>読み上げる文章</label>
        <textarea rows={6} value={n.text} onChange={(e) => setN({ text: e.target.value, assetId: null, duration: null })} placeholder="このシーンで話す内容" />
        <div className="row wrap" style={{ marginTop: 6 }}>
          <span className="small-text muted">AI で書き換え:</span>
          {['短く', 'わかりやすく', '丁寧に', '楽しく'].map((w) => (
            <button key={w} className="small" disabled={!n.text.trim() || api.isBusy(`rewrite:${scene.id}`)} onClick={() => doRewrite(`make it ${w === '短く' ? 'shorter (about 70%)' : w === 'わかりやすく' ? 'easier to understand' : w === '丁寧に' ? 'more polite' : 'more fun and lively'}`)}>
              {w}
            </button>
          ))}
        </div>
        <p className="small-text muted">&lt;laugh&gt;（笑い）や &lt;short pause&gt;（短い間）のようなタグを文中に入れると、話し方を細かく調整できます。</p>
        <div className="grid2">
          <div>
            <label>声</label>
            <select value={n.voice} onChange={(e) => setN({ voice: e.target.value, assetId: null, duration: null })}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>話し方</label>
            <input list="style-presets" value={n.style} onChange={(e) => setN({ style: e.target.value, assetId: null, duration: null })} placeholder="例: 明るく元気に" />
            <datalist id="style-presets">
              {STYLE_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="primary"
            disabled={!n.text.trim() || api.isBusy(`voice:${scene.id}`)}
            onClick={() =>
              runFor(label, `voice:${scene.id}`, async (signal) => {
                api.updateScene(scene.id, await genNarration(api.gemini, scene, signal));
                api.refreshAssets();
              })
            }
          >
            {api.isBusy(`voice:${scene.id}`) && <span className="busy" />}
            {n.assetId ? '作り直す' : 'ナレーションを生成'}
          </button>
          {n.assetId && n.duration && <span className="small-text muted">{n.duration.toFixed(1)} 秒</span>}
        </div>
        {url && <audio src={url} controls style={{ width: '100%', marginTop: 8 }} />}
        {n.assetId && (
          <button className="small ghost danger" onClick={() => setN({ assetId: null, duration: null })}>
            音声を外す
          </button>
        )}
      </div>
      <div className="section">
        <h3>まとめて操作</h3>
        <div className="row wrap">
          <button className="small" onClick={() => api.update((p) => ({ ...p, scenes: p.scenes.map((s) => ({ ...s, narration: { ...s.narration, voice: n.voice, style: n.style, assetId: s.narration.voice === n.voice && s.narration.style === n.style ? s.narration.assetId : null, duration: s.narration.voice === n.voice && s.narration.style === n.style ? s.narration.duration : null } })) }))}>
            この声と話し方を全シーンに適用
          </button>
          <button
            className="small"
            disabled={!missing.length}
            onClick={() =>
              missing.forEach((s) =>
                runFor(`ナレーション: ${s.title}`, `voice:${s.id}`, async (signal) => {
                  api.updateScene(s.id, await genNarration(api.gemini, s, signal));
                  api.refreshAssets();
                }),
              )
            }
          >
            未生成のナレーションをすべて生成（{missing.length}）
          </button>
        </div>
      </div>
    </>
  );
}
