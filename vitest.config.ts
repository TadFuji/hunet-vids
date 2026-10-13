import { defineConfig } from 'vitest/config';

// Unit tests only. Browser tests live in tests/ (Playwright); live API checks run via `npm run test:live`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: process.env.GEMINI_LIVE ? ['node_modules/**'] : ['src/**/*.live.test.ts', 'node_modules/**'],
  },
});
