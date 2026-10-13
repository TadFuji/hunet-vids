import type { Gemini } from '../lib/gemini';
import type { AssetMeta, Project, Scene } from '../lib/model';

export type JobFn = (signal: AbortSignal, progress: (detail: string) => void) => Promise<void>;

/** Everything the inspector panels need from the editor. */
export interface EditorApi {
  project: Project;
  scene: Scene | null;
  gemini: Gemini;
  demo: boolean;
  update: (fn: (p: Project) => Project) => void;
  updateScene: (id: string, fn: (s: Scene) => Scene) => void;
  /** key identifies the job for de-duplication (default: label); use scene ids so equal titles don't collide */
  runJob: (label: string, fn: JobFn, key?: string) => void;
  isBusy: (key: string) => boolean;
  selectedTextId: string | null;
  setSelectedTextId: (id: string | null) => void;
  assets: AssetMeta[];
  refreshAssets: () => void;
  openRecorder: () => void;
  time: number;
}
