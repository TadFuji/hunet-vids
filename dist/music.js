import { StudioError } from './core.js';
import { readApiError, apiErrorMessage } from './api-errors.js';
import { base64ToBytes, bytesToBase64, parseWav, buildWavFromPcm, addSilenceToWav } from './narration.js';

export const MUSIC_ORIGIN = 'https://generativelanguage.googleapis.com';
export const DEFAULT_MUSIC_MODEL = 'lyria-3.5';

export const LYRIA_MODELS = Object.freeze([
  { id: 'lyria-3.5', label: 'フル楽曲・構成指定（Lyria 3.5 · 44.1kHzステレオ）', usdPerTrack: 0.08, maxSeconds: 180 },
  { id: 'lyria-3-clip-preview', label: '短尺クリップ・素早いBGM試作（Lyria 3 Clip · 約30秒）', usdPerTrack: 0.04, maxSeconds: 30 },
]);

export const MUSIC_GENRES = Object.freeze([
  { label: '指定しない（自由記述）', value: '' },
  { label: 'シネマティック・劇伴（映画音楽風）', value: 'Cinematic orchestral soundtrack, expressive strings, emotional piano, dynamic percussion' },
  { label: 'ローファイ・チル（Lo-Fi Chill / 作業・日常映像用）', value: 'Warm Lo-Fi chill hop beat, Rhodes electric piano, mellow vinyl texture, relaxed groove' },
  { label: 'アコースティック・フォーク（温かみのある生楽器）', value: 'Warm acoustic folk, fingerstyle acoustic guitar, light brushed drums, organic instrumentation' },
  { label: 'ピアノ・アンビエント（静かな背景音楽）', value: 'Minimal ambient piano and soft atmospheric synth pads, gentle reverb, peaceful soundscape' },
  { label: 'ポップス・J-Pop（明るく華やか）', value: 'Upbeat modern J-Pop, catchy melody, bright piano, crisp drums, energetic bassline' },
  { label: 'コーポレート・紹介映像用（前向き・清潔感）', value: 'Modern corporate motivational background music, muted guitar harmonics, warm synth pluck, uplifting beat' },
  { label: 'EDM・フューチャーベース（疾走感・フェス）', value: 'Melodic Future Bass / EDM, supersaw synth chords, punchy kick, euphoric drop' },
  { label: 'ジャズ・カフェ（おしゃれ・ボサノヴァ）', value: 'Smooth cafe jazz and bossa nova, upright bass, acoustic piano, soft brush drums, warm saxophone' },
  { label: 'ロック・バンド（力強い・疾走感）', value: 'Energetic modern rock band, driving electric guitars, live acoustic drums, punchy bass' },
  { label: '和風・日本伝統（琴・尺八・和太鼓）', value: 'Japanese traditional fusion, koto, shakuhachi flute, taiko percussion, cinematic strings' },
  { label: 'シンセウェーブ・80年代レトロ', value: '80s synthwave retro electronic, analog arpeggiator, gated reverb drums, neon atmosphere' },
  { label: 'クラシック・室内楽（弦楽・木管）', value: 'Classical chamber ensemble, violin, cello, woodwinds, graceful phrasing' },
  { label: 'ヒップホップ・トラップ（重低音・都会的）', value: 'Modern hip-hop trap beat, deep 808 sub bass, crisp hi-hat rolls, atmospheric synth' },
  { label: 'R&B・ネオソウル（メロウ・グルーヴ）', value: 'Smooth Neo-Soul and contemporary R&B, warm bass groove, lush chords' },
  { label: 'チップチューン・レトロゲーム音楽', value: '8-bit / 16-bit chiptune game soundtrack, square wave lead, upbeat arpeggios' },
  { label: 'トロピカル・サマー（爽快・リゾート）', value: 'Tropical house summer vibe, marimba pluck, steel pan, sunny acoustic guitar, four-on-the-floor beat' },
  { label: 'ファンタジー・冒険（ケルト・オーケストラ）', value: 'Fantasy adventure soundtrack, Celtic flute, harp, orchestral strings, lively percussion' },
]);

export const MUSIC_MOODS = Object.freeze([
  { label: '指定しない', value: '' },
  { label: '爽やか・朝の空気', value: 'fresh, morning light, airy and clear' },
  { label: '感動的・エモーショナル', value: 'deeply emotional, moving, heartfelt, cinematic build-up' },
  { label: '明るく楽しい・前向き', value: 'bright, cheerful, uplifting, positive energy' },
  { label: '落ち着いた・癒やし', value: 'calm, soothing, peaceful, gentle and relaxing' },
  { label: '壮大・ドラマチック', value: 'epic, grand, majestic, wide dynamic range' },
  { label: '切ない・ノスタルジック', value: 'nostalgic, bittersweet, wistful, warm memories' },
  { label: 'おしゃれ・都会的・クール', value: 'stylish, sophisticated, urban night, cool groove' },
  { label: '緊迫感・スリリング', value: 'tense, suspenseful, pulsing rhythm, dramatic tension' },
  { label: '神秘的・幻想的', value: 'mysterious, ethereal, magical, floating atmosphere' },
  { label: '力強い・エネルギッシュ', value: 'powerful, driving, high-energy, unstoppable momentum' },
  { label: '温かく優しい・ファミリー', value: 'warm, tender, welcoming, intimate and cozy' },
  { label: '静寂・ミニマル（ナレーション邪魔しない）', value: 'subtle, understated, minimal arrangement, leaves space for voiceover' },
]);

export const MUSIC_INSTRUMENTS = Object.freeze([
  { id: 'piano', label: 'ピアノ', value: 'acoustic grand piano' },
  { id: 'acoustic_guitar', label: 'アコースティックギター', value: 'acoustic guitar' },
  { id: 'strings', label: 'ストリングス（弦楽）', value: 'lush orchestral strings' },
  { id: 'synth_pad', label: 'シンセパッド', value: 'warm analog synth pads' },
  { id: 'electric_piano', label: 'エレピ（Rhodes）', value: 'Rhodes electric piano' },
  { id: 'electric_guitar', label: 'エレキギター', value: 'clean/overdriven electric guitar' },
  { id: 'acoustic_drums', label: '生ドラム', value: 'live acoustic drum kit' },
  { id: 'lofi_beats', label: 'ローファイビート', value: 'dusty lo-fi drum beat' },
  { id: 'upright_bass', label: 'ウッドベース', value: 'warm upright double bass' },
  { id: 'synth_bass', label: 'シンセベース', value: 'deep synth bass' },
  { id: 'brass', label: 'ブラス（金管）', value: 'warm brass section' },
  { id: 'flute', label: 'フルート・木管', value: 'expressive flute and woodwinds' },
  { id: 'koto_shakuhachi', label: '和楽器（琴・尺八）', value: 'Japanese koto and shakuhachi' },
  { id: 'music_box', label: 'オルゴール・ベル', value: 'delicate music box and celesta bells' },
  { id: 'saxophone', label: 'サックス', value: 'smooth saxophone' },
  { id: 'percussion', label: 'パーカッション・シェイカー', value: 'organic shakers and hand percussion' },
]);

export const MUSIC_TEMPOS = Object.freeze([
  { label: '自動（曲調に合わせる）', value: '', defaultBpm: 0 },
  { label: 'ゆったり（Slow · 70〜85 BPM）', value: 'slow tempo', defaultBpm: 76 },
  { label: 'ミディアム（Medium · 95〜115 BPM）', value: 'medium tempo', defaultBpm: 108 },
  { label: 'アップテンポ（Upbeat · 122〜135 BPM）', value: 'upbeat tempo', defaultBpm: 128 },
  { label: 'ハイテンポ・疾走（Fast · 145〜170 BPM）', value: 'fast driving tempo', defaultBpm: 155 },
]);

export const MUSIC_KEYS = Object.freeze([
  { label: '指定しない', value: '' },
  { label: 'C Major（明るく素直）', value: 'C Major' },
  { label: 'G Major（爽やか・開放的）', value: 'G Major' },
  { label: 'D Major（華やか・前向き）', value: 'D Major' },
  { label: 'F Major（穏やか・温かい）', value: 'F Major' },
  { label: 'A Major（輝き・疾走感）', value: 'A Major' },
  { label: 'Eb Major（包み込む・壮大）', value: 'Eb Major' },
  { label: 'A Minor（切ない・ドラマチック）', value: 'A Minor' },
  { label: 'E Minor（哀愁・シネマティック）', value: 'E Minor' },
  { label: 'D Minor（重厚・シリアス）', value: 'D Minor' },
  { label: 'F# Minor（都会的・エモーショナル）', value: 'F# Minor' },
  { label: 'C Minor（緊迫・劇的）', value: 'C Minor' },
]);

export const ENDING_STYLES = Object.freeze([
  { label: '余韻を残して自然に終える（Fade / Ring out）', value: 'natural resonant ring-out and smooth ending' },
  { label: 'ピタッと歯切れよく終える（Clean Hard Stop）', value: 'clean final cadence with a crisp hard stop at the end' },
  { label: 'ループしやすい構成（Seamless Loop feel）', value: 'consistent groove suitable for background looping' },
]);

export const VOCAL_TYPES = Object.freeze([
  { id: 'female_ja', label: '女性ボーカル（日本語・クリアな発音）', value: 'Expressive female lead vocal, clear Japanese diction, natural phrasing' },
  { id: 'male_ja', label: '男性ボーカル（日本語・クリアな発音）', value: 'Expressive male lead vocal, clear Japanese diction, warm phrasing' },
  { id: 'duet_ja', label: '男女デュエット・ハーモニー', value: 'Male and female vocal duet with rich chorus harmonies, clear diction' },
  { id: 'female_airy', label: 'ウィスパー・透明感女性ボーカル', value: 'Breathless airy female vocal, intimate delivery, dreamy atmosphere' },
  { id: 'choir', label: 'コーラス・聖歌隊（歌詞なしスキャット/合唱）', value: 'Cinematic wordless choir and vocal harmonies' },
  { id: 'rap_sung', label: 'メロディックラップ＋ボーカル', value: 'Rhythmic melodic rap verses with a soaring sung chorus' },
]);

export const SONG_SECTION_TAGS = Object.freeze([
  { tag: '[Intro]', label: 'イントロ [Intro]', desc: '導入パート' },
  { tag: '[Verse 1]', label: 'Aメロ [Verse 1]', desc: '物語の始まり' },
  { tag: '[Pre-Chorus]', label: 'Bメロ [Pre-Chorus]', desc: 'サビへの盛り上がり' },
  { tag: '[Chorus]', label: 'サビ [Chorus]', desc: '最も盛り上がる主題パート' },
  { tag: '[Instrumental Break]', label: '間奏 [Instrumental Break]', desc: '楽器ソロ・間奏' },
  { tag: '[Verse 2]', label: '2番Aメロ [Verse 2]', desc: '展開パート' },
  { tag: '[Bridge]', label: 'Cメロ・ブリッジ [Bridge]', desc: '雰囲気を変える転換部' },
  { tag: '[Drop]', label: 'ドロップ [Drop]', desc: 'ダンス・ビート主体の盛り上がり' },
  { tag: '[Final Chorus]', label: 'ラスサビ [Final Chorus]', desc: 'クライマックスのサビ' },
  { tag: '[Outro]', label: 'アウトロ [Outro]', desc: '締めくくり・余韻' },
]);

export const MUSIC_EXAMPLES = Object.freeze({
  bgm: '朝霧の湖を小さな木の舟がゆっくり進んでいく映像に合う、透明感のあるピアノと柔らかな弦楽のシネマティックBGM。後半に向けて少しずつ視界が開けていくような温かい盛り上がり。',
  vocal: '新しい一歩を踏み出す朝の風景に合う、爽やかで疾走感のあるアコースティック・ポップス。透明感のある歌声で前向きな気持ちを歌い上げる。',
  lyrics: `[Intro]\n（静かなピアノと朝の光のようなシンセパッド）\n\n[Verse 1]\n朝霧の向こうに 光が差し込んで\n静かな水面が ゆっくり目を覚ます\n\n[Chorus]\nまだ見ぬ景色へ 漕ぎ出そう\n風を追い越して 始まる物語\n\n[Outro]\n（穏やかな余韻でフェードアウト）`,
});

export function estimateMusicCost(modelId = DEFAULT_MUSIC_MODEL) {
  const model = LYRIA_MODELS.find(m => m.id === modelId) || LYRIA_MODELS[0];
  const usd = model.usdPerTrack;
  const jpy = usd * 150;
  return { modelId: model.id, usd, jpy, maxSeconds: model.maxSeconds };
}

export function buildMusicPrompt({
  mode = 'bgm',
  model = DEFAULT_MUSIC_MODEL,
  prompt = '',
  genre = '',
  mood = '',
  instruments = [],
  tempo = '',
  bpm = 0,
  musicalKey = '',
  durationSeconds = 30,
  endingStyle = '',
  vocalType = 'female_ja',
  lyrics = '',
  keepSpaceForNarration = false,
} = {}) {
  const isVocal = mode === 'vocal';
  const lines = [];
  const mainDesc = String(prompt || '').trim();
  const hasLyrics = isVocal && String(lyrics || '').trim().length > 0;

  if (!mainDesc && !genre && !mood && !hasLyrics) {
    throw new StudioError('どんな音楽にしたいか説明を入力するか、ジャンル・雰囲気を選んでください。');
  }

  const targetSec = model === 'lyria-3-clip-preview'
    ? 30
    : Math.max(10, Math.min(180, Math.round(Number(durationSeconds) || 30)));

  if (isVocal) {
    const vocalSpec = VOCAL_TYPES.find(v => v.id === vocalType)?.value || VOCAL_TYPES[0].value;
    lines.push(`Create a complete, high-quality vocal song (${targetSec} seconds total duration).`);
    lines.push(`Vocal style: ${vocalSpec}.`);
  } else {
    lines.push(`Create a high-quality instrumental soundtrack / BGM (${targetSec} seconds total duration).`);
    lines.push('Instrumental only, no vocals, no singing, no spoken words.');
  }

  if (mainDesc) lines.push(`Theme & Scene direction: ${mainDesc}`);
  if (genre) lines.push(`Genre & Style: ${genre}.`);
  if (mood) lines.push(`Mood & Atmosphere: ${mood}.`);

  const instLabels = (Array.isArray(instruments) ? instruments : [])
    .map(id => MUSIC_INSTRUMENTS.find(item => item.id === id)?.value || String(id).trim())
    .filter(Boolean);
  if (instLabels.length > 0) {
    lines.push(`Featured Instruments: ${instLabels.join(', ')}.`);
  }

  const numericBpm = Number(bpm);
  const tempoParts = [];
  if (tempo) tempoParts.push(tempo);
  if (Number.isFinite(numericBpm) && numericBpm >= 40 && numericBpm <= 220) tempoParts.push(`${Math.round(numericBpm)} BPM`);
  if (musicalKey) tempoParts.push(`Key of ${musicalKey}`);
  if (tempoParts.length > 0) {
    lines.push(`Tempo & Key: ${tempoParts.join(', ')}.`);
  }

  if (keepSpaceForNarration && !isVocal) {
    lines.push('Mix balance: Keep midrange uncluttered so spoken narration remains clear over this BGM.');
  }

  if (endingStyle) {
    lines.push(`Ending: ${endingStyle}.`);
  }

  lines.push('Production quality: 44.1kHz stereo master quality, balanced dynamics, clear separation.');

  if (hasLyrics) {
    lines.push('\nLyrics & Song Structure:\n' + String(lyrics).trim());
  }

  return lines.join('\n');
}

export function buildMusicRequest({
  model = DEFAULT_MUSIC_MODEL,
  promptText = '',
  imagePart = null,
} = {}) {
  if (!LYRIA_MODELS.some(m => m.id === model)) {
    throw new StudioError('対応している音楽生成モデル（Lyria 3.5 / Lyria 3 Clip）を選んでください。');
  }
  const text = String(promptText || '').trim();
  if (!text) throw new StudioError('音楽生成のプロンプトが空です。');
  if (text.length > 8000) throw new StudioError('音楽生成の指示・歌詞は8,000文字以内で入力してください。');

  if (imagePart && typeof imagePart.data === 'string' && imagePart.data.length > 0) {
    const mime = /^image\/(jpeg|png|webp)$/i.test(imagePart.mimeType || '') ? imagePart.mimeType.toLowerCase() : 'image/jpeg';
    return {
      model,
      input: [
        { type: 'image', mime_type: mime, data: imagePart.data },
        { type: 'text', text },
      ],
      response_format: { type: 'audio' },
    };
  }

  return {
    model,
    input: text,
    response_format: { type: 'audio' },
  };
}

export function sniffAudioMime(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (view.byteLength >= 12) {
    const head4 = String.fromCharCode(...view.subarray(0, 4));
    const wave4 = String.fromCharCode(...view.subarray(8, 12));
    if (head4 === 'RIFF' && wave4 === 'WAVE') return { mimeType: 'audio/wav', ext: 'wav' };
    const ftyp = String.fromCharCode(...view.subarray(4, 8));
    if (ftyp === 'ftyp') return { mimeType: 'audio/mp4', ext: 'm4a' };
    if (head4 === 'OggS') return { mimeType: 'audio/ogg', ext: 'ogg' };
    if (head4.startsWith('ID3') || (view[0] === 0xff && (view[1] & 0xe0) === 0xe0)) {
      return { mimeType: 'audio/mpeg', ext: 'mp3' };
    }
  }
  return { mimeType: 'audio/mpeg', ext: 'mp3' };
}

export function extractMusicOutput(interaction) {
  let audioData = null;
  let audioUri = null;
  let mimeType = '';
  const textParts = [];

  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type === 'user_input') break;
    if (!Array.isArray(step?.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j--) {
      const item = step.content[j];
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
        textParts.unshift(item.text.trim());
      }
      const isAudio = item.type === 'audio' || (typeof item.mime_type === 'string' && item.mime_type.startsWith('audio/'));
      if (isAudio && !audioData && !audioUri) {
        if (typeof item.data === 'string' && item.data.length > 0) {
          audioData = item.data;
          mimeType = item.mime_type || '';
        } else if (typeof item.uri === 'string' && item.uri.length > 0) {
          audioUri = item.uri;
          mimeType = item.mime_type || '';
        }
      }
    }
  }

  if (!audioData && !audioUri && interaction?.output_audio) {
    const out = interaction.output_audio;
    if (typeof out.data === 'string' && out.data.length > 0) {
      audioData = out.data;
      mimeType = out.mime_type || '';
    } else if (typeof out.uri === 'string' && out.uri.length > 0) {
      audioUri = out.uri;
      mimeType = out.mime_type || '';
    }
  }

  return {
    data: audioData,
    uri: audioUri,
    mimeType,
    lyricsOrNotes: textParts.join('\n\n'),
  };
}

export function safeAudioFileId(uri) {
  const raw = String(uri || '').trim();
  if (/^files\/([A-Za-z0-9_-]+)$/.test(raw)) {
    return raw.match(/^files\/([A-Za-z0-9_-]+)$/)[1];
  }
  let url;
  try { url = new URL(raw); } catch {
    throw new StudioError('音楽ファイルの取得先URLを確認できません。', { uncertain: true });
  }
  if (
    url.origin !== MUSIC_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/v1beta\/files\/([A-Za-z0-9_-]+)(?::download)?$/.test(url.pathname) ||
    [...url.searchParams].some(([k, v]) => k !== 'alt' || v !== 'media')
  ) {
    throw new StudioError('音楽ファイルの取得先がGoogle公式APIの許可されたURLではありません。', { uncertain: true });
  }
  return url.pathname.match(/^\/v1beta\/files\/([A-Za-z0-9_-]+)(?::download)?$/)[1];
}

// Converts any decoded AudioBuffer or WAV/MP3 Blob into a 44.1kHz stereo 16-bit PCM WAV Blob
// so both local-media.mjs and browser-media.js (ffmpeg.wasm) can mix it reliably.
export async function convertAudioBlobToWav(blob, { targetSampleRate = 44100, leadSilenceSec = 0, trailSilenceSec = 0 } = {}) {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new StudioError('変換する音楽データがありません。');
  }
  const rawBytes = new Uint8Array(await blob.arrayBuffer());
  const sniffed = sniffAudioMime(rawBytes);
  if (sniffed.ext === 'wav') {
    try {
      return addSilenceToWav(rawBytes, leadSilenceSec, trailSilenceSec);
    } catch {}
  }

  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!AudioCtx || !OfflineCtx) {
    throw new StudioError('この環境ではMP3音声のWAV変換に対応していません。');
  }
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength));
    const channels = Math.min(2, Math.max(1, decoded.numberOfChannels || 2));
    const rate = targetSampleRate || decoded.sampleRate || 44100;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * rate));
    const offline = new OfflineCtx(channels, frameCount, rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();

    const ch0 = rendered.getChannelData(0);
    const ch1 = channels > 1 ? rendered.getChannelData(1) : ch0;
    const pcm = new Uint8Array(rendered.length * channels * 2);
    const view = new DataView(pcm.buffer);
    let offset = 0;
    for (let i = 0; i < rendered.length; i++) {
      const s0 = Math.max(-1, Math.min(1, ch0[i]));
      view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
      offset += 2;
      if (channels > 1) {
        const s1 = Math.max(-1, Math.min(1, ch1[i]));
        view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
        offset += 2;
      }
    }
    const baseWav = buildWavFromPcm(pcm, rate, channels, 16);
    return addSilenceToWav(baseWav, leadSilenceSec, trailSilenceSec);
  } finally {
    try { await ctx.close(); } catch {}
  }
}

const defaultFetcher = (...args) => globalThis.fetch(...args);
const defaultWait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class MusicGateway {
  constructor(getApiKey, { fetcher = defaultFetcher, wait = defaultWait, timeoutMs = 240000, polls = 60 } = {}) {
    this.getApiKey = getApiKey;
    this.fetcher = fetcher;
    this.wait = wait;
    this.timeoutMs = timeoutMs;
    this.polls = polls;
  }
  key() {
    const k = typeof this.getApiKey === 'function' ? this.getApiKey() : this.getApiKey;
    if (!k || !String(k).trim()) throw new StudioError('Gemini の API キーを入力してください', { uncertain: true });
    return String(k).trim();
  }
  async request(path, { method = 'GET', body = null } = {}) {
    const apiKey = this.key();
    const url = new URL(path, MUSIC_ORIGIN);
    if (url.origin !== MUSIC_ORIGIN) throw new StudioError('許可されていない通信先です。', { terminal: true });
    let response;
    try {
      response = await this.fetcher(url.toString(), {
        method,
        headers: {
          'x-goog-api-key': apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new StudioError('Google音楽生成APIへの通信が中断されました。通信状態を確認してください。', { uncertain: true });
    }
    if (!response.ok) {
      const safe = await readApiError(response);
      const terminal = [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status);
      throw new StudioError(apiErrorMessage(safe), { terminal, uncertain: !terminal });
    }
    return response;
  }
  async requestJson(path, options = {}) {
    const res = await this.request(path, options);
    try {
      return await res.json();
    } catch {
      throw new StudioError('Google音楽生成APIの応答を読み取れませんでした。', { uncertain: true });
    }
  }
  async generateMusic(requestPayload) {
    let interaction = await this.requestJson('/v1beta/interactions', { method: 'POST', body: requestPayload });
    const interactionId = String(interaction?.id || '');
    for (let i = 0; i < this.polls; i++) {
      const status = interaction?.status;
      if (!status || status === 'completed') break;
      if (['failed', 'cancelled', 'incomplete'].includes(status)) {
        throw new StudioError('Google側で音楽の生成が完了しませんでした。プロンプトや歌詞を変えて再度お試しください。', { terminal: true });
      }
      if (!['in_progress', 'queued'].includes(status) || !interactionId) break;
      await this.wait(3000);
      interaction = await this.requestJson(`/v1beta/interactions/${encodeURIComponent(interactionId)}`);
    }

    const extracted = extractMusicOutput(interaction);
    let rawBytes = null;
    if (extracted.data) {
      rawBytes = base64ToBytes(extracted.data);
    } else if (extracted.uri) {
      const fileId = safeAudioFileId(extracted.uri);
      let active = false;
      for (let i = 0; i < this.polls; i++) {
        const file = await this.requestJson(`/v1beta/files/${fileId}`);
        if (file?.state === 'ACTIVE' || !file?.state) { active = true; break; }
        if (file?.state === 'FAILED') throw new StudioError('Google側で音楽ファイルの処理に失敗しました。', { terminal: true });
        await this.wait(2500);
      }
      if (!active) throw new StudioError('音楽ファイルの準備待機時間を超えました。', { uncertain: true });
      const mediaRes = await this.request(`/v1beta/files/${fileId}:download?alt=media`);
      rawBytes = new Uint8Array(await mediaRes.arrayBuffer());
    } else {
      throw new StudioError('Google音楽生成APIから音声データが返されませんでした。指示文や歌詞を見直してお試しください。', { terminal: true });
    }

    if (!rawBytes || rawBytes.byteLength === 0) {
      throw new StudioError('受信した音楽データが空でした。', { uncertain: true });
    }

    const sniffed = sniffAudioMime(rawBytes);
    const mimeType = sniffed.mimeType;
    const ext = sniffed.ext;
    const rawBlob = new Blob([rawBytes], { type: mimeType });
    let durationSeconds = 0;
    if (ext === 'wav') {
      try { durationSeconds = parseWav(rawBytes).durationSeconds; } catch {}
    }

    return {
      interactionId,
      bytes: rawBytes,
      blob: rawBlob,
      mimeType,
      ext,
      durationSeconds,
      lyricsOrNotes: extracted.lyricsOrNotes || '',
    };
  }
}

export function mountMusicStudio({
  getApiKey,
  getStudio,
  getVideoElement,
  blobUrl,
  onUpdate,
  alertUser,
  keyRequiredMessage = 'Gemini の API キーを入力してください',
} = {}) {
  const $ = id => document.getElementById(id);
  if (!$('music-section')) return null;

  const gateway = new MusicGateway(() => typeof getApiKey === 'function' ? getApiKey() : '');
  const state = {
    mode: 'bgm',
    modelId: DEFAULT_MUSIC_MODEL,
    genre: MUSIC_GENRES[1].value,
    mood: MUSIC_MOODS[1].value,
    instruments: new Set(['piano', 'strings']),
    tempo: '',
    bpm: '',
    musicalKey: '',
    durationSeconds: 30,
    endingStyle: ENDING_STYLES[0].value,
    keepSpaceForNarration: true,
    vocalType: VOCAL_TYPES[0].id,
    imagePart: null,
    tracks: [],
    selectedTrackId: null,
    busy: false,
    status: '',
    error: '',
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function populateSelect(selectEl, items, currentValue, valueKey = 'value', labelKey = 'label') {
    if (!selectEl) return;
    selectEl.replaceChildren();
    for (const item of items) {
      const opt = make('option', '', item[labelKey]);
      opt.value = item[valueKey];
      selectEl.append(opt);
    }
    selectEl.value = currentValue;
  }

  function renderInstrumentChips() {
    const bar = $('music-instruments');
    if (!bar) return;
    bar.replaceChildren();
    for (const inst of MUSIC_INSTRUMENTS) {
      const active = state.instruments.has(inst.id);
      const btn = make('button', `tag-chip${active ? ' active' : ''}`, `${active ? '✓ ' : '+ '}${inst.label}`);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(active));
      btn.addEventListener('click', () => {
        if (state.instruments.has(inst.id)) state.instruments.delete(inst.id);
        else state.instruments.add(inst.id);
        renderInstrumentChips();
      });
      bar.append(btn);
    }
  }

  function renderSectionTags() {
    const bar = $('music-section-tags');
    if (!bar) return;
    bar.replaceChildren();
    for (const item of SONG_SECTION_TAGS) {
      const btn = make('button', 'tag-chip', item.label);
      btn.type = 'button';
      btn.title = item.desc;
      btn.addEventListener('click', () => {
        const area = $('music-lyrics');
        if (!area) return;
        const current = String(area.value || '');
        const start = Number.isInteger(area.selectionStart) ? area.selectionStart : current.length;
        const end = Number.isInteger(area.selectionEnd) ? area.selectionEnd : current.length;
        const prefix = start > 0 && current[start - 1] !== '\n' ? '\n\n' : '';
        const snippet = `${prefix}${item.tag}\n`;
        area.value = current.slice(0, start) + snippet + current.slice(end);
        area.focus?.();
      });
      bar.append(btn);
    }
  }

  function populateStaticControls() {
    populateSelect($('music-model'), LYRIA_MODELS, state.modelId, 'id', 'label');
    populateSelect($('music-genre'), MUSIC_GENRES, state.genre);
    populateSelect($('music-mood'), MUSIC_MOODS, state.mood);
    populateSelect($('music-tempo'), MUSIC_TEMPOS, state.tempo);
    populateSelect($('music-key'), MUSIC_KEYS, state.musicalKey);
    populateSelect($('music-ending'), ENDING_STYLES, state.endingStyle);
    populateSelect($('music-vocal-type'), VOCAL_TYPES, state.vocalType, 'id', 'label');
    renderInstrumentChips();
    renderSectionTags();
  }

  function selectedTrack() {
    return state.tracks.find(t => t.id === state.selectedTrackId) || state.tracks[0] || null;
  }

  function updateEstimate() {
    const est = estimateMusicCost(state.modelId);
    if ($('music-estimate')) {
      $('music-estimate').textContent = `目安: 1曲あたり 約$${est.usd.toFixed(2)}（約${est.jpy.toFixed(1)}円） · 最大${est.maxSeconds}秒`;
    }
    const durInput = $('music-duration');
    if (durInput) {
      const isClip = state.modelId === 'lyria-3-clip-preview';
      durInput.disabled = state.busy || isClip;
      if (isClip) durInput.value = '30';
    }
  }

  function render() {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selectedVersion = studio?.selected || studio?.base || null;
    const blocked = state.busy || Boolean(studio?.busy || studio?.job);

    if ($('music-mode-bgm')) {
      $('music-mode-bgm').classList.toggle('active', state.mode === 'bgm');
      $('music-mode-bgm').setAttribute('aria-selected', String(state.mode === 'bgm'));
      $('music-mode-bgm').setAttribute('aria-pressed', String(state.mode === 'bgm'));
      $('music-mode-bgm').disabled = blocked;
    }
    if ($('music-mode-vocal')) {
      $('music-mode-vocal').classList.toggle('active', state.mode === 'vocal');
      $('music-mode-vocal').setAttribute('aria-selected', String(state.mode === 'vocal'));
      $('music-mode-vocal').setAttribute('aria-pressed', String(state.mode === 'vocal'));
      $('music-mode-vocal').disabled = blocked;
    }
    if ($('music-vocal-panel')) $('music-vocal-panel').hidden = state.mode !== 'vocal';
    if ($('music-bgm-space-wrap')) $('music-bgm-space-wrap').hidden = state.mode !== 'bgm';

    updateEstimate();

    if ($('music-image-status')) {
      $('music-image-status').textContent = state.imagePart
        ? `視覚イメージ参照中：${state.imagePart.label}（画像・映像の雰囲気に合わせて作曲します）`
        : '未設定（必要に応じて動画の現在フレームや画像を音楽のインスピレーションとして添付できます）';
    }
    if ($('music-clear-image')) $('music-clear-image').hidden = !state.imagePart;
    if ($('music-capture-frame')) $('music-capture-frame').disabled = blocked || !selectedVersion;

    const hasKey = Boolean((typeof getApiKey === 'function' ? getApiKey() : '')?.trim());
    if ($('music-generate')) {
      $('music-generate').disabled = blocked;
      $('music-generate').classList.toggle('needs-key', !hasKey && !blocked);
      $('music-generate').textContent = state.busy
        ? 'Lyria 3.5 で音楽を作曲中…'
        : state.mode === 'vocal'
          ? '歌入り楽曲を生成する（Lyria 3.5）'
          : 'BGM・インスト音楽を生成する（Lyria 3.5）';
    }

    if ($('music-status')) {
      $('music-status').hidden = !state.status;
      $('music-status').textContent = state.status;
    }
    if ($('music-error')) {
      $('music-error').hidden = !state.error;
      $('music-error').textContent = state.error;
    }

    const track = selectedTrack();
    if ($('music-result-panel')) $('music-result-panel').hidden = !track;
    if (track) {
      const trackSelect = $('music-track-select');
      if (trackSelect) {
        trackSelect.replaceChildren();
        for (const item of state.tracks) {
          const opt = make('option', '', `${item.label}${item.durationSeconds ? `（約${item.durationSeconds.toFixed(1)}秒）` : ''}`);
          opt.value = item.id;
          trackSelect.append(opt);
        }
        trackSelect.value = track.id;
      }
      const audioEl = $('music-audio');
      const url = typeof blobUrl === 'function' ? blobUrl(track.blob) : '';
      if (audioEl && url && audioEl.getAttribute('src') !== url) {
        audioEl.src = url;
      }
      if ($('music-download')) {
        $('music-download').href = url;
        $('music-download').download = `omni-music-${track.id}.${track.ext || 'mp3'}`;
      }
      if ($('music-generated-lyrics-box')) {
        $('music-generated-lyrics-box').hidden = !track.lyricsOrNotes;
      }
      if ($('music-generated-lyrics')) {
        $('music-generated-lyrics').textContent = track.lyricsOrNotes || '';
      }
    }

    const canMix = Boolean(studio?.localMediaEnabled && selectedVersion && track);
    if ($('music-apply')) {
      $('music-apply').disabled = blocked || !canMix;
      $('music-apply').textContent = selectedVersion
        ? `選択中の動画（${selectedVersion.wholeSeconds ?? selectedVersion.seconds}秒版）に音楽を重ねる`
        : '動画を生成または選択すると音楽を重ねられます';
    }
    if ($('music-layer')) {
      $('music-layer').hidden = !selectedVersion?.narration;
      $('music-layer').disabled = blocked || !canMix;
    }
    if ($('music-restore')) {
      $('music-restore').hidden = !selectedVersion?.narration;
      $('music-restore').disabled = blocked || !selectedVersion?.narration;
    }
    if ($('music-mix-hint')) {
      if (!selectedVersion) {
        $('music-mix-hint').textContent = '先に上で動画を生成するか手持ち動画を取り込むと、作曲したBGM・楽曲を動画に合成できます。';
      } else if (selectedVersion.narration) {
        $('music-mix-hint').textContent = `現在「${selectedVersion.narration.label}」が合成されています。「今の動画音声（ナレーション等）にさらにBGMを重ねる」を選ぶと、ナレーションを残したままBGMを重ねられます。`;
      } else {
        $('music-mix-hint').textContent = `選択中の動画（${selectedVersion.wholeSeconds ?? selectedVersion.seconds}秒版）の元の音量を保ったまま、作曲した音楽を重ねます（動画の長さに合わせて自動で収まります）。`;
      }
    }
  }

  function requireKey() {
    const key = typeof getApiKey === 'function' ? getApiKey() : '';
    if (!key || !key.trim()) {
      alertUser?.(keyRequiredMessage);
      document.getElementById('api-key')?.focus?.();
      return false;
    }
    return true;
  }

  populateStaticControls();

  $('music-mode-bgm')?.addEventListener('click', () => {
    if (state.busy) return;
    state.mode = 'bgm';
    render();
  });
  $('music-mode-vocal')?.addEventListener('click', () => {
    if (state.busy) return;
    state.mode = 'vocal';
    render();
  });
  $('music-model')?.addEventListener('change', () => {
    state.modelId = $('music-model').value;
    render();
  });
  $('music-genre')?.addEventListener('change', () => {
    state.genre = $('music-genre').value;
  });
  $('music-mood')?.addEventListener('change', () => {
    state.mood = $('music-mood').value;
  });
  $('music-tempo')?.addEventListener('change', () => {
    state.tempo = $('music-tempo').value;
    const preset = MUSIC_TEMPOS.find(t => t.value === state.tempo);
    if (preset?.defaultBpm && $('music-bpm') && !$('music-bpm').value) {
      $('music-bpm').value = String(preset.defaultBpm);
      state.bpm = $('music-bpm').value;
    }
  });
  $('music-bpm')?.addEventListener('input', () => {
    state.bpm = $('music-bpm').value;
  });
  $('music-key')?.addEventListener('change', () => {
    state.musicalKey = $('music-key').value;
  });
  $('music-duration')?.addEventListener('change', () => {
    state.durationSeconds = Math.max(10, Math.min(180, Number($('music-duration').value) || 30));
  });
  $('music-sync-video-duration')?.addEventListener('click', () => {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const v = studio?.selected || studio?.base;
    const target = v ? Math.max(10, Math.min(180, Math.ceil(v.wholeSeconds ?? v.seconds ?? 30))) : 30;
    state.durationSeconds = target;
    if ($('music-duration')) $('music-duration').value = String(target);
    state.status = `目標の長さを動画に合わせて ${target} 秒に設定しました。`;
    render();
  });
  $('music-ending')?.addEventListener('change', () => {
    state.endingStyle = $('music-ending').value;
  });
  $('music-bgm-space')?.addEventListener('change', () => {
    state.keepSpaceForNarration = !!$('music-bgm-space').checked;
  });
  $('music-vocal-type')?.addEventListener('change', () => {
    state.vocalType = $('music-vocal-type').value;
  });
  $('music-example')?.addEventListener('click', () => {
    if ($('music-prompt')) {
      $('music-prompt').value = state.mode === 'vocal' ? MUSIC_EXAMPLES.vocal : MUSIC_EXAMPLES.bgm;
    }
    if (state.mode === 'vocal' && $('music-lyrics') && !$('music-lyrics').value.trim()) {
      $('music-lyrics').value = MUSIC_EXAMPLES.lyrics;
    }
  });
  $('music-lyrics-example')?.addEventListener('click', () => {
    if ($('music-lyrics')) $('music-lyrics').value = MUSIC_EXAMPLES.lyrics;
  });

  $('music-capture-frame')?.addEventListener('click', () => {
    const video = typeof getVideoElement === 'function' ? getVideoElement() : null;
    if (!video || !video.videoWidth || !video.videoHeight) {
      state.error = '動画プレビューが表示されてからフレームを取り込んでください。';
      render();
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(16, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(16, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64) throw new Error('empty frame');
      const sec = Number.isFinite(video.currentTime) ? video.currentTime.toFixed(1) : '0.0';
      state.imagePart = { mimeType: 'image/jpeg', data: base64, label: `動画フレーム（${sec}秒地点）` };
      state.error = '';
      state.status = `動画の ${sec} 秒地点の画面を音楽のイメージ参照に設定しました。`;
      render();
    } catch {
      state.error = '動画フレームの取得に失敗しました。画像ファイル選択からお試しください。';
      render();
    }
  });

  $('music-image-file')?.addEventListener('change', async () => {
    const file = $('music-image-file').files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '') || file.size > 10 * 1024 * 1024) {
      state.error = '10MB以下のJPEG・PNG・WebP画像を選んでください。';
      $('music-image-file').value = '';
      render();
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      state.imagePart = {
        mimeType: file.type.toLowerCase(),
        data: bytesToBase64(bytes),
        label: file.name || '選択した画像',
      };
      state.error = '';
      state.status = `画像「${state.imagePart.label}」を音楽のイメージ参照に設定しました。`;
    } catch {
      state.error = '画像の読み込みに失敗しました。';
    } finally {
      $('music-image-file').value = '';
      render();
    }
  });

  $('music-clear-image')?.addEventListener('click', () => {
    state.imagePart = null;
    state.status = '視覚イメージ参照を解除しました。';
    render();
  });

  $('music-generate')?.addEventListener('click', async () => {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    if (state.busy || studio?.busy || studio?.job || !requireKey()) return;
    state.busy = true;
    state.error = '';
    state.status = 'Googleの音楽生成AI（Lyria 3.5）で作曲しています（通常15〜45秒ほどかかります）…';
    render();
    try {
      const promptText = buildMusicPrompt({
        mode: state.mode,
        model: state.modelId,
        prompt: $('music-prompt')?.value || '',
        genre: $('music-genre')?.value ?? state.genre,
        mood: $('music-mood')?.value ?? state.mood,
        instruments: [...state.instruments],
        tempo: $('music-tempo')?.value ?? state.tempo,
        bpm: Number($('music-bpm')?.value || state.bpm || 0),
        musicalKey: $('music-key')?.value ?? state.musicalKey,
        durationSeconds: Number($('music-duration')?.value || state.durationSeconds || 30),
        endingStyle: $('music-ending')?.value ?? state.endingStyle,
        vocalType: $('music-vocal-type')?.value || state.vocalType,
        lyrics: $('music-lyrics')?.value || '',
        keepSpaceForNarration: $('music-bgm-space') ? $('music-bgm-space').checked : state.keepSpaceForNarration,
      });
      const req = buildMusicRequest({
        model: state.modelId,
        promptText,
        imagePart: state.imagePart,
      });
      const result = await gateway.generateMusic(req);
      const id = `music-${state.tracks.length + 1}`;
      const label = `トラック ${state.tracks.length + 1}（${state.mode === 'vocal' ? 'ボーカル曲' : 'BGM'} · ${state.modelId === 'lyria-3-clip-preview' ? 'Clip' : 'Lyria 3.5'}）`;
      const track = {
        id,
        label,
        blob: result.blob,
        wavBlob: result.ext === 'wav' ? result.blob : null,
        ext: result.ext,
        mimeType: result.mimeType,
        durationSeconds: result.durationSeconds,
        lyricsOrNotes: result.lyricsOrNotes,
        promptText,
      };
      state.tracks.unshift(track);
      state.selectedTrackId = track.id;
      state.status = `${label} を生成しました。下のプレーヤーで試聴やダウンロード、動画への合成ができます。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '音楽の生成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false;
      render();
    }
  });

  $('music-track-select')?.addEventListener('change', () => {
    state.selectedTrackId = $('music-track-select').value;
    render();
  });

  $('music-audio')?.addEventListener('loadedmetadata', () => {
    const audioEl = $('music-audio');
    const track = selectedTrack();
    if (track && audioEl && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      track.durationSeconds = audioEl.duration;
      render();
    }
  });

  $('music-video-volume')?.addEventListener('input', () => {
    if ($('music-video-volume-label')) $('music-video-volume-label').textContent = `${$('music-video-volume').value}%`;
  });
  $('music-track-volume')?.addEventListener('input', () => {
    if ($('music-track-volume-label')) $('music-track-volume-label').textContent = `${$('music-track-volume').value}%`;
  });
  $('music-use-current-time')?.addEventListener('click', () => {
    const video = typeof getVideoElement === 'function' ? getVideoElement() : null;
    if (video && Number.isFinite(video.currentTime) && $('music-start-seconds')) {
      $('music-start-seconds').value = String(Math.max(0, Number(video.currentTime.toFixed(1))));
    }
  });

  async function applyMusicToSelectedVideo(layer = false) {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selected = studio?.selected || studio?.base;
    const track = selectedTrack();
    if (!studio || !selected || !track || state.busy || studio.busy || studio.job) return;
    const startSeconds = Math.max(0, Number($('music-start-seconds')?.value) || 0);
    const videoVolume = Math.max(0, Math.min(200, Number($('music-video-volume')?.value ?? 80))) / 100;
    const musicVolume = Math.max(10, Math.min(200, Number($('music-track-volume')?.value ?? 45))) / 100;
    const leadSilenceSec = Math.max(0, Number($('music-lead-silence')?.value) || 0);
    state.busy = true;
    state.error = '';
    state.status = '音楽データを動画合成用の高音質WAVに変換し、動画に重ねています…';
    render();
    try {
      let wavBlob = track.wavBlob;
      if (!wavBlob || leadSilenceSec > 0) {
        const converted = await convertAudioBlobToWav(track.blob, { targetSampleRate: 44100, leadSilenceSec, trailSilenceSec: 0 });
        wavBlob = converted.blob;
        if (leadSilenceSec === 0) track.wavBlob = wavBlob;
      }
      await studio.applyNarration(selected.id, wavBlob, {
        startSeconds,
        videoVolume,
        narrationVolume: musicVolume,
        layer,
        label: track.label,
      });
      state.status = `${selected.wholeSeconds ?? selected.seconds}秒版の動画に「${track.label}」を合成しました。中央のプレーヤーで再生・保存できます。`;
      onUpdate?.();
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '動画への音楽合成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false;
      render();
    }
  }

  $('music-apply')?.addEventListener('click', () => applyMusicToSelectedVideo(false));
  $('music-layer')?.addEventListener('click', () => applyMusicToSelectedVideo(true));
  $('music-restore')?.addEventListener('click', () => {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selected = studio?.selected || studio?.base;
    if (!studio || !selected) return;
    try {
      studio.restoreAudio(selected.id);
      state.error = '';
      state.status = `${selected.wholeSeconds ?? selected.seconds}秒版の動画を元の音声に戻しました。`;
      render();
      onUpdate?.();
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '元の音声への復元を完了できませんでした。';
      render();
    }
  });

  function reset() {
    state.tracks = [];
    state.selectedTrackId = null;
    state.imagePart = null;
    state.busy = false;
    state.status = '';
    state.error = '';
    const audioEl = $('music-audio');
    if (audioEl) {
      audioEl.removeAttribute('src');
      audioEl.load?.();
    }
    if ($('music-image-file')) $('music-image-file').value = '';
    render();
  }

  render();
  return { gateway, state, render, reset };
}
