import { useState } from 'react';
import { Gemini, explainError } from '../lib/gemini';
import { Brand } from './Brand';

export function Setup({ current, onDone, onCancel }: { current: string; onDone: (key: string) => void; onCancel?: () => void }) {
  const [key, setKey] = useState(current === 'demo' ? '' : current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await new Gemini(key).check();
      onDone(key.trim());
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="card setup">
        <div style={{ marginBottom: 14 }}>
          <Brand />
        </div>
        <h1>Gemini API キーを設定</h1>
        <p className="muted">
          台本・ナレーション・画像・動画・音楽の生成に、あなた自身の Gemini API キーを使います。キーはこのブラウザの中だけに保存され、Google の API 以外には送られません。
        </p>
        <ol>
          <li>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio の API キーのページ
            </a>
            を開き、「API キーを作成」を押す
          </li>
          <li>表示されたキー（AIza… で始まる文字列）をコピーして下に貼り付ける</li>
          <li>画像・動画・音楽の生成は有料枠です。AI Studio で課金（Billing）を有効にしてください。台本とナレーションは無料枠でも使えます。</li>
        </ol>
        <label htmlFor="key">API キー</label>
        <input id="key" type="password" autoComplete="off" value={key} placeholder="AIza..." onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key && submit()} />
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={!key.trim() || busy} onClick={submit}>
            {busy && <span className="busy" />}確認して保存
          </button>
          {onCancel && <button onClick={onCancel}>キャンセル</button>}
          <span className="grow" />
          <button className="ghost" onClick={() => onDone('demo')} title="AI の代わりに仮の素材を作ります。費用はかかりません。">
            キーなしで体験する
          </button>
        </div>
        {current && current !== 'demo' && (
          <p className="small-text muted" style={{ marginTop: 16 }}>
            このブラウザからキーを消すには{' '}
            <button className="small danger" onClick={() => confirm('保存した API キーをこのブラウザから削除しますか？') && onDone('')}>
              キーを削除
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
