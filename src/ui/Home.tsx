import { useEffect, useState } from 'react';
import type { Gemini } from '../lib/gemini';
import { explainError, PRICES, VOICES } from '../lib/gemini';
import { makeProject, makeScene, makeText, THEMES, themeById } from '../lib/model';
import type { Aspect, Project } from '../lib/model';
import { deleteProject, listProjects, saveProject } from '../lib/store';
import { generateStoryboard, projectFromStoryboard } from '../lib/storyboard';
import type { Brief } from '../lib/storyboard';
import { formatTime, layout } from '../lib/timeline';
import { SceneThumb } from './Thumb';
import { Brand } from './Brand';
import { exportBackup, importBackup } from '../lib/backup';
import { download } from './download';

export interface AutoGen {
  narration: boolean;
  visuals: boolean;
  music: boolean;
}
export const AUTOGEN_KEY = (id: string) => `my-vids.autogen.${id}`;

const LENGTHS = [
  { s: 15, label: '15秒' },
  { s: 30, label: '30秒' },
  { s: 60, label: '1分' },
  { s: 120, label: '2分' },
  { s: 300, label: '5分' },
];
const ASPECTS: { a: Aspect; label: string }[] = [
  { a: '16:9', label: '横長 16:9' },
  { a: '9:16', label: '縦長 9:16' },
  { a: '1:1', label: '正方形 1:1' },
];
const SAMPLES = ['新入社員向けに、経費精算の手順を説明する動画', '週末に行きたくなる鎌倉の日帰り旅の紹介', '新商品のコーヒー豆「朝霧ブレンド」の 30 秒広告', '子ども向けに、月の満ち欠けの仕組みを説明'];

export function Home({ gemini, demo, onSettings }: { gemini: Gemini; demo: boolean; onSettings: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [brief, setBrief] = useState<Brief>({ prompt: '', reference: '', seconds: 30, tone: '', language: 'ja', aspect: '16:9', themeId: THEMES[0].id, voice: 'Kore', visual: 'mixed' });
  const [auto, setAuto] = useState<AutoGen>({ narration: true, visuals: !demo ? false : true, music: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<Brief>) => setBrief((b) => ({ ...b, ...p }));

  const refresh = () => listProjects().then((ps) => setProjects(ps.sort((a, b) => b.updatedAt - a.updatedAt)));
  useEffect(() => {
    refresh();
  }, []);

  const open = (p: Project) => (location.hash = `#/edit/${p.id}`);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const sb = await generateStoryboard(gemini, brief);
      const p = projectFromStoryboard(sb, brief);
      await saveProject(p);
      sessionStorage.setItem(AUTOGEN_KEY(p.id), JSON.stringify({ ...auto, musicPrompt: sb.musicPrompt }));
      open(p);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  const blank = async () => {
    const theme = themeById(brief.themeId);
    const p = makeProject({ aspect: brief.aspect, themeId: brief.themeId, defaultVoice: brief.voice, language: brief.language });
    p.scenes = [makeScene(theme, { title: 'タイトル', texts: [makeText(theme, { text: 'タイトルを入力', size: 0.09, weight: 900 })] })];
    await saveProject(p);
    open(p);
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setError('参考資料のファイルが大きすぎます（2MB まで）。必要な部分を貼り付けてください。');
    set({ reference: (brief.reference ? brief.reference + '\n\n' : '') + (await f.text()) });
  };

  // rough upper bound for paid generation, shown before creating
  const scenesGuess = Math.max(1, Math.round(brief.seconds / 6));
  const videoScenes = brief.visual === 'video' ? scenesGuess : brief.visual === 'mixed' ? Math.min(3, scenesGuess) : 0;
  const estimate = (auto.visuals ? videoScenes * 8 * PRICES.videoPerSecond720 + (scenesGuess - videoScenes) * PRICES.image2K : 0) + (auto.music ? PRICES.musicClip : 0);

  return (
    <div className="home">
      <header>
        <Brand />
        {demo && <span className="small-text" style={{ color: 'var(--warn)' }}>体験モード（AI の代わりに仮の素材を作ります）</span>}
        <span className="grow" />
        <label className="row" style={{ margin: 0 }} title="「ファイルに保存」で作った .hunetvids ファイル（旧形式 .myvids も可）を読み込みます">
          <span className="small-text muted">ファイルから開く</span>
          <input
            type="file"
            accept=".hunetvids,.myvids"
            style={{ maxWidth: 200 }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                open(await importBackup(f));
              } catch (err) {
                setError(explainError(err));
              }
            }}
          />
        </label>
        <button onClick={onSettings}>API キー設定</button>
      </header>

      <div className="card create-box">
        <h2 style={{ fontSize: 18 }}>どんな動画を作りますか？</h2>
        <textarea rows={3} value={brief.prompt} placeholder="例: 新入社員向けに、経費精算の手順を 1 分で説明する動画" onChange={(e) => set({ prompt: e.target.value })} />
        <div className="chip-row">
          {SAMPLES.map((s) => (
            <button key={s} className="chip small" onClick={() => set({ prompt: s })}>
              {s}
            </button>
          ))}
        </div>
        <details>
          <summary className="muted small-text" style={{ cursor: 'pointer' }}>
            参考資料を追加（文章を貼り付け、または .txt / .md ファイル）
          </summary>
          <textarea rows={5} value={brief.reference} placeholder="この資料の内容をもとに動画を作ります" onChange={(e) => set({ reference: e.target.value })} />
          <input type="file" accept=".txt,.md,.csv,.json,text/*" onChange={(e) => readFile(e.target.files?.[0])} style={{ marginTop: 6 }} />
        </details>

        <div className="grid3">
          <div>
            <label>長さ</label>
            <div className="chip-row">
              {LENGTHS.map((l) => (
                <button key={l.s} className={`chip small ${brief.seconds === l.s ? 'on' : ''}`} onClick={() => set({ seconds: l.s })}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>画面の形</label>
            <div className="chip-row">
              {ASPECTS.map((a) => (
                <button key={a.a} className={`chip small ${brief.aspect === a.a ? 'on' : ''}`} onClick={() => set({ aspect: a.a })}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>背景の素材</label>
            <select value={brief.visual} onChange={(e) => set({ visual: e.target.value as Brief['visual'] })}>
              <option value="mixed">画像中心＋要所で動画</option>
              <option value="image">すべて画像（安い）</option>
              <option value="video">すべて動画（高い）</option>
            </select>
          </div>
        </div>
        <div className="grid3">
          <div>
            <label>テーマ</label>
            <select value={brief.themeId} onChange={(e) => set({ themeId: e.target.value })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>ナレーションの声</label>
            <select value={brief.voice} onChange={(e) => set({ voice: e.target.value })}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>言語</label>
            <select value={brief.language} onChange={(e) => set({ language: e.target.value })}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>
        <div>
          <label>雰囲気・トーン（任意）</label>
          <input value={brief.tone} placeholder="例: 明るく親しみやすく / 落ち着いた高級感" onChange={(e) => set({ tone: e.target.value })} />
        </div>
        <div className="row wrap small-text" style={{ gap: 16 }}>
          <span className="muted">絵コンテの作成後に自動で生成:</span>
          <label className="row" style={{ margin: 0 }}>
            <input type="checkbox" checked={auto.narration} onChange={(e) => setAuto({ ...auto, narration: e.target.checked })} /> ナレーション（無料枠可）
          </label>
          <label className="row" style={{ margin: 0 }}>
            <input type="checkbox" checked={auto.visuals} onChange={(e) => setAuto({ ...auto, visuals: e.target.checked })} /> 背景の画像・動画（有料）
          </label>
          <label className="row" style={{ margin: 0 }}>
            <input type="checkbox" checked={auto.music} onChange={(e) => setAuto({ ...auto, music: e.target.checked })} /> BGM（有料）
          </label>
        </div>
        {!demo && estimate > 0 && <div className="small-text muted">有料生成の目安: 最大 約 ${estimate.toFixed(2)}（Google の公開価格からの概算。実際の請求は AI Studio で確認してください）</div>}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" disabled={!brief.prompt.trim() || busy} onClick={create}>
            {busy && <span className="busy" />}
            {busy ? '絵コンテを作成中…' : 'AI で絵コンテを作成'}
          </button>
          <button onClick={blank}>白紙から作る</button>
        </div>
      </div>

      <h2 style={{ fontSize: 16, margin: '28px 0 4px' }}>最近の動画</h2>
      {projects.length === 0 && <p className="muted">まだありません。</p>}
      <div className="project-grid">
        {projects.map((p) => (
          <div key={p.id} className="project-card" onClick={() => open(p)}>
            <div className="thumb">{p.scenes[0] ? <SceneThumb project={p} scene={p.scenes[0]} width={260} /> : '空'}</div>
            <div className="meta">
              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              <div className="row small-text muted">
                <span>
                  {p.aspect}・{p.scenes.length} シーン・{formatTime(layout(p).total)}
                </span>
                <span className="grow" />
                <button
                  className="small ghost"
                  title="素材ごと 1 つのファイルに保存します（バックアップ・別のパソコンへの移動用）"
                  onClick={async (e) => {
                    e.stopPropagation();
                    download(await exportBackup(p), `${p.title}.hunetvids`);
                  }}
                >
                  ファイルに保存
                </button>
                <button
                  className="small ghost danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`「${p.title}」を削除しますか？（元に戻せません）`)) return;
                    await deleteProject(p.id);
                    refresh();
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
