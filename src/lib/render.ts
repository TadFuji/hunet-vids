// Frame renderer shared by the live preview and the MP4 exporter.
// drawFrame() is synchronous: callers must supply already-decoded media through a FrameSource.
import { ASPECT_SIZES, TRANSITION_SECONDS, themeById } from './model';
import type { Background, Motion, Project, Scene, TextItem } from './model';
import { captionCues, layout, sceneAt } from './timeline';
import type { Cue } from './timeline';

export type Drawable = CanvasImageSource & { width?: number; height?: number };

export interface FrameSource {
  /** Image (or current video frame) for an asset at a time local to the scene's media. */
  get(assetId: string, mediaTime: number): Drawable | null;
}

const sizeOf = (d: Drawable): { w: number; h: number } => {
  if (d instanceof HTMLVideoElement) return { w: d.videoWidth, h: d.videoHeight };
  if (d instanceof HTMLImageElement) return { w: d.naturalWidth, h: d.naturalHeight };
  if (typeof ImageBitmap !== 'undefined' && d instanceof ImageBitmap) return { w: d.width, h: d.height };
  return { w: Number(d.width) || 1, h: Number(d.height) || 1 };
};

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function motionTransform(motion: Motion, p: number): { scale: number; dx: number } {
  switch (motion) {
    case 'zoom-in':
      return { scale: 1 + 0.12 * p, dx: 0 };
    case 'zoom-out':
      return { scale: 1.12 - 0.12 * p, dx: 0 };
    case 'pan-left':
      return { scale: 1.12, dx: 0.05 - 0.1 * p };
    case 'pan-right':
      return { scale: 1.12, dx: -0.05 + 0.1 * p };
    default:
      return { scale: 1, dx: 0 };
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Background, scene: Scene, local: number, src: FrameSource) {
  if (bg.kind === 'color') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (bg.kind === 'gradient') {
    const a = (bg.angle * Math.PI) / 180;
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const mediaTime = bg.kind === 'video' ? bg.trimStart + local : 0;
  const img = src.get(bg.assetId, mediaTime);
  if (!img) return;
  const { w, h } = sizeOf(img);
  if (!w || !h) return;
  const base = bg.fit === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
  const { scale, dx } = motionTransform(scene.motion, scene.duration ? local / scene.duration : 0);
  const dw = w * base * scale;
  const dh = h * base * scale;
  ctx.drawImage(img, (W - dw) / 2 + dx * W, (H - dh) / 2, dw, dh);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    // CJK has no spaces, so wrap per character; keep latin words together.
    const tokens = para.match(/[A-Za-z0-9'’\-.,!?]+\s*|\s+|./gu) ?? [''];
    let line = '';
    for (const tok of tokens) {
      if (ctx.measureText(line + tok).width > maxW && line) {
        lines.push(line.trimEnd());
        line = tok.trimStart();
      } else line += tok;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function drawText(ctx: CanvasRenderingContext2D, W: number, H: number, t: TextItem, local: number, sceneDur: number) {
  const end = t.end ?? sceneDur;
  if (local < t.start || local > end) return;
  const age = local - t.start;
  const inP = easeOut(age / 0.6);
  const outP = t.end == null ? 1 : easeOut((end - local) / 0.3);
  let alpha = 1;
  let dy = 0;
  let scale = 1;
  let text = t.text;
  switch (t.anim) {
    case 'fade':
      alpha = inP;
      break;
    case 'rise':
      alpha = inP;
      dy = (1 - inP) * H * 0.04;
      break;
    case 'pop':
      alpha = Math.min(1, age / 0.15);
      scale = 0.7 + 0.3 * easeOut(age / 0.35) + Math.sin(Math.min(1, age / 0.35) * Math.PI) * 0.06;
      break;
    case 'typewriter': {
      const chars = [...t.text];
      text = chars.slice(0, Math.ceil(chars.length * Math.min(1, age / Math.max(0.6, chars.length * 0.06)))).join('');
      break;
    }
  }
  alpha *= outP;
  if (alpha <= 0 || !text) return;

  const px = Math.round(t.size * Math.min(W, H));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${t.weight} ${px}px ${t.font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = t.align;
  const maxW = t.width * W;
  const lines = wrapLines(ctx, text, maxW);
  const lh = px * 1.3;
  const cx = t.x * W;
  const cy = t.y * H + dy;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const blockH = lh * lines.length;
  const anchorX = t.align === 'left' ? -maxW / 2 : t.align === 'right' ? maxW / 2 : 0;
  if (t.bg) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pad = px * 0.4;
    const left = t.align === 'left' ? anchorX : t.align === 'right' ? anchorX - widest : -widest / 2;
    ctx.fillStyle = t.bg;
    roundRect(ctx, left - pad, -blockH / 2 - pad * 0.6, widest + pad * 2, blockH + pad * 1.2, px * 0.25);
    ctx.fill();
  }
  if (t.shadow && !t.bg) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = px * 0.25;
    ctx.shadowOffsetY = px * 0.05;
  }
  ctx.fillStyle = t.color;
  lines.forEach((l, i) => ctx.fillText(l, anchorX, -blockH / 2 + lh * (i + 0.5)));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, scene: Scene, local: number, src: FrameSource) {
  drawBackground(ctx, W, H, scene.background, scene, local, src);
  for (const t of scene.texts) drawText(ctx, W, H, t, local, scene.duration);
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, project: Project, cue: Cue) {
  const c = project.captions;
  const px = Math.round(c.size * Math.min(W, H));
  ctx.save();
  ctx.font = `700 ${px}px ${themeById(project.themeId).font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, cue.text, W * 0.86);
  const lh = px * 1.35;
  const blockH = lh * lines.length;
  const cy = c.position === 'top' ? H * 0.1 + blockH / 2 : c.position === 'middle' ? H / 2 : H * 0.9 - blockH / 2;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = c.bg;
  roundRect(ctx, W / 2 - widest / 2 - px * 0.5, cy - blockH / 2 - px * 0.25, widest + px, blockH + px * 0.5, px * 0.2);
  ctx.fill();
  ctx.fillStyle = c.color;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, cy - blockH / 2 + lh * (i + 0.5)));
  ctx.restore();
}

export interface RenderPlan {
  W: number;
  H: number;
  spans: ReturnType<typeof layout>['spans'];
  total: number;
  cues: Cue[];
}

export function plan(project: Project, scale = 1): RenderPlan {
  const { w, h } = ASPECT_SIZES[project.aspect];
  const { spans, total } = layout(project);
  return { W: Math.round(w * scale), H: Math.round(h * scale), spans, total, cues: project.captions.enabled ? captionCues(project) : [] };
}

/** Which (assetId, mediaTime) pairs drawFrame needs at time t. Used to pre-fetch frames during export. */
export function mediaNeeds(rp: RenderPlan, t: number): { assetId: string; time: number }[] {
  const out: { assetId: string; time: number }[] = [];
  const span = sceneAt(rp.spans, t);
  if (!span) return out;
  const push = (scene: Scene, local: number) => {
    const bg = scene.background;
    if (bg.kind === 'image') out.push({ assetId: bg.assetId, time: 0 });
    if (bg.kind === 'video') out.push({ assetId: bg.assetId, time: bg.trimStart + local });
  };
  const local = t - span.start;
  push(span.scene, local);
  if (span.index > 0 && span.scene.transition !== 'cut' && local < TRANSITION_SECONDS) {
    const prev = rp.spans[span.index - 1].scene;
    push(prev, prev.duration);
  }
  return out;
}

export function drawFrame(ctx: CanvasRenderingContext2D, project: Project, rp: RenderPlan, t: number, src: FrameSource) {
  const { W, H } = rp;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const span = sceneAt(rp.spans, t);
  if (!span) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  const local = Math.min(t - span.start, span.scene.duration);
  const inTransition = span.index > 0 && span.scene.transition !== 'cut' && local < TRANSITION_SECONDS;
  if (!inTransition) {
    drawScene(ctx, W, H, span.scene, local, src);
  } else {
    const prev = rp.spans[span.index - 1].scene;
    const p = easeOut(local / TRANSITION_SECONDS);
    drawScene(ctx, W, H, prev, prev.duration, src);
    ctx.save();
    switch (span.scene.transition) {
      case 'fade':
        ctx.globalAlpha = p;
        break;
      case 'slide-left':
        ctx.translate((1 - p) * W, 0);
        break;
      case 'slide-up':
        ctx.translate(0, (1 - p) * H);
        break;
      case 'wipe':
        ctx.beginPath();
        ctx.rect(0, 0, W * p, H);
        ctx.clip();
        break;
      case 'zoom':
        ctx.globalAlpha = p;
        ctx.translate(W / 2, H / 2);
        ctx.scale(0.8 + 0.2 * p, 0.8 + 0.2 * p);
        ctx.translate(-W / 2, -H / 2);
        break;
    }
    drawScene(ctx, W, H, span.scene, local, src);
    ctx.restore();
  }
  const cue = rp.cues.find((c) => t >= c.start && t < c.end);
  if (cue) drawCaption(ctx, W, H, project, cue);
  ctx.restore();
}
