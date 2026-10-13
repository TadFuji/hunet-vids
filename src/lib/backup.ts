// Project backup file (.hunetvids; older .myvids files use the same format): the project JSON and every asset it uses.
// Layout: "MYVIDS1\n" | uint32 header length (LE) | header JSON | asset bytes back to back.
import type { AssetMeta, Project } from './model';
import { normalizeProject, uid } from './model';
import { kindOf } from './assets';
import { getAsset, putAsset, referencedAssets, saveProject } from './store';

const MAGIC = 'MYVIDS1\n';

interface Header {
  project: Project;
  assets: { meta: AssetMeta; size: number }[];
}

export async function exportBackup(project: Project): Promise<Blob> {
  const assets: { meta: AssetMeta; blob: Blob }[] = [];
  for (const id of referencedAssets(project)) {
    const a = await getAsset(id);
    if (a) assets.push(a);
  }
  const header: Header = { project, assets: assets.map((a) => ({ meta: a.meta, size: a.blob.size })) };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.length, true);
  return new Blob([MAGIC, len, json, ...assets.map((a) => a.blob)], { type: 'application/octet-stream' });
}

/** Restores a backup as a new project (existing assets with the same id are kept as they are). */
export async function importBackup(file: Blob): Promise<Project> {
  const bad = () => new Error('ファイルが壊れているか、hunet vids のプロジェクトファイルではありません');
  const magic = await file.slice(0, MAGIC.length).text();
  if (magic !== MAGIC) throw bad();
  const len = new DataView(await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer()).getUint32(0, true);
  let offset = MAGIC.length + 4;
  if (len > 64 * 1024 * 1024 || offset + len > file.size) throw bad();
  let header: { project?: unknown; assets?: unknown };
  try {
    header = JSON.parse(await file.slice(offset, offset + len).text());
  } catch {
    throw bad();
  }
  offset += len;
  const project = normalizeProject(header.project);
  const entries = Array.isArray(header.assets) ? header.assets : [];
  // validate every entry before writing anything
  const assets: { meta: AssetMeta; start: number; size: number }[] = [];
  for (const a of entries) {
    const meta = a?.meta;
    const size = a?.size;
    if (!meta || typeof meta.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(meta.id) || typeof meta.mime !== 'string') throw bad();
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > file.size) throw bad();
    const kind = kindOf(meta.mime);
    if (!kind) throw bad();
    const clean: AssetMeta = {
      id: meta.id,
      kind,
      mime: meta.mime,
      name: typeof meta.name === 'string' ? meta.name.slice(0, 200) : '素材',
      source: (['upload', 'record', 'veo', 'image-ai', 'tts', 'music-ai', 'stock'] as const).find((x) => x === meta.source) ?? 'upload',
      prompt: typeof meta.prompt === 'string' ? meta.prompt : undefined,
      duration: typeof meta.duration === 'number' && Number.isFinite(meta.duration) ? meta.duration : undefined,
      width: typeof meta.width === 'number' ? meta.width : undefined,
      height: typeof meta.height === 'number' ? meta.height : undefined,
      createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : Date.now(),
    };
    assets.push({ meta: clean, start: offset, size });
    offset += size;
  }
  for (const a of assets) {
    if (!(await getAsset(a.meta.id))) await putAsset({ meta: a.meta, blob: file.slice(a.start, a.start + a.size, a.meta.mime) });
  }
  const restored: Project = { ...project, id: uid(), createdAt: Date.now() };
  await saveProject(restored);
  return restored;
}
