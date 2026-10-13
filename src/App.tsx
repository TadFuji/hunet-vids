import { useEffect, useMemo, useState } from 'react';
import { Gemini } from './lib/gemini';
import { MockGemini } from './lib/mock';
import { loadApiKey, saveApiKey } from './lib/store';
import { Setup } from './ui/Setup';
import { Home } from './ui/Home';
import { Editor } from './ui/Editor';

export const DEMO_KEY = 'demo';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const [key, setKey] = useState(loadApiKey);
  const [showSetup, setShowSetup] = useState(false);
  const hash = useHashRoute();
  const gemini = useMemo(() => (key === DEMO_KEY ? new MockGemini() : key ? new Gemini(key) : null), [key]);

  const applyKey = (k: string) => {
    saveApiKey(k);
    setKey(k);
    setShowSetup(false);
  };

  if (!gemini || showSetup) return <Setup current={key} onDone={applyKey} onCancel={key ? () => setShowSetup(false) : undefined} />;

  const editId = /^#\/edit\/(\w+)/.exec(hash)?.[1];
  const demo = key === DEMO_KEY;
  if (editId) return <Editor key={editId} projectId={editId} gemini={gemini} demo={demo} />;
  return <Home gemini={gemini} demo={demo} onSettings={() => setShowSetup(true)} />;
}
