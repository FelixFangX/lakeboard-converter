import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { convertBuffer } from '../src/index.js';
import { ZipLimitError } from '../src/core/bounded-zip.js';
import { makeZip } from './zip-make.js';

const phase = process.argv[2];
const target = process.argv[3];
const expanded = 96 * 1024 * 1024;

function hwm(): number | null {
  try {
    const status = readFileSync('/proc/self/status', 'utf8');
    const match = /VmHWM:\s+(\d+)/.exec(status);
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

if (phase === 'build') {
  const compressed = deflateRawSync(Buffer.alloc(expanded));
  const zip = makeZip([{
    name: 'content.json',
    data: compressed,
    method: 8,
    compressedSize: compressed.length,
    uncompressedSize: 16,
  }]);
  writeFileSync(target, zip);
  console.log(JSON.stringify({ zipBytes: zip.length, compressedBytes: compressed.length, expanded }));
} else if (phase === 'run') {
  const zip = readFileSync(target);
  const before = hwm();
  let message = 'success';
  let outputBytes = -1;
  try {
    await convertBuffer(zip, 'xmind');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    if (error instanceof ZipLimitError) outputBytes = error.outputBytes;
  }
  const after = hwm();
  console.log(JSON.stringify({
    message,
    outputBytes,
    hwmDelta: before === null || after === null ? null : after - before,
    expanded,
  }));
} else {
  throw new Error('phase must be build or run');
}
