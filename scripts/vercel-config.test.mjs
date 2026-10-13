import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { vercelHeaders } from '../server.mjs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = vercelHeaders(config);
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe('deployment security headers (vercel.json)', () => {
  it('builds the Vite app from source into dist', () => {
    expect(config).toMatchObject({ framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' });
  });

  it('lets the page talk only to itself and the Gemini API', () => {
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['connect-src'].filter((s) => s.startsWith('http'))).toEqual(['https://generativelanguage.googleapis.com']);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'none'"]);
  });

  it('allows what the editor needs: blob workers (mediabunny) and blob/data media', () => {
    expect(csp['worker-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']));
    expect(csp['media-src']).toEqual(expect.arrayContaining(['blob:']));
    expect(csp['img-src']).toEqual(expect.arrayContaining(['blob:', 'data:']));
  });

  it('sends the hardening headers on every path', () => {
    expect(headers).toMatchObject({
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
    expect(headers['Permissions-Policy']).toContain('payment=()');
  });
});
