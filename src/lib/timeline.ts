// Pure timing helpers: where each scene sits on the timeline, caption cues, SRT export.
import type { Project, Scene } from './model';

export const NARRATION_LEAD = 0.3; // seconds of silence before narration starts in a scene
export const NARRATION_TAIL = 0.5; // seconds kept after narration ends

export interface SceneSpan {
  scene: Scene;
  index: number;
  start: number;
  end: number;
}

export function layout(project: Project): { spans: SceneSpan[]; total: number } {
  let t = 0;
  const spans = project.scenes.map((scene, index) => {
    const span = { scene, index, start: t, end: t + scene.duration };
    t += scene.duration;
    return span;
  });
  return { spans, total: t };
}

export function sceneAt(spans: SceneSpan[], t: number): SceneSpan | null {
  if (spans.length === 0) return null;
  for (const s of spans) if (t < s.end) return s;
  return spans[spans.length - 1];
}

/** Minimum scene length needed to fit its narration audio. */
export function minDurationFor(scene: Scene): number {
  const n = scene.narration.duration;
  return n ? Math.ceil((n + NARRATION_LEAD + NARRATION_TAIL) * 10) / 10 : 1;
}

/** Scene has narration text but no voice audio yet. */
export const needsVoice = (s: Scene) => !!s.narration.text.trim() && !s.narration.assetId && !s.narration.inVideo;

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const SENTENCE_END = /([。！？!?．.]+["」』）)]*)/;

/** Split narration text into short caption chunks. */
export function splitCaption(text: string, maxLen = 26): string[] {
  const parts: string[] = [];
  for (const raw of text.replace(/\s*\n+\s*/g, ' ').split(SENTENCE_END)) {
    if (!raw) continue;
    if (SENTENCE_END.test(raw) && parts.length) {
      parts[parts.length - 1] += raw;
      continue;
    }
    parts.push(raw);
  }
  const out: string[] = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (p.length <= maxLen) {
      out.push(p);
      continue;
    }
    // break long sentences at commas / spaces, then hard-wrap
    let rest = p;
    while (rest.length > maxLen) {
      const window = rest.slice(0, maxLen + 1);
      const cut = Math.max(window.lastIndexOf('、'), window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf(' '));
      const at = cut >= maxLen / 3 ? cut + 1 : maxLen;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Caption cues timed proportionally to character count over each narration clip. */
export function captionCues(project: Project): Cue[] {
  const cues: Cue[] = [];
  for (const span of layout(project).spans) {
    const n = span.scene.narration;
    if (!n.text.trim()) continue;
    const chunks = splitCaption(n.text);
    const start = span.start + NARRATION_LEAD;
    const speak = n.duration ?? Math.max(1, span.scene.duration - NARRATION_LEAD - NARRATION_TAIL);
    const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
    let t = start;
    for (const c of chunks) {
      const d = (speak * c.length) / total;
      cues.push({ start: t, end: Math.min(t + d, span.end), text: c });
      t += d;
    }
  }
  return cues;
}

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const pad = (v: number, n = 2) => String(v).padStart(n, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms % 1000, 3)}`;
};

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

export const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
