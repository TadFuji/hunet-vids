// Copies the illustrated manual into the build so the app can link to it at /guide.pdf (same origin).
import { copyFileSync, existsSync } from 'node:fs';

const src = new URL('../output/pdf/hunet_vids_図解取扱説明書.pdf', import.meta.url);
const dest = new URL('../dist/guide.pdf', import.meta.url);
if (!existsSync(src)) {
  console.warn('Manual PDF not found (output/pdf). Run `npm run manual` to create it; the app is built without /guide.pdf.');
} else {
  copyFileSync(src, dest);
  console.log('Copied the manual to dist/guide.pdf');
}
