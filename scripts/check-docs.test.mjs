import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { checkLinks } from './check-docs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(new URL('../README.md', import.meta.url));

describe('documentation file links', () => {
  it('accepts local files and fragments', () => {
    expect(checkLinks('[security](docs/security.md#boundary)\n[agents](AGENTS.md)', source, root)).toEqual([]);
  });
  it('rejects missing files, malformed paths and links outside the repository', () => {
    expect(checkLinks('[missing](docs/not-a-document.md)\n[bad](%ZZ.md)\n[outside](../private.md)', source, root)).toHaveLength(3);
  });
  it('does not access web links or interpret same-document fragments as files', () => {
    expect(checkLinks('[web](https://example.invalid/)\n[mail](mailto:example@example.invalid)\n[section](#section)', source, root)).toEqual([]);
  });
});
