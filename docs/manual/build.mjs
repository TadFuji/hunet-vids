// Builds the illustrated manual (A4 PDF) from the captured screens.
// Usage: npm run build && node docs/manual/capture.mjs && node docs/manual/build.mjs
// Writes docs/manual/manual.html (intermediate) and output/pdf/hunet_vids_図解取扱説明書.pdf.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const here = new URL('./', import.meta.url);
const bounds = JSON.parse(readFileSync(new URL('images/bounds.json', here), 'utf8'));
const DATE = '2026-10-13';
const VERSION = JSON.parse(readFileSync(new URL('../../package.json', here), 'utf8')).version;

// ---------- small HTML helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/**
 * Screenshot with numbered markers placed on captured element positions.
 * marks: [[key, n, place?]] where place is 'tl' (top-left, default), 'tr', 'l', 'r', 'c'.
 * crop: [top, bottom] in screenshot px to show only part of a tall image.
 */
function fig(name, marks = [], { crop, width = 100, caption, outline = [], maxH } = {}) {
  const b = bounds[name];
  if (!b) throw new Error(`no capture: ${name}`);
  const [top, bottom] = crop ?? [0, b.h];
  const h = bottom - top;
  const pin = (box, place) => {
    const cx = { tl: box.x, tr: box.x + box.w, l: box.x, r: box.x + box.w, c: box.x + box.w / 2 }[place];
    const cy = { tl: box.y, tr: box.y, l: box.y + box.h / 2, r: box.y + box.h / 2, c: box.y + box.h / 2 }[place];
    return { left: (cx / b.w) * 100, top: ((cy - top) / h) * 100 };
  };
  const markers = marks
    .map(([key, n, place = 'tl']) => {
      const box = b.boxes[key];
      if (!box) throw new Error(`${name}: no box ${key}`);
      const p = pin(box, place);
      const cls = place;
      return `<span class="mk mk-${cls}" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%">${n}</span>`;
    })
    .join('');
  const outlines = outline
    .map((key) => {
      const box = b.boxes[key];
      return `<span class="ol" style="left:${((box.x / b.w) * 100).toFixed(2)}%;top:${(((box.y - top) / h) * 100).toFixed(2)}%;width:${((box.w / b.w) * 100).toFixed(2)}%;height:${((box.h / h) * 100).toFixed(2)}%"></span>`;
    })
    .join('');
  const imgStyle = `width:100%;margin-top:${((-top / b.w) * 100).toFixed(3)}%`;
  const w = maxH ? `min(${width}%, calc(${((maxH * b.w) / h).toFixed(1)}mm + 36px))` : `${width}%`;
  return `<figure class="fig" style="width:${w}"><div class="frame" style="aspect-ratio:${b.w}/${h}"><div class="shot"><img src="images/${name}.png" style="${imgStyle}" alt="">${outlines}</div>${markers}</div>${caption ? `<figcaption>${md(caption)}</figcaption>` : ''}</figure>`;
}

const legend = (items) => `<ol class="legend">${items.map(([n, title, text]) => `<li><span class="num">${n}</span><div><b>${md(title)}</b>${text ? `<p>${md(text)}</p>` : ''}</div></li>`).join('')}</ol>`;
const steps = (items) => `<ol class="steps">${items.map((t, i) => `<li><span class="num">${i + 1}</span><p>${md(t)}</p></li>`).join('')}</ol>`;
const box = (kind, title, text) => `<div class="box ${kind}"><b>${md(title)}</b><p>${md(text)}</p></div>`;
const table = (head, rows, cls = '') => `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${md(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const cols = (a, b, ratio = '1fr 1fr') => `<div class="cols" style="grid-template-columns:${ratio}">${`<div>${a}</div><div>${b}</div>`}</div>`;
const p = (t) => `<p>${md(t)}</p>`;
const h3 = (t) => `<h3>${md(t)}</h3>`;

const toc = [];
function page(kicker, title, lead, body) {
  const id = `s${toc.length + 1}`;
  toc.push({ id, kicker, title });
  return `<section class="page" id="${id}"><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2>${lead ? `<p class="lead">${md(lead)}</p>` : ''}${body}</section>`;
}

// ---------- diagrams (inline SVG) ----------
const flowDiagram = (stepsList) => {
  const w = 170;
  const gap = 34;
  const items = stepsList
    .map((s, i) => {
      const x = i * (w + gap);
      return `<g transform="translate(${x},0)"><rect width="${w}" height="104" rx="10" fill="${i % 2 ? '#fff4e0' : '#e8eef9'}" stroke="${i % 2 ? '#FC9A04' : '#0D357A'}" stroke-width="1.5"/><text x="${w / 2}" y="30" text-anchor="middle" class="t1">${esc(s[0])}</text>${s[1]
        .split('\n')
        .map((l, j) => `<text x="${w / 2}" y="${56 + j * 18}" text-anchor="middle" class="t2">${esc(l)}</text>`)
        .join('')}</g>${i < stepsList.length - 1 ? `<path d="M${x + w + 5} 52 L${x + w + gap - 7} 52" stroke="#0D357A" stroke-width="2" marker-end="url(#ar)"/>` : ''}`;
    })
    .join('');
  const total = stepsList.length * w + (stepsList.length - 1) * gap;
  return `<svg class="diagram" viewBox="-2 -2 ${total + 4} 110"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#0D357A"/></marker></defs>${items}</svg>`;
};

const dataFlowDiagram = `<svg class="diagram" viewBox="0 0 680 230">
 <defs><marker id="a2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#0D357A"/></marker></defs>
 <rect x="10" y="20" width="260" height="190" rx="12" fill="#e8eef9" stroke="#0D357A"/>
 <text x="140" y="46" text-anchor="middle" class="t1">あなたのパソコン（ブラウザ）</text>
 <rect x="30" y="64" width="220" height="40" rx="8" fill="#fff" stroke="#9fb0d6"/><text x="140" y="89" text-anchor="middle" class="t2">hunet vids の画面</text>
 <rect x="30" y="114" width="105" height="80" rx="8" fill="#fff" stroke="#9fb0d6"/><text x="82" y="146" text-anchor="middle" class="t2">API キー</text><text x="82" y="166" text-anchor="middle" class="t3">このブラウザに保存</text>
 <rect x="145" y="114" width="105" height="80" rx="8" fill="#fff" stroke="#9fb0d6"/><text x="197" y="146" text-anchor="middle" class="t2">動画・素材</text><text x="197" y="166" text-anchor="middle" class="t3">このブラウザに保存</text>
 <rect x="420" y="20" width="250" height="110" rx="12" fill="#fff4e0" stroke="#FC9A04"/>
 <text x="545" y="50" text-anchor="middle" class="t1">Google（Gemini API）</text>
 <text x="545" y="76" text-anchor="middle" class="t2">キーで本人を確認し、生成して</text><text x="545" y="96" text-anchor="middle" class="t2">結果を返す。料金はキーの持ち主へ</text>
 <path d="M272 70 L414 70" stroke="#0D357A" stroke-width="2" marker-end="url(#a2)"/><text x="343" y="62" text-anchor="middle" class="t3">指示文・素材＋キー</text>
 <path d="M414 100 L278 100" stroke="#0D357A" stroke-width="2" marker-end="url(#a2)"/><text x="343" y="118" text-anchor="middle" class="t3">生成された素材</text>
 <rect x="420" y="150" width="250" height="60" rx="12" fill="#f3f5f9" stroke="#c4cad8" stroke-dasharray="5 4"/>
 <text x="545" y="176" text-anchor="middle" class="t2">このサイトの運営者・その他のサイト</text><text x="545" y="196" text-anchor="middle" class="t3">キーや作品は送られません（通信を遮断）</text>
 <path d="M272 180 L405 180" stroke="#c62828" stroke-width="2" stroke-dasharray="5 4"/><text x="343" y="172" text-anchor="middle" class="t3" fill="#c62828">✕</text>
</svg>`;

const transitionDiagram = (() => {
  const items = [
    ['なし（カット）', '<rect x="0" y="0" width="60" height="34" fill="#9fb0d6"/><rect x="60" y="0" width="60" height="34" fill="#FC9A04"/>'],
    ['フェード', '<defs><linearGradient id="gf"><stop offset="0" stop-color="#9fb0d6"/><stop offset="1" stop-color="#FC9A04"/></linearGradient></defs><rect width="120" height="34" fill="url(#gf)"/>'],
    ['スライド（左へ）', '<rect width="120" height="34" fill="#9fb0d6"/><rect x="50" width="70" height="34" fill="#FC9A04"/><path d="M44 17 h-20" stroke="#0D357A" stroke-width="2"/><path d="M28 12 l-6 5 6 5" fill="none" stroke="#0D357A" stroke-width="2"/>'],
    ['スライド（上へ）', '<rect width="120" height="34" fill="#9fb0d6"/><rect y="14" width="120" height="20" fill="#FC9A04"/><path d="M60 12 v-9" stroke="#0D357A" stroke-width="2"/>'],
    ['ワイプ', '<rect width="120" height="34" fill="#9fb0d6"/><rect width="64" height="34" fill="#FC9A04"/><path d="M64 0 v34" stroke="#0D357A" stroke-width="2"/>'],
    ['ズーム', '<rect width="120" height="34" fill="#9fb0d6"/><rect x="22" y="5" width="76" height="24" fill="#FC9A04" opacity="0.85"/>'],
  ];
  return `<div class="mini-grid">${items.map(([name, art]) => `<div><svg viewBox="0 0 120 34" class="mini">${art}</svg><span>${name}</span></div>`).join('')}</div>`;
})();

const motionDiagram = (() => {
  const frame = (inner) => `<svg viewBox="0 0 120 70" class="mini"><rect x="1" y="1" width="118" height="68" fill="#f3f5f9" stroke="#9fb0d6"/>${inner}</svg>`;
  const items = [
    ['動きなし', frame('<rect x="20" y="12" width="80" height="46" fill="#cfdaf0"/>')],
    ['ゆっくりズームイン', frame('<rect x="34" y="20" width="52" height="30" fill="none" stroke="#0D357A" stroke-dasharray="3 2"/><rect x="12" y="8" width="96" height="54" fill="none" stroke="#FC9A04" stroke-width="2"/><path d="M36 22 L16 10 M84 48 L104 60" stroke="#0D357A"/>')],
    ['ゆっくりズームアウト', frame('<rect x="12" y="8" width="96" height="54" fill="none" stroke="#0D357A" stroke-dasharray="3 2"/><rect x="34" y="20" width="52" height="30" fill="none" stroke="#FC9A04" stroke-width="2"/><path d="M16 10 L36 22 M104 60 L84 48" stroke="#0D357A"/>')],
    ['左へパン', frame('<rect x="30" y="12" width="70" height="46" fill="none" stroke="#FC9A04" stroke-width="2"/><path d="M60 35 h-34" stroke="#0D357A" stroke-width="2"/><path d="M32 30 l-6 5 6 5" fill="none" stroke="#0D357A" stroke-width="2"/>')],
    ['右へパン', frame('<rect x="20" y="12" width="70" height="46" fill="none" stroke="#FC9A04" stroke-width="2"/><path d="M60 35 h34" stroke="#0D357A" stroke-width="2"/><path d="M88 30 l6 5 -6 5" fill="none" stroke="#0D357A" stroke-width="2"/>')],
  ];
  return `<div class="mini-grid five">${items.map(([name, art]) => `<div>${art}<span>${name}</span></div>`).join('')}</div>`;
})();

const aspectDiagram = `<div class="mini-grid three">
 <div><svg viewBox="0 0 160 100" class="mini"><rect x="8" y="14" width="144" height="81" rx="4" fill="#e8eef9" stroke="#0D357A" stroke-width="2"/><text x="80" y="60" text-anchor="middle" class="t2">16:9</text></svg><span>横長：YouTube・研修・プレゼン</span></div>
 <div><svg viewBox="0 0 160 100" class="mini"><rect x="52" y="4" width="56" height="94" rx="4" fill="#fff4e0" stroke="#FC9A04" stroke-width="2"/><text x="80" y="56" text-anchor="middle" class="t2">9:16</text></svg><span>縦長：ショート・リール・ストーリー</span></div>
 <div><svg viewBox="0 0 160 100" class="mini"><rect x="35" y="5" width="90" height="90" rx="4" fill="#f3f5f9" stroke="#5f6987" stroke-width="2"/><text x="80" y="56" text-anchor="middle" class="t2">1:1</text></svg><span>正方形：SNS の投稿</span></div>
</div>`;

const timingDiagram = `<svg class="diagram" viewBox="0 0 680 150">
 <rect x="20" y="20" width="400" height="34" rx="6" fill="#d5def2" stroke="#0D357A"/><text x="30" y="42" class="t2">シーンの長さ（例：6.0 秒）</text>
 <rect x="440" y="20" width="220" height="34" rx="6" fill="#d5def2" stroke="#0D357A" opacity=".6"/><text x="450" y="42" class="t2">次のシーン</text>
 <rect x="40" y="66" width="340" height="30" rx="6" fill="#d3eedf" stroke="#1f8a4c"/><text x="50" y="86" class="t2">ナレーション（例：5.2 秒）</text>
 <path d="M20 108 h20" stroke="#0D357A" stroke-width="2"/><text x="10" y="126" class="t3">0.3 秒あけて話し始める</text>
 <path d="M380 108 h40" stroke="#0D357A" stroke-width="2"/><text x="330" y="126" class="t3">0.5 秒の余韻</text>
 <rect x="440" y="66" width="34" height="30" rx="6" fill="#fff4e0" stroke="#FC9A04"/><text x="482" y="86" class="t3">切り替え効果（0.6 秒）</text>
</svg>`;

const duckDiagram = `<svg class="diagram" viewBox="0 0 680 120">
 <path d="M20 90 C 40 30, 60 30, 80 30 L 180 30 C 190 30, 195 70, 205 70 L 395 70 C 405 70, 410 30, 420 30 L 600 30 C 620 30, 640 90, 660 90" fill="none" stroke="#FC9A04" stroke-width="3"/>
 <text x="22" y="22" class="t3">BGM の音量</text>
 <rect x="205" y="84" width="190" height="24" rx="6" fill="#d3eedf" stroke="#1f8a4c"/><text x="300" y="101" text-anchor="middle" class="t3">ナレーション中は約 35% に下げる</text>
 <text x="22" y="112" class="t3">フェードイン</text><text x="600" y="112" class="t3">フェードアウト</text>
</svg>`;

// ---------- content ----------
const pages = [];

pages.push(`<section class="cover">
 <div class="cover-brand"><img src="../../public/hunet-logo.png" alt="hunet"><span>vids</span></div>
 <h1>図解取扱説明書</h1>
 <p class="cover-sub">指示文から、ナレーション・映像・音楽つきの動画を。<br>ブラウザだけで完結する動画スタジオの使い方を、画面とともに説明します。</p>
 ${fig('editor', [], { maxH: 118 })}
 <div class="cover-meta">対象: hunet vids ${esc(VERSION)} ／ 公開版 https://hunet-vids.vercel.app ／ 作成日 ${DATE}</div>
</section>`);

pages.push('<!--TOC-->');

pages.push(
  page('はじめに', 'hunet vids でできること', '作りたい動画の内容を文章で伝えると、AI が絵コンテ（シーンの設計図）を作り、ナレーション・背景・BGM を用意します。あとは画面で整えて、MP4 に書き出すだけです。',
    flowDiagram([
      ['① 指示文', '作りたい動画を\n文章で入力'],
      ['② 絵コンテ', 'AI がシーンと\n台本を設計'],
      ['③ 素材の生成', 'ナレーション・画像\n動画・BGM'],
      ['④ 編集', '文字・順番・長さ\n効果・字幕'],
      ['⑤ 書き出し', 'MP4 を保存\n（透かしなし）'],
    ]) +
      table(['分類', 'できること'], [
        ['作成', '指示文と参考資料から絵コンテを作成。長さは 15 秒〜5 分、画面の形は横長・縦長・正方形'],
        ['AI 生成', 'ナレーション（30 種の声）、背景画像と画像の編集、音声つき動画、画像を動かす、人物が話す動画、BGM'],
        ['編集', 'シーンの追加・複製・並べ替え、テキストと登場アニメーション、切り替え効果、背景のズーム・パン、タイムライン、元に戻す'],
        ['音声・字幕', 'ナレーションに合わせた長さ調整、BGM の自動音量調整、ナレーションからの自動字幕、.srt 保存'],
        ['素材', '画像・動画・音声のアップロード、カメラ・画面の録画（プロンプターつき）'],
        ['書き出し・保存', 'MP4（1080p／720p）、ブラウザ内の自動保存、素材ごとのバックアップファイル'],
      ]) +
      box('info', 'キーがなくても、すべての操作を試せます', '「体験モード」では AI の代わりに仮の素材を作るので、費用はかかりません。まず体験モードで流れをつかみ、本番は自分の API キーで作る、という使い方がおすすめです。'),
  ),
);

pages.push(
  page('はじめに', '使う前に用意するもの', 'hunet vids はインストール不要のウェブアプリです。パソコンのブラウザで開くだけで使えます。',
    table(['必要なもの', '内容'], [
      ['パソコンとブラウザ', 'Google Chrome または Microsoft Edge（最新版）。MP4 の書き出しにブラウザの動画機能を使います。Safari とスマートフォンは動作確認の対象外です'],
      ['Gemini API キー', 'Google AI Studio で無料で作れる「利用の鍵」。台本とナレーションは無料枠で使えます'],
      ['課金の設定（必要な場合のみ）', '画像・動画・BGM の生成には、Google 側での課金設定が必要です。料金はキーの持ち主に請求されます'],
      ['（任意）カメラ・マイク', '自分を撮影するときや、画面を録画するときに使います'],
    ]) +
      h3('この説明書で使う言葉') +
      table(['言葉', '意味'], [
        ['絵コンテ', '動画の設計図。シーンごとに、見出し・ナレーション原稿・背景の説明・長さが書かれたもの'],
        ['シーン', '動画を区切った 1 場面。背景 1 つと、文字・ナレーションを持ちます'],
        ['ナレーション', 'AI が原稿を読み上げた音声'],
        ['BGM', '動画全体に流れる背景音楽'],
        ['プロンプト', 'AI への指示文。映像や音楽の内容を文章で説明したもの'],
        ['書き出し', '編集した内容を 1 本の動画ファイル（MP4）にすること'],
        ['体験モード', 'API キーなしで操作を試すモード。AI の代わりに仮の素材を作ります'],
      ]),
  ),
);

pages.push(
  page('API キー', 'API キーは「自分専用の利用の鍵」です', 'hunet vids は、あなたの API キーを使って Google の AI に生成を依頼します。キーと作品はあなたのブラウザの中にだけ保存され、このサイトの運営者には送られません（ページを開いたときの一般的なアクセス記録は、配信サービス側に残ります）。Google には、生成に必要な指示文と素材だけを送ります。',
    dataFlowDiagram +
      table(['よくある疑問', '答え'], [
        ['料金は誰に請求されますか', 'キーを作った Google アカウント（の課金設定）に請求されます。友人が使う場合は、友人自身のキーを使います'],
        ['キーはどこに保存されますか', 'このブラウザの保存領域です。Google の API にだけ送られます。設定画面の「キーを削除」で消せます'],
        ['作った動画はどこにありますか', 'このブラウザの中です。サーバーには保存しません'],
        ['Google に送られるものは', '生成・編集を頼むときの指示文と、その生成に使う素材です（参考資料の文章、「画像を指示で編集」「画像を動かす」で使う画像）。書き出しや保存のために送ることはありません'],
        ['Google アカウントのパスワードとは違いますか', 'まったく別のものです。パスワードは絶対に入力しないでください'],
      ]) +
      box('warn', '共有のパソコンでは使い終わったらキーを削除', 'キーはブラウザに残り、次回も入力なしで使えます。共有のパソコンや人に貸すパソコンでは、使い終わったら設定画面の「キーを削除」を押してください。'),
  ),
);

pages.push(
  page('API キー', 'Google AI Studio でキーを作る', 'キーは Google AI Studio（Google の AI 開発者向けサイト）で作ります。Google アカウントがあれば、数分で作れます。',
    steps([
      'ブラウザで **https://aistudio.google.com/apikey** を開き、Google アカウントでログインします。',
      '「API キーを作成」（Create API key）などのボタンを押します。プロジェクトを選ぶ画面が出たら、通常は既定のままで構いません。',
      '表示された **AIza で始まる文字列** がキーです。コピーボタンを押してコピーします。',
      'hunet vids の設定画面に貼り付けます（次のページ）。',
    ]) +
      h3('画像・動画・BGM も使う場合：課金の設定') +
      steps([
        'AI Studio のメニューから、課金（Billing）や料金プランの設定を開きます（2026 年 10 月時点の名称。変わることがあります）。',
        '画面の案内に従って、支払い方法を登録した請求先アカウントを、キーのプロジェクトに結び付けます。',
        '登録が終わると、画像・動画・BGM の生成ができるようになります。Google Cloud の予算アラート（使いすぎの通知）も設定しておくと安心です。',
      ]) +
      box('info', '無料枠でできること', 'Google の公開情報（2026 年 10 月時点）では、台本（絵コンテ）の作成、文章の書き換え、ナレーションは無料枠でも使えます。無料枠には回数の上限があり、超えると「利用上限に達しました（429）」と表示されます。') +
      box('warn', 'AI Studio の画面は変わることがあります', 'ボタン名や場所は Google の更新で変わることがあります。見つからないときは AI Studio のヘルプを確認してください。この説明書には Google のサイトの画面は掲載していません。'),
  ),
);

pages.push(
  page('API キー', 'キーを設定する（最初の画面）', '初めて開くと、キーの設定画面が表示されます。',
    cols(
      fig('setup', [['link', 1, 'l'], ['input', 2, 'l'], ['save', 3, 'l'], ['demo', 4, 'r']]),
      legend([
        [1, 'キーを取得するページ', 'Google AI Studio のキー作成ページを新しいタブで開きます。'],
        [2, 'API キーの入力欄', 'コピーしたキーを貼り付けます（⌘V）。文字は伏せて表示されます。'],
        [3, '確認して保存', 'Google にキーが正しいかを問い合わせてから保存します。生成はまだ行いません。'],
        [4, 'キーなしで体験する', '体験モードで始めます。あとからいつでもキーを設定できます。'],
      ]),
      '1.25fr 1fr',
    ) +
      box('info', 'この説明書はアプリから開けます', '設定画面の「図解取扱説明書（PDF）」や、一覧画面の「使い方（PDF）」から、いつでもこの説明書を開けます。') +
      box('info', 'キーを変更・削除するには', '一覧画面の右上「API キー設定」を押すと、この画面に戻ります。新しいキーを入れて保存するか、下部の「キーを削除」で消します。') +
      box('warn', 'エラーが出たとき', '「API キーが正しくありません」と出たら、キーを全部コピーできているか（前後の空白や欠け）を確認してください。詳しくは「困ったとき」のページを参照してください。'),
  ),
);

pages.push(
  page('はじめに', '体験モードで、まず流れをつかむ', '体験モードは、AI の代わりにパソコンの中で仮の素材を作ります。Google には一切通信せず、費用もかかりません。',
    table(['体験モードで作られるもの', '内容'], [
      ['絵コンテ', '3 シーンの決まった例（入力した題名が見出しに入ります）'],
      ['ナレーション', '話し声の代わりの音（長さは原稿の文字数に合わせます）'],
      ['画像・動画', '色の付いた図形の画像・動画（下に「DEMO」と表示）'],
      ['BGM', '和音のループ'],
      ['「＋ AI で追加」のシーン', '決まった例の文章（見出しは入力内容と一致しません）'],
    ]) +
      p('編集・再生・書き出し・保存は本番と同じように動きます。書き出した MP4 も本物の動画ファイルです。') +
      box('info', '本番に切り替えるには', '一覧画面の「API キー設定」でキーを入れて保存します。体験モードで作ったプロジェクトはそのまま残り、背景やナレーションを本物の AI で作り直せます。') +
      box('info', '友人に紹介するときも便利です', 'キーを持っていない人でも、体験モードで操作感を確かめられます。'),
  ),
);

pages.push(
  page('作成', '一覧画面の見方', 'キーを設定すると、動画の作成と一覧の画面が開きます。ここで作りたい動画の条件を指定します。',
    fig('home', [['settings', 1, 'l'], ['open', 2, 'l'], ['prompt', 3, 'l'], ['samples', 4, 'l'], ['reference', 5, 'l'], ['length', 6, 'l'], ['aspect', 7, 'l'], ['visual', 8, 'l'], ['theme', 9, 'l'], ['voice', 10, 'l'], ['language', 11, 'l'], ['tone', 12, 'l'], ['auto', 13, 'l'], ['create', 14, 'l'], ['blank', 15, 'r'], ['guide', 16, 'l']], { maxH: 128 }) +
      `<div class="cols3">${legend([
        [1, 'API キー設定', 'キーの変更・削除'],
        [2, 'ファイルから開く', 'バックアップを読み込む'],
        [3, '指示文', '作りたい動画の内容'],
        [4, '例文', '押すと指示文に入ります'],
        [5, '参考資料', '資料の文章を元に作る'],
      ])}${legend([
        [6, '長さ', '15 秒〜5 分'],
        [7, '画面の形', '横長・縦長・正方形'],
        [8, '背景の素材', '画像中心＋要所で動画／すべて画像／すべて動画'],
        [9, 'テーマ', '文字と背景の色の組み合わせ'],
        [10, 'ナレーションの声', '30 種類から選択'],
      ])}${legend([
        [11, '言語', '台本と字幕の言語'],
        [12, '雰囲気・トーン', '例: 明るく親しみやすく'],
        [13, '自動で生成するもの', 'ナレーション・背景・BGM'],
        [14, 'AI で絵コンテを作成', '作成を開始'],
        [15, '白紙から作る', 'AI を使わず 1 から作る'],
        [16, '使い方（PDF）', 'この説明書を開く'],
      ])}</div>`,
  ),
);

pages.push(
  page('作成', '伝わる指示文の書き方', '指示文は、人に動画制作を頼むときのように書くのがコツです。「誰に」「何を」「どんな雰囲気で」の 3 点を入れると、絵コンテの質が上がります。',
    table(['書き方', '例'], [
      ['短すぎる例', '「コーヒーの動画」'],
      ['よい例', '「カフェ初心者向けに、ハンドドリップでおいしく淹れる 3 つのコツを、明るく親しみやすく 1 分で紹介する動画」'],
      ['社内向けの例', '「新入社員向けに、経費精算の手順を 5 ステップで説明する。最後に問い合わせ先を案内する」'],
      ['広告の例', '「新商品のコーヒー豆『朝霧ブレンド』の 30 秒広告。高級感があり落ち着いた雰囲気。最後に商品名を大きく」'],
    ]) +
      h3('参考資料を使う') +
      fig('home-reference', [['area', 1, 'r'], ['file', 2, 'r']]) +
      `<div class="cols2">${legend([
        [1, '文章を貼り付ける', '企画書・マニュアル・記事などの文章を貼ると、その内容に沿って台本を作ります（数字や事実は資料のものを使うよう AI に指示しています）。資料の文章は Google の AI に送られます。'],
      ])}${legend([
        [2, 'テキストファイルを読み込む', '.txt や .md などの文字のファイル（2MB まで）を読み込めます。AI に渡すのは先頭の約 3 万文字までです。PDF や Word は、文章をコピーして貼り付けてください。'],
      ])}</div>` +
      box('info', '長さの目安', '1 シーンはおよそ 4〜8 秒です。30 秒なら 4〜6 シーン、1 分なら 8〜12 シーンほどになります。ナレーションは日本語で 1 秒あたり約 7 文字を目安に作られます。'),
  ),
);

pages.push(
  page('作成', '絵コンテを作る', '「AI で絵コンテを作成」を押すと、数秒〜数十秒で編集画面が開きます。続いて、チェックを入れた素材の生成が自動で始まります。',
    cols(
      fig('jobs', [], { caption: '右下に生成の進み具合が表示されます' }),
      h3('自動で生成されるもの') +
        table(['チェック', '生成されるもの', '費用'], [
          ['ナレーション', '全シーンの読み上げ音声。長さに合わせてシーンも伸びます', '無料枠あり'],
          ['背景の画像・動画', '各シーンの背景。絵コンテで「動画」と決めたシーンは動画、ほかは画像', '有料'],
          ['BGM', '雰囲気に合った 30 秒の曲（繰り返し再生）', '有料'],
        ]) +
        p('生成は **同時に 2 件まで** 行い、残りは「順番待ち」になります。同じものを二重に頼むことはありません。') +
        p('生成中も編集できます。終わったものから画面に反映されます。'),
      '0.7fr 1.3fr',
    ) +
      box('warn', '有料の生成について', 'キーを使う本番では、「背景の画像・動画」と「BGM」のチェックは最初は外れています。チェックを入れると、作成ボタンの上に有料生成の上限の目安が表示されます。金額を確認してから「AI で絵コンテを作成」を押してください。') +
      box('info', '中止したいとき', '生成中のカードの「中止」を押すと、画像・動画・BGM は Google 側にも取り消しを依頼します（取り消しが間に合わず課金されることがあります）。台本・ナレーションは通信を打ち切ります。エラーになったカードは「×」で閉じられます。'),
  ),
);

pages.push(
  page('編集', '編集画面の全体', '編集画面は、上部のバー、左のシーン一覧、中央のプレビュー、右の編集パネル、下のタイムラインでできています。',
    fig('editor', [['back', 1, 'l'], ['title', 2], ['undo', 3], ['bulk', 4], ['export', 5, 'r'], ['scenes', 6, 'c'], ['preview', 7], ['player', 8, 'l'], ['inspector', 9, 'c'], ['timeline', 10, 'l']], { maxH: 140 }) +
      `<div class="cols2">${legend([
        [1, '一覧へ戻る', '編集内容は自動で保存されます'],
        [2, '動画のタイトル', 'クリックして変更'],
        [3, '戻す／やり直す', '⌘Z／⇧⌘Z でも操作できます'],
        [4, '一括生成', '未生成のナレーション・背景をまとめて作成'],
        [5, '書き出し', 'MP4 を作ります'],
      ])}${legend([
        [6, 'シーン一覧', '選ぶ・並べ替える・複製する'],
        [7, 'プレビュー', '文字はドラッグで移動できます'],
        [8, '再生バー', '再生・停止と再生位置'],
        [9, '編集パネル', 'シーン・テキスト・音声・素材・BGM・設定'],
        [10, 'タイムライン', '全体の時間の流れ'],
      ])}</div>`,
  ),
);

pages.push(
  page('編集', 'シーンを並べる・増やす', '左のシーン一覧で、動画の構成を整えます。上から順に再生されます。',
    cols(
      fig('scene-list', [['active', 1, 'r'], ['dup', 2, 'l'], ['add', 3, 'l'], ['ai', 4, 'r']], { crop: [0, bounds['scene-list'].boxes.ai.y + bounds['scene-list'].boxes.ai.h + 14], maxH: 150 }),
      legend([
        [1, '選択中のシーン', 'オレンジの枠が付きます。クリックで選ぶと、プレビューと右の編集パネルがそのシーンに切り替わります。'],
        [2, '複製・削除', '選択中のシーンの下に表示されます。削除しても「戻す」で元に戻せます。'],
        [3, '＋ シーン', '選択中のシーンの後ろに、空のシーンを追加します。'],
        [4, '＋ AI で追加', '追加したい内容（例：料金プランの比較）を入力すると、前後のシーンと同じ雰囲気でシーンを 1 つ作ります。'],
      ]) +
        box('info', '並べ替え', 'シーンの縮小画像をドラッグして、別のシーンの上で離すと、その位置に移動します。') +
        box('info', 'シーンの長さ', 'タイムラインのシーンの右端をドラッグするか、「シーン」タブの「長さ（秒）」で変更します。'),
      '0.55fr 1.45fr',
    ),
  ),
);

pages.push(
  page('編集', 'プレビューで確かめる', '中央のプレビューは、書き出す動画と同じ見た目です。文字の位置もここで直接調整できます。',
    fig('player', [['play', 1, 'l'], ['time', 2], ['seek', 3]]) +
      legend([
        [1, '再生／停止', 'スペースキーでも切り替えられます（文字入力中を除く）。プレビューをダブルクリックしても再生します。'],
        [2, '時刻', '現在の位置／動画全体の長さ'],
        [3, '再生位置', 'つまみを動かすと、その位置の画面を表示します。'],
      ]) +
      cols(
        fig('text-drag', [], { caption: '選んだ文字には青い点線の枠が付きます' }),
        h3('文字をドラッグして動かす') +
          steps(['再生を止めます。', 'プレビュー上の文字をクリックします（右のパネルが「テキスト」タブに切り替わります）。', 'そのままドラッグして、好きな位置で離します。']) +
          p('ナレーションの字幕は、設定タブで位置（上・中央・下）を選びます。'),
      ),
  ),
);

pages.push(
  page('シーンタブ', 'シーンの長さ・切り替え・動き', '右の編集パネルの「シーン」タブでは、選択中のシーンの基本を設定します。',
    cols(
      fig('panel-scene', [['duration', 1, 'l'], ['fit', 2, 'r'], ['transition', 3, 'l'], ['motion', 4, 'r'], ['bg', 5, 'l']], { crop: [0, 470], maxH: 92 }),
      legend([
        [1, '長さ（秒）', 'シーンを表示する秒数。'],
        [2, 'ナレーションに合わせる', 'ナレーションが収まる最短の長さにします（話し始め 0.3 秒＋余韻 0.5 秒）。'],
        [3, '前のシーンからの切り替え', '前のシーンからこのシーンへ移るときの効果（0.6 秒）。'],
        [4, '背景の動き', '静止画の背景をゆっくり動かして、映像らしさを出します。'],
        [5, '背景', '単色・グラデーション・画像・動画。画像と動画は「素材」タブか AI 生成で設定します。'],
      ]),
      '0.8fr 1.2fr',
    ) +
      h3('切り替え効果') +
      transitionDiagram +
      h3('背景の動き') +
      motionDiagram,
  ),
);

pages.push(
  page('シーンタブ', 'AI で背景を作る', '「シーン」タブの下半分では、背景の画像や動画を AI で作ります。絵コンテの作成時に、映像の説明はすでに入っています。',
    cols(
      fig('panel-scene', [['prompt', 1, 'l'], ['image', 2, 'r'], ['video', 3, 'r'], ['animate', 4, 'r'], ['edit', 5, 'l']], { crop: [bounds['panel-scene'].boxes.prompt.y - 30, bounds['panel-scene'].boxes.presenter.y - 20], maxH: 128 }),
      legend([
        [1, '映像の説明', '背景の内容を文章で説明します。英語のほうが意図どおりになりやすく、文字を入れない指示がおすすめです（文字は「テキスト」タブで重ねます）。'],
        [2, '画像を生成', '約 $0.05／枚。数秒〜数十秒でできます。'],
        [3, '音声つき動画を生成', '長さ（4〜10 秒）と画質を選びます。720p で 1 秒あたり約 $0.10（1080p の料金は Google が公表していないため、画面では 720p の料金で表示します）。1〜数分かかります。セリフや効果音も説明に書けば入ります。'],
        [4, '画像を動かす', 'チェックすると、いまの背景画像を最初のコマにして動画を作ります。'],
        [5, '画像を指示で編集', '「背景を消して白に」「夜の景色に」のように、いまの画像を作り替えます（約 $0.05）。'],
      ]) +
      box('warn', '画像を Google に送る操作', '「画像を動かす」と「画像を指示で編集」は、いまの背景画像を Google の AI に送って作り替えます。人に見せたくない画像では使わないでください。') +
      legend([
      ]),
      '0.85fr 1.15fr',
    ) +
      table(['映像の説明の例', '仕上がり'], [
        ['aerial view of a misty forest at sunrise, cinematic', '朝もやの森の空撮'],
        ['a barista pouring hot water over coffee, close-up, warm light', 'コーヒーを淹れる手元'],
        ['flat illustration of a calendar and documents, pastel colors', 'イラスト調の資料'],
      ]) +
      box('warn', '動画の形について', '動画を作れるのは横長（16:9）と縦長（9:16）です。正方形の動画では横長で作り、中央を切り抜いて使います。') +
      box('info', '動画の音', 'ナレーションがあるシーンでは、AI 動画の音は最初は 0% にしています。動画の音を使いたいときは、背景の「動画の音量」を上げてください。'),
  ),
);

pages.push(
  page('シーンタブ', '人物が話す動画（アバター風）', 'ナレーション原稿を、動画の中の人物がセリフとして話す動画を作れます。研修や説明動画の「話し手」に使えます。',
    cols(
      fig('panel-scene', [['presenter', 1, 'l']], { crop: [bounds['panel-scene'].boxes.presenter.y - 20, Math.min(bounds['panel-scene'].h, bounds['panel-scene'].boxes.presenter.y + 330)] }),
      steps([
        '「音声」タブで、話してほしい原稿を確認します（これがセリフになります）。',
        '「人物と場所の説明」に、人物と背景を書きます。例: **a Japanese woman in her 30s in a bright office**',
        '「話す人物の動画を生成」を押します（長さと画質は上の動画の設定を使います）。',
        'できあがると、このシーンは**動画の人物の声**を使い、AI ナレーションは外れます。字幕は原稿から作られます。',
      ]),
      '0.9fr 1.1fr',
    ) +
      box('warn', '注意', '日本語のセリフは、英語より不自然になることがあります。1 本の動画は最大 10 秒程度なので、セリフは短めにしてください。実在の人物に似せる指示はしないでください。') +
      box('info', '元に戻すには', '「ナレーション音声に戻す」を押すと、AI ナレーションを使う設定に戻り、人物動画の音は 0% になります（声が二重にならないように）。ナレーションは「音声」タブで改めて生成してください。動画そのものを外すときは、背景を差し替えます。'),
  ),
);

pages.push(
  page('テキストタブ', '文字を入れる', '「テキスト」タブでは、見出しや説明文などの文字をシーンに重ねます。1 シーンに何個でも置けます。',
    cols(
      fig('panel-text', [['add', 1, 'l'], ['text', 2, 'l'], ['size', 3, 'l'], ['anim', 4, 'r'], ['timing', 5, 'l'], ['del', 6, 'r']], { crop: [0, 560], maxH: 110 }),
      legend([
        [1, '文字の追加', '見出し・本文・ラベル（色付きの札）・下部テロップの 4 種類のひな形があります。'],
        [2, '文字の内容', '改行もそのまま反映されます。'],
        [3, '大きさ・色・背景', '背景にチェックすると、文字の後ろに色の帯が付きます。'],
        [4, '太さ・揃え・登場', '登場のしかた（下の表）を選びます。'],
        [5, '表示する時間', 'シーンの始まりから何秒後に出して、何秒後に消すか。空欄なら最後まで表示します。'],
        [6, '削除', 'その文字を消します。'],
      ]),
      '0.8fr 1.2fr',
    ) +
      table(['登場', '動き'], [
        ['なし', 'すぐに表示'],
        ['フェード', 'ふわっと現れる'],
        ['下から', '少し下から浮かび上がる'],
        ['ポップ', '小さく弾むように現れる'],
        ['タイプ', '1 文字ずつ打ち出される'],
      ]) +
      box('info', '配置のコツ', '「配置」で上・中央・下にすばやく移動できます。細かい位置はプレビュー上でドラッグします。字幕と重ならないよう、見出しは画面の上半分に置くと見やすくなります。'),
  ),
);

pages.push(
  page('音声タブ', 'ナレーションを作る', '「音声」タブでは、シーンの原稿を AI の声で読み上げます。台本とナレーションは無料枠でも使えます。',
    cols(
      fig('panel-voice', [['text', 1, 'l'], ['rewrite', 2, 'l'], ['voice', 3, 'l'], ['style', 4, 'l'], ['make', 5, 'r'], ['audio', 6, 'r'], ['bulk', 7, 'l']], { crop: [0, bounds['panel-voice'].boxes.bulk.y + 110], maxH: 128 }),
      legend([
        [1, '読み上げる文章', '原稿を直すと、音声は作り直しが必要になります。'],
        [2, 'AI で書き換え', '短く・わかりやすく・丁寧に・楽しく、の 4 種類。'],
        [3, '声', '30 種類。よく使う声には、名前の横に特徴を書いています。'],
        [4, '話し方', '「明るく元気に」など自由に指示できます。候補も選べます。'],
        [5, 'ナレーションを生成', '数秒でできます。シーンが短いときは自動で伸ばします。'],
        [6, '試聴', 'できた音声をその場で再生します。'],
        [7, 'まとめて操作', '声と話し方を全シーンにそろえる、未生成分をまとめて作る。'],
      ]),
      '0.75fr 1.25fr',
    ) +
      table(['話し方の工夫', '書き方'], [
        ['間を入れる', '原稿の中に `<short pause>` と書く'],
        ['笑いを入れる', '原稿の中に `<laugh>` と書く'],
        ['雰囲気を変える', '話し方の欄に「ニュースのように明瞭に」「ささやくように」など'],
      ]) +
      box('info', '声の選び方', '最初は「Kore（落ち着いた女性）」「Puck（元気な男性）」「Charon（情報を伝える男性）」がおすすめです。全シーンで声をそろえると聞きやすくなります。'),
  ),
);

pages.push(
  page('素材タブ', '手持ちの画像・動画・音楽を使う', '「素材」タブには、アップロード・録画した素材と、AI で作った画像・動画・BGM が並びます（ナレーション音声は除く）。どのプロジェクトからも使えます。',
    cols(
      fig('panel-media', [['upload', 1, 'l'], ['record', 2, 'r'], ['filter', 3, 'l'], ['grid', 4, 'l']], { crop: [0, bounds['panel-media'].boxes.grid.y + bounds['panel-media'].boxes.grid.h + 30], maxH: 110 }),
      legend([
        [1, 'ファイルを選択', '画像・動画・音声をまとめて選べます。'],
        [2, 'カメラ・画面を録画', '録画画面を開きます（次のページ）。'],
        [3, '種類の切り替え', '「画像・動画」と「音楽・音声」を切り替えます。'],
        [4, '素材の一覧', '画像・動画をクリックすると、選択中のシーンの背景になります。音楽をクリックすると BGM になります。'],
      ]),
      '0.8fr 1.2fr',
    ) +
      table(['素材', '使える形式の例', '使い方'], [
        ['画像', 'PNG・JPEG・GIF・WebP', 'シーンの背景（画面いっぱい／全体を表示）'],
        ['動画', 'MP4・WebM・MOV（ブラウザが再生できるもの）', 'シーンの背景。選ぶとシーンが動画の長さまで伸びます。シーンが動画より長いと最後のコマで止まります（「繰り返す」にチェックで繰り返し再生）'],
        ['音声', 'MP3・WAV・M4A・OGG', 'BGM'],
      ], 'nowrap1') +
      box('warn', '権利に注意', '他人が作った写真・動画・音楽を使うときは、利用の許可があるかを確認してください。'),
  ),
);

pages.push(
  page('素材タブ', 'カメラや画面を録画する', '自分の解説やパソコンの操作画面を、その場で録画して素材にできます。録画はブラウザの中で行われ、どこにも送られません。',
    cols(
      fig('recorder', [['modes', 1, 'l'], ['preview', 2, 'c'], ['prompter', 3, 'l'], ['start', 4, 'r']], { caption: '画面は説明用の試験映像です' }),
      legend([
        [1, '録画するもの', 'カメラ／画面／画面＋カメラ（右下に丸い顔のワイプ）。選んでから「準備する」を押します。'],
        [2, '確認用の映像', '実際に録画される映像です。'],
        [3, 'プロンプター', '原稿を画面上部に表示します（録画には映りません）。選択中のシーンのナレーションが最初から入っています。'],
        [4, '録画開始／停止して保存', '停止すると素材に保存され、選択中のシーンの背景になります。'],
      ]),
      '1.15fr 0.85fr',
    ) +
      steps([
        '「素材」タブの「● カメラ・画面を録画」を押します。',
        '録画するものを選び、「準備する」を押します。ブラウザがカメラ・マイク・画面の利用許可を求めたら「許可」を押します。',
        '画面を録画する場合は、共有する画面やウィンドウを選びます。',
        '「● 録画開始」で録画、「■ 停止して保存」で終了します。ブラウザの「共有を停止」を押しても終了・保存されます。',
      ]) +
      box('warn', '許可を求められないとき', 'アドレスバー左のアイコンから、カメラ・マイクの許可を確認してください。macOS では「システム設定 → プライバシーとセキュリティ」でブラウザに画面収録の許可が必要な場合があります。'),
  ),
);

pages.push(
  page('BGM タブ', 'BGM を付ける', '「BGM」タブでは、動画全体に流れる音楽を AI で作るか、手持ちの曲を設定します。',
    cols(
      fig('panel-music', [['prompt', 1, 'l'], ['kind', 2, 'l'], ['make', 3, 'r'], ['volume', 4, 'l'], ['fade', 5, 'l'], ['duck', 6, 'l']], { crop: [0, bounds['panel-music'].boxes.duck.y + 90], maxH: 120 }),
      legend([
        [1, '曲の雰囲気', 'ジャンル・気分・テンポを書きます。下の候補を押しても入ります。歌のない曲になるよう自動で指示します。'],
        [2, '長さ', '30 秒のループ素材（約 $0.04）か、2〜3 分の曲（約 $0.08）。'],
        [3, 'BGM を生成', '数十秒〜1 分ほどかかります。'],
        [4, '音量', '初期値は 35%。ナレーションが聞き取りやすい大きさにします。'],
        [5, 'フェードイン・アウト', '始まりと終わりで音量をなめらかに上げ下げします。'],
        [6, 'ナレーション中は BGM を小さくする', 'ナレーションが流れる間だけ自動で音量を下げます（下の図）。'],
      ]),
      '0.8fr 1.2fr',
    ) +
      duckDiagram +
      box('info', '曲の短さは気にしなくて大丈夫', '動画より短い曲は、自動で繰り返し再生します。手持ちの曲を使うときは「素材」タブでアップロードして、「音楽・音声」からクリックします。'),
  ),
);

pages.push(
  page('設定タブ', '画面の形・テーマ・字幕', '「設定」タブでは、動画全体に関わる設定を変えます。',
    cols(
      fig('panel-settings', [['aspect', 1, 'l'], ['theme', 2, 'l'], ['captions', 3, 'l'], ['srt', 4, 'r'], ['add', 5, 'r']], { crop: [0, bounds['panel-settings'].boxes.add.y + 60], maxH: 92 }),
      legend([
        [1, '画面の形', 'あとから変えても、文字の大きさは自動で調整されます。'],
        [2, 'テーマ', '文字と背景の色をまとめて切り替えます（自分で変えた色はそのまま）。'],
        [3, '字幕', 'ナレーションの原稿から自動で作ります。位置・文字色・帯・大きさを選べます。'],
        [4, '字幕ファイルを保存', 'YouTube などに字幕だけを登録するための .srt ファイル。'],
        [5, 'シーンの追加', '最後に空のシーンを足します。'],
      ]),
      '0.8fr 1.2fr',
    ) +
      aspectDiagram +
      fig('editor-portrait', [], { caption: '縦長（9:16）に切り替えた編集画面', maxH: 56 }),
  ),
);

pages.push(
  page('編集', 'タイムラインの見方', '画面下のタイムラインには、シーン・ナレーション・BGM・字幕の並びが時間に沿って表示されます。',
    fig('timeline', [['ruler', 1, 'c'], ['scene', 2, 'c'], ['handle', 3, 'tr'], ['voice', 4, 'c'], ['music', 5, 'c'], ['caption', 6, 'c'], ['zoom', 7, 'l']]) +
      `<div class="cols2">${legend([
        [1, '目盛り', 'クリックした時刻に移動します。'],
        [2, 'シーン', 'クリックで選択。オレンジの枠が選択中です。'],
        [3, '長さのつまみ', '右端をドラッグして長さを変えます。'],
        [4, 'ナレーション', '話している時間です。'],
      ])}${legend([
        [5, 'BGM', '動画の最初から最後まで流れます。'],
        [6, '字幕', '原稿を短く区切った表示単位です。'],
        [7, '拡大・縮小', '細かく調整したいときに拡大します。'],
      ])}</div>` +
      h3('シーンとナレーションの時間の関係') +
      timingDiagram +
      p('ナレーションはシーンの開始 0.3 秒後から始まります。ナレーションを作ると、収まるようにシーンが自動で伸びます（短くはなりません）。字幕は原稿の文字数の割合で時間を割り振ります。'),
  ),
);

pages.push(
  page('書き出し', 'MP4 に書き出す', '右上の「書き出し」から、動画ファイルを作ります。処理はブラウザの中で行われ、どこにもアップロードされません。透かしは入りません。',
    cols(
      fig('export', [['quality', 1, 'l'], ['fps', 2, 'l'], ['start', 3, 'l'], ['srt', 4, 'r']]) + fig('export-progress', [], { caption: '書き出し中の表示。「中止」で止められます' }),
      fig('export-done', [['video', 5, 'c'], ['save', 6, 'l']], { maxH: 92 }),
    ) +
      `<div class="cols2">${legend([
        [1, '画質', 'フル HD か HD。横長は 1920×1080／1280×720、縦長は 1080×1920／720×1280、正方形は 1080×1080／720×720 です。'],
        [2, 'フレームレート', '30fps が標準。動きの多い動画は 60fps、映画風なら 24fps。'],
        [3, '書き出し開始', '1 分の動画で数十秒〜数分かかります（パソコンの性能によります）。'],
      ])}${legend([
        [4, '字幕 .srt を保存', '字幕だけのファイルを保存します。'],
        [5, '確認用の再生', 'できあがった動画をその場で確認できます。'],
        [6, 'MP4 を保存', 'パソコンに保存します（「ダウンロード」フォルダなど）。'],
      ])}</div>` +
      box('warn', '音声がまだのシーンがあるとき', '原稿はあるのに音声を作っていないシーンがあると、黄色の注意が出ます。その部分は無音になるので、先にナレーションを生成してください。'),
  ),
);

pages.push(
  page('保存', '保存・バックアップ・別のパソコンへ', '編集内容は自動で保存されます。ただし保存先はこのブラウザの中なので、大事な動画はバックアップを取ってください。',
    cols(
      fig('project-card', [['save', 1, 'l'], ['del', 2, 'r']]),
      legend([
        [1, 'ファイルに保存', 'プロジェクトと素材をまとめて 1 つのファイル（.hunetvids）に保存します。'],
        [2, '削除', 'プロジェクトを削除します（元に戻せません）。素材は素材一覧に残ります。'],
      ]) +
        h3('別のパソコン・ブラウザで続きを作る') +
        steps(['元のパソコンで「ファイルに保存」を押します。', 'できたファイルを、別のパソコンへコピーします。', '別のパソコンで hunet vids を開き、一覧画面の「ファイルから開く」で読み込みます（読み込むたびに新しい複製として追加されます）。']),
      '0.45fr 1.55fr',
    ) +
      table(['こんなとき', '保存された内容は'], [
        ['ブラウザを閉じた・パソコンを再起動した', '残ります'],
        ['別のブラウザ（Chrome → Edge）で開いた', '見えません（ブラウザごとに別の保存場所です）'],
        ['ブラウザの「閲覧履歴データの削除」でサイトデータ・Cookie を消した', '消えます'],
        ['シークレットウィンドウで使った', 'ウィンドウを閉じると消えます'],
        ['パソコンの空き容量が非常に少ない', 'ブラウザが自動で消すことがあります（バックアップをおすすめします）'],
      ]) +
      box('warn', '書き出した MP4 とバックアップは別物です', 'MP4 は完成した動画で、あとから編集はできません。編集を続けたいときは .hunetvids を保存してください。サイトデータを消すと、保存した API キーも消えます。'),
  ),
);

pages.push(
  page('料金', '料金の目安と節約のコツ', '料金は Google から、キーの持ち主へ請求されます。Google の公開価格（ai.google.dev/gemini-api/docs/pricing、2026 年 10 月 13 日時点）に基づく目安です。',
    table(['生成するもの', '目安', '無料枠'], [
      ['絵コンテ・文章の書き換え', 'ごく少額（通常は 1 回数円以下。長い参考資料を貼ると増えます）', 'あり'],
      ['ナレーション', 'ごく少額', 'あり'],
      ['画像（2K）・画像の編集', '1 枚 約 $0.05', 'なし'],
      ['動画（720p）・人物動画', '1 秒 約 $0.10（8 秒で約 $0.80）。1080p は料金未公表', 'なし'],
      ['BGM', '30 秒 $0.04 ／ 1 曲 $0.08', 'なし'],
    ]) +
      h3('計算例：30 秒・5 シーンの動画') +
      table(['内訳', '費用の目安'], [
        ['絵コンテとナレーション 5 シーン', 'ほぼ無料（無料枠内）'],
        ['背景：画像 3 枚', '約 $0.15'],
        ['背景：動画 2 本（各 8 秒）', '約 $1.60'],
        ['BGM（30 秒）', '約 $0.04'],
        ['**合計**', '**約 $1.79**（作り直した分は追加でかかります）'],
      ]) +
      p('作成画面に表示される目安は「上限」です。たとえば 30 秒・画像中心では、動画を最大 3 本・画像 2 枚・BGM ありとして約 $2.54 と表示されます。') +
      h3('節約のコツ') +
      steps([
        'まず**体験モード**や画像だけで構成を固め、最後に必要なシーンだけを動画にします。',
        '動画は 1 本ずつ作って確認します。「背景を一括生成」の前には費用の確認が出ます。',
        '画像の背景でも「背景の動き（ズーム・パン）」で十分に動きが出ます。',
        'Google Cloud の請求設定で予算アラートを設定し、使いすぎに気づけるようにします。',
      ]) +
      box('warn', '料金は変わることがあります', '最新の料金は Google の公式ページ（ai.google.dev/gemini-api/docs/pricing）と AI Studio の請求画面で確認してください。'),
  ),
);

pages.push(
  page('困ったとき', 'エラーが表示されたら', 'エラーは日本語の対処法を表示します。多くの場合、Google からの元のメッセージ（英語）も並べて表示します。',
    cols(fig('error-key', [['error', 1, 'l']], { maxH: 72 }), legend([
        [1, 'キーの確認で失敗した例', '設定画面の入力欄の下に、原因と対処が表示されます。'],
        [2, '生成で失敗した例', '作成画面や生成中のカードに、日本語の対処法と Google からの元のメッセージ（英語）が表示されます。'],
      ]), '1fr 1fr') +
      fig('error-quota', [['error', 2, 'l']], { crop: [bounds['error-quota'].boxes.error.y - 14, bounds['error-quota'].boxes.error.y + bounds['error-quota'].boxes.error.h + 14] }) +
      table(['表示', '原因と対処'], [
        ['API キーが正しくありません', 'キーの入力ミスです。AI Studio でキーをもう一度コピーし、設定し直してください'],
        ['API キーにこの機能の権限がありません（401／403）', 'キーの制限やプロジェクトの設定で、その機能が使えません。AI Studio でキーの設定を確認してください'],
        ['利用上限に達しました（429）', '無料枠の上限か、短時間に送りすぎです。少し待つか、課金を有効にしてください'],
        ['有料枠（課金の有効化）が必要です', '画像・動画・BGM は課金の設定が必要です（「Google AI Studio でキーを作る」のページ）'],
        ['安全上の理由で生成が拒否されました', '指示の内容が Google の方針に合いませんでした。表現を変えて試してください'],
        ['このブラウザは H.264 の書き出しに対応していません', 'Chrome または Edge の最新版で書き出してください'],
        ['ファイルが壊れているか、hunet vids のプロジェクトファイルではありません', '読み込んだファイルが .hunetvids ではないか、途中で壊れています'],
      ]),
  ),
);

pages.push(
  page('困ったとき', 'よくある質問', '',
    table(['こんなとき', '確認すること'], [
      ['再生しても音が出ない', 'パソコンの音量、ナレーションが作られているか（タイムラインの緑の帯）、BGM の音量を確認します'],
      ['生成がなかなか終わらない', '動画は 1〜数分かかります。右下のカードに経過秒数が出ます。10 分以上変わらなければ「中止」して作り直します'],
      ['生成ボタンを押しても反応しない', '同じ生成がすでに動いているか「順番待ち」です（同時に 2 件まで）。右下のカードを確認します'],
      ['書き出しに時間がかかる', '長い動画や 60fps は時間がかかります。720p・30fps にすると速くなります。書き出し中はタブを閉じないでください'],
      ['プロジェクトが見当たらない', '別のブラウザやシークレットウィンドウではないか確認します。バックアップファイルがあれば「ファイルから開く」で戻せます'],
      ['間違えて消した・変えた', '編集画面なら「戻す」（⌘Z）で戻せます。一覧画面での削除は戻せません'],
      ['文字がはみ出す', '「テキスト」タブで大きさを小さくするか、文字を改行します'],
      ['画面が真っ白になった', '「表示中にエラーが起きました」の画面から「一覧へ戻る」か「再読み込み」を押します。編集内容は自動保存されています'],
      ['Safari・スマートフォンで使いたい', '動作確認の対象外です。パソコンの Chrome か Edge を使ってください'],
      ['キーを他人に知られたかもしれない', 'AI Studio でそのキーを削除（無効化）し、新しいキーを作って設定し直してください'],
    ]),
  ),
);

pages.push(
  page('付録', 'ショートカットと安全のまとめ', '',
    h3('キーボードショートカット（編集画面）') +
      table(['操作', 'キー'], [
        ['再生／停止', 'スペース（文字の入力中を除く）'],
        ['元に戻す', '⌘Z（Windows は Ctrl + Z）'],
        ['やり直す', '⇧⌘Z（Windows は Ctrl + Shift + Z）'],
        ['再生／停止（マウス）', 'プレビューをダブルクリック'],
        ['文字の入力確定（キー設定）', 'Enter'],
      ]) +
      h3('安全とプライバシー') +
      table(['項目', '内容'], [
        ['API キー', 'このブラウザに保存し、Google の Gemini API にだけ送ります。設定画面の「キーを削除」で消せます'],
        ['作品', 'このブラウザに保存します。保存・書き出しのためにアップロードすることはありません'],
        ['Google に送るもの', '指示文と、生成に使う素材（参考資料の文章、編集・動画化する画像）。非公開の画像を「画像を指示で編集」「画像を動かす」に使うと Google に送られます'],
        ['通信先', '公開サイトは、Google の Gemini API 以外の外部サイトと通信できないよう制限しています'],
        ['生成物の印', 'Google の公開情報によると、Google の AI で作った素材には目に見えない電子透かし（SynthID）が含まれます'],
        ['残るリスク', '共有パソコン、ブラウザ拡張機能、乗っ取られたパソコンではキーを読み取られる可能性があります'],
      ]) +
      h3('この説明書について') +
      p('画面写真は、体験モードと説明用のダミーキー（Google との通信はすべて手元で応答）を使って自動撮影しました。実際の AI 生成の結果ではありません。Google の料金・機能・画面は変わることがあります。最新情報は公式資料と、GitHub の README（https://github.com/TadFuji/hunet-vids）を確認してください。'),
  ),
);

// ---------- assemble ----------
const tocHtml = `<section class="page toc"><div class="kicker">目次</div><h2>目次</h2><ol>${toc
  .map((t, i) => `<li><a href="#${t.id}"><span class="tk">${esc(t.kicker)}</span><span class="tt">${esc(t.title)}</span><span class="tp">${i + 3}</span></a></li>`)
  .join('')}</ol></section>`;

const css = `
@page { size: A4; margin: 13mm 14mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; color: #1d2a44; font-size: 9.6pt; line-height: 1.62; background: #fff; }
.page, .cover { height: 268mm; overflow: visible; break-after: page; position: relative; }
.kicker { color: #FC9A04; font-weight: 700; font-size: 8.5pt; letter-spacing: .04em; border-bottom: 2px solid #0D357A; padding-bottom: 3pt; margin-bottom: 7pt; }
h2 { font-size: 17pt; color: #0D357A; margin: 0 0 4pt; line-height: 1.3; }
h3 { font-size: 11pt; color: #0D357A; margin: 9pt 0 4pt; border-left: 4px solid #FC9A04; padding-left: 6pt; }
.lead { color: #3b4767; margin: 0 0 8pt; }
p { margin: 3pt 0; }
code { background: #eef1f7; padding: 0 3px; border-radius: 3px; font-size: 8.8pt; }
.fig { margin: 4pt auto 6pt; padding: 0 18px; break-inside: avoid; }
.frame { position: relative; }
.shot { position: absolute; inset: 0; overflow: hidden; border: 1px solid #c9d1e1; border-radius: 6px; background: #fff; }
.shot img { display: block; }
.fig figcaption { font-size: 8pt; color: #5f6987; margin-top: 2pt; }
.mk { position: absolute; transform: translate(-50%, -50%); width: 17px; height: 17px; border-radius: 50%; background: #FC9A04; color: #fff; font-size: 9.5px; font-weight: 800; display: grid; place-items: center; border: 1.5px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.45); }
.ol { position: absolute; border: 2px solid #FC9A04; border-radius: 4px; }
.mk-l { transform: translate(-108%, -50%); }
.mk-r { transform: translate(8%, -50%); }
.mk-tl { transform: translate(-75%, -75%); }
.mk-tr { transform: translate(-25%, -75%); }
.mk-il { transform: translate(20%, -50%); }
.mk-ir { transform: translate(-120%, -50%); }
.legend, .steps { list-style: none; padding: 0; margin: 4pt 0; }
.legend li, .steps li { display: grid; grid-template-columns: 18px 1fr; gap: 6px; margin-bottom: 4pt; align-items: start; }
.legend .num { background: #FC9A04; color: #fff; }
.steps .num { background: #0D357A; color: #fff; }
.num { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; font-weight: 800; margin-top: 2px; }
.legend p, .steps p { margin: 0; color: #3b4767; font-size: 9pt; }
.legend b { color: #0D357A; }
.cols { display: grid; gap: 12pt; align-items: start; }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
.cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8pt; }
.cols3 .legend p { font-size: 8.4pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 6pt; font-size: 8.9pt; break-inside: avoid; }
th { background: #0D357A; color: #fff; text-align: left; padding: 4pt 6pt; font-weight: 700; }
td { border-bottom: 1px solid #dde2ec; padding: 3.5pt 6pt; vertical-align: top; }
tr:nth-child(even) td { background: #f5f7fb; }
.nowrap1 td:first-child, .nowrap1 th:first-child { white-space: nowrap; }
.box { border-radius: 6px; padding: 6pt 9pt; margin: 6pt 0; break-inside: avoid; }
.box b { display: block; margin-bottom: 1pt; }
.box p { margin: 0; font-size: 9pt; }
.box.info { background: #eaf0fb; border-left: 4px solid #0D357A; }
.box.info b { color: #0D357A; }
.box.warn { background: #fff3df; border-left: 4px solid #FC9A04; }
.box.warn b { color: #9a5b00; }
.diagram { width: 100%; height: auto; margin: 6pt 0; }
.diagram .t1, .mini .t1 { font-size: 15px; font-weight: 700; fill: #0D357A; }
.diagram .t2, .mini .t2 { font-size: 12.5px; fill: #1d2a44; }
.diagram .t3 { font-size: 11px; fill: #3b4767; }
.mini-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6pt; margin: 4pt 0; }
.mini-grid.five { grid-template-columns: repeat(5, 1fr); }
.mini-grid.three { grid-template-columns: repeat(3, 1fr); }
.mini-grid div { text-align: center; font-size: 8.2pt; color: #3b4767; }
.mini { width: 100%; height: auto; display: block; margin-bottom: 2pt; }
.cover { display: flex; flex-direction: column; justify-content: center; }
.cover-brand { display: flex; align-items: center; gap: 12px; }
.cover-brand img { height: 64px; width: auto; }
.cover-brand span { font-size: 50px; font-weight: 800; color: #FC9A04; line-height: 1; margin-top: 6px; }
.cover h1 { font-size: 30pt; color: #0D357A; margin: 18pt 0 6pt; }
.cover-sub { font-size: 12pt; color: #3b4767; margin-bottom: 16pt; }
.cover-meta { margin-top: 12pt; font-size: 9pt; color: #5f6987; border-top: 2px solid #0D357A; padding-top: 6pt; }
.toc ol { list-style: none; padding: 0; margin: 8pt 0; columns: 1; }
.toc li a { display: grid; grid-template-columns: 70pt 1fr 24pt; padding: 3.6pt 0; border-bottom: 1px dotted #c4cad8; color: #1d2a44; text-decoration: none; }
.toc .tk { color: #FC9A04; font-weight: 700; font-size: 8.5pt; }
.toc .tp { text-align: right; color: #5f6987; }
`;

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>hunet vids 図解取扱説明書</title><style>${css}</style></head><body>${pages.join('\n').replace('<!--TOC-->', tocHtml)}</body></html>`;
const htmlPath = new URL('manual.html', here);
writeFileSync(htmlPath, html);

// ---------- print ----------
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome' });
const page2 = await browser.newPage();
await page2.goto(htmlPath.href);
await page2.evaluate(() => document.fonts.ready);
await page2.waitForFunction(() => [...document.images].every((i) => i.complete));
const overflow = await page2.evaluate(() =>
  [...document.querySelectorAll('.page, .cover')]
    .map((s, i) => ({ i: i + 1, title: s.querySelector('h2,h1')?.textContent, over: s.scrollHeight - s.clientHeight }))
    .filter((x) => x.over > 2),
);
if (overflow.length) {
  console.error('Pages overflowing their A4 area (px):\n' + overflow.map((o) => `  p.${o.i} ${o.title}: +${o.over}`).join('\n'));
  process.exitCode = 1;
}
const outDir = new URL('../../output/pdf/', here);
mkdirSync(outDir, { recursive: true });
const pdfPath = new URL('hunet_vids_図解取扱説明書.pdf', outDir);
await page2.pdf({
  path: decodeURIComponent(pdfPath.pathname),
  format: 'A4',
  printBackground: true,
  outline: true,
  tagged: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#5f6987;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Hiragino Sans',sans-serif"><span>hunet vids ／ 図解取扱説明書 ／ ${DATE}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log(`Wrote ${decodeURIComponent(pdfPath.pathname)} (${toc.length + 2} pages planned)`);
