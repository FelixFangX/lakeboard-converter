import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { deflateRawSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { convertBuffer, convertFile, readMindMap } from '../src/index.js';
import { ARCHIVE_LIMITS, ZipLimitError } from '../src/core/bounded-zip.js';
import { webErrorKey } from '../web/src/converter.js';
import { makeZip } from './zip-make.js';

const run = promisify(execFile);
const repo = path.join(__dirname, '..');
const fixture = (name: string) => path.join(repo, 'test-fixtures', name);
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zip-limit-'));
  dirs.push(dir);
  return dir;
}

const content = Buffer.from(JSON.stringify([{ title: 'Plan', rootTopic: { id: 'r', title: 'Root' } }]));

function contentZip(patch: Partial<Parameters<typeof makeZip>[0][number]> = {}): Buffer {
  return makeZip([{ name: 'content.json', data: content, ...patch }]);
}

it('reads ordinary stored and deflated mind maps, and rejects hostile zip structure', async () => {
  const stored = await convertBuffer(contentZip(), 'xmind');
  expect(stored.markdown).toBe('# Root\n');
  expect(stored.document.losses).toEqual([]);
  const deflated = deflateRawSync(content);
  const inflated = await convertBuffer(makeZip([{
    name: 'content.json', data: deflated, method: 8, compressedSize: deflated.length, uncompressedSize: content.length,
  }]), 'xmind');
  expect(inflated.markdown).toBe('# Root\n');

  const sample = await convertBuffer(await readFile(fixture('test.xmind')), 'xmind');
  expect(sample.markdown.startsWith('# XMind Test Root')).toBe(true);
  await expect(convertBuffer(await readFile(fixture('mindmanager.mmap')), 'mindmanager')).resolves.toMatchObject({ document: { format: 'mindmanager' } });
  await expect(convertBuffer(await readFile(fixture('ithoughts.itmz')), 'ithoughts')).resolves.toMatchObject({ document: { format: 'ithoughts' } });
  await expect(convertBuffer(await readFile(fixture('simplemind.smmx')), 'simplemind')).resolves.toMatchObject({ document: { format: 'simplemind' } });

  await expect(convertBuffer(Buffer.from('PK\x03\x04truncated'), 'xmind')).rejects.toThrow('Cannot unzip .xmind file: it may be corrupt');
  await expect(convertBuffer(contentZip({ flags: 1 }), 'xmind')).rejects.toThrow('encrypted members are not supported');
  await expect(convertBuffer(contentZip({ method: 12 }), 'xmind')).rejects.toThrow('unsupported compression method');
  await expect(convertBuffer(makeZip([{ name: 'content.json', data: content }], 1), 'xmind')).rejects.toThrow('zip layout is not supported');
  await expect(convertBuffer(contentZip({ compressedSize: 0x7fffffff, uncompressedSize: 16 }), 'xmind')).rejects.toThrow('claims more than 32 MiB of compressed data');
  const many = Array.from({ length: ARCHIVE_LIMITS.maxMembers + 1 }, (_, index) => ({ name: `f${index}.txt`, data: Buffer.from('x') }));
  many[0] = { name: 'content.json', data: content };
  await expect(convertBuffer(makeZip(many), 'xmind')).rejects.toThrow('more than 1024 members');

  for (const [format, kind] of [['mindmanager', '.mmap'], ['ithoughts', '.itmz'], ['simplemind', '.smmx']] as const) {
    await expect(convertBuffer(Buffer.from('PK\x03\x04broken'), format)).rejects.toThrow(`Cannot unzip ${kind} file: it may be corrupt`);
  }

  const huge = Buffer.alloc(ARCHIVE_LIMITS.maxArchiveBytes + 1);
  huge[0] = 0x50; huge[1] = 0x4b;
  await expect(convertBuffer(huge, 'xmind')).rejects.toThrow('larger than 32 MiB');
});

it('stops a deflate bomb whose uncompressed-size header lies, and does not write a partial file', async () => {
  const dir = await tempDir();
  const bomb = path.join(dir, 'bomb.xmind');
  const build = await run(process.execPath, ['--import', 'tsx', 'tests/zip-limit.probe.ts', 'build', bomb], { cwd: repo });
  const built = JSON.parse(build.stdout) as { expanded: number; zipBytes: number };
  expect(built.expanded).toBe(96 * 1024 * 1024);
  expect(built.zipBytes).toBeLessThan(1024 * 1024);
  const probe = await run(process.execPath, ['--import', 'tsx', 'tests/zip-limit.probe.ts', 'run', bomb], { cwd: repo });
  const report = JSON.parse(probe.stdout) as { message: string; outputBytes: number; hwmDelta: number | null };
  expect(report.message).toContain('inflated data would pass 32 MiB');
  expect(report.outputBytes).toBe(ARCHIVE_LIMITS.maxUncompressedBytes);
  if (report.hwmDelta !== null) expect(report.hwmDelta).toBeLessThan(64 * 1024 * 1024);

  const cli = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'convert', bomb, '--format', 'md', '--out-dir', dir, '--json'], { cwd: repo }).then(() => {
    throw new Error('convert succeeded');
  }, (error: { stdout?: string; stderr?: string; code?: number }) => error);
  expect(cli.code).not.toBe(0);
  expect(cli.stdout ?? '').not.toMatch(/Done:|# Root|"nodeCount"/);
  expect(cli.stderr ?? '').toContain('inflated data would pass 32 MiB');
  expect(JSON.parse(cli.stderr ?? '')).toEqual({ error: expect.stringContaining('stopped after 33554432 bytes') });
  expect(await readdir(dir)).toEqual(['bomb.xmind']);

  const human = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'read', bomb], { cwd: repo }).then(() => {
    throw new Error('read succeeded');
  }, (error: { stdout?: string; stderr?: string }) => error);
  expect(human.stdout ?? '').toBe('');
  expect(human.stderr ?? '').toContain('inflated data would pass 32 MiB');

  const normal = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'read', fixture('test.xmind')], { cwd: repo });
  expect(normal.stdout.startsWith('# XMind Test Root')).toBe(true);
  expect(normal.stdout).not.toContain('> Note:');

  const sparse = path.join(dir, 'sparse.xmind');
  await writeFile(sparse, Buffer.from('PK\x03\x04'));
  await truncate(sparse, ARCHIVE_LIMITS.maxArchiveBytes + 1);
  await expect(readMindMap(sparse, 'md')).rejects.toThrow('larger than 32 MiB');
  await expect(convertFile({ input: bomb, format: 'md', markdownStyle: 'generic', outDir: dir, overwrite: true })).rejects.toBeInstanceOf(ZipLimitError);
  expect((await readdir(dir)).sort()).toEqual(['bomb.xmind', 'sparse.xmind']);
}, 60_000);

it('speaks MCP over stdio for a normal map, a lossy map, and a rejected archive', async () => {
  const dir = await tempDir();
  const lossy = path.join(dir, 'lossy.xmind');
  const zen = [{
    title: 'Plan',
    relationships: [{}],
    rootTopic: {
      id: 'root', title: 'Root',
      children: { attached: [{ id: 'a', title: 'Alpha' }], detached: [{ id: 'f', title: 'Floating' }] },
    },
  }];
  await writeFile(lossy, makeZip([{ name: 'content.json', data: Buffer.from(JSON.stringify(zen)) }]));
  const bomb = path.join(dir, 'bomb.xmind');
  await run(process.execPath, ['--import', 'tsx', 'tests/zip-limit.probe.ts', 'build', bomb], { cwd: repo });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/cli.ts', 'mcp'],
    cwd: repo,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'zip-limit', version: '1' });
  await client.connect(transport);
  try {
    const normal = await client.callTool({ name: 'convert', arguments: { path: fixture('test.xmind'), format: 'md' } });
    expect(normal.isError).toBeFalsy();
    expect(normal.content).toMatchObject([{ text: expect.stringContaining('# XMind Test Root') }]);
    expect(JSON.stringify(normal.content)).not.toContain('> Note:');

    const omitted = await client.callTool({ name: 'convert', arguments: { path: lossy, format: 'md' } });
    expect(omitted.isError).toBeFalsy();
    const omittedText = JSON.stringify(omitted.content);
    expect(omittedText).toContain('Floating');
    expect(omittedText).toContain('> Note: Dropped 1 relationship.');
    expect(omitted.structuredContent).toMatchObject({ losses: [{ code: 'relationship', count: 1 }] });

    const rejected = await client.callTool({ name: 'convert', arguments: { path: bomb, format: 'md' } });
    expect(rejected.isError).toBe(true);
    const rejectedText = JSON.stringify(rejected.content);
    expect(rejectedText).toContain('inflated data would pass 32 MiB');
    expect(rejectedText).not.toContain('# Root');
    expect(rejectedText).not.toContain('Floating');
    expect(rejected.structuredContent).toBeUndefined();

    const inspected = await client.callTool({ name: 'inspect', arguments: { path: bomb } });
    expect(inspected.isError).toBe(true);
    expect(JSON.stringify(inspected.content)).toContain('inflated data would pass 32 MiB');
    expect(JSON.stringify(inspected.content)).not.toContain('nodeCount');
  } finally {
    await client.close();
  }
}, 60_000);

it('stops when inflate runs past the time limit and keeps html notes from becoming markup', async () => {
  const now = Date.now;
  let calls = 0;
  Date.now = () => now() + (calls++ > 0 ? 20_000 : 0);
  const deflated = deflateRawSync(content);
  try {
    await expect(convertBuffer(makeZip([{
      name: 'content.json', data: deflated, method: 8, compressedSize: deflated.length, uncompressedSize: content.length,
    }]), 'xmind')).rejects.toThrow('decompression took longer than 10 seconds');
  } finally {
    Date.now = now;
  }

  const hostile = JSON.stringify([{
    title: 'Plan',
    rootTopic: {
      id: 'r',
      title: '<img src=x onerror=alert(1)>',
      href: 'javascript:alert(1)',
      notes: { html: { content: '<script>alert(1)</script><p>Soon</p>' } },
    },
  }]);
  const { markdown, document } = await convertBuffer(makeZip([{ name: 'content.json', data: Buffer.from(hostile) }]), 'xmind');
  expect(markdown).toContain('](javascript:alert(1))');
  expect(markdown).toContain('Soon');
  expect(markdown).not.toContain('<script');
  expect(document.root.notes).toBe('Soon');
  expect(document.root.title).toContain('<img');
  const unclosed = JSON.stringify([{
    title: 'Plan',
    rootTopic: { id: 'r', title: 'Root', notes: { html: { content: '<script>alert(1)<p>Later</p>' } } },
  }]);
  const dropped = await convertBuffer(makeZip([{ name: 'content.json', data: Buffer.from(unclosed) }]), 'xmind');
  expect(dropped.markdown).not.toContain('alert');
  expect(dropped.document.root.notes ?? '').not.toContain('alert');
  const app = await readFile(path.join(repo, 'web/src/App.tsx'), 'utf8');
  expect(app).not.toContain('dangerouslySetInnerHTML');
  expect(app).not.toContain('href={node.href}');

  expect(webErrorKey(new Error('Cannot unzip .xmind file: inflated data would pass 32 MiB (stopped after 33554432 bytes).'))).toBe('errorArchiveSize');
  expect(webErrorKey(new Error('Cannot unzip .mmap file: encrypted members are not supported.'))).toBe('errorArchiveUnsupported');
  expect(webErrorKey(new Error('Cannot unzip .xmind file: it may be corrupt or not a valid ZIP archive.'))).toBe('errorZip');
});
