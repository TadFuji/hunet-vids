// Core data model for a my-vids project. Everything here is plain JSON so it can be
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
