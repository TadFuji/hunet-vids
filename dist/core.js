import { sanitizeApiError } from './api-errors.js';

export const MAX_SECONDS = 40;
export const APP_VERSION = '2026-10-28.15';

export class StudioError extends Error {
  constructor(message, { uncertain = false, terminal = false } = {}) {
    super(message); this.uncertain = uncertain; this.terminal = terminal;
  }
}

export const DEFAULT_VIDEO_SETTINGS = Object.freeze({ aspectRatio: '16:9', resolution: '360p' });
// Versions made before per-video settings were recorded used fixed 16:9 / 720p.
export const LEGACY_VIDEO_SETTINGS = Object.freeze({ aspectRatio: '16:9', resolution: '720p' });
export function videoSettings(settings = DEFAULT_VIDEO_SETTINGS) {
  const { aspectRatio, resolution } = settings;
  if (!['16:9', '9:16'].includes(aspectRatio) || !['360p', '720p', '1080p', '4k'].includes(resolution))
    throw new StudioError('対応している動画の画角・解像度を選んでください。');
  return { aspectRatio, resolution };
}
export function formatVideoSettings(settings = DEFAULT_VIDEO_SETTINGS) {
  const { aspectRatio, resolution } = videoSettings(settings);
  return `${aspectRatio === '9:16' ? '縦' : '横'} ${aspectRatio} · ${resolution === '4k' ? '4K' : resolution}${['1080p', '4k'].includes(resolution) ? '（アップスケール）' : ''}`;
}

// Supported rectangular ratios allow pixel rounding.
export function verifyAspectRatio(width, height, aspectRatio) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n >= 16)) return false;
  const pair = ({ '16:9': [16,9], '9:16': [9,16] })[aspectRatio];
  return !!pair && Math.abs(width * pair[1] - height * pair[0]) <= Math.max(...pair);
}

export const secondsLabel = value => Number(value.toFixed(2)).toLocaleString('ja-JP');
export function canExtend(version, { localMediaEnabled = true } = {}) {
  if (!version || (version.settings?.aspectRatio && !['16:9','9:16'].includes(version.settings.aspectRatio))) return false;
  if (localMediaEnabled) return MAX_SECONDS - version.seconds >= 3 - 0.000001;
  const context = version.modelSeconds ?? version.actualSeconds ?? version.seconds;
  return !!version.interactionId && !version.source && !version.requiresUpload && Number.isFinite(context) && MAX_SECONDS - version.seconds >= 3 && MAX_SECONDS - context >= 3;
}
export function requestBody(prompt, parent = null, settings = DEFAULT_VIDEO_SETTINGS, addedSeconds = 10) {
  const { aspectRatio, resolution } = videoSettings(parent ? parent.settings || LEGACY_VIDEO_SETTINGS : settings);
  if (parent?.requiresUpload && parent.interactionId) throw new StudioError('切り出した現在版の末尾を準備してから延長してください。');
  const uploaded = !!parent && !parent.interactionId && !!(parent.source || parent.uploaded);
  if (!Number.isInteger(addedSeconds) || addedSeconds < 3 || addedSeconds > 10)
    throw new StudioError('Googleへ依頼する長さは整数3〜10秒です。');
  const timing = Number.isFinite(parent?.seconds) ? ` Extend the full ${parent.seconds}-second video to a full ${Number((parent.seconds + addedSeconds).toFixed(6))}-second video.` : '';
  const instruction = parent
    ? `[# Sources <${uploaded ? 'VIDEO_0' : 'PREVIOUS_VIDEO'}>@Video1] Extend this video by exactly ${addedSeconds} seconds, appending a new continuation after its existing ending.` + timing + ' Keep the existing story and sound, allowing the native seam adjustment. Do not replace its ending. Return the full extended video.' + (parent.source || parent.uploaded || parent.requiresUpload ? ' Do not add any new spoken dialogue. 続きの内容：' : ' 続きの内容：')
    : `Generate a video exactly ${addedSeconds} seconds long. 映像の内容：`;
  return {
    model: 'gemini-omni-1.1-flash',
    input: [{ type: 'text', text: instruction + prompt }],
    ...(parent?.interactionId ? { previous_interaction_id: parent.interactionId } : {}),
    ...(uploaded ? { generation_config: { video_config: { task: 'extend' } } } : {}),
    store: true,
    response_format: { type: 'video', ...(uploaded ? {} : { aspect_ratio: aspectRatio }), resolution, duration: `${addedSeconds}s`, delivery: 'uri' },
  };
}

export function videoSelection(interaction) {
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  const candidates = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === 'user_input') break;
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j--)
      if (step.content[j].type === 'video') candidates.push({ output: step.content[j], step: i, content: j });
  }
  const selected = candidates[0];
  return { output: selected?.output, summary: { count: candidates.length, step: selected?.step ?? null, content: selected?.content ?? null, hasData: !!selected?.output.data, hasUri: !!selected?.output.uri } };
}
export function outputVideo(interaction) { return videoSelection(interaction).output; }

export function verifyDuration(actual, expected) {
  return Number.isFinite(actual) && actual > 0 && Math.abs(actual - expected) <= 0.1 && actual <= MAX_SECONDS;
}
const number = n => Number.isFinite(n) ? n : null;
const oneOf = (value, values) => values.includes(value) ? value : 'unknown';
async function sameVideo(a, b) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  const [first, second] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const left = new Uint8Array(first), right = new Uint8Array(second);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

export class Studio {
  constructor(gateway, { validate = async () => true, prepare = async () => { throw new StudioError('現在版の末尾を準備できませんでした。Googleへは送信していません。', { uncertain: true }); }, trim = async () => { throw new StudioError('切り出し処理を利用できません。生成結果は保持しています。', { uncertain: true }); }, compose = async () => { throw new StudioError('ローカル接続処理を利用できません。元動画と生成結果は保持しています。', { uncertain: true }); }, mix = async () => { throw new StudioError('ナレーション音声の合成処理を利用できません。元の動画は保持しています。', { uncertain: true }); }, onChange = () => {}, localMediaEnabled = true, preflight = async () => {} } = {}) {
    this.localMediaEnabled = localMediaEnabled !== false; this.preflight = preflight;
    this.gateway = gateway; this.validate = validate; this.prepare = prepare; this.trim = trim; this.compose = compose; this.mix = mix; this.onChange = onChange;
    this.versions = []; this.baseId = null; this.selectedId = null; this.job = null;
    this.attempts = []; this.rejections = [];
    this.busy = false; this.error = ''; this.notice = ''; this.branching = false;
  }
  importSource(source) {
    if (!this.localMediaEnabled) throw new StudioError('公開版は動画の取り込み・短縮・接続に対応していません。文章から3〜10秒の動画を生成してください。');
    if (this.busy || this.hasWork) throw new StudioError('現在の作品を保存し、「新しく始める」から取り込んでください。');
    if (!(source.originalBlob instanceof Blob) || !(source.tailBlob instanceof Blob) || !Number.isFinite(source.tailSeconds) || source.tailSeconds <= 0 || source.tailSeconds > 10 || !Number.isFinite(source.prefixSeconds) || source.prefixSeconds < 0 || !Number.isFinite(source.sourceSeconds) || Math.abs(source.sourceSeconds - source.prefixSeconds - source.tailSeconds) > 0.3)
      throw new StudioError('取り込む動画の長さを確認できませんでした。Googleへは送信していません。');
    const saved = Object.freeze({ ...source, settings: Object.freeze(videoSettings(source.settings)) });
    const version = { id: 'local-original', interactionId: null, kind: 'uploaded-original', source: saved, width: saved.sourceWidth ?? saved.width ?? null, height: saved.sourceHeight ?? saved.height ?? null, settings: saved.settings, seconds: saved.tailSeconds, wholeSeconds: saved.sourceSeconds, actualSeconds: saved.tailSeconds, modelSeconds: saved.tailSeconds, blob: saved.originalBlob, cleanBlob: saved.originalBlob, modelBlob: saved.tailBlob, narration: null, viewed: false, prompt: '取り込んだ元動画', parentId: null };
    this.versions.push(version); this.baseId = version.id; this.selectedId = version.id;
    this.error = ''; this.notice = '元動画をローカルに準備しました。Googleへはまだ送信していません。続きを入力できます。再生は任意です。'; this.notify();
  }
  get rejected() { return this.rejections.at(-1); }
  get base() { return this.versions.find(v => v.id === this.baseId) || null; }
  get selected() { return this.versions.find(v => v.id === this.selectedId) || null; }
  get hasWork() { return !!this.job || this.versions.length > 0 || this.rejections.length > 0 || this.attempts.length > 0; }
  get lineage() {
    const items = []; let node = this.base;
    while (node) { items.unshift(node); node = this.versions.find(v => v.id === node.parentId); }
    return items;
  }
  // Export an explicit allowlist. Never serialize jobs, responses, IDs, prompts or Blobs.
  diagnostics() {
    return { schemaVersion: 3, appVersion: APP_VERSION, durationPolicy: 'model-playback<=40s; expected+-0.1s; desired3..10; api3..10', attempts: this.attempts.map((a, index) => {
      const d = a.diagnostic;
      return {
        attempt: index + 1, expectedSeconds: number(a.seconds), parentSeconds: number(a.parentSeconds), desiredSeconds: number(a.desiredSeconds), apiDurationSeconds: number(a.apiDurationSeconds), apiExpectedSeconds: number(a.apiExpectedSeconds), keptSeconds: number(a.keptSeconds), rebased: a.rebased === true, trimmed: a.trimmed === true,
        outcome: oneOf(a.outcome, ['pending','review','accepted','failed','abandoned']),
        requests: { post: number(d.post || 0), get: number(d.get || 0) },
        apiErrors: (Array.isArray(d.apiErrors) ? d.apiErrors : []).slice(-20).map(sanitizeApiError),
        requestSettings: { model: 'gemini-omni-1.1-flash', aspectRatio: oneOf(a.settings?.aspectRatio, ['16:9','9:16']), resolution: oneOf(a.settings?.resolution, ['360p','720p','1080p','4k']), duration: Number.isInteger(a.apiDurationSeconds) && a.apiDurationSeconds >= 3 && a.apiDurationSeconds <= 10 ? `${a.apiDurationSeconds}s` : null, delivery: 'uri', store: true, route: a.uploadSource ? 'uploaded_extension' : a.previousInteractionId ? 'native_extension' : 'initial' },
        httpStatuses: (d.httpStatuses || []).filter(n => Number.isInteger(n) && n >= 100 && n <= 599).slice(-100),
        statuses: (d.statuses || []).slice(-100).map(s => oneOf(s, ['queued','in_progress','completed','failed','cancelled','incomplete','requires_action'])),
        fileStates: (d.fileStates || []).slice(-100).map(s => oneOf(s, ['PROCESSING','ACTIVE','FAILED'])),
        identity: Object.fromEntries(['interaction','parent','input'].map(k => [k, oneOf(d.identity?.[k], ['matched','mismatched','missing','not_required'])])),
        selection: d.selection ? { count: number(d.selection.count), step: number(d.selection.step), content: number(d.selection.content), hasData: d.selection.hasData === true, hasUri: d.selection.hasUri === true } : null,
        receivedBytes: number(d.receivedBytes),
        measurements: (d.measurements || []).map(m => ({ actualSeconds: number(m.actualSeconds), expectedSeconds: number(m.expectedSeconds ?? a.apiExpectedSeconds ?? a.seconds), width: number(m.width), height: number(m.height), expectedAspectRatio: oneOf(a.settings?.aspectRatio, ['16:9','9:16']), phase: oneOf(m.phase, ['prepared','raw','retained','assembled']), result: oneOf(m.result, ['accepted','unreadable','too_short','too_long','over_limit','aspect']) })),
      };
    }) };
  }
  notify() { this.onChange(this); }
  select(id) { this.selectedId = id; this.notify(); }
  viewed(id) { const v = this.versions.find(v => v.id === id); if (v) v.viewed = true; this.notify(); }
  fork(id) {
    if (this.busy || this.job) throw new StudioError('処理中は分岐を変更できません。');
    const v = this.versions.find(v => v.id === id);
    if (!v || !canExtend(v, { localMediaEnabled: this.localMediaEnabled })) throw new StudioError('この版からは延長できません。');
    this.baseId = id; this.branching = true; this.error = '';
    this.notice = `${secondsLabel(v.seconds)}秒版を延長の元に切り替えました。追加する長さを選び、別の続きを入力してください。`; this.notify();
  }
  async generate(prompt, settings = DEFAULT_VIDEO_SETTINGS, addedSeconds = 10) {
    if (this.busy || this.job) return false;
    const text = prompt.trim();
    if (!text || text.length > 4000) throw new StudioError('内容を1〜4,000文字で入力してください。');
    const parent = this.base;
    if (parent) videoSettings(parent.settings || LEGACY_VIDEO_SETTINGS);
    if (parent && !canExtend(parent)) throw new StudioError('この展開の上限は40秒です。追加は3秒以上のため、これ以上延長できません。');
    if (parent && this.versions.some(v => v.parentId === parent.id) && !this.branching)
      throw new StudioError('既存版からの別展開は、分岐ボタンで明示的に選んでください。');
    if (!Number.isInteger(addedSeconds) || addedSeconds < 3 || addedSeconds > 10)
      throw new StudioError('動画の長さは整数3〜10秒から選んでください。');
    const seconds = Number(((parent?.seconds || 0) + addedSeconds).toFixed(6));
    if (seconds > MAX_SECONDS + 0.000001) throw new StudioError('追加後のモデル部分が40秒を超えます。追加する長さを短くしてください。');
    const frozenSettings = Object.freeze(videoSettings(parent ? parent.settings || LEGACY_VIDEO_SETTINGS : settings));
    const apiDurationSeconds = addedSeconds;
    const contextSeconds = parent ? parent.modelSeconds ?? parent.actualSeconds ?? parent.seconds : 0;
    const parentNarrated = Boolean(parent?.narration || (parent?.cleanBlob && parent.cleanBlob !== parent.blob));
    const rebased = !!parent && (!!parent.requiresUpload || (!!parent.interactionId && parentNarrated) || contextSeconds + apiDurationSeconds > MAX_SECONDS);
    if (!this.localMediaEnabled && parent && (parent.source || parent.requiresUpload || !parent.interactionId))
      throw new StudioError('この版の延長には動画の取り込み・接続が必要です。公開版では利用できません。動画を保存して、文章から新しく始めてください。');
    if (!this.localMediaEnabled && (!Number.isFinite(contextSeconds) || rebased))
      throw new StudioError('公開版では、実際のAI動画の長さと追加する秒数の合計が40秒を超える延長はできません。3秒以上で追加できる長さを選ぶか、動画を保存してください。');
    this.busy = true; this.error = ''; this.notice = '';
    const initialAssemblySource = parent?.source ? (parentNarrated && !parent.interactionId ? { ...parent.source, originalBlob: parent.blob } : parent.source) : null;
    const job = { source: parent?.source || null, assemblySource: initialAssemblySource,
      uploadSource: parent?.source && !parent.interactionId ? parent.modelBlob : null,
      previousInteractionId: rebased ? null : parent?.interactionId || null, requestReady: false,
      desiredSeconds: addedSeconds, addedSeconds, apiDurationSeconds, apiExpectedSeconds: contextSeconds + apiDurationSeconds,
      keptSeconds: contextSeconds + addedSeconds, rebased, trimmed: false,
      settings: frozenSettings, prompt: text, inputText: '', parentId: parent?.id || null,
      parentSeconds: parent?.seconds || 0, seconds, interactionId: null, response: null, result: null,
      stage: rebased ? '現在版の末尾を、このMac内で準備しています' : '送信しています', outcome: 'pending', diagnostic: { measurements: [] } };
    job.report = stage => { job.stage = stage; this.notify(); };
    this.job = job; this.attempts.push(job); this.notify();
    try {
      // No external request has been made; a failed browser capability check is safe to retry manually.
      let assertPrepared = () => {};
      try { const check = await this.preflight({ requiresMedia: job.rebased || !!job.source, settings: frozenSettings, currentBlob: parent?.blob || null, expectedWholeSeconds: parent ? (parent.wholeSeconds ?? parent.seconds) + addedSeconds : addedSeconds }); if (typeof check === 'function') assertPrepared = check; }
      catch (error) { throw new StudioError(error instanceof StudioError ? error.message : '動画処理の準備に失敗しました。Googleへは送信していません。', { terminal: true }); }
      let requestParent = parent ? { ...parent, seconds: contextSeconds } : null;
      if (rebased) {
        const tailSource = parent.cleanBlob || parent.blob;
        const prepared = await this.prepare(tailSource);
        if (prepared?.originalBlob !== tailSource || !(prepared?.originalBlob instanceof Blob) || !(prepared.tailBlob instanceof Blob) || !Number.isFinite(prepared.tailSeconds) || prepared.tailSeconds <= 0 || prepared.tailSeconds > 10 || !Number.isFinite(prepared.prefixSeconds) || prepared.prefixSeconds < 0 || !Number.isFinite(prepared.sourceSeconds) || Math.abs(prepared.sourceSeconds - (parent.wholeSeconds ?? parent.seconds)) > 0.3 || Math.abs(prepared.sourceSeconds - prepared.prefixSeconds - prepared.tailSeconds) > 0.3)
          throw new StudioError('現在版の末尾を確認できませんでした。Googleへは送信していません。', { uncertain: true });
        job.assemblySource = parent.cleanBlob && parent.cleanBlob !== parent.blob ? { ...prepared, originalBlob: parent.blob } : prepared;
        job.uploadSource = prepared.tailBlob;
        job.apiExpectedSeconds = prepared.tailSeconds + apiDurationSeconds;
        job.keptSeconds = prepared.tailSeconds + addedSeconds;
        requestParent = { uploaded: true, seconds: prepared.tailSeconds, settings: frozenSettings, interactionId: null };
      }
      if (job.uploadSource) {
        const tailExpected = job.apiExpectedSeconds - apiDurationSeconds;
        const tail = await this.validate(job.uploadSource, tailExpected, { aspectRatio: frozenSettings.aspectRatio });
        if (!(typeof tail === 'boolean' ? tail : tail.valid)) {
          job.diagnostic.measurements.push({ actualSeconds: tail?.actualSeconds, expectedSeconds: tailExpected, phase: 'prepared', width: tail?.width, height: tail?.height, result: tail?.aspectValid === false ? 'aspect' : 'unreadable' });
          throw new StudioError('送信前の末尾動画の長さ・画角を確認できませんでした。Googleへは送信していません。元動画を保ったまま処理を止めています。', { uncertain: true });
        }
      }
      assertPrepared();
      const body = requestBody(text, requestParent, frozenSettings, apiDurationSeconds);
      job.inputText = body.input[0].text; job.requestReady = true;
      job.response = await this.gateway.create(body, job.diagnostic, job);
      job.interactionId = job.response.id || null;
      await this.finish();
    } catch (e) { this.handleError(e); }
    finally { this.busy = false; this.notify(); }
    return true;
  }
  async finish({ local = false } = {}) {
    const job = this.job;
    let result = local ? job.result : await this.gateway.resolve(job, stage => { job.stage = stage; this.notify(); });
    if (!result || !result.interactionId || result.interactionId !== job.interactionId)
      throw new StudioError('生成結果と確認中の処理が一致しません。同じ結果を再取得してください。', { uncertain: true });
    if (this.versions.some(v => v.id === result.interactionId))
      throw new StudioError('この生成IDはすでに保存された版です。結果確認中の処理のIDを指定してください。', { uncertain: true });
    if (this.baseId !== job.parentId)
      throw new StudioError('延長元が処理開始時と一致しません。新規生成せず結果を確認してください。', { uncertain: true });
    let inspection;
    for (const item of this.rejections) {
      if (item.interactionId === result.interactionId && await sameVideo(item.blob, result.blob)) {
        inspection = item; result = { ...result, blob: item.blob }; break;
      }
    }
    job.result = result; job.response = null;
    const expectedRaw = job.apiExpectedSeconds;
    const measured = await this.validate(result.blob, expectedRaw, { aspectRatio: job.settings.aspectRatio });
    const checked = typeof measured === 'boolean' ? measured : measured.valid;
    const rawActualSeconds = typeof measured === 'object' && Number.isFinite(measured.actualSeconds) ? measured.actualSeconds : null;
    const reason = checked ? 'accepted' : measured?.aspectValid === false && measured?.durationValid !== false ? 'aspect' : rawActualSeconds === null ? 'unreadable' : rawActualSeconds > MAX_SECONDS ? 'over_limit' : rawActualSeconds < expectedRaw ? 'too_short' : 'too_long';
    job.diagnostic.measurements.push({ actualSeconds: rawActualSeconds, expectedSeconds: expectedRaw, phase: 'raw', width: measured?.width, height: measured?.height, result: reason });
    job.diagnostic.receivedBytes = result.blob.size;
    const retain = () => {
      if (inspection) { inspection.actualSeconds = rawActualSeconds; inspection.width = measured?.width ?? null; inspection.height = measured?.height ?? null; inspection.reason = reason; }
      else { inspection = { ...result, attempt: this.attempts.indexOf(job) + 1, seconds: expectedRaw, expectedSeconds: expectedRaw, actualSeconds: rawActualSeconds, width: measured?.width ?? null, height: measured?.height ?? null, expectedAspectRatio: job.settings.aspectRatio, reason, accepted: false }; this.rejections.push(inspection); }
    };
    if (!checked) {
      retain(); job.outcome = 'review'; job.reviewReason = reason;
      if (reason === 'aspect') throw new StudioError(`生成結果の画角を確認してください（希望${job.settings.aspectRatio}／返却${measured?.width || '?'}×${measured?.height || '?'}）。希望と異なる比率、または寸法を確認できないため、完成版や延長には使いません。動画は確認・保存でき、自動再生成や横長への代替はしません。`, { uncertain: true });
      const comparison = `予定${secondsLabel(expectedRaw)}秒／${rawActualSeconds === null ? '実尺を読み取れません' : `実尺${rawActualSeconds.toFixed(2)}秒`}`;
      const detail = reason === 'unreadable' ? '再生時間を計測できませんでした。保存済み動画の再計測、または同じ結果の再取得を試せます。' : reason === 'over_limit' ? '音声を含むモデル動画の総再生時間が40秒を超えています。上限超過のため完成版に加えません。' : '予定と異なる長さのため、延長には使わず確認用に保持しました。';
      throw new StudioError(`生成結果の長さを確認してください（${comparison}）。${detail} 自動で再生成しません。`, { uncertain: true });
    }
    const modelBlob = result.blob, actualSeconds = rawActualSeconds;
    let fullBlob = modelBlob, wholeSeconds = actualSeconds ?? job.keptSeconds, width = measured?.width ?? null, height = measured?.height ?? null;
    if (job.assemblySource) {
      job.stage = '元動画の前半と生成結果を、このMac内で接続しています'; this.notify();
      try {
        const expectedWhole = job.assemblySource.prefixSeconds + (actualSeconds ?? job.keptSeconds);
        const assembled = await this.compose(job.assemblySource, modelBlob, expectedWhole);
        if (!(assembled?.blob instanceof Blob) || !Number.isFinite(assembled.actualSeconds) || Math.abs(assembled.actualSeconds - expectedWhole) > 0.1 || (!job.source && assembled.actualSeconds > MAX_SECONDS)) throw new Error('assembly duration');
        const full = await this.validate(assembled.blob, expectedWhole, { aspectRatio: job.settings.aspectRatio, maxSeconds: job.source ? 1240 : MAX_SECONDS, tolerance: 0.1 });
        if (!(typeof full === 'boolean' ? full : full.valid)) { job.diagnostic.measurements.push({ actualSeconds: full?.actualSeconds, expectedSeconds: expectedWhole, phase: 'assembled', width: full?.width, height: full?.height, result: full?.aspectValid === false ? 'aspect' : 'unreadable' }); throw new Error('assembly dimensions'); }
        fullBlob = assembled.blob; wholeSeconds = full?.actualSeconds ?? assembled.actualSeconds;
        width = full?.width ?? width; height = full?.height ?? height;
        job.diagnostic.measurements.push({ actualSeconds: wholeSeconds, expectedSeconds: expectedWhole, phase: 'assembled', width, height, result: 'accepted' });
      } catch {
        retain(); job.outcome = 'review'; job.reviewReason = 'assembly';
        throw new StudioError('元動画への接続を完了できませんでした。元動画と受信済みのモデル動画を保持しています。「保存済み動画を再計測・仕上げ」で接続だけを再試行できます。有料生成は再送しません。', { uncertain: true });
      }
    }
    if (inspection) { inspection.actualSeconds = rawActualSeconds; inspection.width = measured?.width ?? null; inspection.height = measured?.height ?? null; inspection.reason = 'accepted'; inspection.accepted = true; }
    const version = { source: job.source, width, height, rawWidth: measured?.width ?? null, rawHeight: measured?.height ?? null, rawBlob: result.blob, rawActualSeconds, modelBlob, modelSeconds: actualSeconds ?? job.keptSeconds, requiresUpload: job.rebased, desiredSeconds: job.desiredSeconds, apiDurationSeconds: job.apiDurationSeconds, wholeSeconds, settings: job.settings, id: result.interactionId, interactionId: result.interactionId, parentId: job.parentId, seconds: job.seconds, prompt: job.prompt, blob: fullBlob, cleanBlob: fullBlob, narration: null, actualSeconds, viewed: false, createdAt: new Date().toISOString() };
    this.versions.push(version); this.baseId = version.id; this.selectedId = version.id;
    job.outcome = 'accepted'; job.response = null; this.job = null; this.branching = false;
    this.notice = version.source ? `全体${secondsLabel(wholeSeconds)}秒の動画が完成しました（AI部分${secondsLabel(version.seconds)}秒）。` : `${version.seconds}秒版が完成しました。再生して続きを考えましょう。`;
  }
  async applyNarration(versionId, wavBlob, { startSeconds = 0, videoVolume = 0.6, narrationVolume = 1, layer = false, label = '' } = {}) {
    if (!this.localMediaEnabled) throw new StudioError('この環境では動画へのナレーション合成を利用できません。');
    if (this.busy || this.job) throw new StudioError('別の処理が進行中です。完了してからナレーションを合成してください。');
    const version = this.versions.find(v => v.id === (versionId || this.selectedId || this.baseId));
    if (!version) throw new StudioError('ナレーションを重ねる動画を先に生成または選択してください。');
    if (!(wavBlob instanceof Blob) || wavBlob.size <= 0) throw new StudioError('合成するナレーション音声を先に生成してください。');
    const duration = version.wholeSeconds ?? version.actualSeconds ?? version.seconds;
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds >= duration) throw new StudioError(`開始秒数は0秒以上、動画の長さ（${secondsLabel(duration)}秒）未満で指定してください。`);
    if (!Number.isFinite(videoVolume) || videoVolume < 0 || videoVolume > 2 || !Number.isFinite(narrationVolume) || narrationVolume <= 0 || narrationVolume > 2) throw new StudioError('音量は0%〜200%の範囲で指定してください。');
    const frozenSettings = videoSettings(version.settings || LEGACY_VIDEO_SETTINGS);
    const targetBlob = layer && version.narration ? version.blob : (version.cleanBlob || version.blob);
    this.busy = true; this.error = ''; this.notice = ''; this.notify();
    try {
      let assertPrepared = () => {};
      try { const check = await this.preflight({ requiresMedia: true, forNarration: true, settings: frozenSettings, currentBlob: targetBlob, expectedWholeSeconds: duration }); if (typeof check === 'function') assertPrepared = check; }
      catch (error) { throw new StudioError(error instanceof StudioError ? error.message : 'ナレーション合成の準備に失敗しました。元の動画は保持しています。', { terminal: true }); }
      assertPrepared();
      const mixed = await this.mix(targetBlob, wavBlob, { startSeconds, videoVolume, narrationVolume, aspectRatio: frozenSettings.aspectRatio, expectedSeconds: duration });
      if (!(mixed?.blob instanceof Blob)) throw new StudioError('ナレーション音声の合成を完了できませんでした。元の動画は保持しています。');
      const checked = await this.validate(mixed.blob, duration, { aspectRatio: frozenSettings.aspectRatio, maxSeconds: version.source ? 1240 : MAX_SECONDS, tolerance: 0.1 });
      if (!(typeof checked === 'boolean' ? checked : checked.valid)) throw new StudioError('合成後の動画の長さ・画角を確認できませんでした。元の動画は保持しています。');
      if (!version.cleanBlob) version.cleanBlob = version.blob;
      const prevCount = layer && version.narration ? (version.narration.count || 1) : 0;
      version.blob = mixed.blob;
      version.narration = { wavBlob, startSeconds: Number(startSeconds.toFixed(2)), videoVolume: Number(videoVolume.toFixed(2)), narrationVolume: Number(narrationVolume.toFixed(2)), layer: !!(layer && version.narration), count: prevCount + 1, label: String(label || 'ナレーション'), updatedAt: new Date().toISOString() };
      this.notice = `${secondsLabel(version.wholeSeconds ?? version.seconds)}秒の動画にナレーションを重ねました（開始 ${secondsLabel(startSeconds)}秒 · 元音声 ${Math.round(videoVolume * 100)}% · ナレーション ${Math.round(narrationVolume * 100)}%）。`;
      return version;
    } catch (e) {
      this.error = e instanceof StudioError ? e.message : 'ナレーション音声の合成を完了できませんでした。元の動画は保持しています。';
      throw e;
    } finally {
      this.busy = false; this.notify();
    }
  }
  restoreAudio(versionId) {
    if (this.busy || this.job) throw new StudioError('処理中は音声を戻せません。');
    const version = this.versions.find(v => v.id === (versionId || this.selectedId || this.baseId));
    if (!version || !version.cleanBlob || version.blob === version.cleanBlob) return false;
    version.blob = version.cleanBlob;
    version.narration = null;
    this.error = '';
    this.notice = '動画を元の音声に戻しました。';
    this.notify();
    return true;
  }
  handleError(e) {
    this.error = e instanceof StudioError ? e.message : '結果を確認できませんでした。生成を再送せず、同じ結果の確認を再開してください。';
    if (e.terminal && this.job) { this.job.outcome = 'failed'; this.job.response = null; this.job = null; }
    if (this.job) this.job.stage = this.job.outcome === 'review' ? '動画の長さ・画角を確認してください' : '結果確認を中断しました';
  }
  async recheck() {
    if (this.busy || !this.job?.result) return false;
    this.busy = true; this.error = ''; this.notify();
    try { await this.finish({ local: true }); } catch (e) { this.handleError(e); }
    finally { this.busy = false; this.notify(); }
    return true;
  }
  async resume(interactionId) {
    if (this.busy || !this.job) return false;
    if (this.job.requestReady === false) throw new StudioError('ローカル準備で停止したため、生成は送信していません。結果確認を終了してから再度お試しください。');
    if (interactionId) {
      if (!/^[A-Za-z0-9_-]{3,300}$/.test(interactionId)) throw new StudioError('正しい生成IDを入力してください。');
      if (this.versions.some(v => v.id === interactionId)) throw new StudioError('この生成IDはすでに保存された版です。結果確認中の処理のIDを指定してください。');
      if (this.job.interactionId && this.job.interactionId !== interactionId) this.job.result = null;
      this.job.interactionId = interactionId; this.job.manualRecovery = true;
    }
    if (!this.job.interactionId) throw new StudioError('Google AI Studioのログで処理を確認し、生成IDを入力してください。');
    this.job.response = null; // A retry always retrieves the same interaction, never reuses the POST response.
    this.busy = true; this.error = ''; this.notify();
    try { await this.finish(); } catch (e) { this.handleError(e); }
    finally { this.busy = false; this.notify(); }
    return true;
  }
  abandon() {
    if (this.busy) return;
    if (this.job) { this.job.outcome = 'abandoned'; this.job.response = null; }
    this.job = null; this.error = ''; this.notice = '結果確認を終了しました。確認用の動画は残ります。新規生成は別のリクエストで、実生成では追加料金が発生します。Google側の取り消し・返金を意味しません。'; this.notify();
  }
}
