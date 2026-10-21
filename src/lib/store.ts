// IndexedDB persistence: projects (JSON) and assets (metadata + blob). Everything stays in this browser.
import type { AssetMeta, Project } from './model';

// Storage names keep the original 'my-vids' prefix so existing projects and saved keys survive the rename.
const DB_NAME = 'my-vids';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'meta.id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const listProjects = () => run<Project[]>('projects', 'readonly', (s) => s.getAll() as IDBRequest<Project[]>);
export const getProject = (id: string) => run<Project | undefined>('projects', 'readonly', (s) => s.get(id));
export const saveProject = (p: Project) => run('projects', 'readwrite', (s) => s.put({ ...p, updatedAt: Date.now() }));
export async function deleteProject(id: string): Promise<string[]> {
  const target = await getProject(id);
  await run('projects', 'readwrite', (s) => s.delete(id));
  const remaining = await listProjects();
  const used = new Set<string>();
  for (const p of remaining) {
    for (const aid of referencedAssets(p)) used.add(aid);
  }
  const targetRefs = target ? referencedAssets(target) : new Set<string>();
  const all = await listAssets();
  const removed: string[] = [];
  for (const a of all) {
    const aid = a.meta.id;
    if (used.has(aid)) continue;
    if (remaining.length === 0 || targetRefs.has(aid) || a.meta.source === 'tts') {
      await deleteAsset(aid);
      removed.push(aid);
    }
  }
  return removed;
}

export interface StoredAsset {
  meta: AssetMeta;
  blob: Blob;
}

export const putAsset = (a: StoredAsset) => run('assets', 'readwrite', (s) => s.put(a));
export const getAsset = (id: string) => run<StoredAsset | undefined>('assets', 'readonly', (s) => s.get(id));
export const listAssets = () => run<StoredAsset[]>('assets', 'readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>);
export const deleteAsset = (id: string) => run('assets', 'readwrite', (s) => s.delete(id));

/** Asset ids referenced by a project (backgrounds, narration, music). */
export function referencedAssets(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const s of p.scenes) {
    if (s.background.kind === 'image' || s.background.kind === 'video') ids.add(s.background.assetId);
    if (s.narration.assetId) ids.add(s.narration.assetId);
  }
  if (p.music) ids.add(p.music.assetId);
  return ids;
}

// API key lives only in this browser's localStorage and is sent only to Google's API.
const KEY = 'my-vids.gemini-key';
export const loadApiKey = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export const saveApiKey = (k: string) => {
  try {
    if (k) localStorage.setItem(KEY, k);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
};
