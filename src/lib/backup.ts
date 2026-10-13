// Project backup file (.myvids): one file containing the project JSON and every asset it uses.
// Layout: "MYVIDS1\n" | uint32 header length (LE) | header JSON | asset bytes back to back.
import type { AssetMeta, Project } from './model';
import { uid } from './model';
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
  const magic = await file.slice(0, MAGIC.length).text();
  if (magic !== MAGIC) throw new Error('my-vids のプロジェクトファイルではありません');
  const len = new DataView(await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer()).getUint32(0, true);
  let offset = MAGIC.length + 4;
  const header = JSON.parse(await file.slice(offset, offset + len).text()) as Header;
  offset += len;
  for (const a of header.assets) {
    const blob = file.slice(offset, offset + a.size, a.meta.mime);
    offset += a.size;
    if (!(await getAsset(a.meta.id))) await putAsset({ meta: a.meta, blob: new Blob([await blob.arrayBuffer()], { type: a.meta.mime }) });
  }
  const project: Project = { ...header.project, id: uid(), createdAt: Date.now() };
  await saveProject(project);
  return project;
}
