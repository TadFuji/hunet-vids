// Core data model for a hunet vids project. Everything here is plain JSON so it can be
// stored in IndexedDB as-is. Media blobs live separately in the asset store.

export type Aspect = '16:9' | '9:16' | '1:1';

export const ASPECT_SIZES: Record<Aspect, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
};

export type AssetKind = 'image' | 'video' | 'audio';
export type AssetSource = 'upload' | 'record' | 'veo' | 'image-ai' | 'tts' | 'music-ai' | 'stock';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  mime: string;
  name: string;
  source: AssetSource;
  prompt?: string;
  duration?: number; // seconds (video/audio)
  width?: number;
  height?: number;
  createdAt: number;
}

export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image'; assetId: string; fit: 'cover' | 'contain' }
  | { kind: 'video'; assetId: string; fit: 'cover' | 'contain'; trimStart: number; volume: number; loop: boolean };

export type Motion = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type Transition = 'cut' | 'fade' | 'slide-left' | 'slide-up' | 'wipe' | 'zoom';
export type TextAnim = 'none' | 'fade' | 'rise' | 'pop' | 'typewriter';

export interface TextItem {
  id: string;
  text: string;
  x: number; // center, 0..1 of frame width
  y: number; // center, 0..1 of frame height
  width: number; // max line width, 0..1 of frame width
  size: number; // font size as fraction of frame height
  color: string;
  bg: string | null; // box behind text
  weight: 400 | 700 | 900;
  align: 'left' | 'center' | 'right';
  font: string;
  anim: TextAnim;
  start: number; // seconds from scene start
  end: number | null; // null = until scene end
  shadow: boolean;
}

export interface Narration {
  text: string;
  voice: string;
  style: string; // free-form delivery instruction, e.g. "calm and warm"
  assetId: string | null;
  duration: number | null;
  inVideo?: boolean; // spoken by a person in the background clip, so no TTS audio is needed
}

export interface Scene {
  id: string;
  title: string;
  duration: number; // seconds
  background: Background;
  motion: Motion;
  texts: TextItem[];
  narration: Narration;
  transition: Transition; // transition INTO this scene from the previous one
  visualPrompt: string; // prompt used to generate the background
  visualType: 'image' | 'video';
  notes: string;
}

export interface MusicTrack {
  assetId: string;
  volume: number; // 0..1
  fadeIn: number;
  fadeOut: number;
  duck: boolean; // lower music while narration plays
  prompt?: string;
}

export interface CaptionStyle {
  enabled: boolean;
  size: number; // fraction of frame height
  color: string;
  bg: string;
  position: 'bottom' | 'top' | 'middle';
}

export interface Theme {
  id: string;
  name: string;
  font: string;
  titleColor: string;
  bodyColor: string;
  accent: string;
  bg: Background;
}

export interface Project {
  id: string;
  title: string;
  aspect: Aspect;
  themeId: string;
  scenes: Scene[];
  music: MusicTrack | null;
  captions: CaptionStyle;
  language: string; // BCP-47-ish, e.g. "ja"
  defaultVoice: string;
  createdAt: number;
  updatedAt: number;
}

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);

export const TRANSITION_SECONDS = 0.6;

export const THEMES: Theme[] = [
  { id: 'hunet', name: 'hunet', font: '"Hiragino Sans", "Noto Sans JP", sans-serif', titleColor: '#ffffff', bodyColor: '#dbe4f6', accent: '#fc9a04', bg: { kind: 'gradient', from: '#0d357a', to: '#081f4a', angle: 135 } },
  { id: 'midnight', name: 'ミッドナイト', font: '"Hiragino Sans", "Noto Sans JP", sans-serif', titleColor: '#ffffff', bodyColor: '#d7defa', accent: '#5b8cff', bg: { kind: 'gradient', from: '#0d1430', to: '#24346e', angle: 135 } },
  { id: 'paper', name: 'ペーパー', font: '"Hiragino Mincho ProN", "Noto Serif JP", serif', titleColor: '#1c1c1c', bodyColor: '#333333', accent: '#c2410c', bg: { kind: 'color', color: '#f4f4f2' } },
  { id: 'vivid', name: 'ビビッド', font: '"Hiragino Sans", "Noto Sans JP", sans-serif', titleColor: '#ffffff', bodyColor: '#fff4e6', accent: '#ffd23f', bg: { kind: 'gradient', from: '#ff3d77', to: '#7a2cff', angle: 120 } },
  { id: 'forest', name: 'フォレスト', font: '"Hiragino Sans", "Noto Sans JP", sans-serif', titleColor: '#f2fff4', bodyColor: '#cfe9d4', accent: '#7ee08a', bg: { kind: 'gradient', from: '#0b2b1c', to: '#1f5a3a', angle: 160 } },
  { id: 'mono', name: 'モノクロ', font: '"Helvetica Neue", "Hiragino Sans", sans-serif', titleColor: '#ffffff', bodyColor: '#bdbdbd', accent: '#ffffff', bg: { kind: 'color', color: '#111111' } },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function makeText(theme: Theme, partial: Partial<TextItem> = {}): TextItem {
  return {
    id: uid(),
    text: 'テキスト',
    x: 0.5,
    y: 0.5,
    width: 0.8,
    size: 0.07,
    color: theme.titleColor,
    bg: null,
    weight: 700,
    align: 'center',
    font: theme.font,
    anim: 'rise',
    start: 0,
    end: null,
    shadow: true,
    ...partial,
  };
}

export function makeScene(theme: Theme, partial: Partial<Scene> = {}): Scene {
  return {
    id: uid(),
    title: '新しいシーン',
    duration: 5,
    background: theme.bg,
    motion: 'none',
    texts: [],
    narration: { text: '', voice: 'Kore', style: '', assetId: null, duration: null },
    transition: 'fade',
    visualPrompt: '',
    visualType: 'image',
    notes: '',
    ...partial,
  };
}

export function makeProject(partial: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: uid(),
    title: '無題の動画',
    aspect: '16:9',
    themeId: THEMES[0].id,
    scenes: [],
    music: null,
    captions: { enabled: true, size: 0.045, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', position: 'bottom' },
    language: 'ja',
    defaultVoice: 'Kore',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

function normalizeBackground(v: unknown, theme: Theme): Background {
  if (!isObj(v)) return theme.bg;
  if (v.kind === 'color') return { kind: 'color', color: str(v.color, '#111111') };
  if (v.kind === 'gradient') return { kind: 'gradient', from: str(v.from, '#000000'), to: str(v.to, '#333333'), angle: num(v.angle, 135) };
  if (v.kind === 'image' && typeof v.assetId === 'string') return { kind: 'image', assetId: v.assetId, fit: v.fit === 'contain' ? 'contain' : 'cover' };
  if (v.kind === 'video' && typeof v.assetId === 'string')
    return { kind: 'video', assetId: v.assetId, fit: v.fit === 'contain' ? 'contain' : 'cover', trimStart: num(v.trimStart, 0, 0), volume: num(v.volume, 0.8, 0, 1), loop: !!v.loop };
  return theme.bg;
}

/**
 * Turn untrusted JSON (an imported backup file) into a well-formed Project,
 * filling defaults for anything missing so the UI can never crash on it.
 */
export function normalizeProject(raw: unknown): Project {
  if (!isObj(raw)) throw new Error('プロジェクトの内容を読み取れませんでした');
  const base = makeProject();
  const aspect: Aspect = raw.aspect === '9:16' || raw.aspect === '1:1' ? raw.aspect : '16:9';
  const theme = themeById(str(raw.themeId, base.themeId));
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).filter(isObj).map((s) => {
    const d = makeScene(theme);
    const n = isObj(s.narration) ? s.narration : {};
    return {
      ...d,
      id: str(s.id, d.id),
      title: str(s.title, d.title),
      duration: num(s.duration, d.duration, 0.5, 600),
      background: normalizeBackground(s.background, theme),
      motion: (['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'] as const).find((m) => m === s.motion) ?? 'none',
      transition: (['cut', 'fade', 'slide-left', 'slide-up', 'wipe', 'zoom'] as const).find((m) => m === s.transition) ?? 'fade',
      visualPrompt: str(s.visualPrompt, ''),
      visualType: s.visualType === 'video' ? 'video' : 'image',
      notes: str(s.notes, ''),
      narration: {
        text: str(n.text, ''),
        voice: str(n.voice, d.narration.voice),
        style: str(n.style, ''),
        assetId: typeof n.assetId === 'string' ? n.assetId : null,
        duration: typeof n.duration === 'number' && Number.isFinite(n.duration) ? n.duration : null,
        inVideo: !!n.inVideo,
      },
      texts: (Array.isArray(s.texts) ? s.texts : []).filter(isObj).map((t) => {
        const dt = makeText(theme);
        return {
          ...dt,
          id: str(t.id, dt.id),
          text: str(t.text, ''),
          x: num(t.x, 0.5, 0, 1),
          y: num(t.y, 0.5, 0, 1),
          width: num(t.width, 0.8, 0.05, 1),
          size: num(t.size, 0.07, 0.005, 0.5),
          color: str(t.color, dt.color),
          bg: typeof t.bg === 'string' ? t.bg : null,
          weight: t.weight === 400 || t.weight === 900 ? t.weight : 700,
          align: t.align === 'left' || t.align === 'right' ? t.align : 'center',
          font: str(t.font, dt.font),
          anim: (['none', 'fade', 'rise', 'pop', 'typewriter'] as const).find((a) => a === t.anim) ?? 'none',
          start: num(t.start, 0, 0),
          end: typeof t.end === 'number' && Number.isFinite(t.end) ? t.end : null,
          shadow: t.shadow !== false,
        } satisfies TextItem;
      }),
    } satisfies Scene;
  });
  const m = isObj(raw.music) && typeof raw.music.assetId === 'string' ? raw.music : null;
  const c = isObj(raw.captions) ? raw.captions : {};
  return {
    ...base,
    title: str(raw.title, base.title).slice(0, 200),
    aspect,
    themeId: theme.id,
    scenes,
    music: m ? { assetId: m.assetId as string, volume: num(m.volume, 0.35, 0, 1), fadeIn: num(m.fadeIn, 1, 0, 30), fadeOut: num(m.fadeOut, 2, 0, 30), duck: m.duck !== false, prompt: typeof m.prompt === 'string' ? m.prompt : undefined } : null,
    captions: {
      enabled: c.enabled !== false,
      size: num(c.size, base.captions.size, 0.01, 0.2),
      color: str(c.color, base.captions.color),
      bg: str(c.bg, base.captions.bg),
      position: c.position === 'top' || c.position === 'middle' ? c.position : 'bottom',
    },
    language: str(raw.language, base.language),
    defaultVoice: str(raw.defaultVoice, base.defaultVoice),
  };
}
