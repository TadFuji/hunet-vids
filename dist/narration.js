import { StudioError } from './core.js';
import { readApiError, apiErrorMessage } from './api-errors.js';

export const TTS_ORIGIN = 'https://generativelanguage.googleapis.com';
export const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-tts';
export const TTS_MODELS = Object.freeze([
  { id: 'gemini-3.8-flash-tts', label: '高品質（Gemini 3.8 Flash TTS）', usdPerMillion: 9.0 },
  { id: 'gemini-3.8-flash-lite-tts', label: '安くて速い（Gemini 3.8 Flash-Lite TTS）', usdPerMillion: 6.0 },
]);

export const PRESET_VOICES = Object.freeze([
  { id: 'Zephyr', name: 'Zephyr', feature: '明るい', gender: 'female' },
  { id: 'Puck', name: 'Puck', feature: '弾むような', gender: 'male' },
  { id: 'Charon', name: 'Charon', feature: '知的で落ち着いた', gender: 'male' },
  { id: 'Kore', name: 'Kore', feature: 'きりっとした', gender: 'female' },
  { id: 'Fenrir', name: 'Fenrir', feature: '興奮ぎみ', gender: 'male' },
  { id: 'Leda', name: 'Leda', feature: '若々しい', gender: 'female' },
  { id: 'Orus', name: 'Orus', feature: 'きりっとした', gender: 'male' },
  { id: 'Aoede', name: 'Aoede', feature: 'さわやか', gender: 'female' },
  { id: 'Callirrhoe', name: 'Callirrhoe', feature: 'おおらか', gender: 'female' },
  { id: 'Autonoe', name: 'Autonoe', feature: '明るい', gender: 'female' },
  { id: 'Enceladus', name: 'Enceladus', feature: '息まじり', gender: 'male' },
  { id: 'Iapetus', name: 'Iapetus', feature: 'はっきりした', gender: 'male' },
  { id: 'Umbriel', name: 'Umbriel', feature: 'おおらか', gender: 'male' },
  { id: 'Algieba', name: 'Algieba', feature: 'なめらか', gender: 'male' },
  { id: 'Despina', name: 'Despina', feature: 'なめらか', gender: 'female' },
  { id: 'Erinome', name: 'Erinome', feature: 'はっきりした', gender: 'female' },
  { id: 'Algenib', name: 'Algenib', feature: 'しゃがれた', gender: 'male' },
  { id: 'Rasalgethi', name: 'Rasalgethi', feature: '知的で落ち着いた', gender: 'male' },
  { id: 'Laomedeia', name: 'Laomedeia', feature: '弾むような', gender: 'female' },
  { id: 'Achernar', name: 'Achernar', feature: 'やわらかい', gender: 'female' },
  { id: 'Alnilam', name: 'Alnilam', feature: 'きりっとした', gender: 'male' },
  { id: 'Schedar', name: 'Schedar', feature: '落ち着いた', gender: 'male' },
  { id: 'Gacrux', name: 'Gacrux', feature: '大人びた', gender: 'female' },
  { id: 'Pulcherrima', name: 'Pulcherrima', feature: '前向きな', gender: 'female' },
  { id: 'Achird', name: 'Achird', feature: '親しみやすい', gender: 'male' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', feature: 'くだけた', gender: 'male' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', feature: 'やさしい', gender: 'female' },
  { id: 'Sadachbia', name: 'Sadachbia', feature: '生き生きした', gender: 'male' },
  { id: 'Sadaltager', name: 'Sadaltager', feature: '物知りな', gender: 'male' },
  { id: 'Sulafat', name: 'Sulafat', feature: '温かい', gender: 'female' },
]);

export const STYLE_FEELINGS = Object.freeze([
  { label: '指定しない', value: '' },
  { label: '明るく親しみやすく', value: 'cheerful and friendly' },
  { label: '明るく元気に', value: 'cheerful and energetic' },
  { label: '温かく会話するように', value: 'warm and conversational' },
  { label: '熱意をこめて', value: 'warm and enthusiastic' },
  { label: '落ち着いて', value: 'calm and relaxed' },
  { label: 'しみじみと', value: 'reflective and awe-inspired' },
  { label: 'ニュースのように', value: 'clear, professional news delivery' },
  { label: 'ささやき声で', value: 'whispering' },
  { label: '息を切らして', value: 'out of breath' },
  { label: '怒って', value: 'angry tone' },
  { label: '皮肉っぽく', value: 'sarcastic' },
  { label: '抑揚をつけずに', value: 'monotone and flat' },
  { label: '怖がって', value: 'scared and trembling' },
  { label: '悲しそうに', value: 'sad and tearful' },
  { label: '元気に', value: 'energetic and lively' },
  { label: '楽しそうに', value: 'happy and playful' },
  { label: '優しく', value: 'gentle and kind' },
  { label: '不安そうに', value: 'anxious and uneasy' },
  { label: '驚いて', value: 'surprised' },
  { label: '真剣に', value: 'serious and earnest' },
]);

export const STYLE_SPEEDS = Object.freeze([
  { label: 'ゆっくり', value: 'speaking slowly' },
  { label: 'ふつう', value: '' },
  { label: 'はやく', value: 'speaking rapidly' },
]);

export const EXPRESSIONS_COMMON = Object.freeze([
  { tag: '<short pause>', label: 'ひと呼吸' },
  { tag: '<long pause>', label: '長めの間' },
  { tag: '<breath>', label: '息を吸う' },
  { tag: '<sigh>', label: 'ため息' },
  { tag: '<phew>', label: 'ほっと一息' },
  { tag: '<laugh>', label: '笑う' },
  { tag: '<chuckle>', label: 'くすっと笑う' },
  { tag: '<giggle>', label: 'くすくす笑う' },
  { tag: '<gasp>', label: 'はっと息をのむ' },
  { tag: '<throat-clearing>', label: '咳払い' },
  { tag: '<cry>', label: '泣く' },
  { tag: '<whispers>', label: 'ささやく' },
]);

export const EXPRESSIONS_ALL = Object.freeze([
  { category: '間', items: [
    { tag: '<short pause>', label: 'ひと呼吸', desc: '短い間を空ける' },
    { tag: '<long pause>', label: '長めの間', desc: '長めの間を空ける' },
  ] },
  { category: '呼吸', items: [
    { tag: '<breath>', label: '息を吸う', desc: '息を吸う音' },
    { tag: '<heavy breath>', label: '荒い呼吸', desc: '荒い・深い呼吸' },
    { tag: '<exhales>', label: '息を吐く', desc: '息を吐く' },
    { tag: '<pant>', label: '息を切らす', desc: 'ハアハアと息を切らす' },
    { tag: '<yawn>', label: 'あくび', desc: 'あくび' },
  ] },
  { category: '笑い', items: [
    { tag: '<laugh>', label: '笑う', desc: '笑う・笑い声' },
    { tag: '<chuckle>', label: 'くすっと笑う', desc: 'くすっと笑う、含み笑い' },
    { tag: '<giggle>', label: 'くすくす笑う', desc: 'くすくす笑う' },
    { tag: '<snicker>', label: 'ひひっと笑う', desc: '皮肉・からかいの忍び笑い' },
    { tag: '<cackle>', label: 'けたけた笑う', desc: '甲高く笑う' },
  ] },
  { category: 'ため息など', items: [
    { tag: '<sigh>', label: 'ため息', desc: 'ため息' },
    { tag: '<phew>', label: 'ほっと一息', desc: '安堵の息' },
    { tag: '<pff>', label: 'ぷっと息を吐く', desc: 'あきれ・小ばかにした息' },
    { tag: '<tsk>', label: '舌打ち', desc: 'ちっ（舌打ち）' },
  ] },
  { category: '驚き', items: [
    { tag: '<gasp>', label: 'はっと息をのむ', desc: 'はっと息をのむ' },
    { tag: '<cheer>', label: '歓声を上げる', desc: '歓声を上げる' },
  ] },
  { category: '叫び', items: [
    { tag: '<scream>', label: '悲鳴を上げる', desc: '悲鳴を上げる' },
    { tag: '<shriek>', label: '金切り声を上げる', desc: '甲高い悲鳴' },
    { tag: '<shout>', label: '叫ぶ', desc: '叫ぶ・大声を出す' },
  ] },
  { category: '泣き', items: [
    { tag: '<cry>', label: '泣く', desc: '泣く' },
    { tag: '<sob>', label: 'すすり泣く', desc: 'しゃくり上げて泣く' },
    { tag: '<whimper>', label: 'めそめそ泣く', desc: '弱々しく泣く' },
  ] },
  { category: '苦しみ', items: [
    { tag: '<moan>', label: 'うめく', desc: 'うめく（苦痛・不満）' },
    { tag: '<groan>', label: 'うーんとうなる', desc: 'うーんとうなる' },
  ] },
  { category: '怒り', items: [
    { tag: '<argh>', label: 'いら立ちの声', desc: 'いら立ち・悔しさの声' },
    { tag: '<grr>', label: '怒りのうなり', desc: '怒りのうなり' },
  ] },
  { category: '威嚇', items: [
    { tag: '<growl>', label: '低くうなる', desc: '動物的な威嚇' },
    { tag: '<grunt>', label: 'ふんっと言う', desc: '力んだり不満を示す短い声' },
    { tag: '<hiss>', label: 'シャーッと言う', desc: '歯の間から出す鋭い息の音' },
    { tag: '<snort>', label: '鼻を鳴らす', desc: 'ふんっと鼻を鳴らす' },
  ] },
  { category: '体の音', items: [
    { tag: '<cough>', label: '咳をする', desc: '咳' },
    { tag: '<throat-clearing>', label: '咳払い', desc: '咳払い（えへん）' },
    { tag: '<sneeze>', label: 'くしゃみ', desc: 'くしゃみ' },
  ] },
  { category: 'ささやき', items: [
    { tag: '<whispers>', label: 'ささやく', desc: 'ささやき声になる' },
  ] },
]);

export const CONSENT_TEXT = Object.freeze({
  'ja-JP': '私はこの音声の所有者であり、Googleがこの音声を使用して音声合成モデルを作成することを承認します。',
  'en-US': 'I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.',
});

export const DESIGN_EXAMPLE_TEXT = '落ち着いた温かい女性の声。30代くらいで、物語を優しく語りかけるような穏やかな話し方。';

export function buildStyle(feelingValue = '', speedValue = '') {
  return [feelingValue.trim(), speedValue.trim()].filter(Boolean).join(', ');
}

export function resolveStyleLabel(labelOrValue = '') {
  const token = String(labelOrValue).trim();
  if (!token) return '';
  const parts = token.split(/[・,+]/).map(s => s.trim()).filter(Boolean);
  const resolved = parts.map(part => {
    const f = STYLE_FEELINGS.find(item => item.label === part || item.value === part);
    if (f) return f.value;
    const s = STYLE_SPEEDS.find(item => item.label === part || item.value === part);
    if (s) return s.value;
    return part;
  }).filter(Boolean);
  return resolved.join(', ');
}

// Parses inline markers like 【話し方:明るく元気に・はやく】 or 【話し方:落ち着いて】 into content segments.
export function parseInlineStyleSegments(rawText, defaultStyle = '') {
  const text = String(rawText || '');
  const regex = /【話し方[:：]([^】]+)】/g;
  const segments = [];
  let currentStyle = defaultStyle;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const chunk = text.slice(lastIndex, match.index).trim();
    if (chunk) segments.push({ text: chunk, style: currentStyle });
    currentStyle = resolveStyleLabel(match[1]);
    lastIndex = regex.lastIndex;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) segments.push({ text: tail, style: currentStyle });
  return segments;
}

export function stripInlineStyleMarkers(rawText) {
  return String(rawText || '').replace(/【話し方[:：][^】]+】/g, '').replace(/<[a-z -]+>/gi, '');
}

export function slicePreviewText(rawText) {
  const segments = parseInlineStyleSegments(rawText, '');
  const fullPlain = segments.map(s => s.text).join('');
  if (fullPlain.length <= 75) return String(rawText || '').trim();
  const text = String(rawText || '').trim();
  const minSlice = 45, maxSlice = 95;
  const sub = text.slice(0, maxSlice);
  for (let i = minSlice; i < sub.length; i++) {
    if ('。！？!?\n'.includes(sub[i])) return sub.slice(0, i + 1).trim();
  }
  return text.slice(0, 65).trim();
}

export function estimateNarrationCost(rawText, modelId = DEFAULT_TTS_MODEL) {
  const plain = stripInlineStyleMarkers(rawText).trim();
  const chars = plain.length;
  const estimatedSeconds = chars === 0 ? 0 : Math.max(1, Math.round(chars / 6));
  const tokens = estimatedSeconds * 25;
  const model = TTS_MODELS.find(m => m.id === modelId) || TTS_MODELS[0];
  const usd = (tokens / 1_000_000) * model.usdPerMillion;
  const jpy = usd * 150;
  return { chars, estimatedSeconds, tokens, usd, jpy };
}

export function buildContentItem(text, style = '', speaker = '') {
  const item = { type: 'text', text: String(text || '').trim() };
  if (style || speaker) {
    const meta = { type: 'speech_metadata' };
    if (style) meta.style = style;
    if (speaker) meta.speaker = speaker;
    item.annotations = [meta];
  }
  return item;
}

export function buildSingleTtsRequest({ model = DEFAULT_TTS_MODEL, text = '', feeling = '', speed = '', voiceId = 'Zephyr' } = {}) {
  if (!TTS_MODELS.some(m => m.id === model)) throw new StudioError('対応している音声モデルを選んでください。');
  const voice = String(voiceId || '').trim();
  if (!voice) throw new StudioError('読み上げる声を選んでください。');
  const defaultStyle = buildStyle(feeling, speed);
  const segments = parseInlineStyleSegments(text, defaultStyle);
  if (!segments.length || segments.every(s => !s.text)) throw new StudioError('読み上げる文章を入力してください。');
  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalChars > 5000) throw new StudioError('読み上げる文章は5,000文字以内で入力してください。');
  return {
    model,
    input: [{ type: 'user_input', content: segments.map(s => buildContentItem(s.text, s.style)) }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice }] },
  };
}

export function buildDialogueTtsRequest({ model = DEFAULT_TTS_MODEL, speakers = [], turns = [] } = {}) {
  if (!TTS_MODELS.some(m => m.id === model)) throw new StudioError('対応している音声モデルを選んでください。');
  if (!Array.isArray(speakers) || speakers.length !== 2 || !speakers[0]?.voice || !speakers[1]?.voice)
    throw new StudioError('2人の会話には、話し手1と話し手2の声を選んでください。');
  if (speakers.some(s => s.custom))
    throw new StudioError('2人の会話モードでは、プリセットまたはカタログの声を選んでください（自作・複製した声は1人読み上げで利用できます）。');
  const validTurns = (Array.isArray(turns) ? turns : []).filter(t => String(t?.text || '').trim());
  if (!validTurns.length) throw new StudioError('会話のセリフを1行以上入力してください。');
  const content = validTurns.map(turn => {
    const speaker = turn.speaker === 'Speaker2' ? 'Speaker2' : 'Speaker1';
    const style = buildStyle(turn.feeling || '', turn.speed || '');
    return buildContentItem(turn.text, style, speaker);
  });
  return {
    model,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: {
      speech_config: {
        mode: 'conversational',
        speakers: [
          { speaker: 'Speaker1', voice: String(speakers[0].voice) },
          { speaker: 'Speaker2', voice: String(speakers[1].voice) },
        ],
      },
    },
  };
}

export function extractAudioBase64(interaction) {
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j--) {
      const item = step.content[j];
      if (item?.type === 'audio' && typeof item.data === 'string' && item.data.length > 0) return item.data;
    }
  }
  if (typeof interaction?.output_audio?.data === 'string' && interaction.output_audio.data.length > 0)
    return interaction.output_audio.data;
  return null;
}

export function base64ToBytes(base64) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks = [];
  for (let i = 0; i < view.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...view.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(''));
}

export function parseWav(bufferOrBytes) {
  const bytes = bufferOrBytes instanceof Uint8Array ? bufferOrBytes : new Uint8Array(bufferOrBytes);
  if (bytes.byteLength < 44) throw new StudioError('音声データ（WAV）が短すぎるか壊れています。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, len) => String.fromCharCode(...bytes.subarray(offset, offset + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new StudioError('WAV形式の音声データではありません。');
  let sampleRate = 24000, numChannels = 1, bitsPerSample = 16, pcmBytes = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    if (bodyStart + size > bytes.byteLength) break;
    if (id === 'fmt ' && size >= 16) {
      numChannels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (id === 'data') {
      pcmBytes = bytes.subarray(bodyStart, bodyStart + size);
      break;
    }
    offset = bodyStart + size + (size % 2);
  }
  if (!pcmBytes || sampleRate <= 0 || numChannels <= 0 || bitsPerSample <= 0)
    throw new StudioError('WAV音声の内部データを読み取れませんでした。');
  const bytesPerSample = Math.max(1, (bitsPerSample / 8) * numChannels);
  const durationSeconds = pcmBytes.byteLength / (sampleRate * bytesPerSample);
  return { sampleRate, numChannels, bitsPerSample, pcmBytes, durationSeconds };
}

export function buildWavFromPcm(pcmBytes, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const pcm = pcmBytes instanceof Uint8Array ? pcmBytes : new Uint8Array(pcmBytes);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const out = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(out.buffer);
  const writeStr = (pos, str) => { for (let i = 0; i < str.length; i++) out[pos + i] = str.charCodeAt(i); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

export function addSilenceToWav(wavBytes, leadSilenceSec = 0, trailSilenceSec = 0) {
  const parsed = parseWav(wavBytes);
  const lead = Math.max(0, Math.min(10, Number(leadSilenceSec) || 0));
  const trail = Math.max(0, Math.min(10, Number(trailSilenceSec) || 0));
  if (lead === 0 && trail === 0) {
    const clean = buildWavFromPcm(parsed.pcmBytes, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample);
    return { bytes: clean, blob: new Blob([clean], { type: 'audio/wav' }), durationSeconds: parsed.durationSeconds };
  }
  const blockAlign = parsed.numChannels * (parsed.bitsPerSample / 8);
  const leadBytes = Math.round(lead * parsed.sampleRate) * blockAlign;
  const trailBytes = Math.round(trail * parsed.sampleRate) * blockAlign;
  const combined = new Uint8Array(leadBytes + parsed.pcmBytes.byteLength + trailBytes);
  combined.set(parsed.pcmBytes, leadBytes);
  const wav = buildWavFromPcm(combined, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample);
  const durationSeconds = combined.byteLength / (parsed.sampleRate * blockAlign);
  return { bytes: wav, blob: new Blob([wav], { type: 'audio/wav' }), durationSeconds };
}

export async function convertAudioBlobTo24kMonoWav(blob) {
  if (!(blob instanceof Blob) || blob.size <= 0) throw new StudioError('音声ファイルを選択してください。');
  const raw = new Uint8Array(await blob.arrayBuffer());
  try {
    const parsed = parseWav(raw);
    if (parsed.sampleRate === 24000 && parsed.numChannels === 1 && parsed.bitsPerSample === 16) {
      const clean = buildWavFromPcm(parsed.pcmBytes, 24000, 1, 16);
      return { bytes: clean, blob: new Blob([clean], { type: 'audio/wav' }), durationSeconds: parsed.durationSeconds };
    }
  } catch {}
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!AudioCtx || !OfflineCtx) throw new StudioError('このブラウザでは音声の変換に対応していません。24kHzモノラルのWAVファイルを選んでください。');
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const targetRate = 24000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineCtx(1, frameCount, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const channel = rendered.getChannelData(0);
    const pcm = new Uint8Array(channel.length * 2);
    const view = new DataView(pcm.buffer);
    for (let i = 0; i < channel.length; i++) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    const wav = buildWavFromPcm(pcm, targetRate, 1, 16);
    return { bytes: wav, blob: new Blob([wav], { type: 'audio/wav' }), durationSeconds: channel.length / targetRate };
  } finally {
    try { await ctx.close(); } catch {}
  }
}

export function normalizeCatalogVoice(v = {}) {
  const asList = val => Array.isArray(val) ? val.filter(Boolean).map(String) : val ? [String(val)] : [];
  const languages = asList(v.language_code);
  const styles = asList(v.persona ?? v.style);
  const contexts = asList(v.contexts ?? v.context);
  const name = String(v.display_name || v.id || '');
  const desc = String(v.description || '');
  const gender = String(v.gender || '');
  const pitch = String(v.pitch || '');
  const accent = String(v.accent || '');
  const searchText = [name, desc, accent, gender, pitch, ...languages, ...styles, ...contexts].join(' ').toLowerCase();
  return { id: String(v.id || name), name, desc, gender, pitch, languages, styles, contexts, accent, kind: v.type || 'prebuilt', searchText };
}

export function filterCatalogVoices(voices = [], { query = '', language = '', gender = '', pitch = '', favoritesOnly = false, favorites = new Set() } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return voices.filter(v => {
    if (favoritesOnly && !favorites.has(v.id)) return false;
    if (language && !v.languages.some(l => l.toLowerCase().startsWith(language.toLowerCase()))) return false;
    if (gender && v.gender.toLowerCase() !== gender.toLowerCase()) return false;
    if (pitch && v.pitch.toLowerCase() !== pitch.toLowerCase()) return false;
    if (q && !v.searchText.includes(q)) return false;
    return true;
  });
}

const defaultFetcher = (...args) => globalThis.fetch(...args);

export class NarrationGateway {
  constructor(getApiKey, { fetcher = defaultFetcher, timeoutMs = 120000 } = {}) {
    this.getApiKey = getApiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.catalogCache = null;
    this.previewCache = new Map();
    this.customVoices = [];
    this.ephemeralVoiceKeys = [];
  }
  key() {
    const k = typeof this.getApiKey === 'function' ? this.getApiKey() : this.getApiKey;
    if (!k) throw new StudioError('Gemini の API キーを入力してください', { uncertain: true });
    return k;
  }
  async requestJson(path, { method = 'GET', body = null } = {}) {
    const apiKey = this.key();
    const url = new URL(path, TTS_ORIGIN);
    if (url.origin !== TTS_ORIGIN) throw new StudioError('許可されていない通信先です。', { terminal: true });
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
      throw new StudioError('Google音声APIへの通信が中断されました。通信状態を確認してください。', { uncertain: true });
    }
    if (!response.ok) {
      const safe = await readApiError(response);
      const terminal = [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status);
      throw new StudioError(apiErrorMessage(safe), { terminal, uncertain: !terminal });
    }
    return response.json();
  }
  async synthesize(requestPayload, { leadSilence = 0, trailSilence = 0 } = {}) {
    const json = await this.requestJson('/v1beta/interactions', { method: 'POST', body: requestPayload });
    const b64 = extractAudioBase64(json);
    if (!b64) throw new StudioError('Google音声APIから音声データが返されませんでした。文章や設定を変えてお試しください。', { terminal: true });
    const rawBytes = base64ToBytes(b64);
    return addSilenceToWav(rawBytes, leadSilence, trailSilence);
  }
  async synthesizeSingle({ model = DEFAULT_TTS_MODEL, text = '', feeling = '', speed = '', voiceId = 'Zephyr', leadSilence = 0, trailSilence = 0, previewOnly = false } = {}) {
    const targetText = previewOnly ? slicePreviewText(text) : text;
    const payload = buildSingleTtsRequest({ model, text: targetText, feeling, speed, voiceId });
    return this.synthesize(payload, { leadSilence: previewOnly ? 0 : leadSilence, trailSilence: previewOnly ? 0 : trailSilence });
  }
  async synthesizeDialogue({ model = DEFAULT_TTS_MODEL, speakers = [], turns = [], leadSilence = 0, trailSilence = 0, previewOnly = false } = {}) {
    const targetTurns = previewOnly ? turns.filter(t => String(t?.text || '').trim()).slice(0, 2) : turns;
    const payload = buildDialogueTtsRequest({ model, speakers, turns: targetTurns });
    return this.synthesize(payload, { leadSilence: previewOnly ? 0 : leadSilence, trailSilence: previewOnly ? 0 : trailSilence });
  }
  async previewVoice(voiceId, model = DEFAULT_TTS_MODEL) {
    const cacheKey = `${model}:${voiceId}`;
    if (this.previewCache.has(cacheKey)) return this.previewCache.get(cacheKey);
    const result = await this.synthesizeSingle({
      model,
      text: 'こんにちは。この声でナレーションを読み上げます。',
      voiceId,
    });
    this.previewCache.set(cacheKey, result);
    return result;
  }
  async loadVoiceCatalog({ force = false, maxPages = 10 } = {}) {
    if (!force && Array.isArray(this.catalogCache)) return this.catalogCache;
    const voices = [];
    let pageToken = '';
    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams({ type: 'prebuilt', page_size: '1000' });
      if (pageToken) qs.set('page_token', pageToken);
      const json = await this.requestJson(`/v1beta/voices?${qs.toString()}`);
      for (const item of json?.voices || []) voices.push(normalizeCatalogVoice(item));
      if (!json?.next_page_token) break;
      pageToken = String(json.next_page_token);
    }
    this.catalogCache = voices;
    return voices;
  }
  async loadCustomVoices() {
    const remote = [];
    for (const type of ['prompted', 'replicated']) {
      try {
        const json = await this.requestJson(`/v1beta/voices?type=${type}&page_size=200`);
        for (const item of json?.voices || []) remote.push({ ...normalizeCatalogVoice({ ...item, type }), custom: true });
      } catch {}
    }
    this.customVoices = [
      ...remote,
      ...this.ephemeralVoiceKeys.map(item => ({ id: item.key, name: `${item.name}（このタブ限定鍵）`, desc: '複製した声（Google未保存）', kind: 'replicated_key', custom: true, languages: [item.languageCode || 'ja-JP'], styles: [], contexts: [], gender: '', pitch: '', accent: '', searchText: item.name.toLowerCase() })),
    ];
    return this.customVoices;
  }
  async createPromptedVoice({ model = DEFAULT_TTS_MODEL, name = '', description = '', languageCode = 'ja-JP', gender = '', store = false } = {}) {
    const displayName = String(name || '').trim();
    const prompt = String(description || '').trim();
    if (!displayName) throw new StudioError('新しい声の名前を入力してください。');
    if (!prompt) throw new StudioError('どんな声にするか説明文を入力してください。');
    const voice = { model, type: 'prompted', display_name: displayName, language_code: languageCode, prompted: { input: prompt } };
    if (gender) voice.gender = gender;
    const json = await this.requestJson('/v1beta/voices', { method: 'POST', body: { store: !!store, voice } });
    const id = String(json?.key || json?.id || json?.voice?.id || displayName);
    if (!store && json?.key) {
      this.ephemeralVoiceKeys.push({ key: String(json.key), name: displayName, languageCode, createdAt: Date.now() });
    }
    let sampleBlob = null;
    if (typeof json?.sample_audio?.data === 'string' && json.sample_audio.data.length > 0) {
      sampleBlob = addSilenceToWav(base64ToBytes(json.sample_audio.data), 0, 0).blob;
    }
    const created = { id, name: displayName, desc: store ? prompt : `${prompt}（このタブ限定鍵）`, kind: 'prompted', custom: true, sampleBlob };
    this.customVoices = [created, ...this.customVoices.filter(v => v.id !== created.id)];
    return created;
  }
  async createReplicatedVoice({ model = DEFAULT_TTS_MODEL, name = '', languageCode = 'ja-JP', sampleWavBytes, consentWavBytes, store = true } = {}) {
    const displayName = String(name || '').trim();
    if (!displayName) throw new StudioError('複製する声の名前を入力してください。');
    if (!(sampleWavBytes instanceof Uint8Array) || sampleWavBytes.byteLength < 44)
      throw new StudioError('ご本人のサンプル音声（10〜30秒）を録音または選択してください。');
    if (!(consentWavBytes instanceof Uint8Array) || consentWavBytes.byteLength < 44)
      throw new StudioError('同意文を読み上げた音声を録音または選択してください。');
    const sampleInfo = parseWav(sampleWavBytes);
    if (sampleInfo.durationSeconds < 10 || sampleInfo.durationSeconds > 30)
      throw new StudioError(`サンプル音声の長さが約${sampleInfo.durationSeconds.toFixed(1)}秒です。10〜30秒の範囲で用意してください。`);
    parseWav(consentWavBytes);
    const voice = {
      model,
      type: 'replicated',
      display_name: displayName,
      language_code: languageCode,
      replicated: {
        source_audio: { mime_type: 'audio/wav', data: bytesToBase64(sampleWavBytes) },
        consent_audio: { mime_type: 'audio/wav', data: bytesToBase64(consentWavBytes) },
      },
    };
    const json = await this.requestJson('/v1beta/voices', { method: 'POST', body: { store: !!store, voice } });
    const id = String(json?.key || json?.id || json?.voice?.id || displayName);
    if (!store && json?.key) {
      this.ephemeralVoiceKeys.push({ key: String(json.key), name: displayName, languageCode, createdAt: Date.now() });
    }
    const created = { id, name: displayName, desc: store ? '複製した声（Google保存）' : '複製した声（このタブ限定鍵）', kind: 'replicated', custom: true };
    this.customVoices = [created, ...this.customVoices.filter(v => v.id !== created.id)];
    return created;
  }
  async deleteVoice(voiceId) {
    const id = String(voiceId || '').trim();
    if (!id) return false;
    const localIdx = this.ephemeralVoiceKeys.findIndex(k => k.key === id);
    if (localIdx !== -1) {
      this.ephemeralVoiceKeys.splice(localIdx, 1);
      this.customVoices = this.customVoices.filter(v => v.id !== id);
      return true;
    }
    await this.requestJson(`/v1beta/voices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.customVoices = this.customVoices.filter(v => v.id !== id);
    return true;
  }
}

export function mountNarrationStudio({ getApiKey, getStudio, getVideoElement, blobUrl, onUpdate, alertUser, keyRequiredMessage = 'Gemini の API キーを入力してください' } = {}) {
  const $ = id => document.getElementById(id);
  if (!$('narration-section')) return null;

  const gateway = new NarrationGateway(() => typeof getApiKey === 'function' ? getApiKey() : '');
  const state = {
    mode: 'single',
    modelId: TTS_MODELS[0].id,
    voiceName: 'Kore',
    feelingValue: '',
    speedValue: '',
    leadSilenceSec: 0,
    trailSilenceSec: 0,
    speaker1Name: '話し手A',
    speaker1Voice: 'Kore',
    speaker1Style: '',
    speaker2Name: '話し手B',
    speaker2Voice: 'Puck',
    speaker2Style: '',
    turns: [
      { speakerIndex: 0, text: 'こんにちは。この映像のポイントをわかりやすくご案内します。' },
      { speakerIndex: 1, text: 'よろしくお願いします。<short pause> さっそく見ていきましょう。' },
    ],
    clips: [],
    selectedClipId: null,
    catalogVoices: [],
    favorites: new Set(['Kore', 'Puck', 'Aoede', 'Leda', 'Sulafat']),
    busy: false,
    status: '',
    error: '',
    cloneSampleWav: null,
    cloneSampleSeconds: 0,
    cloneConsentWav: null,
    cloneConsentSeconds: 0,
    recorders: { sample: null, consent: null },
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function allAvailableVoices() {
    const custom = gateway.customVoices.map(v => ({
      id: v.id,
      label: `★ ${v.name} — ${v.desc || v.feature || 'カスタム音声'}`,
      gender: 'custom',
    }));
    const presets = PRESET_VOICES.map(v => ({
      id: v.id,
      label: `${state.favorites.has(v.id) ? '★ ' : ''}${v.name} — ${v.feature || v.desc || ''}`,
      gender: v.gender,
    }));
    const presetIds = new Set(PRESET_VOICES.map(v => v.id));
    const catalogExtras = state.catalogVoices
      .filter(v => !presetIds.has(v.id))
      .slice(0, 120)
      .map(v => ({
        id: v.id,
        label: `${state.favorites.has(v.id) ? '★ ' : ''}${v.name} — ${v.desc || ''}`,
        gender: v.gender,
      }));
    return [...custom, ...presets, ...catalogExtras];
  }

  function populateVoiceSelect(selectNode, currentValue) {
    if (!selectNode) return;
    const voices = allAvailableVoices();
    selectNode.replaceChildren();
    for (const v of voices) {
      const opt = make('option', '', v.label);
      opt.value = v.id;
      selectNode.append(opt);
    }
    if (voices.some(v => v.id === currentValue)) {
      selectNode.value = currentValue;
    } else if (voices.length) {
      selectNode.value = voices[0].id;
    }
  }

  function populateStaticControls() {
    const modelSel = $('narration-model');
    if (modelSel) {
      modelSel.replaceChildren();
      for (const m of TTS_MODELS) {
        const opt = make('option', '', m.label);
        opt.value = m.id;
        modelSel.append(opt);
      }
      modelSel.value = state.modelId;
    }
    const feelSel = $('narration-feeling');
    if (feelSel) {
      feelSel.replaceChildren();
      for (const f of STYLE_FEELINGS) {
        const opt = make('option', '', f.label);
        opt.value = f.value;
        feelSel.append(opt);
      }
      feelSel.value = state.feelingValue;
    }
    const speedSel = $('narration-speed');
    if (speedSel) {
      speedSel.replaceChildren();
      for (const s of STYLE_SPEEDS) {
        const opt = make('option', '', s.label);
        opt.value = s.value;
        speedSel.append(opt);
      }
      speedSel.value = state.speedValue;
    }
    populateVoiceSelect($('narration-voice'), state.voiceName);
    populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
    populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);

    const commonBar = $('narration-common-tags');
    if (commonBar) {
      commonBar.replaceChildren();
      for (const item of EXPRESSIONS_COMMON) {
        const btn = make('button', 'tag-chip', item.label);
        btn.type = 'button';
        btn.title = item.tag;
        btn.addEventListener('click', () => insertTagIntoScript(item.tag));
        commonBar.append(btn);
      }
    }
    const allTagsGrid = $('narration-all-tags');
    if (allTagsGrid) {
      allTagsGrid.replaceChildren();
      for (const group of EXPRESSIONS_ALL) {
        const box = make('div', 'tag-group');
        box.append(make('strong', 'tag-group-title', group.category));
        const list = make('div', 'tag-group-items');
        for (const item of group.items) {
          const btn = make('button', 'tag-chip', `${item.label} ${item.tag}`);
          btn.type = 'button';
          btn.title = item.desc;
          btn.addEventListener('click', () => insertTagIntoScript(item.tag));
          list.append(btn);
        }
        box.append(list);
        allTagsGrid.append(box);
      }
    }
    if ($('narration-consent-quote')) {
      $('narration-consent-quote').textContent = `「${CONSENT_TEXT['ja-JP']}」`;
    }
  }

  function insertTextAtCursor(textarea, snippet) {
    if (!textarea) return;
    const current = String(textarea.value || '');
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : current.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : current.length;
    textarea.value = current.slice(0, start) + snippet + current.slice(end);
    textarea.focus?.();
    updateEstimate();
  }

  function insertTagIntoScript(tag) {
    if (state.mode === 'dialogue') {
      const lastIdx = Math.max(0, state.turns.length - 1);
      state.turns[lastIdx].text = `${state.turns[lastIdx].text} ${tag}`.trim();
      renderTurns();
      updateEstimate();
      return;
    }
    insertTextAtCursor($('narration-text'), ` ${tag} `);
  }

  function renderTurns() {
    const container = $('narration-turns');
    if (!container) return;
    container.replaceChildren();
    state.turns.forEach((turn, idx) => {
      const row = make('div', 'dialogue-turn-row');
      const speakerSelect = make('select', 'turn-speaker-select');
      const opt1 = make('option', '', `話し手1 (${state.speaker1Name})`); opt1.value = '0';
      const opt2 = make('option', '', `話し手2 (${state.speaker2Name})`); opt2.value = '1';
      speakerSelect.append(opt1, opt2);
      speakerSelect.value = String(turn.speakerIndex === 1 ? 1 : 0);
      speakerSelect.addEventListener('change', () => {
        turn.speakerIndex = Number(speakerSelect.value) === 1 ? 1 : 0;
      });
      const input = make('textarea', 'turn-text-input');
      input.rows = 2;
      input.value = turn.text;
      input.placeholder = 'セリフを入力（<short pause> や |うん| などの相づちも使えます）';
      input.addEventListener('input', () => {
        turn.text = input.value;
        updateEstimate();
      });
      const removeBtn = make('button', 'quiet', '削除');
      removeBtn.type = 'button';
      removeBtn.disabled = state.turns.length <= 1;
      removeBtn.addEventListener('click', () => {
        if (state.turns.length <= 1) return;
        state.turns.splice(idx, 1);
        renderTurns();
        updateEstimate();
      });
      row.append(speakerSelect, input, removeBtn);
      container.append(row);
    });
  }

  function currentScriptText() {
    if (state.mode === 'dialogue') {
      return state.turns.map(t => t.text).join('\n');
    }
    return $('narration-text')?.value || '';
  }

  function updateEstimate() {
    const est = estimateNarrationCost(currentScriptText(), state.modelId);
    if ($('narration-estimate')) {
      $('narration-estimate').textContent = `文字数 ${est.chars}文字 · 推定 約${est.estimatedSeconds}秒 · 目安 約$${est.usd.toFixed(4)}（約${est.jpy.toFixed(2)}円）`;
    }
  }

  function selectedClip() {
    return state.clips.find(c => c.id === state.selectedClipId) || state.clips[0] || null;
  }

  function renderCatalogList() {
    const list = $('narration-catalog-list');
    if (!list) return;
    list.replaceChildren();
    const query = ($('narration-catalog-search')?.value || '').trim().toLowerCase();
    const genderFilter = $('narration-catalog-gender')?.value || 'all';
    const items = (state.catalogVoices.length ? state.catalogVoices : PRESET_VOICES).filter(v => {
      if (genderFilter === 'favorites' && !state.favorites.has(v.id)) return false;
      if (genderFilter !== 'all' && genderFilter !== 'favorites' && v.gender !== genderFilter) return false;
      if (!query) return true;
      return `${v.id} ${v.name} ${v.desc} ${v.languageCode || ''}`.toLowerCase().includes(query);
    }).slice(0, 60);

    for (const item of items) {
      const row = make('div', 'catalog-voice-item');
      const info = make('div', 'catalog-voice-info');
      info.append(make('strong', '', `${item.name} (${item.id})`), make('small', '', item.desc || ''));
      const actions = make('div', 'catalog-voice-actions');
      const favBtn = make('button', 'quiet', state.favorites.has(item.id) ? '★' : '☆');
      favBtn.type = 'button';
      favBtn.addEventListener('click', () => {
        if (state.favorites.has(item.id)) state.favorites.delete(item.id);
        else state.favorites.add(item.id);
        populateVoiceSelect($('narration-voice'), state.voiceName);
        renderCatalogList();
      });
      const useBtn = make('button', 'secondary', 'この声を選ぶ');
      useBtn.type = 'button';
      useBtn.addEventListener('click', () => {
        state.voiceName = item.id;
        populateVoiceSelect($('narration-voice'), state.voiceName);
        state.status = `「${item.name}」を選択しました。`;
        render();
      });
      actions.append(favBtn, useBtn);
      row.append(info, actions);
      list.append(row);
    }
  }

  function renderCustomVoicesList() {
    const list = $('narration-custom-voices-list');
    if (!list) return;
    list.replaceChildren();
    if (!gateway.customVoices.length) {
      list.append(make('p', 'hint', '作成したカスタム音声・複製音声がここに並びます。'));
      return;
    }
    for (const v of gateway.customVoices) {
      const row = make('div', 'catalog-voice-item');
      const info = make('div', 'catalog-voice-info');
      info.append(make('strong', '', `★ ${v.name}`), make('small', '', v.desc || 'カスタム音声'));
      const actions = make('div', 'catalog-voice-actions');
      const useBtn = make('button', 'secondary', '使う');
      useBtn.type = 'button';
      useBtn.addEventListener('click', () => {
        state.voiceName = v.id;
        populateVoiceSelect($('narration-voice'), state.voiceName);
        state.status = `カスタム音声「${v.name}」を選択しました。`;
        render();
      });
      const delBtn = make('button', 'quiet', '削除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', async () => {
        if (!requireKey()) return;
        state.busy = true; state.error = ''; render();
        try {
          await gateway.deleteVoice(v.id);
          populateVoiceSelect($('narration-voice'), state.voiceName);
          populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
          populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);
          state.status = `カスタム音声「${v.name}」を削除しました。`;
        } catch (err) {
          state.error = err instanceof StudioError ? err.message : '音声の削除を完了できませんでした。';
        } finally {
          state.busy = false;
          render();
        }
      });
      actions.append(useBtn, delBtn);
      row.append(info, actions);
      list.append(row);
    }
  }

  function requireKey() {
    const key = typeof getApiKey === 'function' ? getApiKey() : '';
    if (!key) {
      if (typeof alertUser === 'function') alertUser(keyRequiredMessage);
      document.getElementById('api-key')?.focus?.();
      return false;
    }
    return true;
  }

  async function runSynthesize({ previewOnly = false } = {}) {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    if (state.busy || studio?.busy) return;
    if (!requireKey()) return;
    state.busy = true;
    state.error = '';
    state.status = previewOnly ? '最初の約10秒のナレーションを試聴生成しています…' : 'ナレーション音声を生成しています…';
    render();
    try {
      let result;
      if (state.mode === 'dialogue') {
        const turns = state.turns.map(t => ({
          speaker: t.speakerIndex === 1 ? 'Speaker2' : 'Speaker1',
          text: t.text,
          feeling: t.speakerIndex === 1 ? state.speaker2Style : state.speaker1Style,
          speed: '',
        }));
        result = await gateway.synthesizeDialogue({
          model: state.modelId,
          speakers: [
            { voice: state.speaker1Voice, custom: gateway.customVoices.some(v => v.id === state.speaker1Voice) },
            { voice: state.speaker2Voice, custom: gateway.customVoices.some(v => v.id === state.speaker2Voice) },
          ],
          turns,
          leadSilence: state.leadSilenceSec,
          trailSilence: state.trailSilenceSec,
          previewOnly,
        });
      } else {
        const rawText = $('narration-text')?.value || '';
        const customInstruction = $('narration-custom-style')?.value?.trim() || '';
        const combinedFeeling = [state.feelingValue, customInstruction].filter(Boolean).join(', ');
        result = await gateway.synthesizeSingle({
          model: state.modelId,
          text: rawText,
          feeling: combinedFeeling,
          speed: state.speedValue,
          voiceId: state.voiceName,
          leadSilence: state.leadSilenceSec,
          trailSilence: state.trailSilenceSec,
          previewOnly,
        });
      }
      const clipId = `narration-${Date.now()}-${state.clips.length + 1}`;
      const label = `${previewOnly ? '[試聴] ' : ''}${state.mode === 'dialogue' ? '2人の会話' : state.voiceName} (${result.durationSeconds.toFixed(1)}秒)`;
      const clip = {
        id: clipId,
        label,
        blob: result.blob,
        durationSeconds: result.durationSeconds,
        mode: state.mode,
        voiceName: state.voiceName,
        previewOnly,
      };
      state.clips.unshift(clip);
      state.selectedClipId = clip.id;
      state.status = `${label} を生成しました。下のプレーヤーで試聴や動画への合成ができます。`;
      const audioEl = $('narration-audio');
      if (audioEl && typeof blobUrl === 'function') {
        audioEl.src = blobUrl(clip.blob);
      }
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : 'ナレーションの生成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false;
      render();
      onUpdate?.();
    }
  }

  async function applyToSelectedVideo({ layer = false } = {}) {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selected = studio?.selected;
    const clip = selectedClip();
    if (!studio || !selected || !clip || state.busy || studio.busy) return;
    const startSeconds = Math.max(0, Number($('narration-start-seconds')?.value) || 0);
    const videoVolume = Math.max(0, Math.min(2, (Number($('narration-video-volume')?.value) ?? 60) / 100));
    const narrationVolume = Math.max(0.1, Math.min(2, (Number($('narration-voice-volume')?.value) ?? 100) / 100));
    state.busy = true;
    state.error = '';
    state.status = '動画にナレーション音声を合成しています…';
    render();
    try {
      await studio.applyNarration(selected.id, clip.blob, {
        startSeconds,
        videoVolume,
        narrationVolume,
        layer,
        label: clip.label,
      });
      state.status = `${selected.seconds}秒版の動画（開始 ${startSeconds.toFixed(1)}秒）にナレーションを合成しました。中央のプレビューで確認・保存できます。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '動画へのナレーション合成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false;
      render();
      onUpdate?.();
    }
  }

  function render() {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selected = studio?.selected;
    const hasKey = !!(typeof getApiKey === 'function' && getApiKey());
    const locked = state.busy || !!studio?.busy;

    if ($('narration-mode-single')) $('narration-mode-single').setAttribute('aria-pressed', String(state.mode === 'single'));
    if ($('narration-mode-dialogue')) $('narration-mode-dialogue').setAttribute('aria-pressed', String(state.mode === 'dialogue'));
    if ($('narration-single-panel')) $('narration-single-panel').hidden = state.mode !== 'single';
    if ($('narration-dialogue-panel')) $('narration-dialogue-panel').hidden = state.mode !== 'dialogue';

    for (const id of ['narration-generate', 'narration-preview-10s', 'narration-voice-preview']) {
      const btn = $(id);
      if (btn) {
        btn.disabled = locked;
        btn.classList.toggle('needs-key', !hasKey);
      }
    }

    const clip = selectedClip();
    if ($('narration-result-panel')) $('narration-result-panel').hidden = !clip;
    const clipsSel = $('narration-clips-select');
    if (clipsSel) {
      clipsSel.replaceChildren();
      for (const c of state.clips) {
        const opt = make('option', '', c.label);
        opt.value = c.id;
        clipsSel.append(opt);
      }
      if (clip) clipsSel.value = clip.id;
    }
    if (clip && $('narration-wav-download') && typeof blobUrl === 'function') {
      $('narration-wav-download').href = blobUrl(clip.blob);
      $('narration-wav-download').download = `omni-narration-${clip.durationSeconds.toFixed(1)}s.wav`;
      $('narration-wav-download').hidden = false;
    }

    const canMix = !!selected && !!clip && !locked && typeof studio?.mix === 'function';
    if ($('narration-apply')) {
      $('narration-apply').disabled = !canMix;
      $('narration-apply').textContent = selected
        ? `選択中の動画（${selected.seconds}秒版）にナレーションを重ねる`
        : '動画を生成または選択すると合成できます';
    }
    if ($('narration-layer')) {
      $('narration-layer').hidden = !selected?.narration;
      $('narration-layer').disabled = !canMix;
    }
    if ($('narration-restore')) {
      $('narration-restore').hidden = !selected?.narration;
      $('narration-restore').disabled = locked || !selected?.narration;
    }
    if ($('narration-mix-hint')) {
      $('narration-mix-hint').textContent = selected
        ? selected.narration
          ? `現在この版にはナレーションが${selected.narration.count}回合成されています。「元の動画音声に戻す」でいつでも合成前に戻せます。`
          : `選択中の動画（${selected.seconds}秒版）の元音声を残したまま、指定した開始位置・音量でナレーションを重ねます。`
        : 'ナレーション音声は動画がなくても単体で生成・WAV保存できます。動画を生成したあとで合成することも可能です。';
    }

    const statusNode = $('narration-status');
    if (statusNode) {
      const msg = state.error || state.status;
      statusNode.hidden = !msg;
      statusNode.classList.toggle('error', !!state.error);
      statusNode.textContent = msg;
    }
    renderCustomVoicesList();
    updateEstimate();
  }

  populateStaticControls();
  renderTurns();
  renderCatalogList();

  $('narration-mode-single')?.addEventListener('click', () => { state.mode = 'single'; render(); });
  $('narration-mode-dialogue')?.addEventListener('click', () => { state.mode = 'dialogue'; render(); });
  $('narration-model')?.addEventListener('change', () => { state.modelId = $('narration-model').value; updateEstimate(); });
  $('narration-voice')?.addEventListener('change', () => { state.voiceName = $('narration-voice').value; });
  $('narration-feeling')?.addEventListener('change', () => { state.feelingValue = $('narration-feeling').value; });
  $('narration-speed')?.addEventListener('change', () => { state.speedValue = $('narration-speed').value; });
  $('narration-lead-silence')?.addEventListener('change', () => { state.leadSilenceSec = Number($('narration-lead-silence').value) || 0; });
  $('narration-trail-silence')?.addEventListener('change', () => { state.trailSilenceSec = Number($('narration-trail-silence').value) || 0; });
  $('narration-text')?.addEventListener('input', updateEstimate);
  $('narration-custom-style')?.addEventListener('input', updateEstimate);

  $('narration-insert-style')?.addEventListener('click', () => {
    const feeling = STYLE_FEELINGS.find(f => f.value === state.feelingValue && f.value);
    const speed = STYLE_SPEEDS.find(s => s.value === state.speedValue && s.value);
    const label = [feeling?.label || '', speed?.label || ''].filter(Boolean).join('・') || '落ち着いて';
    insertTextAtCursor($('narration-text'), `\n【話し方:${label}】\n`);
  });

  $('narration-voice-preview')?.addEventListener('click', async () => {
    if (state.busy || !requireKey()) return;
    state.busy = true; state.error = ''; state.status = `「${state.voiceName}」の声を試聴しています…`; render();
    try {
      const res = await gateway.previewVoice(state.voiceName, state.modelId);
      const audioEl = $('narration-audio');
      if (audioEl && typeof blobUrl === 'function') {
        audioEl.src = blobUrl(res.blob);
        $('narration-result-panel').hidden = false;
        await audioEl.play?.().catch(() => {});
      }
      state.status = `「${state.voiceName}」のサンプル音声を生成しました。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '試聴音声の生成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false; render();
    }
  });

  $('narration-sp1-name')?.addEventListener('input', () => { state.speaker1Name = $('narration-sp1-name').value || '話し手A'; renderTurns(); });
  $('narration-sp2-name')?.addEventListener('input', () => { state.speaker2Name = $('narration-sp2-name').value || '話し手B'; renderTurns(); });
  $('narration-sp1-voice')?.addEventListener('change', () => { state.speaker1Voice = $('narration-sp1-voice').value; });
  $('narration-sp2-voice')?.addEventListener('change', () => { state.speaker2Voice = $('narration-sp2-voice').value; });
  $('narration-sp1-style')?.addEventListener('input', () => { state.speaker1Style = $('narration-sp1-style').value; });
  $('narration-sp2-style')?.addEventListener('input', () => { state.speaker2Style = $('narration-sp2-style').value; });
  $('narration-add-turn')?.addEventListener('click', () => {
    const nextSpeaker = state.turns.length ? (state.turns.at(-1).speakerIndex === 0 ? 1 : 0) : 0;
    state.turns.push({ speakerIndex: nextSpeaker, text: '' });
    renderTurns();
  });
  $('narration-insert-backchannel')?.addEventListener('click', () => {
    insertTagIntoScript('|うん、なるほど|');
  });

  $('narration-preview-10s')?.addEventListener('click', () => runSynthesize({ previewOnly: true }));
  $('narration-generate')?.addEventListener('click', () => runSynthesize({ previewOnly: false }));

  $('narration-clips-select')?.addEventListener('change', () => {
    state.selectedClipId = $('narration-clips-select').value;
    const clip = selectedClip();
    if (clip && $('narration-audio') && typeof blobUrl === 'function') {
      $('narration-audio').src = blobUrl(clip.blob);
    }
    render();
  });

  $('narration-use-current-time')?.addEventListener('click', () => {
    const videoEl = typeof getVideoElement === 'function' ? getVideoElement() : null;
    if (videoEl && $('narration-start-seconds')) {
      const current = Number.isFinite(videoEl.currentTime) ? Math.max(0, Number(videoEl.currentTime.toFixed(1))) : 0;
      $('narration-start-seconds').value = String(current);
    }
  });

  $('narration-video-volume')?.addEventListener('input', () => {
    if ($('narration-video-volume-label')) $('narration-video-volume-label').textContent = `${$('narration-video-volume').value}%`;
  });
  $('narration-voice-volume')?.addEventListener('input', () => {
    if ($('narration-voice-volume-label')) $('narration-voice-volume-label').textContent = `${$('narration-voice-volume').value}%`;
  });

  $('narration-apply')?.addEventListener('click', () => applyToSelectedVideo({ layer: false }));
  $('narration-layer')?.addEventListener('click', () => applyToSelectedVideo({ layer: true }));
  $('narration-restore')?.addEventListener('click', () => {
    const studio = typeof getStudio === 'function' ? getStudio() : null;
    const selected = studio?.selected;
    if (!studio || !selected || state.busy || studio.busy) return;
    try {
      studio.restoreAudio(selected.id);
      state.error = '';
      state.status = `${selected.seconds}秒版の動画を元の音声に戻しました。`;
      render();
      onUpdate?.();
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '元の音声への復元を完了できませんでした。';
      render();
    }
  });

  $('narration-load-catalog')?.addEventListener('click', async () => {
    if (state.busy || !requireKey()) return;
    state.busy = true; state.error = ''; state.status = 'Googleの拡張音声ライブラリ（約2,000種類）を読み込んでいます…'; render();
    try {
      state.catalogVoices = await gateway.loadVoiceCatalog();
      await gateway.loadCustomVoices().catch(() => {});
      populateVoiceSelect($('narration-voice'), state.voiceName);
      populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
      populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);
      renderCatalogList();
      state.status = `拡張音声ライブラリから ${state.catalogVoices.length} 種類の声を読み込みました。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '音声ライブラリの取得を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false; render();
    }
  });
  $('narration-catalog-search')?.addEventListener('input', renderCatalogList);
  $('narration-catalog-gender')?.addEventListener('change', renderCatalogList);

  $('narration-design-create')?.addEventListener('click', async () => {
    if (state.busy || !requireKey()) return;
    const name = $('narration-design-name')?.value?.trim() || 'オリジナル音声';
    const description = $('narration-design-prompt')?.value?.trim() || '';
    const store = !!$('narration-design-store')?.checked;
    state.busy = true; state.error = ''; state.status = '説明文から新しい声をデザインしています…'; render();
    try {
      const created = await gateway.createPromptedVoice({ model: state.modelId, name, description, store });
      state.voiceName = created.id;
      populateVoiceSelect($('narration-voice'), state.voiceName);
      populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
      populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);
      state.status = `新しい声「${created.name}」を作成し、選択しました。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '声のデザイン作成を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false; render();
    }
  });

  async function handleCloneAudioFile(file, target) {
    if (!file) return;
    state.busy = true; state.error = ''; render();
    try {
      const converted = await convertAudioBlobTo24kMonoWav(file);
      if (target === 'sample') {
        state.cloneSampleWav = converted.bytes;
        state.cloneSampleSeconds = converted.durationSeconds;
        if ($('narration-clone-sample-info')) $('narration-clone-sample-info').textContent = `サンプル音声: ${converted.durationSeconds.toFixed(1)}秒（24kHzモノラルWAV変換済み）`;
      } else {
        state.cloneConsentWav = converted.bytes;
        state.cloneConsentSeconds = converted.durationSeconds;
        if ($('narration-clone-consent-info')) $('narration-clone-consent-info').textContent = `同意音声: ${converted.durationSeconds.toFixed(1)}秒（24kHzモノラルWAV変換済み）`;
      }
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '音声ファイルの変換に失敗しました。';
    } finally {
      state.busy = false; render();
    }
  }

  $('narration-clone-sample-file')?.addEventListener('change', () => handleCloneAudioFile($('narration-clone-sample-file').files?.[0], 'sample'));
  $('narration-clone-consent-file')?.addEventListener('change', () => handleCloneAudioFile($('narration-clone-consent-file').files?.[0], 'consent'));

  $('narration-clone-create')?.addEventListener('click', async () => {
    if (state.busy || !requireKey()) return;
    const name = $('narration-clone-name')?.value?.trim() || '複製した声';
    const store = !!$('narration-clone-store')?.checked;
    state.busy = true; state.error = ''; state.status = 'サンプル音声と同意音声から声を複製しています…'; render();
    try {
      const created = await gateway.createReplicatedVoice({
        model: state.modelId,
        name,
        sampleWavBytes: state.cloneSampleWav,
        consentWavBytes: state.cloneConsentWav,
        store,
      });
      state.voiceName = created.id;
      populateVoiceSelect($('narration-voice'), state.voiceName);
      populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
      populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);
      state.status = `複製した声「${created.name}」を作成し、選択しました。`;
    } catch (err) {
      state.error = err instanceof StudioError ? err.message : '声の複製を完了できませんでした。';
      state.status = '';
    } finally {
      state.busy = false; render();
    }
  });

  function reset() {
    state.clips = [];
    state.selectedClipId = null;
    state.cloneSampleWav = null;
    state.cloneSampleSeconds = 0;
    state.cloneConsentWav = null;
    state.cloneConsentSeconds = 0;
    state.busy = false;
    state.status = '';
    state.error = '';
    gateway.previewCache.clear();
    gateway.ephemeralVoiceKeys = [];
    gateway.customVoices = [];
    const audioEl = $('narration-audio');
    if (audioEl) {
      audioEl.removeAttribute('src');
      audioEl.load?.();
    }
    if ($('narration-clone-sample-file')) $('narration-clone-sample-file').value = '';
    if ($('narration-clone-consent-file')) $('narration-clone-consent-file').value = '';
    if ($('narration-clone-sample-info')) $('narration-clone-sample-info').textContent = '未選択';
    if ($('narration-clone-consent-info')) $('narration-clone-consent-info').textContent = '未選択';
    populateVoiceSelect($('narration-voice'), state.voiceName);
    populateVoiceSelect($('narration-sp1-voice'), state.speaker1Voice);
    populateVoiceSelect($('narration-sp2-voice'), state.speaker2Voice);
    render();
  }

  render();
  return { gateway, state, render, reset };
}
