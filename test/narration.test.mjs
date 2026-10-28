import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mixAudioMedia } from '../local-media.mjs';
import {
  TTS_MODELS,
  PRESET_VOICES,
  STYLE_FEELINGS,
  STYLE_SPEEDS,
  EXPRESSIONS_COMMON,
  EXPRESSIONS_ALL,
  CONSENT_TEXT,
  buildStyle,
  parseInlineStyleSegments,
  slicePreviewText,
  estimateNarrationCost,
  buildSingleTtsRequest,
  buildDialogueTtsRequest,
  parseWav,
  buildWavFromPcm,
  addSilenceToWav,
  NarrationGateway,
} from '../dist/narration.js';
import { Studio, StudioError } from '../dist/core.js';

const exec = promisify(execFile);
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const ffprobe = '/opt/homebrew/bin/ffprobe';

function makeSyntheticPcm(seconds = 1.0, sampleRate = 24000) {
  const samples = Math.round(seconds * sampleRate);
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    const val = Math.round(Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 8000);
    view.setInt16(i * 2, val, true);
  }
  return pcm;
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('preset voices, feelings, speeds and 36 expression tags match specification', () => {
  assert.equal(TTS_MODELS.length, 2);
  assert.equal(PRESET_VOICES.length, 30);
  assert.equal(STYLE_FEELINGS.length, 21);
  assert.equal(STYLE_SPEEDS.length, 3);
  assert.equal(EXPRESSIONS_COMMON.length, 12);
  const totalTags = EXPRESSIONS_ALL.reduce((sum, group) => sum + group.items.length, 0);
  assert.equal(EXPRESSIONS_ALL.length, 12);
  assert.equal(totalTags, 36);
  assert.match(CONSENT_TEXT['ja-JP'], /私はこの音声の所有者であり/);
});

test('buildStyle, parseInlineStyleSegments, slicePreviewText and estimateNarrationCost work accurately', () => {
  const style = buildStyle('calm and relaxed', 'speaking slowly');
  assert.equal(style, 'calm and relaxed, speaking slowly');

  const segments = parseInlineStyleSegments('最初の段落です。\n【話し方:明るく元気に・はやく】\n次の段落です。', 'calm and relaxed');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].style, 'calm and relaxed');
  assert.equal(segments[0].text, '最初の段落です。');
  assert.equal(segments[1].style, 'cheerful and energetic, speaking rapidly');
  assert.equal(segments[1].text, '次の段落です。');

  const sliced = slicePreviewText('あいうえお。かきくけこ。さしすせそ。たちつてと。なにぬねの。はひふへほ。まみむめも。やゆよ。らりるれろ。わをん。あいうえお。かきくけこ。さしすせそ。たちつてと。なにぬねの。');
  assert.ok(sliced.length <= 95);
  assert.match(sliced, /。$/);

  const cost = estimateNarrationCost('こんにちは、これはナレーションのテストです。', 'gemini-3.8-flash-tts');
  assert.ok(cost.chars > 0);
  assert.ok(cost.estimatedSeconds >= 1);
  assert.ok(cost.usd > 0);
  assert.ok(cost.jpy > 0);
});

test('buildSingleTtsRequest and buildDialogueTtsRequest construct valid Gemini TTS payloads', () => {
  const single = buildSingleTtsRequest({
    text: '湖の朝霧が晴れていきます。<short pause> 鳥の声が聞こえます。',
    voiceId: 'Kore',
    feeling: 'calm and relaxed',
    speed: 'speaking slowly',
  });
  assert.deepEqual(single.response_format, { type: 'audio', mime_type: 'audio/wav' });
  assert.equal(single.generation_config.speech_config[0].voice, 'Kore');
  assert.equal(single.input[0].content[0].annotations[0].style, 'calm and relaxed, speaking slowly');

  const dialogue = buildDialogueTtsRequest({
    speakers: [
      { voice: 'Kore' },
      { voice: 'Puck' },
    ],
    turns: [
      { speaker: 'Speaker1', text: '朝が来ました。', feeling: 'calm and relaxed' },
      { speaker: 'Speaker2', text: '出発しましょう！ |うん|', feeling: 'cheerful and energetic' },
    ],
  });
  const configs = dialogue.generation_config.speech_config.speakers;
  assert.equal(configs.length, 2);
  assert.equal(configs[0].speaker, 'Speaker1');
  assert.equal(configs[0].voice, 'Kore');
  assert.equal(configs[1].speaker, 'Speaker2');
  assert.equal(configs[1].voice, 'Puck');
  assert.equal(dialogue.input[0].content[0].text, '朝が来ました。');
  assert.equal(dialogue.input[0].content[1].text, '出発しましょう！ |うん|');
});

test('WAV builder, parser and silence padding preserve PCM sample integrity', () => {
  const pcm = makeSyntheticPcm(1.0, 24000);
  const wav = buildWavFromPcm(pcm, 24000, 1, 16);
  const parsed = parseWav(wav);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.numChannels, 1);
  assert.equal(parsed.bitsPerSample, 16);
  assert.ok(Math.abs(parsed.durationSeconds - 1.0) < 0.01);

  const padded = addSilenceToWav(wav, 0.5, 1.0);
  const parsedPadded = parseWav(padded.bytes);
  assert.ok(Math.abs(parsedPadded.durationSeconds - 2.5) < 0.02);
});

test('NarrationGateway synthesizes single/dialogue audio, caches previews, and manages voices without leaking keys', async () => {
  const pcm1s = makeSyntheticPcm(1.0, 24000);
  const wav1s = buildWavFromPcm(pcm1s, 24000, 1, 16);
  const calls = [];
  const gateway = new NarrationGateway(() => 'unit-test-key', {
    fetcher: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET', headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
      if (String(url).includes('/v1beta/interactions')) {
        return jsonResponse({
          steps: [{
            type: 'model_output',
            content: [{
              type: 'audio',
              data: bytesToBase64(wav1s),
            }],
          }],
        });
      }
      if (String(url).includes('/v1beta/voices?type=prebuilt')) {
        return jsonResponse({
          voices: [
            { id: 'voices/ja-warm-1', display_name: 'Warm Ja', gender: 'FEMALE', language_code: 'ja-JP', description: 'Warm Japanese voice' },
          ],
        });
      }
      if (String(url).endsWith('/v1beta/voices') && options.method === 'POST') {
        return jsonResponse({ id: 'custom-voice-1', key: 'ephemeral-key-1' });
      }
      if (String(url).includes('/v1beta/voices/') && options.method === 'DELETE') {
        return jsonResponse({ deleted: true });
      }
      return jsonResponse({});
    },
  });

  // Single synthesis with inline style switch and silence padding
  const singleRes = await gateway.synthesizeSingle({
    text: '前半のナレーションです。\n【話し方:明るく元気に】\n後半のナレーションです。',
    voiceId: 'Kore',
    feeling: 'calm and relaxed',
    leadSilence: 0.5,
    trailSilence: 0.5,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-goog-api-key'], 'unit-test-key');
  assert.equal(calls[0].body.input[0].content.length, 2);
  assert.ok(Math.abs(singleRes.durationSeconds - 2.0) < 0.05);

  // Preview caching
  await gateway.previewVoice('Kore');
  const countAfterFirstPreview = calls.length;
  await gateway.previewVoice('Kore');
  assert.equal(calls.length, countAfterFirstPreview, 'second preview of same voice uses cache');

  // Dialogue synthesis
  const diagRes = await gateway.synthesizeDialogue({
    speakers: [
      { voice: 'Kore' },
      { voice: 'Puck' },
    ],
    turns: [
      { speaker: 'Speaker1', text: 'こんにちは' },
      { speaker: 'Speaker2', text: 'よろしく' },
    ],
  });
  assert.ok(Math.abs(diagRes.durationSeconds - 1.0) < 0.05);

  // Voice catalog
  const catalog = await gateway.loadVoiceCatalog();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'voices/ja-warm-1');

  // Prompted voice creation (ephemeral store:false by default, then store:true)
  const promptedEphemeral = await gateway.createPromptedVoice({
    name: '映画ナレーター（一時）',
    description: '深みのある落ち着いた大人の声で、ドキュメンタリー番組のように丁寧に話す。',
    store: false,
  });
  assert.equal(promptedEphemeral.name, '映画ナレーター（一時）');
  assert.equal(calls.at(-1).body.store, false);
  assert.equal(gateway.ephemeralVoiceKeys.length, 1);

  const promptedStored = await gateway.createPromptedVoice({
    name: '映画ナレーター',
    description: '深みのある落ち着いた大人の声で、ドキュメンタリー番組のように丁寧に話す。',
    store: true,
  });
  assert.equal(promptedStored.name, '映画ナレーター');
  assert.equal(calls.at(-1).body.store, true);

  // HTTP error handling via readApiError + apiErrorMessage
  const errorGateway = new NarrationGateway(() => 'unit-test-key', {
    fetcher: async () => new Response(JSON.stringify({ error: { code: 'invalid_argument', message: 'secret detail' } }), { status: 400 }),
  });
  await assert.rejects(
    errorGateway.synthesizeSingle({ text: 'テスト', voiceId: 'Kore' }),
    err => err instanceof StudioError && err.message.length > 0 && !err.message.includes('secret detail') && err.terminal === true
  );

  // Replicated voice duration validation (must be 10..30s)
  await assert.rejects(
    gateway.createReplicatedVoice({
      name: '短いサンプル',
      sampleWavBytes: wav1s,
      consentWavBytes: wav1s,
    }),
    /10〜30秒/
  );

  const pcm12s = makeSyntheticPcm(12.0, 24000);
  const wav12s = buildWavFromPcm(pcm12s, 24000, 1, 16);
  const replicated = await gateway.createReplicatedVoice({
    name: '自分の声',
    sampleWavBytes: wav12s,
    consentWavBytes: wav1s,
    store: true,
  });
  assert.equal(replicated.name, '自分の声');
});

test('Studio.applyNarration, restoreAudio, and rebase extension preserve cleanBlob for Google while keeping narration in local prefix', async () => {
  const preparedBlobs = [];
  const composedSources = [];
  const originalVideoBlob = new Blob(['clean-video-35s'], { type: 'video/mp4' });
  const narratedVideoBlob = new Blob(['narrated-video-35s'], { type: 'video/mp4' });
  const layeredVideoBlob = new Blob(['layered-video-35s'], { type: 'video/mp4' });
  const wavBlob = new Blob(['wav-audio'], { type: 'audio/wav' });

  let mixCall = 0;
  const studio = new Studio(
    {
      create: async () => ({ id: 'ext-interaction-40' }),
      resolve: async job => ({ interactionId: job.interactionId, blob: new Blob(['model-ext-40'], { type: 'video/mp4' }) }),
    },
    {
      localMediaEnabled: true,
      validate: async (blob, expected) => ({ valid: true, durationValid: true, aspectValid: true, actualSeconds: expected, width: 640, height: 360 }),
      mix: async (vBlob, aBlob, opts) => {
        mixCall++;
        return {
          blob: mixCall === 1 ? narratedVideoBlob : layeredVideoBlob,
          actualSeconds: 20,
          width: 640,
          height: 360,
        };
      },
      prepare: async blob => {
        preparedBlobs.push(blob);
        return {
          originalBlob: blob,
          tailBlob: new Blob(['clean-tail-10s'], { type: 'video/mp4' }),
          sourceSeconds: 20,
          tailSeconds: 10,
          prefixSeconds: 10,
          settings: { aspectRatio: '16:9', resolution: '360p' },
          width: 640,
          height: 360,
          name: 'continuation.mp4',
          hasAudio: true,
        };
      },
      compose: async (source, ending, expected) => {
        composedSources.push(source);
        return {
          blob: new Blob(['final-composed-40s'], { type: 'video/mp4' }),
          actualSeconds: expected,
          width: 640,
          height: 360,
        };
      },
    }
  );

  studio.versions = [{
    id: 'v-20',
    interactionId: 'v-20',
    seconds: 20,
    wholeSeconds: 20,
    modelSeconds: 20, // Normal 20s version (20 + 5 <= 40), rebased triggered by narration!
    actualSeconds: 20,
    blob: originalVideoBlob,
    cleanBlob: originalVideoBlob,
    modelBlob: originalVideoBlob,
    rawBlob: originalVideoBlob,
    settings: { aspectRatio: '16:9', resolution: '360p' },
    width: 640,
    height: 360,
    viewed: true,
    prompt: 'initial',
    parentId: null,
  }];
  studio.baseId = 'v-20';
  studio.selectedId = 'v-20';

  // Apply narration
  await studio.applyNarration('v-20', wavBlob, { startSeconds: 1.5, videoVolume: 0.5, narrationVolume: 1.2, label: 'テスト音声' });
  assert.equal(studio.selected.blob, narratedVideoBlob);
  assert.equal(studio.selected.cleanBlob, originalVideoBlob);
  assert.equal(studio.selected.narration.count, 1);

  // Layer second narration
  await studio.applyNarration('v-20', wavBlob, { startSeconds: 5.0, videoVolume: 0.8, narrationVolume: 1.0, layer: true, label: '追加音声' });
  assert.equal(studio.selected.blob, layeredVideoBlob);
  assert.equal(studio.selected.cleanBlob, originalVideoBlob);
  assert.equal(studio.selected.narration.count, 2);

  // Extend narrated version (20s + 5s = 25s, automatically rebased because of narration)
  await studio.generate('続きのシーン', { aspectRatio: '16:9', resolution: '360p' }, 5);
  assert.equal(preparedBlobs.length, 1);
  assert.equal(preparedBlobs[0], originalVideoBlob, 'Google tail upload uses cleanBlob without narration speech');
  assert.equal(composedSources.length, 1);
  assert.equal(composedSources[0].originalBlob, layeredVideoBlob, 'local prefix composition preserves narrated video');

  // Restore original audio on v-20
  studio.restoreAudio('v-20');
  const v20 = studio.versions.find(v => v.id === 'v-20');
  assert.equal(v20.blob, originalVideoBlob);
  assert.equal(v20.narration, null);
});

test('mixAudioMedia mixes 24kHz WAV narration into MP4 with start offset and volume balance using real FFmpeg', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omni-narration-test-'));
  try {
    const videoPath = join(dir, 'video.mp4');
    await exec(ffmpeg, [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=green:s=640x360:r=24:d=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-t', '4', videoPath,
    ]);
    const videoBytes = await readFile(videoPath);
    const wavBytes = Buffer.from(buildWavFromPcm(makeSyntheticPcm(1.5, 24000), 24000, 1, 16));

    const mixedBytes = await mixAudioMedia(videoBytes, wavBytes, {
      startSeconds: 1.0,
      videoVolume: 0.5,
      narrationVolume: 1.2,
    });
    const outPath = join(dir, 'mixed.mp4');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outPath, mixedBytes);
    const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outPath]);
    const info = JSON.parse(stdout);
    const vStream = info.streams.find(s => s.codec_type === 'video');
    const aStream = info.streams.find(s => s.codec_type === 'audio');
    assert.ok(vStream);
    assert.ok(aStream);
    assert.equal(vStream.width, 640);
    assert.equal(vStream.height, 360);
    assert.equal(aStream.codec_name, 'aac');
    assert.ok(Math.abs(Number(info.format.duration) - 4.0) < 0.15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

