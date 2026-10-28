import { StudioError, videoSelection } from './core.js';
import { readApiError, sanitizeApiError, apiErrorMessage } from './api-errors.js';

const ORIGIN = 'https://generativelanguage.googleapis.com';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uncertain = message => new StudioError(message, { uncertain: true });
const isUploadedJob = job => !!(job.uploadSource || job.sourceFileUri || (job.source && Object.hasOwn(job, 'previousInteractionId') && job.previousInteractionId === null));
function textContent(content) {
  if (!Array.isArray(content) || content.some(c => c?.type !== 'text' || typeof c.text !== 'string')) return null;
  return content.map(c => c.text).join('');
}
function latestUserText(steps) {
  if (!Array.isArray(steps)) return undefined;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]?.type === 'user_input') return textContent(steps[i].content);
  return undefined;
}
function inputText(input) {
  if (typeof input === 'string') return input;
  if (input?.type === 'text' && typeof input.text === 'string') return input.text;
  if (Array.isArray(input)) return input.some(c => c?.type === 'user_input') ? latestUserText(input) : textContent(input);
  return null;
}
function verifyInput(interaction, job, identity) {
  if (isUploadedJob(job)) {
    if (!job.sourceFileUri) {
      identity.input = 'missing';
      throw uncertain('アップロードした動画の識別情報がないため、この生成結果を照合できません。新規生成せず、先の処理を確認してください。');
    }
    return verifyUploadedInput(interaction, job, identity);
  }
  const top = interaction.input === undefined ? undefined : inputText(interaction.input);
  const step = latestUserText(interaction.steps);
  if (top === undefined && step === undefined) { identity.input = 'missing'; return false; }
  if ([top, step].some(value => value !== undefined && value !== job.inputText)) {
    identity.input = 'mismatched';
    throw uncertain('応答のプロンプトが確認中の処理と一致しません。新規生成せず、該当する処理を確認してください。');
  }
  identity.input = 'matched'; return true;
}
function latestUserContent(steps) {
  if (!Array.isArray(steps)) return undefined;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]?.type === 'user_input') return steps[i].content;
  return undefined;
}
function uploadedInput(input) {
  if (typeof input === 'string') return [{ type: 'text', text: input }];
  if (Array.isArray(input)) return input.some(c => c?.type === 'user_input') ? latestUserContent(input) : input;
  if (input?.type === 'text' || input?.type === 'video') return [input];
  return null;
}
function verifyUploadedInput(interaction, job, identity) {
  const representations = [interaction.input === undefined ? undefined : uploadedInput(interaction.input), latestUserContent(interaction.steps)];
  let missing = false, seen = false;
  for (const content of representations) {
    if (content === undefined) continue;
    seen = true;
    const valid = Array.isArray(content) && content.every(c => c && (c.type === 'text' && typeof c.text === 'string' || c.type === 'video'));
    const texts = valid ? content.filter(c => c.type === 'text') : [];
    const videos = valid ? content.filter(c => c.type === 'video') : [];
    if (!valid || videos.length > 1 || (texts.length && texts.map(c => c.text).join('') !== job.inputText) || videos.some(c => c.uri !== undefined && c.uri !== job.sourceFileUri || c.mime_type !== undefined && c.mime_type !== 'video/mp4')) {
      identity.input = 'mismatched';
      throw uncertain('応答の動画素材またはプロンプトが確認中の処理と一致しません。新規生成せず、該当する処理を確認してください。');
    }
    if (!texts.length || videos.length !== 1 || videos[0].uri !== job.sourceFileUri || videos[0].data) missing = true;
  }
  identity.input = !seen || missing ? 'missing' : 'matched';
  return identity.input === 'matched';
}

export function safeUploadUrl(uri) {
  let url;
  try { url = new URL(uri); } catch { throw uncertain('Googleのアップロード先を確認できません。生成は送信していません。'); }
  const entries = [...url.searchParams];
  if (url.origin !== ORIGIN || url.username || url.password || url.hash || url.pathname !== '/upload/v1beta/files' || !url.searchParams.get('upload_id') || entries.some(([k, v]) => !['upload_id', 'upload_protocol'].includes(k) || (k === 'upload_protocol' && v !== 'resumable')) || new Set(entries.map(([k]) => k)).size !== entries.length)
    throw uncertain('Googleのアップロード先を確認できません。生成は送信していません。');
  return url;
}
function uploadedFile(file, expectedName) {
  if (!file || !/^files\/[A-Za-z0-9_-]+$/.test(file.name || '') || file.uri !== `${ORIGIN}/v1beta/${file.name}` || expectedName && file.name !== expectedName || file.mimeType !== undefined && file.mimeType !== 'video/mp4')
    throw uncertain('アップロードした動画の識別情報を確認できません。生成は送信していません。');
  return file;
}
export class GoogleGateway {
  constructor(getKey, { fetcher = (...args) => fetch(...args), wait = sleep, polls = 180 } = {}) {
    this.getKey = getKey; this.fetcher = fetcher; this.wait = wait; this.polls = polls;
  }
  async request(path, options = {}, diagnostic = null, timeoutMs = 60000) {
    const key = this.getKey();
    if (!key || !key.trim()) throw new StudioError('Gemini の API キーを入力してください', { uncertain: true });
    if (diagnostic) { const method = options.method === 'POST' ? 'post' : 'get'; diagnostic[method] = (diagnostic[method] || 0) + 1; }
    let response;
    try {
      response = await this.fetcher(ORIGIN + path, {
        ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers, 'x-goog-api-key': key },
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw uncertain('通信が途切れ、結果を確認できませんでした。Google側では生成が続いている可能性があります。生成を再送せず、同じ結果を再取得してください。');
    }
    if (diagnostic) (diagnostic.httpStatuses ||= []).push(response.status);
    if (!response.ok) {
      const safe = await readApiError(response);
      if (diagnostic) {
        const previous = Array.isArray(diagnostic.apiErrors) ? diagnostic.apiErrors : [];
        diagnostic.apiErrors = [...previous.slice(-19).map(sanitizeApiError), safe];
      }
      // Only HTTP status and the original route/method determine recovery policy.
      const terminal = path === '/v1beta/interactions' && options.method === 'POST' && [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status);
      throw new StudioError(apiErrorMessage(safe), { terminal, uncertain: !terminal });
    }
    return response;
  }
  async json(path, options, diagnostic, timeoutMs) {
    const res = await this.request(path, options, diagnostic, timeoutMs);
    try { return await res.json(); }
    catch { throw uncertain('応答を読み取れませんでした。生成を再送せず結果を確認してください。'); }
  }
  async create(body, diagnostic, job) {
    let finalBody = body;
    if (job?.uploadSource) {
      if (!(job.uploadSource instanceof Blob) || !job.uploadSource.size || job.uploadSource.type !== 'video/mp4') throw uncertain('送信する末尾動画を確認できません。生成は送信していません。');
      if (job.uploadStarted) throw uncertain('アップロードを自動再送しません。先の処理を確認してください。');
      job.uploadStarted = true;
      const report = stage => { job.stage = stage; job.report?.(stage); };
      report('末尾動画をGoogleへ送信する準備をしています');
      const start = await this.request('/upload/v1beta/files', {
        method: 'POST', headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(job.uploadSource.size), 'X-Goog-Upload-Header-Content-Type': 'video/mp4' },
        body: JSON.stringify({ file: { display_name: 'omni-tail.mp4' } }),
      });
      const url = safeUploadUrl(start.headers.get('x-goog-upload-url'));
      report('末尾動画をGoogleへ送信しています');
      const uploaded = await this.json(url.pathname + url.search, {
        method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: job.uploadSource,
      }, null, 600000);
      let file = uploadedFile(uploaded?.file);
      job.sourceFileName = file.name; job.sourceFileUri = file.uri;
      for (let i = 0; file.state !== 'ACTIVE'; i++) {
        if (file.state !== 'PROCESSING' || i >= this.polls) throw uncertain('Googleで末尾動画の準備を確認できません。生成は送信していません。');
        report('Googleで末尾動画を処理しています');
        await this.wait(5000);
        file = uploadedFile(await this.json(`/v1beta/${job.sourceFileName}`), job.sourceFileName);
      }
      finalBody = { ...body, input: [{ type: 'video', uri: job.sourceFileUri, mime_type: 'video/mp4' }, ...body.input] };
      report('動画の延長を送信しています');
    }
    return this.json('/v1beta/interactions', { method: 'POST', body: JSON.stringify(finalBody) }, diagnostic, body.response_format?.resolution === '4k' ? 900000 : 600000);
  }
  async resolve(job, report) {
    const diagnostic = job.diagnostic || {};
    const identity = diagnostic.identity ||= {};
    // Never downgrade an interrupted upload into text-only identity checking.
    // An arbitrary recovered response cannot establish the missing source URI.
    if (isUploadedJob(job) && !job.sourceFileUri) {
      identity.input = 'missing';
      throw uncertain('アップロードした動画の識別情報がないため、この生成結果を照合できません。新規生成せず、先の処理を確認してください。');
    }
    let interaction = job.response;
    let retrieved = false;
    const get = async () => {
      if (!job.interactionId) throw uncertain('生成IDを受け取れませんでした。Google AI Studioのログを確認してください。');
      retrieved = true;
      return this.json(`/v1beta/interactions/${encodeURIComponent(job.interactionId)}?include_input=true`, undefined, diagnostic);
    };
    for (let i = 0; i < this.polls; i++) {
      if (!interaction) interaction = await get();
      if (!interaction || typeof interaction !== 'object') throw uncertain('応答の処理情報を確認できません。同じ結果を再取得してください。');
      if (!interaction.id || (job.interactionId && job.interactionId !== interaction.id)) {
        identity.interaction = interaction.id ? 'mismatched' : 'missing';
        throw uncertain('応答の生成IDが確認中の処理と一致しません。Google AI Studioで確認してください。');
      }
      identity.interaction = 'matched'; job.interactionId = interaction.id;
      const status = interaction.status;
      (diagnostic.statuses ||= []).push(['queued','in_progress','completed','failed','cancelled','incomplete','requires_action'].includes(status) ? status : 'unknown');
      const terminalStatus = ['completed','failed','cancelled','incomplete'].includes(status);
      if (terminalStatus) {
        const expectedParent = (Object.hasOwn(job, 'previousInteractionId') ? job.previousInteractionId : job.parentId) || null;
        const hasParent = Object.hasOwn(interaction, 'previous_interaction_id') && interaction.previous_interaction_id !== undefined;
        if (!hasParent && expectedParent) {
          identity.parent = 'missing';
          if (!retrieved) { interaction = await get(); i--; continue; }
          throw uncertain('応答の延長元を確認できません。完成版には加えず、同じ結果の確認を続けてください。');
        }
        if ((interaction.previous_interaction_id || null) !== expectedParent) {
          identity.parent = 'mismatched';
          throw uncertain('応答の延長元が確認中の処理と一致しません。新規生成せず、Google AI Studioで確認してください。');
        }
        identity.parent = 'matched';
        if (job.manualRecovery || job.inputText || job.sourceFileUri) {
          const matched = verifyInput(interaction, job, identity);
          if (!matched && job.sourceFileUri && !retrieved) { interaction = await get(); i--; continue; }
          if (!matched && (job.manualRecovery || job.sourceFileUri)) throw uncertain('照合に必要な入力が応答にありません。該当する生成IDを確認してください。');
        } else identity.input = 'not_required';
      }
      if (['failed','cancelled','incomplete'].includes(status))
        throw new StudioError('Google側で生成が完了しませんでした。以前の動画はそのまま残っています。必要なら内容を変更して、改めて生成してください。', { terminal: true });
      if (status === 'completed') break;
      if (!['in_progress','queued'].includes(status)) throw uncertain('対応していない処理状態です。Google AI Studioで結果を確認してください。');
      report('Googleで生成中です'); await this.wait(5000); interaction = null;
    }
    if (interaction?.status !== 'completed') throw uncertain('生成の待機時間を超えました。再生成せず、同じ結果を再取得できます。');
    const selection = videoSelection(interaction);
    diagnostic.selection = selection.summary;
    const output = selection.output;
    if (!output || (!output.data && !output.uri)) throw uncertain('処理は終了しましたが、最新の動画データを確認できません。同じ結果を再取得してください。');
    report('動画の完成を確認しています');
    let blob;
    if (output.data) {
      try {
        const decoded = atob(output.data);
        blob = new Blob([Uint8Array.from(decoded, c => c.charCodeAt(0))], { type: 'video/mp4' });
      } catch { throw uncertain('動画データを読み取れませんでした。同じ結果を再取得してください。'); }
    } else {
      const url = safeVideoUrl(output.uri);
      const id = url.pathname.match(/^\/v1beta\/files\/([A-Za-z0-9_-]+)(?::download)?$/)[1];
      let active = false;
      for (let i = 0; i < this.polls; i++) {
        const file = await this.json(`/v1beta/files/${id}`, undefined, diagnostic);
        (diagnostic.fileStates ||= []).push(['PROCESSING','ACTIVE','FAILED'].includes(file.state) ? file.state : 'unknown');
        if (file.state === 'ACTIVE') { active = true; break; }
        if (file.state === 'FAILED') throw new StudioError('Google側で動画ファイルの処理に失敗しました。自動で再生成しません。', { terminal: true });
        if (file.state !== 'PROCESSING') throw uncertain('動画ファイルの状態を確認できません。同じ結果を再取得してください。');
        report('動画ファイルを処理しています'); await this.wait(5000);
      }
      if (!active) throw uncertain('ファイル処理の待機時間を超えました。同じ結果の取得だけ再開できます。');
      const res = await this.request(`/v1beta/files/${id}:download?alt=media`, {}, diagnostic);
      try { blob = await res.blob(); } catch { throw uncertain('動画の受信が中断されました。同じ結果を再取得してください。'); }
    }
    if (!blob.size) throw uncertain('動画が空です。同じ結果を再取得してください。');
    diagnostic.receivedBytes = blob.size;
    return { blob, interactionId: job.interactionId };
  }
}

export function safeVideoUrl(uri) {
  let url;
  try { url = new URL(uri); } catch { throw new StudioError('動画の取得先が不正です。同じ結果を再取得して確認してください。', { uncertain: true }); }
  if (url.origin !== ORIGIN || url.username || url.password || url.hash || !/^\/v1beta\/files\/[A-Za-z0-9_-]+(?::download)?$/.test(url.pathname) || [...url.searchParams].some(([k,v]) => k !== 'alt' || v !== 'media'))
    throw new StudioError('動画の取得先がGoogle公式APIの許可されたURLではありません。キーは送信しません。同じ結果の再取得で確認してください。', { uncertain: true });
  return url;
}
