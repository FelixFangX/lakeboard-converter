import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { isEntrypoint } from '../src/mcp.js';

it('resolves bin symlinks and rejects unrelated or unavailable entry points', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lakeboard-mcp-'));
  try {
    const modulePath = join(dir, 'mcp.js');
    const cliPath = join(dir, 'cli.js');
    const binPath = join(dir, 'lakeboard-converter-mcp');
    writeFileSync(modulePath, '');
    writeFileSync(cliPath, '');
    symlinkSync(modulePath, binPath);
    const moduleUrl = pathToFileURL(modulePath).href;

    expect(isEntrypoint(binPath, moduleUrl)).toBe(true);
    expect(isEntrypoint(modulePath, moduleUrl)).toBe(true);
    expect(isEntrypoint(cliPath, moduleUrl)).toBe(false);
    expect(isEntrypoint(join(dir, 'missing'), moduleUrl)).toBe(false);
    expect(isEntrypoint(undefined, moduleUrl)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
