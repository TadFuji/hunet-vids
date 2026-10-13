# CLAUDE.md — my-vids

Browser-only Google Vids clone. React 19 + Vite + TypeScript, one runtime dependency besides React: `mediabunny` (WebCodecs MP4 encode/decode). No backend: each user's Gemini API key is stored in `localStorage` and sent only to `generativelanguage.googleapis.com` via the `x-goog-api-key` header.

## Commands

- `npm run dev -- --port 5178` — dev server (`.claude/launch.json` entry "my-vids")
- `npm test` — unit tests (timeline, captions, WAV, API client with mocked fetch, backup/storyboard hardening)
- `npm run test:live` — real API checks; reads `GEMINI_API_KEY` from env or `.env.local` (git-ignored). Free checks only by default; `LIVE_PAID=image,music,video` adds paid ones. Outputs go to `live-output/` (git-ignored).
- `npm run build` — type-check + production build into `dist/`
- Browser check without a key: choose "キーなしで体験する" (key = `demo` → `MockGemini` in `src/lib/mock.ts` produces placeholder media locally).

## Layout

- `src/lib/model.ts` — project JSON model (scenes, texts, narration, music, captions, themes)
- `src/lib/timeline.ts` — scene spans, caption splitting/timing, SRT
- `src/lib/render.ts` — `drawFrame()` canvas renderer shared by preview and export (transitions, Ken Burns motion, text anims, captions)
- `src/lib/mix.ts` — WebAudio scheduling for preview and `OfflineAudioContext` mixdown (music ducking/fades)
- `src/lib/media.ts` — `PreviewMedia` (<img>/<video>) and `ExportMedia` (frame-accurate decode with mediabunny `CanvasSink`)
- `src/lib/exporter.ts` — MP4 export (H.264 + AAC) via mediabunny `CanvasSource`/`AudioBufferSource`
- `src/lib/gemini.ts` — Interactions API client; **all model IDs in `MODELS`**
- `src/lib/storyboard.ts` — "Help me create" prompt + JSON schema
- `src/lib/generate.ts` — generate asset → return a scene/project updater
- `src/lib/store.ts` — IndexedDB (projects, assets) + API key in localStorage
- `src/lib/backup.ts` — `.myvids` backup file (magic + header JSON + concatenated asset bytes)
- `src/ui/*` — Setup, Home, Editor (Player, Timeline, inspector panels, Recorder, ExportDialog)

## Design decisions

- Gemini **Interactions API** (`POST /v1beta/interactions`) is used for everything; it is Google's primary API as of 2026-10. Long jobs (image/video/music) send `background: true` and poll `GET /v1beta/interactions/{id}`; any 400 on the background POST retries once synchronously (a rejected POST creates no job, so no double charge). Background mode is documented only for text models, so whether Omni/Nano Banana/Lyria accept it is unverified. Aborting a job also calls `POST /interactions/{id}/cancel` so Google stops billing. Polling continues only while status is `in_progress`/`queued`.
- `Editor.runJob(label, fn, key)` ignores a job whose key is already queued/running (prevents duplicate paid generations); keys use scene ids (`voice:`, `image:`, `video:`, ...) so scenes with equal titles don't collide. At most 2 jobs run at once (`MAX_PARALLEL`), the rest wait.
- Imported `.myvids` files are untrusted: `normalizeProject()` (model.ts) coerces every field, and `importBackup` bounds-checks sizes before writing anything. AI storyboard JSON is coerced by `cleanStoryboard()`.
- Background video time (trim/loop/clamp) is computed by one function, `videoMediaTime()` in render.ts, used by preview, export and (via loopStart) audio.
- An `ErrorBoundary` (src/ui/ErrorBoundary.tsx) replaces blank screens with a recover screen. Editor flushes a pending autosave on unmount/pagehide.
- `Gemini.download` only accepts `files/...` URIs on generativelanguage.googleapis.com, so the key can never be sent elsewhere. Video uses `delivery: 'uri'` (inline is limited to ~4MB).
- Video model is `gemini-omni-1.1-flash` (Veo 3.1 shuts down 2026-10-22; Imagen 4 already shut down). Omni supports only 16:9 / 9:16, so 1:1 projects use 16:9 + cover crop.
- Plain `fetch`, not `@google/genai`: an SDK version added an `Api-Revision` header that breaks browser CORS (js-genai issue #1723).
- Narration audio drives scene length (`minDurationFor`); captions are derived from narration text, timed proportionally by characters.
- Generated/uploaded media are shared across projects (asset library); deleting a project does not delete assets.

## Deployment

- Production: https://hunet-vids.vercel.app — Vercel project `hunet-vids` (team "tadfuji's projects", scope `tadfujis-projects`). Deploy with `npx vercel@latest deploy --prod --scope tadfujis-projects` from this folder (the CLI is not installed globally; `.vercel/` holds the link and is git-ignored; `.vercelignore` keeps `.env*`, `live-output/`, `.claude/` out of uploads). Note `vercel link` writes a VERCEL_OIDC_TOKEN into `.env.local` (git-ignored). `vercel.json` sets build/output and security headers (CSP allowing only self + generativelanguage.googleapis.com; mediabunny needs `worker-src blob:`). Referrer-Policy is `strict-origin-when-cross-origin` so users can restrict their API key to the site's origin.

## Known issues / not verified

- Request shapes were written from the official docs (2026-10-13); they have NOT yet been exercised with a real key. Run `npm run test:live` first when a key is available.
- The `duration` field of the video `response_format` is documented only as a string; we send `"8s"` and retry once without it on a 400 mentioning duration.
- Not implemented vs Vids: Google Slides import, stock library, collaboration/comments, YouTube upload, GIF export.
- Research notes: `docs/research.md`.
