# CLAUDE.md — hunet vids (folder: my-vids)

@AGENTS.md

Browser-only Google Vids clone ("hunet vids"). React 19 + Vite + TypeScript; the only runtime dependency besides React is `mediabunny` (WebCodecs MP4 encode/decode). No backend. Architecture: [docs/architecture.md](docs/architecture.md). Security model and residual risks: [docs/security.md](docs/security.md). Commands and test strategy: [docs/development.md](docs/development.md). Deploying: [docs/deployment.md](docs/deployment.md). What has / hasn't been verified (incl. real API): [docs/validation.md](docs/validation.md).

## Quick reference

- Dev: `npm run dev` (http://127.0.0.1:5173) or the `.claude/launch.json` entry. Production-like: `npm run build && npm start` (http://127.0.0.1:4180 — not 4173, which the owner's Banana Studio uses).
- Verify before reporting: `npm run check` and `npm run test:e2e`. Browser check without a key: "キーなしで体験する" (`MockGemini`).
- Real API: `npm run test:live` with `GEMINI_API_KEY` in `.env.local`; paid checks need `LIVE_PAID=...` and the owner's approval.
- Branding: orange #FC9A04, navy #0D357A (tokens in `src/index.css`), logo `public/hunet-logo.png` (recolored to the swatch), `Brand` component.

## Design decisions not obvious from the code

- Interactions API everywhere. Long jobs send `background: true` and poll; any 400 on that POST retries once synchronously (a rejected POST creates no job). Background mode is documented only for text models, so for Omni/Nano Banana/Lyria it is unverified.
- Video model is `gemini-omni-1.1-flash` (Veo 3.1 shut down 2026-10-22; Imagen 4 already gone). Omni supports only 16:9 / 9:16; 1:1 projects use 16:9 + cover crop.
- Plain `fetch`, not `@google/genai`: an SDK version added an `Api-Revision` header that broke browser CORS (js-genai issue #1723).
- The API key is persisted in localStorage on purpose ("enter the key once"). The sister app hunet-banana keeps it only in worker memory; switching is an open option, documented in docs/security.md.
- Narration audio drives scene length (`minDurationFor`); captions come from narration text, timed proportionally by characters.
- Generated/uploaded media are shared across projects; deleting a project does not delete assets.

## Repository and deployment

- GitHub `TadFuji/hunet-vids` (public), branch `main`. Changes go in through Pull Requests that pass CI (see docs/development.md). The owner asked (2026-10-13) to keep the code on GitHub: after verifying a change, open a PR, wait for checks, squash-merge, then sync local `main`.
- GitHub is intentionally NOT connected to Vercel (owner's decision, 2026-10-13). Deploy manually (`npx vercel@latest deploy --prod --scope tadfujis-projects`) only when asked to update the site.
- `vercel link` writes a VERCEL_OIDC_TOKEN into `.env.local` (git- and vercel-ignored).
