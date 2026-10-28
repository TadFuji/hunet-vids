import { Studio, StudioError, DEFAULT_VIDEO_SETTINGS, LEGACY_VIDEO_SETTINGS, videoSettings, formatVideoSettings, canExtend, secondsLabel } from './core.js';
import { GoogleGateway } from './google.js';
import { validateVideo } from './media.js';
import { prepareSource, prepareContinuation, composeSource, trimVideo, mixAudio } from './local-media-client.js';
import { localMediaEnabled, browserMediaEnabled } from './runtime.js';
import { createBrowserMedia } from './browser-media.js';
import { mountNarrationStudio } from './narration.js';
import { mountMusicStudio } from './music.js';

const $ = id => document.getElementById(id);
const KEY_REQUIRED_MESSAGE = 'Gemini の API キーを入力してください';
let apiKey = '';
let initialSettings = { ...DEFAULT_VIDEO_SETTINGS };
let studio;
let narrationUi = null;
let musicUi = null;
let browserMedia = null;
let mediaState = { busy: false, phase: 'idle' };
let mediaCancelEpoch = 0;
document.getElementById('browser-media-license').hidden = !browserMediaEnabled;
const processingText = value => browserMediaEnabled ? String(value).replaceAll('このMac', 'この端末').replaceAll('Mac内', 'ブラウザ内') : value;
let startMode = 'text';
let desiredSeconds = 10;
let playingId = null;
let previewAction = 0;
let playbackNotice = '';
const urls = new Map();
let diagnosticUrl = null, diagnosticText = '', inspectionCount = 0;
const examples = {
  initial: '朝霧に包まれた湖。小さな木の舟がゆっくり進む。カメラは水面すれすれを追いかけ、鳥の声と穏やかな水音が聞こえる。朝日が山の向こうから差し始める。',
  continuation: 'このシーンの続き。舟の先に白い鳥が舞い降りる。カメラがゆっくり引くと、湖を囲む山々が見えてくる。水音と鳥の声は自然につながる。',
};

function blobUrl(blob) {
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
}
function clearUrls() {
  for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear();
  if (diagnosticUrl) URL.revokeObjectURL(diagnosticUrl);
  diagnosticUrl = null; diagnosticText = ''; inspectionCount = 0;
  $('inspection-list').replaceChildren();
}
function newStudio() {
  previewAction++;
  playbackNotice = '';
  browserMedia?.dispose(); mediaState = { busy: false, phase: 'idle' };
  browserMedia = browserMediaEnabled ? createBrowserMedia({ onState: state => { mediaState = state; if (studio) render(); } }) : null;
  const gateway = new GoogleGateway(() => apiKey);
  const processor = browserMedia || { prepareSource, prepareContinuation, composeSource, trimVideo, mixAudio };
  studio = new Studio(gateway, { localMediaEnabled, validate: validateVideo, compose: processor.composeSource, trim: processor.trimVideo, prepare: processor.prepareContinuation, mix: processor.mixAudio, onChange: render,
    preflight: async plan => {
      if (!browserMedia || !plan.requiresMedia) return;
      if (!['360p', '720p'].includes(plan.settings.resolution)) throw new StudioError('ブラウザ内の短縮・取り込み・接続は720p以下に対応します。Googleへは送信していません。');
      if (plan.expectedWholeSeconds > 90 || (plan.currentBlob?.size || 0) > 100 * 1024 * 1024) throw new StudioError('ブラウザ内で処理できる全体90秒・100MiBを超えます。Googleへは送信していません。現在の動画を保存してください。');
      const epoch = mediaCancelEpoch;
      await browserMedia.ensureReady();
      const check = () => { if (epoch !== mediaCancelEpoch) throw new StudioError('端末内の処理を中止しました。Googleへの生成は送信していません。', { terminal: true }); };
      check(); return check;
    },
  });
  playingId = null; $('video').removeAttribute('src'); $('video').load();
  $('prompt').value = ''; initialSettings = { ...DEFAULT_VIDEO_SETTINGS }; startMode = 'text'; desiredSeconds = 10; $('source-file').value = ''; $('extension-seconds').value = '10';
  $('recovery-id').value = '';
  clearUrls(); narrationUi?.reset?.(); musicUi?.reset?.(); render();
}

function make(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function render() {
  const base = studio.base; const selected = studio.selected;
  const blocked = studio.busy || !!studio.job;
  const uploaded = !!base?.source;
  const max = !!base && !canExtend(base);
  const atForty = !!base && base.seconds >= 40 - 0.000001;
  const minimum = 3;
  const actualRemaining = base ? 40 - (base.modelSeconds ?? base.actualSeconds ?? base.seconds) : 40;
  const remaining = Math.max(0, Math.min(10, Math.floor(Math.min(40 - (base?.seconds || 0) + (localMediaEnabled ? 0.000001 : 0), localMediaEnabled ? 40 : actualRemaining))));
  const publicUnavailable = !localMediaEnabled && !!base && !canExtend(base, { localMediaEnabled });
  const stopped = max || publicUnavailable;
  const shortRemaining = stopped && !atForty && !uploaded && !base?.requiresUpload && (!base || !!base.interactionId);
  const stopMessage = !localMediaEnabled && (base?.source || base?.requiresUpload || (base && !base.interactionId))
    ? 'この版は取り込み・接続が必要なため、公開版では延長できません。動画を保存して、文章から新しく始めてください。'
    : '延長は3秒以上です。40秒までの残りが3秒未満のため、この版はここで保存してください。';
  if (!blocked && remaining >= minimum) desiredSeconds = Math.max(minimum, Math.min(desiredSeconds, remaining));
  $('public-profile-note').hidden = localMediaEnabled && !browserMediaEnabled;
  if (browserMediaEnabled) {
    $('public-profile-note').textContent = '公開版：動画の取り込み・切り出し・接続はブラウザ内で処理します。初回約31MBのエンジン取得が必要です。デスクトップ向け、取り込み60秒・50MiB・720p以下。現在版と接続後は90秒・100MiB以下です。スマートフォン・4K加工は対応保証外です。';
    $('source-file-label').textContent = '元動画を選ぶ（60秒・50MiB・720p以下）';
    $('upload-processing-description').textContent = '選択した動画はブラウザ内で準備し、Vercelや別の処理サーバーへ送りません。元ファイルは変更しません。切り出し・接続はH.264/AACへ再エンコードするため、画質や音質が変わる場合があります。';
  }
  $('browser-media-panel').hidden = !browserMediaEnabled;
  const phases = { loading: '処理エンジンを読み込んでいます…', checking: '動画処理の動作を確認しています…', preparing: 'この端末内で末尾を準備しています…', trimming: 'この端末内で長さを切り出しています…', composing: 'この端末内で動画をつないでいます…', ready: 'ブラウザ内の動画処理を準備できました。', cancelled: '端末内の処理を中止しました。元動画は変更していません。', error: '端末内の処理を完了できませんでした。手動で再試行できます。' };
  $('browser-media-state').textContent = phases[mediaState.phase] || (mediaState.busy ? 'この端末内で動画を処理しています…' : '動画処理は必要なときに読み込みます。Googleへの生成は本人の操作でのみ送信します。');
  $('cancel-media').hidden = !mediaState.busy; $('cancel-media').disabled = !mediaState.busy;

  if (!localMediaEnabled) {
    $('duration-description').textContent = '公開版では初回も延長も3〜10秒を選び、その長さをGoogle APIへ指定します。1・2秒への短縮と動画の取り込み・接続は利用できません。';
    $('extension-description').textContent = '延長は前の生成IDを参照する通常の延長だけに対応します。実際のAI動画の長さと追加する秒数の合計が40秒を超える操作は送信しません。';
    $('duration-policy-description').textContent = '予定と実際の再生時間は分けて確認し、予定から外れた出力は確認用に残します。残りが3秒未満なら、その版を保存してください。フレーム・音声の端数があるため、厳密な実尺は保証しません。公開先からの実API動作は未試験です。';
  }
  const added = studio.job?.desiredSeconds ?? studio.job?.addedSeconds ?? desiredSeconds;
  const next = (base?.seconds || 0) + (stopped ? 0 : added);
  const nextWhole = base ? (base.wholeSeconds ?? base.seconds) + (stopped ? 0 : added) : added;
  const reupload = !!base && (!!base.requiresUpload || !!base.narration || ((base.modelSeconds ?? base.actualSeconds ?? base.seconds) + Math.max(3, added) > 40));
  const sourceMode = localMediaEnabled && (startMode === 'upload' || uploaded);
  $('source-text').disabled = blocked || studio.hasWork; $('source-upload').disabled = !localMediaEnabled || blocked || studio.hasWork; $('source-upload').hidden = !localMediaEnabled;
  $('source-text').setAttribute('aria-pressed', String(!sourceMode)); $('source-upload').setAttribute('aria-pressed', String(sourceMode));
  $('upload-panel').hidden = !sourceMode; $('source-file').disabled = !localMediaEnabled || blocked || studio.hasWork;
  $('extension-options').hidden = false; $('extension-seconds').disabled = blocked || stopped;
  $('duration-label').textContent = base ? '追加する長さ' : '動画の長さ';
  $('extension-seconds').value = String(added);
  for (const option of $('extension-seconds').querySelectorAll('option')) option.disabled = Number(option.value) < minimum || Number(option.value) > remaining;
  $('duration-hint').textContent = (publicUnavailable && !atForty) || shortRemaining ? stopMessage : max ? 'この展開は上限に達しました。各版を保存できます。' : '選んだ秒数をGoogleへ指定します。予定の長さと実際の再生時間は別に確認します。';
  $('duration-caveat').hidden = !localMediaEnabled || !reupload;
  $('duration-caveat').textContent = reupload ? '延長の元になる動画の末尾10秒以下をGoogleへ送り直して延長します。EEA・スイス・英国では利用できず、新しいセリフの追加は非対応です。前半はこのMacでつなぎます。' : '';
  $('planned-length').textContent = stopped ? `この展開 ${secondsLabel(base.seconds)} / 40秒` : sourceMode && !base ? '元動画を選ぶと、延長後の予定を表示します。' : base ? `保存する全体の予定：約${secondsLabel(nextWhole)}秒 · この展開 ${secondsLabel(next)} / 40秒` : `完成予定：${secondsLabel(next)}秒 / 最大40秒`;
  $('upload-summary').textContent = uploaded ? `${base.source.name} · 元動画 ${secondsLabel(base.source.sourceSeconds)}秒 / ローカルの前半 ${secondsLabel(base.source.prefixSeconds)}秒 / 元動画から保存した末尾 ${secondsLabel(base.source.tailSeconds)}秒。音声${base.source.hasAudio ? 'あり' : 'なし'}。${base.source.normalized ? '末尾と接続結果は対応画角・解像度へ変換します。' : ''}` : studio.busy && sourceMode ? 'このMacで動画を準備しています…' : 'MP4・MOV・WebM、横16:9・縦9:16を取り込めます。';
  $('tail-download').hidden = !uploaded;
  if (uploaded) { $('tail-download').href = blobUrl(base.source.tailBlob); $('tail-download').download = 'omni-source-tail.mp4'; }
  $('key-state').textContent = apiKey ? 'キー入力済み（未確認）' : 'キー未入力';
  $('forget-key').hidden = !apiKey;
  $('reset').disabled = blocked;
  $('api-key').disabled = studio.busy; $('forget-key').disabled = studio.busy;
  $('prompt').disabled = blocked || stopped; $('example').disabled = blocked || stopped;
  const settings = studio.job?.settings || (base ? base.settings || LEGACY_VIDEO_SETTINGS : initialSettings);
  $('aspect-ratio').value = settings.aspectRatio; $('resolution').value = settings.resolution;
  $('aspect-ratio').disabled = blocked || !!base || sourceMode; $('resolution').disabled = blocked || !!base || sourceMode;
  $('settings-hint').textContent = blocked ? '処理中の画角・解像度は変更できません。' : base ? 'このアプリでは、同じ物語の画角・解像度を保って延長します。変更する場合は「新しく始める」を選んでください。' : sourceMode ? '画角・解像度は、取り込む動画に合わせます。横16:9・縦9:16を取り込めます。' : '最初の生成に使う動画設定です。横16:9・縦9:16を選べます。';
  $('resolution-hint').textContent = ['1080p', '4k'].includes(settings.resolution) ? '1080p・4Kはアップスケール出力です。高解像度は生成に時間がかかる場合があります。' : settings.resolution === '360p' ? '360pは下書き向け。Googleは720pの約1/3の生成コストと案内しています。総額は利用量によります。' : '720pは標準解像度です。1080p・4Kはアップスケール出力になります。';
  $('char-count').textContent = `${$('prompt').value.length.toLocaleString('ja-JP')} / 4,000`;
  $('prompt-title').textContent = stopped ? 'この展開の延長はここまで' : sourceMode && !base ? 'まず元動画を選んでください' : base ? `次の${added}秒をつくる` : `最初の${added}秒をつくる`;
  $('prompt-label').textContent = base ? 'この先、何が起こりますか？' : 'どんなシーンから始めますか？';
  $('target-seconds').textContent = uploaded ? `この展開 ${secondsLabel(base.seconds)} → ${secondsLabel(next)}秒` : atForty ? '40 / 40秒' : stopped ? `${secondsLabel(base.seconds)} / 40秒` : `${secondsLabel(base?.seconds || 0)} → ${secondsLabel(next)}秒`;
  $('prompt').placeholder = base ? examples.continuation : '例：' + examples.initial;
  $('branch-note').hidden = !studio.branching;
  $('branch-note').textContent = studio.branching ? `${base.seconds}秒版から別の続きをつくります。すでにある動画も残ります。` : '';
  $('generate-label').textContent = studio.busy ? '処理中です…' : studio.job ? '結果を確認してください' : stopped ? 'この展開の延長はここまでです' : uploaded ? `${added}秒延長する · 全体 約${secondsLabel(nextWhole)}秒` : base ? `${added}秒延長する → ${secondsLabel(next)}秒` : sourceMode ? '元動画を選んでください' : `最初の${added}秒を生成`;
  $('generate').disabled = blocked || stopped || (!!apiKey && (!$('prompt').value.trim() || (sourceMode && !base)));
  $('generate').classList.toggle('needs-key', !apiKey);
  $('generate').setAttribute('aria-describedby', 'action-hint');
  $('action-hint').textContent = (publicUnavailable && !atForty) || shortRemaining ? stopMessage : max ? '延長はここまで。動画を保存して完成です。' : !apiKey ? KEY_REQUIRED_MESSAGE : 'この操作でGoogle APIの利用料金が発生します。';
  $('preview-title').textContent = selected ? `${versionLabel(selected)}${selected.id === studio.baseId ? ' · 延長の元になる動画' : ' · 過去の版を表示中'}` : '最初のシーンを待っています';
  const previewSettings = selected ? selected.settings || LEGACY_VIDEO_SETTINGS : settings;
  $('preview-spec').textContent = '要求設定：' + formatVideoSettings(previewSettings);
  $('video-screen').classList.toggle('portrait', previewSettings.aspectRatio === '9:16');
  $('preview-dimensions').hidden = !selected;
  $('preview-dimensions').textContent = selected ? (selected.kind === 'uploaded-original' ? '元動画の実寸：' : '保存する動画の実寸：') + dimensionsLabel(selected.width, selected.height) + (Number.isFinite(selected.rawWidth) && Number.isFinite(selected.rawHeight) ? ` / 返却されたAI出力：${dimensionsLabel(selected.rawWidth, selected.rawHeight)}` : '') : '';
  $('empty-state').hidden = !!selected; $('video').hidden = !selected;
  const selectedUrl = selected ? blobUrl(selected.blob) : '';
  if (selected && (playingId !== selected.id || $('video').src !== selectedUrl)) {
    playbackNotice = '';
    $('video').src = selectedUrl; playingId = selected.id;
  }
  $('playback-notice').hidden = !playbackNotice;
  $('playback-notice').textContent = playbackNotice;
  $('download').hidden = !selected;
  if (selected) { $('download').href = blobUrl(selected.blob); $('download').download = filename(selected); }
  $('view-state').textContent = selected ? !localMediaEnabled && canExtend(selected) && !canExtend(selected, { localMediaEnabled }) ? '公開版ではこの版をこれ以上延長できません。動画を保存できます。' : !canExtend(selected) ? selected.source ? 'この展開の延長はここまでです。動画全体を保存できます。' : selected.seconds >= 40 - 0.000001 ? '40秒版です。この展開は完成です。動画を保存できます。' : '40秒までの残りが3秒未満のため、これ以上延長できません。動画を保存できます。' : selected.viewed ? '再生済み · 各版は個別に保存できます。' : '動画情報を確認済み · 再生は任意です。各版を保存できます。' : '生成後、動画情報の確認が完了すると、続きをつくれます。';
  $('duration-readout').hidden = !selected;
  $('duration-readout').textContent = selected ? `動画全体 ${Number.isFinite(selected.wholeSeconds ?? selected.actualSeconds) ? secondsLabel(selected.wholeSeconds ?? selected.actualSeconds) + '秒' : '未計測'} / この展開：予定 ${secondsLabel(selected.seconds)}秒・上限40秒 / ${selected.kind === 'uploaded-original' ? '参照する元動画の末尾' : '採用したAI部分'} ${Number.isFinite(selected.actualSeconds) ? selected.actualSeconds.toFixed(2) + '秒' : '未計測'}${Number.isFinite(selected.rawActualSeconds) ? ` / 加工前のAI出力 ${selected.rawActualSeconds.toFixed(2)}秒` : ''}` : '';
  const hasRaw = !!selected?.rawBlob && (selected.rawBlob !== selected.modelBlob || selected.rawBlob !== selected.blob);
  $('raw-download').hidden = !hasRaw;
  if (hasRaw) { $('raw-download').href = blobUrl(selected.rawBlob); $('raw-download').download = `omni-raw-${studio.versions.indexOf(selected) + 1}.mp4`; }
  $('working-overlay').hidden = !studio.busy; $('working-text').textContent = processingText(studio.job?.stage || '確認中です');
  $('status').hidden = !studio.error && !studio.notice;
  $('status').classList.toggle('error', !!studio.error); $('status').textContent = processingText(studio.error || studio.notice);
  $('recovery').hidden = !studio.job || studio.busy;
  const preparationFailed = studio.job?.requestReady === false;
  const needsId = !!studio.job && !preparationFailed && (!studio.job.interactionId || studio.job.manualRecovery);
  $('recovery-description').textContent = preparationFailed ? '延長用の末尾をこのMacで準備できず、Googleへの生成は送信していません。元の動画は残っています。確認を終了してから、ローカル処理の状態を確認し、改めて延長してください。' : '新しい生成は送信しません。結果不明の処理がある間は、生成ボタンを止めています。';
  $('recovery-id').hidden = !needsId; $('recovery-label').hidden = !needsId;
  $('resume').disabled = studio.busy || !apiKey || preparationFailed;
  $('pending-model-download').hidden = !studio.job?.result;
  if (studio.job?.result) { $('pending-model-download').href = blobUrl(studio.job.result.blob); $('pending-model-download').download = 'omni-pending-model.mp4'; }
  $('recheck').hidden = !studio.job?.result; $('recheck').disabled = studio.busy;
  $('diagnostics-panel').hidden = studio.attempts.length === 0;
  if (studio.attempts.length) {
    const text = JSON.stringify(studio.diagnostics(), null, 2);
    if (text !== diagnosticText) {
      if (diagnosticUrl) URL.revokeObjectURL(diagnosticUrl);
      diagnosticText = text; diagnosticUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    }
    $('diagnostic-download').href = diagnosticUrl; $('diagnostic-download').download = 'omni-diagnostics.json';
  }
  if (browserMediaEnabled) {
    for (const id of ['upload-summary', 'duration-hint', 'duration-caveat', 'recovery-description']) $(id).textContent = processingText($(id).textContent);
    $('duration-description').textContent = '初回も延長も3〜10秒を選び、その長さをGoogle APIへ指定します。';
    $('extension-description').textContent = '通常の延長は前の生成IDを参照します。取り込んだ動画や上限付近の延長では現在版の末尾10秒以下をGoogleへ送り直し、前半をこの端末で接続します。Googleへの送信は延長ボタンを押したときだけです。';
    $('duration-policy-description').textContent = 'この展開の予定は合計40秒までです。長い元動画の前半は端末内に保持します。予定と実尺を検査し、不一致は確認用に残します。ブラウザ処理は720p以下・現在版90秒/100MiBまで。途中で閉じると作品が失われるため、各版を保存してください。';
  }
  renderInspections();
  renderTimeline(); renderHistory();
  narrationUi?.render();
  musicUi?.render();
}

function dimensionsLabel(width, height) { return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? `${width} × ${height}px` : '未計測'; }

function renderInspections() {
  $('inspections').hidden = studio.rejections.length === 0;
  $('inspection-count').textContent = `${studio.rejections.length}本`;
  // Append only: polling/rerendering must not interrupt inspection playback.
  while (inspectionCount < studio.rejections.length) {
    const item = studio.rejections[inspectionCount++];
    const card = make('article', 'inspection-card');
    card.append(make('strong', '', `試行 ${item.attempt} · 確認用 ${inspectionCount}`));
    card.append(make('p'));
    const video = make('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.src = blobUrl(item.blob);
    video.setAttribute('aria-label', `確認用動画 ${inspectionCount}`); card.append(video);
    const download = make('a', '', '↓ この確認用動画を保存'); download.href = blobUrl(item.blob);
    download.download = `omni-check-attempt-${item.attempt}-${inspectionCount}.mp4`; card.append(download);
    $('inspection-list').append(card);
  }
  studio.rejections.forEach((item, i) => {
    const label = $('inspection-list').children[i].querySelector('p');
    const aspect = item.expectedAspectRatio ? ` / 要求画角 ${item.expectedAspectRatio}・返却実寸 ${dimensionsLabel(item.width, item.height)}` : '';
    const problem = !item.accepted && item.reason === 'aspect' ? '画角を確認できないか、要求と一致しません。' : '';
    label.textContent = `予定 ${item.expectedSeconds}秒 / 総再生時間 ${Number.isFinite(item.actualSeconds) ? item.actualSeconds.toFixed(2) + '秒' : '未計測'}${aspect} · ${problem}${item.accepted ? '再確認で完成版に採用済み' : '延長には使いません'}`;
  });
}

function versionLabel(version) { return version.kind === 'uploaded-original' ? `元動画 ${secondsLabel(version.wholeSeconds)}秒` : version.source ? `全体 ${secondsLabel(version.wholeSeconds)}秒（この展開 ${secondsLabel(version.seconds)}秒）` : `${version.seconds}秒版`; }
function filename(version) { return version.kind === 'uploaded-original' ? version.source.name : `omni-live-${secondsLabel(version.wholeSeconds ?? version.seconds)}s-${studio.versions.indexOf(version) + 1}.mp4`; }
function selectPreview(id) {
  if (studio.busy || !studio.versions.some(version => version.id === id)) return null;
  const action = ++previewAction;
  playbackNotice = '';
  studio.select(id);
  const video = $('video');
  video.scrollIntoView({ block: 'center', behavior: 'auto' });
  video.focus({ preventScroll: true });
  return { video, action };
}
async function playPreview(id) {
  const preview = selectPreview(id);
  if (!preview) return;
  try { await preview.video.play(); }
  catch {
    if (preview.action !== previewAction || studio.selectedId !== id) return;
    playbackNotice = '再生を開始できませんでした。中央の動画プレーヤーの再生ボタンを押してください。';
    render();
  }
}
function renderTimeline() {
  const timeline = $('timeline'); timeline.replaceChildren();
  const lineage = studio.lineage;
  const uploaded = !!studio.base?.source;
  const steps = lineage.map(version => ({ seconds: version.seconds, version }));
  const base = studio.base;
  if (!base || canExtend(base, { localMediaEnabled })) steps.push({ seconds: studio.job?.seconds ?? (base?.seconds || 0) + desiredSeconds, version: null });
  for (const { seconds, version } of steps) {
    const label = version ? versionLabel(version) : `予定 ${secondsLabel(seconds)}秒`;
    const button = make('button', `timeline-step${version ? '' : ' empty'}${version?.id === studio.selectedId ? ' current' : ''}`);
    button.type = 'button'; button.disabled = !version || studio.busy;
    button.setAttribute('aria-label', `${label}${version ? 'を再生' : ' 未生成'}`);
    if (version) button.setAttribute('aria-pressed', String(version.id === studio.selectedId));
    button.append(make('strong', '', uploaded && version ? `${secondsLabel(version.wholeSeconds)}秒` : `${secondsLabel(seconds)}秒`), make('small', '', version ? (version.kind === 'uploaded-original' ? '元動画 · ローカル' : version.id === studio.baseId ? '延長の元 · 完成' : '完成 · 再生する') : '次の予定'));
    if (version) { button.append(make('span','step-dot')); button.addEventListener('click', () => playPreview(version.id)); }
    timeline.append(button);
  }
  $('timeline-note').textContent = '3〜10秒を選択 · この展開は40秒まで';
  $('timeline-total').textContent = uploaded ? `この展開 ${secondsLabel(base.seconds)} / 40秒 · 全体 ${secondsLabel(base.wholeSeconds)}秒` : `${secondsLabel(base?.seconds || 0)} / 40秒`;
}
function renderHistory() {
  $('history').replaceChildren(); $('history-empty').hidden = studio.versions.length > 0;
  $('history-count').textContent = `${studio.versions.length}本`;
  studio.versions.forEach((version, i) => {
    const row = make('div', `version-row${version.id === studio.selectedId ? ' selected' : ''}`);
    const play = make('button','version-icon','▷'); play.type = 'button'; play.disabled = studio.busy;
    play.setAttribute('aria-label', `版 ${i + 1} ${versionLabel(version)}を再生`);
    play.addEventListener('click', () => playPreview(version.id));
    row.append(play);
    const body = make('div','version-body');
    const parentNumber = studio.versions.findIndex(v => v.id === version.parentId) + 1;
    body.append(make('strong','', `版 ${i + 1} · ${versionLabel(version)}${parentNumber ? ` · 版 ${parentNumber}から延長` : ' · 最初の動画'}`), make('p','',version.prompt));
    const view = make('button','secondary','表示'); view.disabled = studio.busy;
    view.setAttribute('aria-label', `版 ${i + 1} ${versionLabel(version)}を表示`); view.addEventListener('click', () => selectPreview(version.id));
    const download = make('a','','↓'); download.href = blobUrl(version.blob); download.download = filename(version);
    download.setAttribute('aria-label', `版 ${i + 1} ${versionLabel(version)}をダウンロード`);
    row.append(body,view,download); $('history').append(row);
  });
  const selected = studio.selected;
  $('fork-panel').hidden = !selected || !canExtend(selected, { localMediaEnabled }) || selected.id === studio.baseId;
  $('fork-description').textContent = selected ? `表示中：${versionLabel(selected)}。ここから別の展開を試す場合は、右の操作で明示的に切り替えます。` : '';
  $('fork').disabled = studio.busy || !!studio.job;
}

async function confirmAction(title, copy, requireCheck = false) {
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title; $('confirm-copy').textContent = copy;
  $('confirm-check-label').hidden = !requireCheck; $('confirm-check').checked = false;
  $('confirm-ok').disabled = requireCheck;
  $('confirm-check').onchange = () => { $('confirm-ok').disabled = requireCheck && !$('confirm-check').checked; };
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}
function showError(error) { studio.error = error instanceof StudioError ? error.message : '操作を完了できませんでした。'; render(); }

$('cancel-media').addEventListener('click', () => { mediaCancelEpoch++; browserMedia?.cancel(); });
$('key-form').addEventListener('submit', event => event.preventDefault());
$('api-key').addEventListener('input', () => {
  if (studio.busy) return;
  apiKey = $('api-key').value.trim();
  render();
});
$('forget-key').addEventListener('click', () => {
  if (studio.busy) return;
  apiKey = ''; $('api-key').value = '';
  studio.notice = 'APIキーをこのタブのメモリから消去しました。動画と診断情報は残ります。'; render();
});
for (const [id, mode] of [['source-text', 'text'], ['source-upload', 'upload']]) $(id).addEventListener('click', () => {
  if (studio.busy || studio.hasWork || (!localMediaEnabled && mode === 'upload')) return;
  startMode = mode; render();
});
$('source-file').addEventListener('change', async () => {
  if (!localMediaEnabled || studio.busy || studio.hasWork) return;
  const file = $('source-file').files?.[0]; if (!file) return;
  studio.busy = true; studio.error = ''; render();
  try { const source = await (browserMedia || { prepareSource }).prepareSource(file); studio.busy = false; studio.importSource(source); }
  catch (error) { studio.busy = false; showError(error); }
  finally { studio.busy = false; $('source-file').value = ''; render(); }
});
$('extension-seconds').addEventListener('change', () => {
  if (!studio.busy && !studio.job) {
    const value = Number($('extension-seconds').value);
    if (Number.isInteger(value) && value >= 3 && value <= 10) desiredSeconds = value;
  }
  render();
});
$('prompt').addEventListener('input', render);
for (const id of ['aspect-ratio', 'resolution']) $(id).addEventListener('change', () => {
  if (studio.busy || studio.job || studio.base || startMode === 'upload') { render(); return; }
  try { initialSettings = videoSettings({ aspectRatio: $('aspect-ratio').value, resolution: $('resolution').value }); }
  catch (error) { showError(error); }
  render();
});
$('example').addEventListener('click', () => { $('prompt').value = studio.base ? examples.continuation : examples.initial; render(); $('prompt').focus(); });
$('generate-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (studio.busy || studio.job || (studio.base && !canExtend(studio.base, { localMediaEnabled }))) return;
  if (!apiKey) { window.alert(KEY_REQUIRED_MESSAGE); $('api-key').focus(); return; }
  if ($('generate').disabled) return;
  const count = studio.versions.length;
  $('recovery-id').value = '';
  try { await studio.generate($('prompt').value, initialSettings, desiredSeconds); } catch (e) { showError(e); }
  if (studio.versions.length > count) { $('prompt').value = ''; render(); }
});
$('video').addEventListener('ended', () => { if (playingId) studio.viewed(playingId); });
$('fork').addEventListener('click', async () => {
  const selected = studio.selected; if (!selected) return;
  if (await confirmAction('この版から別の続きをつくる', `${versionLabel(selected)}を延長の元に切り替えます。既存の動画は残ります。実生成では、続きを生成する操作で新たに料金が発生します。`)) {
    try { studio.fork(selected.id); $('prompt').value = ''; render(); $('prompt').focus(); } catch (e) { showError(e); }
  }
});
$('resume').addEventListener('click', async () => {
  if (!apiKey) { window.alert(KEY_REQUIRED_MESSAGE); $('api-key').focus(); return; }
  const count = studio.versions.length;
  try { await studio.resume($('recovery-id').hidden ? undefined : $('recovery-id').value.trim()); }
  catch(e) { showError(e); }
  if (!studio.job) $('recovery-id').value = '';
  if (studio.versions.length > count) $('prompt').value = '';
  render();
});
$('recheck').addEventListener('click', async () => {
  const count = studio.versions.length;
  try { await studio.recheck(); } catch(e) { showError(e); }
  if (studio.versions.length > count) { $('prompt').value = ''; $('recovery-id').value = ''; render(); }
});
$('abandon').addEventListener('click', async () => {
  if (await confirmAction('確認を終了し、新規生成を選べる状態にしますか？', '確認用の動画は残ります。Google側の先の処理の状態と利用量を確認してください。ここで生成は送信しません。後で生成ボタンを押すと別の有料リクエストになり、追加料金が発生します。先の生成の取り消し・返金ではありません。', true)) {
    studio.abandon();
  }
});
$('reset').addEventListener('click', async () => {
  if (studio.busy || studio.job) return;
  if (studio.hasWork && !await confirmAction('新しい物語を始める', 'このタブの動画と確認用の出力、履歴、APIキーを消去します。必要な動画と診断情報は先に保存してください。Google側の履歴は消えません。')) return;
  apiKey = ''; $('api-key').value = ''; newStudio();
});
window.addEventListener('beforeunload', event => { if (studio.hasWork) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { browserMedia?.dispose(); apiKey = ''; $('api-key').value = ''; clearUrls(); narrationUi?.reset?.(); musicUi?.reset?.(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { apiKey = ''; newStudio(); studio.notice = '画面を再開したため、セッションを初期化しました。必要なキーはご本人が改めて入力してください。'; render(); }
});
if (typeof mountNarrationStudio === 'function') {
  narrationUi = mountNarrationStudio({
    getApiKey: () => apiKey,
    getStudio: () => studio,
    getVideoElement: () => $('video'),
    blobUrl,
    onUpdate: render,
    alertUser: msg => window.alert(msg),
    keyRequiredMessage: KEY_REQUIRED_MESSAGE,
  });
}
if (typeof mountMusicStudio === 'function') {
  musicUi = mountMusicStudio({
    getApiKey: () => apiKey,
    getStudio: () => studio,
    getVideoElement: () => $('video'),
    blobUrl,
    onUpdate: render,
    alertUser: msg => window.alert(msg),
    keyRequiredMessage: KEY_REQUIRED_MESSAGE,
  });
}
newStudio();
