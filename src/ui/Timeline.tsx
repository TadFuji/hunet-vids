import { useRef, useState } from 'react';
import type { Project } from '../lib/model';
import { captionCues, formatTime, layout, NARRATION_LEAD } from '../lib/timeline';

interface Props {
  project: Project;
  time: number;
  selectedSceneId: string | null;
  onSeek: (t: number) => void;
  onSelectScene: (id: string) => void;
  onResizeScene: (id: string, duration: number) => void;
}

export function Timeline({ project, time, selectedSceneId, onSeek, onSelectScene, onResizeScene }: Props) {
  const [pps, setPps] = useState(40); // pixels per second
  const { spans, total } = layout(project);
  const cues = project.captions.enabled ? captionCues(project) : [];
  const ref = useRef<HTMLDivElement>(null);
  const width = Math.max(total, 10) * pps + 120;

  const seekFromEvent = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(total, (e.clientX - rect.left) / pps)));
  };

  const startResize = (e: React.PointerEvent, id: string, startDur: number) => {
    e.stopPropagation();
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => onResizeScene(id, Math.max(1, Math.round((startDur + (ev.clientX - x0) / pps) * 10) / 10));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const step = pps >= 60 ? 1 : pps >= 25 ? 2 : 5;
  const ticks = [];
  for (let s = 0; s <= Math.max(total, 10); s += step) ticks.push(s);

  return (
    <div className="timeline">
      <div style={{ position: 'absolute', right: 8, top: 2, zIndex: 5 }} className="row small-text">
        <button className="small ghost" onClick={() => setPps((p) => Math.max(10, p / 1.5))} title="縮小">
          −
        </button>
        <button className="small ghost" onClick={() => setPps((p) => Math.min(200, p * 1.5))} title="拡大">
          ＋
        </button>
      </div>
      <div className="tl-inner" style={{ width }}>
        <div className="tl-ruler" onPointerDown={seekFromEvent}>
          {ticks.map((s) => (
            <div key={s} className="tl-tick" style={{ left: s * pps }}>
              {formatTime(s)}
            </div>
          ))}
        </div>
        <div ref={ref} style={{ position: 'relative' }}>
          <div className="tl-playhead" style={{ left: time * pps, top: -22, height: 200 }} />
          <div className="tl-track">
            <span className="tl-track-label">シーン</span>
            {spans.map((s) => (
              <div
                key={s.scene.id}
                className={`tl-clip scene ${s.scene.id === selectedSceneId ? 'active' : ''}`}
                style={{ left: s.start * pps, width: s.scene.duration * pps - 2 }}
                onPointerDown={(e) => {
                  onSelectScene(s.scene.id);
                  seekFromEvent(e);
                }}
                title={`${s.scene.title}（${s.scene.duration}秒）`}
              >
                {s.index + 1}. {s.scene.title}
                <div className="tl-handle" onPointerDown={(e) => startResize(e, s.scene.id, s.scene.duration)} title="ドラッグで長さを変更" />
              </div>
            ))}
          </div>
          <div className="tl-track">
            <span className="tl-track-label">ナレーション</span>
            {spans
              .filter((s) => s.scene.narration.assetId && s.scene.narration.duration)
              .map((s) => (
                <div key={s.scene.id} className="tl-clip voice" style={{ left: (s.start + NARRATION_LEAD) * pps, width: Math.min(s.scene.narration.duration!, s.scene.duration - NARRATION_LEAD) * pps }} title={s.scene.narration.text}>
                  {s.scene.narration.text}
                </div>
              ))}
          </div>
          <div className="tl-track">
            <span className="tl-track-label">BGM</span>
            {project.music && (
              <div className="tl-clip music" style={{ left: 0, width: total * pps }} title={project.music.prompt}>
                ♪ {project.music.prompt ?? 'BGM'}
              </div>
            )}
          </div>
          <div className="tl-track" style={{ height: 26 }}>
            <span className="tl-track-label">字幕</span>
            {cues.map((c, i) => (
              <div key={i} className="tl-clip caption" style={{ left: c.start * pps, width: Math.max(2, (c.end - c.start) * pps - 1) }} title={c.text}>
                {c.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
