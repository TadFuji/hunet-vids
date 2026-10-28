// Only these constants may leave the error decoder. Provider prose is never retained.
const CODES = new Set(['unknown', 'invalid_request', 'failed_precondition', 'parameter_unknown', 'authentication', 'payment_required', 'permission_denied', 'not_found', 'model_not_found', 'already_exists', 'aborted', 'out_of_range', 'cancelled', 'api_error', 'unimplemented', 'service_unavailable', 'deadline_exceeded', 'rate_limit_exceeded', 'quota_exceeded', 'too_many_requests', 'resource_exhausted']);
const FIELDS = new Set(['model', 'input', 'response_format', 'response_format.duration', 'response_format.aspect_ratio', 'response_format.resolution', 'response_format.delivery', 'response_format.type', 'previous_interaction_id', 'generation_config', 'store', 'background']);
const LEGACY = Object.freeze({ INVALID_ARGUMENT: 'invalid_request', FAILED_PRECONDITION: 'failed_precondition', UNAUTHENTICATED: 'authentication', PERMISSION_DENIED: 'permission_denied', NOT_FOUND: 'not_found', ALREADY_EXISTS: 'already_exists', ABORTED: 'aborted', OUT_OF_RANGE: 'out_of_range', CANCELLED: 'cancelled', INTERNAL: 'api_error', UNIMPLEMENTED: 'unimplemented', UNAVAILABLE: 'service_unavailable', DEADLINE_EXCEEDED: 'deadline_exceeded', RESOURCE_EXHAUSTED: 'resource_exhausted' });
export const API_ERROR_MAX_BYTES = 16 * 1024;
const FIELD_CODES = new Set(['invalid_request', 'parameter_unknown']);
function own(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined; } catch { return undefined; }
}
function httpStatus(value) { return Number.isInteger(value) && value >= 400 && value <= 599 ? value : null; }
export function sanitizeApiError(value) {
  const candidate = own(value, 'code');
  const code = typeof candidate === 'string' && CODES.has(candidate) ? candidate : 'unknown';
  const candidateField = own(value, 'field');
  return { httpStatus: httpStatus(own(value, 'httpStatus')), code, field: FIELD_CODES.has(code) && typeof candidateField === 'string' && FIELDS.has(candidateField) ? candidateField : null };
}
function parameterField(message) {
  if (typeof message !== 'string' || message.length > 2048) return null;
  // Whole-message templates, quoted identifiers and exact path lookup avoid matching
  // identifiers embedded in echoed prompts, URLs, keys, values or extra prose.
  let match = /^(?:Unknown|Unrecognized|Unsupported) (?:field|parameter):? (["'])([a-z_][a-z0-9_.]{0,79})\1(?: (?:in|at) (["'])([a-z_][a-z0-9_.]{0,79})\3)?\.?$/.exec(message);
  if (match) { const path = match[4] ? `${match[4]}.${match[2]}` : match[2]; return FIELDS.has(path) ? path : null; }
  match = /^(?:Invalid JSON payload received\. )?Unknown name "([a-z_][a-z0-9_]{0,79})"(?: at '([a-z_][a-z0-9_.]{0,79})')?: Cannot find field\.$/.exec(message);
  if (match) { const path = match[2] ? `${match[2]}.${match[1]}` : match[1]; return FIELDS.has(path) ? path : null; }
  // A second diagnostic phrase makes an echoed value/context ambiguous.
  const contextCount = (message.match(/(?:Unknown|Unrecognized|Unsupported) (?:field|parameter)|Unknown name |Invalid value at | is not supported for /g) || []).length;
  if (contextCount !== 1) return null;
  match = /^Invalid value at (["'])([a-z_][a-z0-9_.]{0,79})\1(?: \([^\r\n]{1,256}\))?(?:[:,] [^\r\n]{1,1024})?\.?$/.exec(message);
  if (match) return FIELDS.has(match[2]) ? match[2] : null;
  match = /^The value (["'])([^\r\n]{0,1024})\1 is not supported for (["'])([a-z_][a-z0-9_.]{0,79})\3 at (["'])([a-z_][a-z0-9_.]{0,79})\5(?:\. Supported values: [^\r\n]{1,512})?\.?$/.exec(message);
  if (match) { const path = `${match[6]}.${match[4]}`; return FIELDS.has(path) ? path : null; }
  return null;
}
export function decodeApiError(payload, status) {
  const error = own(payload, 'error');
  const rawCode = own(error, 'code');
  let code = typeof rawCode === 'string' && CODES.has(rawCode) ? rawCode : 'unknown';
  // Legacy numeric codes are accepted only alongside an exact documented status.
  if (typeof rawCode === 'number' && rawCode === httpStatus(status)) {
    const legacyStatus = own(error, 'status');
    if (typeof legacyStatus === 'string' && Object.hasOwn(LEGACY, legacyStatus)) code = LEGACY[legacyStatus];
  }
  return sanitizeApiError({ httpStatus: status, code, field: FIELD_CODES.has(code) ? parameterField(own(error, 'message')) : null });
}
function cancel(reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
export async function readApiError(response, { timeoutMs = 1500 } = {}) {
  const fallback = sanitizeApiError({ httpStatus: response?.status });
  let reader; let timer; let complete = false; let stopped = false;
  try {
    reader = response.body?.getReader();
    if (!reader) return fallback;
    const length = response.headers?.get('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > API_ERROR_MAX_BYTES) return fallback;
    const bytes = new Uint8Array(API_ERROR_MAX_BYTES); let used = 0;
    const read = async () => {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (stopped) return null;
        if (done) { complete = true; return bytes.subarray(0, used); }
        if (!(value instanceof Uint8Array) || used + value.byteLength > API_ERROR_MAX_BYTES) return null;
        bytes.set(value, used); used += value.byteLength;
      }
      return null;
    };
    const deadline = new Promise(resolve => { timer = setTimeout(() => { stopped = true; cancel(reader); resolve(null); }, Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, 1500)) : 1500); });
    const data = await Promise.race([read(), deadline]);
    if (!data) return fallback;
    let payload; try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { return fallback; }
    return decodeApiError(payload, response.status);
  } catch { return fallback; }
  finally {
    stopped = true; clearTimeout(timer);
    if (reader) { if (!complete) cancel(reader); try { reader.releaseLock(); } catch {} }
  }
}
const MESSAGES = Object.freeze({
  unknown: 'Google APIの応答から原因を安全に特定できませんでした。送信設定とGoogle AI Studioの利用状況を確認してください。',
  invalid_request: 'リクエストの形式または値が受け付けられませんでした。送信項目とモデルの対応仕様を確認してください。',
  parameter_unknown: 'APIが対応していないリクエスト項目を検出しました。送信項目を確認してください。',
  failed_precondition: '利用の前提条件を満たしていません。Google AI Studioでプロジェクトの利用条件と課金設定を確認してください。',
  authentication: '認証が受け付けられませんでした。APIキーの設定を確認してください。',
  payment_required: '課金設定の確認が必要です。Google AI Studioで対象プロジェクトの課金状態を確認してください。',
  permission_denied: 'APIへのアクセスが許可されませんでした。対象プロジェクトの権限と利用条件を確認してください。',
  not_found: '指定した対象が見つかりません。モデルと処理の指定を確認してください。',
  model_not_found: '指定したモデルが見つかりません。モデルの指定と提供状況を確認してください。',
  already_exists: '指定した対象がすでに存在します。先の処理を確認してください。',
  aborted: 'Google側で処理が中断されました。先の処理の状態を確認してください。',
  out_of_range: '指定した値が対応範囲を超えています。送信設定を確認してください。',
  cancelled: 'Google側で処理がキャンセルされました。先の処理の状態を確認してください。',
  api_error: 'Google API側のエラーが報告されました。先の処理の状態を確認してください。',
  unimplemented: '指定した機能はAPIで実装されていません。対応する機能を確認してください。',
  service_unavailable: 'Google APIを現在利用できません。サービスの状態を確認してください。',
  deadline_exceeded: 'Google側の処理時間の上限を超えました。先の処理の状態を確認してください。',
  rate_limit_exceeded: 'リクエスト頻度の制限が報告されました。Google AI Studioで制限を確認してください。',
  quota_exceeded: '利用枠の上限が報告されました。Google AI Studioで利用枠を確認してください。',
  too_many_requests: 'Google側の利用制限が報告されました。利用枠とリクエスト頻度を確認してください。',
  resource_exhausted: 'Google側の利用制限が報告されました。利用枠とリクエスト頻度を確認してください。',
});
export function apiErrorMessage(value) {
  const safe = sanitizeApiError(value);
  return `${MESSAGES[safe.code]}${safe.field ? `確認する項目: ${safe.field}。` : ''}（HTTP ${safe.httpStatus ?? '不明'} / ${safe.code}）自動で生成を再送しません。`;
}
