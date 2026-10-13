// "Help me create": turn a brief into a scene-by-scene storyboard with Gemini structured output.
import type { Gemini } from './gemini';
import { makeProject, makeScene, makeText, themeById } from './model';
import type { Aspect, Motion, Project, Scene } from './model';

export interface Brief {
  prompt: string;
  reference: string; // pasted text / file contents used as source material
  seconds: number; // target length
  tone: string;
  language: string;
  aspect: Aspect;
  themeId: string;
  voice: string;
  visual: 'image' | 'video' | 'mixed';
}

export interface StoryboardScene {
  title: string;
  headline: string;
  subtext: string;
  narration: string;
  visualPrompt: string;
  visualType: 'image' | 'video';
  seconds: number;
  motion: Motion;
}

export interface Storyboard {
  title: string;
  musicPrompt: string;
  voiceStyle: string;
  scenes: StoryboardScene[];
}

export const STORYBOARD_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    musicPrompt: { type: 'string', description: 'English prompt for instrumental background music' },
    voiceStyle: { type: 'string', description: 'How the narrator should sound, in the narration language' },
    scenes: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          headline: { type: 'string', description: 'Short on-screen headline, max ~16 characters for Japanese' },
          subtext: { type: 'string', description: 'Optional short supporting line; empty string if none' },
          narration: { type: 'string' },
          visualPrompt: { type: 'string', description: 'Detailed English prompt for the background image or video, no text in the image' },
          visualType: { type: 'string', enum: ['image', 'video'] },
          seconds: { type: 'integer', minimum: 3, maximum: 20 },
          motion: { type: 'string', enum: ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'] },
        },
        required: ['title', 'headline', 'subtext', 'narration', 'visualPrompt', 'visualType', 'seconds', 'motion'],
      },
    },
  },
  required: ['title', 'musicPrompt', 'voiceStyle', 'scenes'],
};

const LANG_NAMES: Record<string, string> = { ja: 'Japanese', en: 'English', zh: 'Chinese', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German' };

export function storyboardPrompt(b: Brief): string {
  const lang = LANG_NAMES[b.language] ?? b.language;
  const visualRule =
    b.visual === 'image'
      ? 'Every scene uses visualType "image".'
      : b.visual === 'video'
        ? 'Every scene uses visualType "video" (an 8-second AI video clip with natural motion).'
        : 'Use visualType "video" for 1-3 scenes where motion matters most, "image" for the rest.';
  return [
    'You are a professional short-video producer. Create a storyboard for a video.',
    `Brief: ${b.prompt}`,
    b.reference.trim() ? `Source material (use its facts, do not invent numbers):\n"""\n${b.reference.slice(0, 30000)}\n"""` : '',
    `Target total length: about ${b.seconds} seconds. Aspect ratio: ${b.aspect}. Tone: ${b.tone || 'clear and friendly'}.`,
    `Write title, headline, subtext and narration in ${lang}. Write visualPrompt and musicPrompt in English.`,
    'Narration is spoken by a TTS voice: natural spoken sentences, roughly 7 Japanese characters or 2.5 English words per second, so it fits the scene length.',
    'The first scene hooks the viewer; the last scene wraps up with a clear takeaway or call to action.',
    `visualPrompt describes a cinematic, cohesive look across scenes (same style, palette and characters), composed for ${b.aspect}, and must not ask for any text, letters or logos.`,
    visualRule,
    'musicPrompt: instrumental only, no vocals; describe genre, mood, tempo.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function generateStoryboard(g: Gemini, b: Brief, signal?: AbortSignal): Promise<Storyboard> {
  const sb = await g.json<Storyboard>(storyboardPrompt(b), STORYBOARD_SCHEMA, signal);
  if (!sb?.scenes?.length) throw new Error('絵コンテを作れませんでした。指示を具体的にしてもう一度お試しください。');
  return sb;
}

export function sceneFromStoryboard(s: StoryboardScene, p: Project, voice: string, voiceStyle: string): Scene {
  const theme = themeById(p.themeId);
  const portrait = p.aspect === '9:16';
  const texts = [];
  if (s.headline.trim()) {
    texts.push(makeText(theme, { text: s.headline.trim(), y: portrait ? 0.3 : 0.4, size: portrait ? 0.05 : 0.08, width: 0.86, weight: 900 }));
  }
  if (s.subtext.trim()) {
    texts.push(makeText(theme, { text: s.subtext.trim(), y: portrait ? 0.38 : 0.55, size: portrait ? 0.03 : 0.045, color: theme.bodyColor, weight: 400, anim: 'fade', start: 0.4 }));
  }
  return makeScene(theme, {
    title: s.title,
    duration: Math.max(3, Math.min(20, s.seconds || 5)),
    motion: s.visualType === 'image' ? s.motion : 'none',
    texts,
    narration: { text: s.narration, voice, style: voiceStyle, assetId: null, duration: null },
    visualPrompt: s.visualPrompt,
    visualType: s.visualType,
  });
}

export function projectFromStoryboard(sb: Storyboard, b: Brief): Project {
  const p = makeProject({ title: sb.title || '無題の動画', aspect: b.aspect, themeId: b.themeId, language: b.language, defaultVoice: b.voice });
  p.scenes = sb.scenes.map((s) => sceneFromStoryboard(s, p, b.voice, sb.voiceStyle ?? ''));
  return p;
}

/** Ask Gemini to rewrite one field (Vids-style "help me write"). */
export async function rewrite(g: Gemini, text: string, instruction: string, signal?: AbortSignal): Promise<string> {
  return g.text(`Rewrite the following text. Instruction: ${instruction}\nReturn only the rewritten text, same language as the original, no quotes.\n\n${text}`, signal);
}
