import { useEffect, useMemo, useRef } from 'react';
import type { Project, TextItem } from '../lib/model';
import { drawFrame, plan } from '../lib/render';
import { PreviewMedia } from '../lib/media';
import { loadBuffers, schedule } from '../lib/mix';
import { audioCtx } from '../lib/audio';
import { sceneAt } from '../lib/timeline';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  onTime: (t: number) => void;
  onPlaying: (p: boolean) => void;
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
  onMoveText: (sceneId: string, textId: string, x: number, y: number) => void;
}

/** Live preview: draws with the shared renderer, plays audio through WebAudio and keeps <video> elements in sync. */
export function Player({ project, time, playing, onTime, onPlaying, selectedTextId, onSelectText, onMoveText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const media = useMemo(() => new PreviewMedia(), []);
  const rp = useMemo(() => plan(project, 0.5), [project]);
  const state = useRef({ project, rp, time, selectedTextId });
  state.current = { project, rp, time, selectedTextId };

  const draw = (t: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const { project: p, rp: r, selectedTextId: sel } = state.current;
    const ctx = c.getContext('2d')!;
    drawFrame(ctx, p, r, t, media);
    // selection outline for the text being edited
    const span = sceneAt(r.spans, t);
    const item = span?.scene.texts.find((x) => x.id === sel);
    if (item && !playing) {
      const b = textBox(item, r.W, r.H);
      ctx.save();
      ctx.strokeStyle = '#4f7dff';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  };

  // load media used by the project
  useEffect(() => {
    media.onReady = () => draw(state.current.time);
    for (const s of project.scenes) {
      const bg = s.background;
      if (bg.kind === 'image' || bg.kind === 'video') media.ensure({ id: bg.assetId, kind: bg.kind });
    }
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Put each <video> at the right position for time t; play the active one when playing. */
  const syncVideos = (t: number, play: boolean) => {
    const { rp: r } = state.current;
    const span = sceneAt(r.spans, t);
    const active = new Set<string>();
    if (span && span.scene.background.kind === 'video') {
      const bg = span.scene.background;
      const v = media.videos.get(bg.assetId);
      if (v) {
        active.add(bg.assetId);
        const local = Math.min(t - span.start, span.scene.duration);
        let target = bg.trimStart + local;
        if (v.duration) target = bg.loop ? bg.trimStart + ((target - bg.trimStart) % Math.max(0.1, v.duration - bg.trimStart)) : Math.min(target, v.duration - 0.05);
        if (Math.abs(v.currentTime - target) > (play ? 0.3 : 0.02)) v.currentTime = target;
        if (play && v.paused) v.play().catch(() => {});
        if (!play && !v.paused) v.pause();
      }
    }
    media.videos.forEach((v, id) => {
      if (!active.has(id) && !v.paused) v.pause();
    });
  };

  // redraw when paused and something changes; also redraw after seeks complete
  useEffect(() => {
    if (playing) return;
    syncVideos(time, false);
    draw(time);
    const redraw = () => draw(state.current.time);
    media.videos.forEach((v) => v.addEventListener('seeked', redraw));
    return () => media.videos.forEach((v) => v.removeEventListener('seeked', redraw));
  }, [time, project, playing, selectedTextId]); // eslint-disable-line react-hooks/exhaustive-deps

  // playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let stopped = false;
    let nodes: AudioScheduledSourceNode[] = [];
    const ctx = audioCtx();
    const startT = state.current.time >= rp.total - 0.05 ? 0 : state.current.time;
    let t0 = 0;
    (async () => {
      await ctx.resume();
      const buffers = await loadBuffers(state.current.project);
      if (stopped) return;
      t0 = ctx.currentTime + 0.05;
      nodes = schedule(ctx, state.current.project, buffers, startT, t0);
      const tick = () => {
        if (stopped) return;
        const t = startT + Math.max(0, ctx.currentTime - t0);
        if (t >= state.current.rp.total) {
          onTime(state.current.rp.total);
          onPlaying(false);
          return;
        }
        syncVideos(t, true);
        draw(t);
        onTime(t);
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      media.videos.forEach((v) => v.pause());
    };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // drag text directly on the canvas
  const drag = useRef<{ sceneId: string; textId: string; dx: number; dy: number } | null>(null);
  const toNorm = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e: React.PointerEvent) => {
    if (playing) return;
    const span = sceneAt(rp.spans, time);
    if (!span) return;
    const { x, y } = toNorm(e);
    const hit = [...span.scene.texts].reverse().find((t) => {
      const b = textBox(t, 1, 1);
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    });
    onSelectText(hit?.id ?? null);
    if (hit) {
      drag.current = { sceneId: span.scene.id, textId: hit.id, dx: x - hit.x, dy: y - hit.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y } = toNorm(e);
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    onMoveText(drag.current.sceneId, drag.current.textId, clamp(x - drag.current.dx), clamp(y - drag.current.dy));
  };

  return (
    <canvas
      ref={canvasRef}
      width={rp.W}
      height={rp.H}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => onPlaying(!playing)}
      style={{ cursor: playing ? 'default' : 'crosshair', aspectRatio: `${rp.W} / ${rp.H}` }}
    />
  );
}

/** Approximate bounding box of a text item (normalized when W=H=1). */
function textBox(t: TextItem, W: number, H: number) {
  const lines = Math.max(1, t.text.split('\n').length);
  const h = t.size * 1.3 * lines * H + t.size * H * 0.4;
  const w = t.width * W;
  return { x: t.x * W - w / 2, y: t.y * H - h / 2, w, h };
}
