import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LYRIA_MODELS,
  MUSIC_GENRES,
  MUSIC_MOODS,
  MUSIC_INSTRUMENTS,
  VOCAL_TYPES,
  SONG_SECTION_TAGS,
  estimateMusicCost,
  buildMusicPrompt,
  buildMusicRequest,
  sniffAudioMime,
  extractMusicOutput,
  safeAudioFileId,
  convertAudioBlobToWav,
  MusicGateway,
} from '../dist/music.js';
import { buildWavFromPcm, bytesToBase64 } from '../dist/narration.js';
import { Studio, DEFAULT_VIDEO_SETTINGS } from '../dist/core.js';

function createSyntheticWav(durationSec = 1.0, sampleRate = 44100) {
  const numSamples = Math.round(durationSec * sampleRate);
  const pcm = new Uint8Array(numSamples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(i * 2, Math.round(Math.sin(i * 0.05) * 4000), true);
  }
  return buildWavFromPcm(pcm, sampleRate, 1, 16);
}

test('Lyria 3.5 catalogs and cost estimation expose models, genres, moods, instruments, vocal styles, and section tags', () => {
  assert.equal(LYRIA_MODELS.length, 2);
  assert.equal(LYRIA_MODELS[0].id, 'lyria-3.5');
  assert.equal(LYRIA_MODELS[1].id, 'lyria-3-clip-preview');
  assert.ok(MUSIC_GENRES.length >= 16);
  assert.ok(MUSIC_MOODS.length >= 12);
  assert.equal(MUSIC_INSTRUMENTS.length, 16);
  assert.equal(VOCAL_TYPES.length, 6);
  assert.equal(SONG_SECTION_TAGS.length, 10);

  const fullCost = estimateMusicCost('lyria-3.5');
  assert.equal(fullCost.usd, 0.08);
  assert.equal(fullCost.maxSeconds, 180);

  const clipCost = estimateMusicCost('lyria-3-clip-preview');
  assert.equal(clipCost.usd, 0.04);
  assert.equal(clipCost.maxSeconds, 30);
});

test('buildMusicPrompt formats BGM and Vocal Song prompts with instruments, BPM, key, and lyrics', () => {
  const bgmPrompt = buildMusicPrompt({
    mode: 'bgm',
    model: 'lyria-3.5',
    prompt: '朝霧の湖を進む小舟',
    genre: MUSIC_GENRES[1].value,
    mood: MUSIC_MOODS[1].value,
    instruments: ['piano', 'strings'],
    tempo: 'slow tempo',
    bpm: 78,
    musicalKey: 'C Major',
    durationSeconds: 20,
    endingStyle: 'natural resonant ring-out and smooth ending',
    keepSpaceForNarration: true,
  });
  assert.match(bgmPrompt, /20 seconds total duration/);
  assert.match(bgmPrompt, /Instrumental only, no vocals/);
  assert.match(bgmPrompt, /acoustic grand piano, lush orchestral strings/);
  assert.match(bgmPrompt, /78 BPM, Key of C Major/);
  assert.match(bgmPrompt, /spoken narration remains clear/);

  const vocalPrompt = buildMusicPrompt({
    mode: 'vocal',
    model: 'lyria-3.5',
    prompt: '爽やかな朝のポップス',
    vocalType: 'female_ja',
    durationSeconds: 45,
    lyrics: '[Verse 1]\n朝の光が差し込む\n[Chorus]\n新しい空へ',
  });
  assert.match(vocalPrompt, /vocal song \(45 seconds total duration\)/);
  assert.match(vocalPrompt, /Expressive female lead vocal, clear Japanese diction/);
  assert.match(vocalPrompt, /\[Verse 1\]\n朝の光が差し込む/);

  assert.throws(() => buildMusicPrompt({ mode: 'bgm', prompt: '', genre: '', mood: '' }), /説明を入力するか/);
});

test('buildMusicRequest supports text-only and multimodal image+text input for Lyria 3.5', () => {
  const textReq = buildMusicRequest({
    model: 'lyria-3.5',
    promptText: 'Create an ambient piano BGM.',
  });
  assert.equal(textReq.model, 'lyria-3.5');
  assert.equal(textReq.input, 'Create an ambient piano BGM.');
  assert.deepEqual(textReq.response_format, { type: 'audio' });

  const multiReq = buildMusicRequest({
    model: 'lyria-3.5',
    promptText: 'Compose music matching this lake scene.',
    imagePart: { mimeType: 'image/jpeg', data: 'YWJjZA==' },
  });
  assert.equal(Array.isArray(multiReq.input), true);
  assert.equal(multiReq.input.length, 2);
  assert.deepEqual(multiReq.input[0], { type: 'image', mime_type: 'image/jpeg', data: 'YWJjZA==' });
  assert.deepEqual(multiReq.input[1], { type: 'text', text: 'Compose music matching this lake scene.' });

  assert.throws(() => buildMusicRequest({ model: 'unknown-model', promptText: 'abc' }), /音楽生成モデル/);
});

test('sniffAudioMime and extractMusicOutput detect WAV/MP3/M4A and extract lyrics + audio', () => {
  const wavBytes = createSyntheticWav(0.5);
  assert.deepEqual(sniffAudioMime(wavBytes), { mimeType: 'audio/wav', ext: 'wav' });
  const mp3Id3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(sniffAudioMime(mp3Id3), { mimeType: 'audio/mpeg', ext: 'mp3' });
  const mp3Sync = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(sniffAudioMime(mp3Sync), { mimeType: 'audio/mpeg', ext: 'mp3' });

  const extracted = extractMusicOutput({
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'prompt' }] },
      {
        type: 'model_output',
        content: [
          { type: 'text', text: '[Verse 1]\nGenerated lyrics line' },
          { type: 'audio', mime_type: 'audio/mpeg', data: 'bXAzZGF0YQ==' },
        ],
      },
    ],
  });
  assert.equal(extracted.data, 'bXAzZGF0YQ==');
  assert.equal(extracted.mimeType, 'audio/mpeg');
  assert.match(extracted.lyricsOrNotes, /Generated lyrics line/);
});

test('safeAudioFileId validates Google Files URIs and blocks foreign origins', () => {
  assert.equal(safeAudioFileId('files/abc_123-xyz'), 'abc_123-xyz');
  assert.equal(safeAudioFileId('https://generativelanguage.googleapis.com/v1beta/files/track99:download?alt=media'), 'track99');
  assert.throws(() => safeAudioFileId('https://evil.example.com/v1beta/files/track99'), /許可されたURLではありません/);
});

test('MusicGateway handles inline audio, Files URI polling, missing key, and safe API errors', async () => {
  const wav = createSyntheticWav(1.0);
  const b64 = bytesToBase64(wav);
  const calls = [];
  const gateway = new MusicGateway(() => 'test-key-never-logged', {
    wait: async () => {},
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: 'lyria-int-1',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'text', text: '[Instrumental] Smooth piano' },
              { type: 'audio', mime_type: 'audio/wav', data: b64 },
            ],
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const req = buildMusicRequest({ model: 'lyria-3.5', promptText: 'Smooth piano BGM' });
  const result = await gateway.generateMusic(req);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'test-key-never-logged');
  assert.equal(result.ext, 'wav');
  assert.ok(Math.abs(result.durationSeconds - 1.0) < 0.05);
  assert.equal(result.lyricsOrNotes, '[Instrumental] Smooth piano');

  // Test URI polling + download
  let pollStep = 0;
  const uriGateway = new MusicGateway(() => 'test-key', {
    wait: async () => {},
    fetcher: async url => {
      pollStep++;
      if (pollStep === 1) {
        return new Response(JSON.stringify({
          id: 'lyria-int-2',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'audio', uri: 'files/musicfile123' }] }],
        }), { status: 200 });
      }
      if (pollStep === 2) {
        return new Response(JSON.stringify({ name: 'files/musicfile123', state: 'ACTIVE' }), { status: 200 });
      }
      return new Response(wav, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    },
  });
  const uriResult = await uriGateway.generateMusic(req);
  assert.equal(uriResult.ext, 'wav');
  assert.equal(pollStep, 3);

  // Missing key guard
  const noKeyGateway = new MusicGateway(() => '');
  await assert.rejects(() => noKeyGateway.generateMusic(req), /Gemini の API キーを入力してください/);
});

test('convertAudioBlobToWav and Studio.applyNarration layer BGM on top of narrated video while preserving cleanBlob', async () => {
  const wavBytes = createSyntheticWav(2.0);
  const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
  const converted = await convertAudioBlobToWav(wavBlob, { leadSilenceSec: 0.5 });
  assert.ok(Math.abs(converted.durationSeconds - 2.5) < 0.1);

  const mixCalls = [];
  const studio = new Studio(
    { async create() {}, async resolve() {} },
    {
      localMediaEnabled: true,
      validate: async () => ({ valid: true, actualSeconds: 10, width: 1280, height: 720 }),
      mix: async (videoBlob, audioBlob, opts) => {
        mixCalls.push({ videoBlob, audioBlob, opts });
        return { blob: new Blob([`mixed-${mixCalls.length}`], { type: 'video/mp4' }), actualSeconds: 10 };
      },
    }
  );
  const origVideo = new Blob(['original-video'], { type: 'video/mp4' });
  studio.versions = [{
    id: 'v1',
    interactionId: 'v1',
    seconds: 10,
    actualSeconds: 10,
    wholeSeconds: 10,
    width: 1280,
    height: 720,
    settings: DEFAULT_VIDEO_SETTINGS,
    blob: origVideo,
    cleanBlob: origVideo,
    narration: null,
    prompt: 'scene 1',
  }];
  studio.baseId = 'v1';
  studio.selectedId = 'v1';

  // First apply narration
  await studio.applyNarration('v1', wavBlob, { startSeconds: 0.5, videoVolume: 0.7, narrationVolume: 1.0, layer: false, label: 'ナレーション1' });
  const afterNarrationBlob = studio.selected.blob;
  assert.equal(studio.selected.cleanBlob, origVideo);
  assert.equal(studio.selected.narration.count, 1);

  // Next layer Lyria 3.5 BGM on top of the narrated video
  await studio.applyNarration('v1', converted.blob, { startSeconds: 0, videoVolume: 1.0, narrationVolume: 0.45, layer: true, label: 'トラック 1（BGM · Lyria 3.5）' });
  assert.equal(mixCalls.length, 2);
  assert.equal(mixCalls[1].videoBlob, afterNarrationBlob);
  assert.equal(studio.selected.cleanBlob, origVideo);
  assert.equal(studio.selected.narration.count, 2);
  assert.equal(studio.selected.narration.label, 'トラック 1（BGM · Lyria 3.5）');

  // Restore returns all the way back to cleanBlob
  studio.restoreAudio('v1');
  assert.equal(studio.selected.blob, origVideo);
  assert.equal(studio.selected.narration, null);
});
