import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Gemini } from '../lib/gemini';
import { explainError, PRICES } from '../lib/gemini';
import { makeScene, themeById, uid } from '../lib/model';
import type { AssetMeta, Project, Scene } from '../lib/model';
import { getProject, listAssets, saveProject } from '../lib/store';
import { formatTime, layout, sceneAt } from '../lib/timeline';
import { genImage, genMusic, genNarration, genVideo } from '../lib/generate';
import { generateStoryboard, sceneFromStoryboard } from '../lib/storyboard';
import type { EditorApi, JobFn } from './api';
import { AUTOGEN_KEY } from './Home';
import type { AutoGen } from './Home';
import { Player } from './Player';
import { Timeline } from './Timeline';
import { SceneThumb } from './Thumb';
import { ScenePanel, TextPanel, VoicePanel } from './ScenePanels';
import { MediaPanel, MusicPanel, SettingsPanel } from './ProjectPanels';
import { Recorder } from './Recorder';
import { ExportDialog } from './ExportDialog';

interface Job {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail: string;
  abort: AbortController;
}

type Tab = 'scene' | 'text' | 'voice' | 'media' | 'music' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'scene', label: 'シーン' },
  { id: 'text', label: 'テキスト' },
  { id: 'voice', label: '音声' },
  { id: 'media', label: '素材' },
  { id: 'music', label: 'BGM' },
  { id: 'settings', label: '設定' },
];

export function Editor({ projectId, gemini, demo }: { projectId: string; gemini: Gemini; demo: boolean }) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [textId, setTextId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('scene');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recording, setRecording] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const history = useRef<{ past: Project[]; future: Project[]; last: number }>({ past: [], future: [], last: 0 });

  const refreshAssets = useCallback(() => listAssets().then((a) => setAssets(a.map((x) => x.meta))), []);

  useEffect(() => {
    getProject(projectId).then((p) => {
      if (!p) return setMissing(true);
      setProject(p);
      setSceneId(p.scenes[0]?.id ?? null);
      // start on a frame where the first scene's text has already appeared
      if (p.scenes[0]) setTime(Math.min(1.2, p.scenes[0].duration * 0.5));
    });
    refreshAssets();
  }, [projectId, refreshAssets]);

  // autosave
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project]);

  /** Apply a change; snapshots are grouped so typing doesn't create one undo step per key. */
  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (next === prev) return prev;
      const h = history.current;
      const now = Date.now();
      if (now - h.last > 800) {
        h.past.push(prev);
        if (h.past.length > 100) h.past.shift();
      }
      h.last = now;
      h.future = [];
      return next;
    });
  }, []);

  const updateScene = useCallback((id: string, fn: (s: Scene) => Scene) => update((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === id ? fn(s) : s)) })), [update]);

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !project) return;
    h.future.push(project);
    h.last = 0;
    setProject(prev);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !project) return;
    h.past.push(project);
    h.last = 0;
    setProject(next);
  };

  const runJob = useCallback((label: string, fn: JobFn) => {
    const job: Job = { id: uid(), label, status: 'running', detail: '', abort: new AbortController() };
    setJobs((js) => [...js, job]);
    const patch = (p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, ...p } : j)));
    fn(job.abort.signal, (detail) => patch({ detail }))
      .then(() => {
        patch({ status: 'done', detail: '完了' });
        setTimeout(() => setJobs((js) => js.filter((j) => j.id !== job.id)), 2500);
      })
      .catch((e) => patch({ status: 'error', detail: explainError(e) }));
  }, []);
  const isBusy = useCallback((label: string) => jobs.some((j) => j.label === label && j.status === 'running'), [jobs]);

  // generation requested from the "create" screen
  const autogenDone = useRef(false);
  useEffect(() => {
    if (!project || autogenDone.current) return;
    autogenDone.current = true;
    const raw = sessionStorage.getItem(AUTOGEN_KEY(project.id));
    if (!raw) return;
    sessionStorage.removeItem(AUTOGEN_KEY(project.id));
    const auto = JSON.parse(raw) as AutoGen & { musicPrompt?: string };
    generateMissing(project, auto, auto.musicPrompt);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateMissing = (p: Project, what: Partial<AutoGen>, musicPrompt?: string) => {
    for (const s of p.scenes) {
      if (what.narration && s.narration.text.trim() && !s.narration.assetId) {
        runJob(`ナレーション: ${s.title}`, async (signal) => {
          updateScene(s.id, await genNarration(gemini, s, signal));
          refreshAssets();
        });
      }
      const hasMedia = s.background.kind === 'image' || s.background.kind === 'video';
      if (what.visuals && !hasMedia && s.visualPrompt.trim()) {
        if (s.visualType === 'video') {
          runJob(`動画生成: ${s.title}`, async (signal, progress) => {
            updateScene(s.id, await genVideo(gemini, p.aspect, s, { seconds: 8, resolution: '720p', fromImage: false, onWait: (sec) => progress(`生成中… ${sec} 秒経過`) }, signal));
            refreshAssets();
          });
        } else {
          runJob(`画像生成: ${s.title}`, async (signal) => {
            updateScene(s.id, await genImage(gemini, p.aspect, s, signal));
            refreshAssets();
          });
        }
      }
    }
    if (what.music && !p.music) {
      runJob('BGM 生成', async (signal) => {
        update(await genMusic(gemini, musicPrompt || 'calm, warm background music, 90 bpm', 'clip', signal));
        refreshAssets();
      });
    }
  };

  const spans = useMemo(() => (project ? layout(project).spans : []), [project]);
  const total = spans.length ? spans[spans.length - 1].end : 0;
  const scene = project?.scenes.find((s) => s.id === sceneId) ?? null;

  // keep the selected scene in step with the playhead
  useEffect(() => {
    const span = sceneAt(spans, time);
    if (span && playing && span.scene.id !== sceneId) setSceneId(span.scene.id);
  }, [time, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectScene = (id: string) => {
    setSceneId(id);
    setTextId(null);
    const span = spans.find((s) => s.scene.id === id);
    if (span && !playing) setTime(span.start + Math.min(span.scene.duration * 0.5, 1.2));
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (missing)
    return (
      <div className="center-page">
        <div className="card">
          <p>この動画が見つかりませんでした。</p>
          <button onClick={() => (location.hash = '')}>一覧へ戻る</button>
        </div>
      </div>
    );
  if (!project) return <div className="center-page muted">読み込み中…</div>;

  const theme = themeById(project.themeId);
  const api: EditorApi = { project, scene, gemini, demo, update, updateScene, runJob, isBusy, selectedTextId: textId, setSelectedTextId: setTextId, assets, refreshAssets, openRecorder: () => setRecording(true), time };

  const addScene = (after: number, s: Scene = makeScene(theme, { narration: { text: '', voice: project.defaultVoice, style: '', assetId: null, duration: null } })) => {
    update((p) => {
      const scenes = [...p.scenes];
      scenes.splice(after + 1, 0, s);
      return { ...p, scenes };
    });
    setSceneId(s.id);
  };
  const duplicate = (i: number) => addScene(i, { ...structuredClone(project.scenes[i]), id: uid(), texts: project.scenes[i].texts.map((t) => ({ ...t, id: uid() })) });
  const remove = (id: string) => {
    if (!confirm('このシーンを削除しますか？（「元に戻す」で戻せます）')) return;
    const i = project.scenes.findIndex((s) => s.id === id);
    update((p) => ({ ...p, scenes: p.scenes.filter((s) => s.id !== id) }));
    setSceneId(project.scenes[i + 1]?.id ?? project.scenes[i - 1]?.id ?? null);
  };
  const move = (from: number, to: number) =>
    update((p) => {
      const scenes = [...p.scenes];
      const [s] = scenes.splice(from, 1);
      scenes.splice(to, 0, s);
      return { ...p, scenes };
    });
  const aiScene = () => {
    const idea = prompt('追加するシーンの内容を入力してください（例: 料金プランの比較）');
    if (!idea) return;
    const at = project.scenes.findIndex((s) => s.id === sceneId);
    runJob('AI でシーン追加', async (signal) => {
      const context = project.scenes.map((s, i) => `${i + 1}. ${s.title}: ${s.narration.text}`).join('\n');
      const sb = await generateStoryboard(
        gemini,
        { prompt: `Create exactly ONE new scene about: ${idea}. It will be inserted into this existing video, keep the same style:\n${context}`, reference: '', seconds: 6, tone: '', language: project.language, aspect: project.aspect, themeId: project.themeId, voice: project.defaultVoice, visual: 'image' },
        signal,
      );
      addScene(at < 0 ? project.scenes.length - 1 : at, sceneFromStoryboard(sb.scenes[0], project, project.defaultVoice, sb.voiceStyle));
    });
  };

  const missingVoice = project.scenes.filter((s) => s.narration.text.trim() && !s.narration.assetId).length;
  const missingVisual = project.scenes.filter((s) => s.background.kind !== 'image' && s.background.kind !== 'video' && s.visualPrompt.trim());
  const visualCost = missingVisual.reduce((a, s) => a + (s.visualType === 'video' ? 8 * PRICES.videoPerSecond720 : PRICES.image1K), 0);

  return (
    <div className="editor">
      <div className="topbar">
        <button className="ghost" onClick={() => (location.hash = '')} title="一覧へ戻る">
          ← 一覧
        </button>
        <input className="title-input" value={project.title} onChange={(e) => update((p) => ({ ...p, title: e.target.value }))} />
        {demo && <span className="small-text" style={{ color: 'var(--warn)' }}>体験モード</span>}
        <button className="small ghost" onClick={undo} disabled={!history.current.past.length} title="元に戻す（⌘Z）">
          ↶ 戻す
        </button>
        <button className="small ghost" onClick={redo} disabled={!history.current.future.length} title="やり直す（⇧⌘Z）">
          ↷ やり直す
        </button>
        <span className="grow" />
        <button className="small" disabled={!missingVoice} onClick={() => generateMissing(project, { narration: true })} title="音声がまだないシーンのナレーションを作ります">
          ナレーションを一括生成（{missingVoice}）
        </button>
        <button
          className="small"
          disabled={!missingVisual.length}
          onClick={() => (demo || confirm(`背景が未生成の ${missingVisual.length} シーンに、画像・動画を生成します。\n費用の目安: 約 $${visualCost.toFixed(2)}\nよろしいですか？`)) && generateMissing(project, { visuals: true })}
        >
          背景を一括生成（{missingVisual.length}）
        </button>
        <button className="primary" onClick={() => setExporting(true)}>
          書き出し
        </button>
      </div>

      <div className="workspace">
        <div className="scenes">
          {project.scenes.map((s, i) => (
            <div
              key={s.id}
              className={`scene-item ${s.id === sceneId ? 'active' : ''}`}
              onClick={() => selectScene(s.id)}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
                setDragIndex(null);
              }}
            >
              <SceneThumb project={project} scene={s} width={190} />
              <div className="label">
                <span>
                  {i + 1}. {s.title}
                </span>
                <span className="muted">{s.duration}s</span>
              </div>
              {s.id === sceneId && (
                <div className="row" style={{ marginTop: 4, gap: 4 }}>
                  <button className="small ghost" onClick={(e) => (e.stopPropagation(), duplicate(i))} title="複製">
                    複製
                  </button>
                  <button className="small ghost danger" onClick={(e) => (e.stopPropagation(), remove(s.id))} title="削除">
                    削除
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="row wrap" style={{ gap: 4 }}>
            <button className="small" onClick={() => addScene(project.scenes.findIndex((s) => s.id === sceneId))}>
              ＋ シーン
            </button>
            <button className="small" onClick={aiScene} disabled={isBusy('AI でシーン追加')}>
              ＋ AI で追加
            </button>
          </div>
        </div>

        <div className="stage">
          <div className="canvas-wrap">
            <Player
              project={project}
              time={time}
              playing={playing}
              onTime={setTime}
              onPlaying={setPlaying}
              selectedTextId={textId}
              onSelectText={(id) => {
                setTextId(id);
                if (id) setTab('text');
              }}
              onMoveText={(sid, tid, x, y) => updateScene(sid, (s) => ({ ...s, texts: s.texts.map((t) => (t.id === tid ? { ...t, x, y } : t)) }))}
            />
          </div>
          <div className="player-bar">
            <button className="primary" onClick={() => setPlaying((p) => !p)} style={{ minWidth: 76, justifyContent: 'center' }}>
              {playing ? '❚❚ 停止' : '▶ 再生'}
            </button>
            <span className="small-text" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(time)} / {formatTime(total)}
            </span>
            <input type="range" className="grow" min={0} max={Math.max(0.1, total)} step={0.01} value={Math.min(time, total)} onChange={(e) => (setPlaying(false), setTime(Number(e.target.value)))} />
          </div>
        </div>

        <div className="inspector">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {tab === 'scene' && <ScenePanel api={api} />}
            {tab === 'text' && <TextPanel api={api} />}
            {tab === 'voice' && <VoicePanel api={api} />}
            {tab === 'media' && <MediaPanel api={api} />}
            {tab === 'music' && <MusicPanel api={api} />}
            {tab === 'settings' && <SettingsPanel api={api} />}
          </div>
        </div>
      </div>

      <Timeline
        project={project}
        time={time}
        selectedSceneId={sceneId}
        onSeek={(t) => {
          setPlaying(false);
          setTime(t);
        }}
        onSelectScene={(id) => {
          setSceneId(id);
          setTextId(null);
        }}
        onResizeScene={(id, d) => updateScene(id, (s) => ({ ...s, duration: d }))}
      />

      {jobs.length > 0 && (
        <div className="jobs">
          {jobs.map((j) => (
            <div key={j.id} className="job">
              <div className="row">
                {j.status === 'running' && <span className="busy" />}
                {j.status === 'done' && <span style={{ color: 'var(--ok)' }}>✓</span>}
                {j.status === 'error' && <span style={{ color: 'var(--danger)' }}>✕</span>}
                <span className="grow" style={{ fontWeight: 600 }}>
                  {j.label}
                </span>
                {j.status === 'running' ? (
                  <button className="small ghost" onClick={() => j.abort.abort()}>
                    中止
                  </button>
                ) : (
                  <button className="small ghost" onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))}>
                    ×
                  </button>
                )}
              </div>
              {j.detail && <div className={j.status === 'error' ? 'error' : 'muted'}>{j.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {recording && (
        <Recorder
          script={scene?.narration.text ?? ''}
          onClose={() => setRecording(false)}
          onSaved={(a) => {
            setRecording(false);
            refreshAssets();
            if (scene) updateScene(scene.id, (s) => ({ ...s, background: { kind: 'video', assetId: a.id, fit: 'contain', trimStart: 0, volume: 1, loop: false }, duration: Math.max(1, Math.round((a.duration ?? s.duration) * 10) / 10) }));
          }}
        />
      )}
      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
    </div>
  );
}
