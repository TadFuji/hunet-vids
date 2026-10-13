import { useEffect, useRef } from 'react';
import { ASPECT_SIZES } from '../lib/model';
import type { Project, Scene } from '../lib/model';
import { drawFrame } from '../lib/render';
import type { RenderPlan } from '../lib/render';
import { PreviewMedia } from '../lib/media';

const shared = new PreviewMedia();

/** Static thumbnail of one scene, drawn with the same renderer as the player. */
export function SceneThumb({ project, scene, width = 180 }: { project: Project; scene: Scene; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = ASPECT_SIZES[project.aspect];
  const scale = width / w;

  useEffect(() => {
    let alive = true;
    const draw = () => {
      const c = ref.current;
      if (!c || !alive) return;
      const ctx = c.getContext('2d')!;
      // draw at reduced resolution: fake a plan for a one-scene project, without captions
      const rp: RenderPlan = { W: c.width, H: c.height, spans: [{ scene: { ...scene, transition: 'cut' }, index: 0, start: 0, end: scene.duration }], total: scene.duration, cues: [] };
      const t = Math.min(scene.duration - 0.01, Math.max(1, scene.duration * 0.5));
      drawFrame(ctx, project, rp, t, shared);
    };
    const bg = scene.background;
    if (bg.kind === 'image' || bg.kind === 'video') shared.ensure({ id: bg.assetId, kind: bg.kind }).then(draw);
    draw();
    return () => {
      alive = false;
    };
  }, [project, scene]);

  return <canvas ref={ref} width={Math.round(w * scale)} height={Math.round(h * scale)} />;
}
