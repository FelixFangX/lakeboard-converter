import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { inspectMindMap, readMindMap, readMindMaps } from '../src/agent.js';
import { createServer } from '../src/mcp.js';
import { multiSheetFixture } from '../test-fixtures/multi-sheet.js';

let dir: string;
let good: string;
let missing: string;
let unsupported: string;
let corrupt: string;
const lakeboard = path.resolve('test-fixtures/test.lakeboard');
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'batch-inspect-'));
  good = path.join(dir, 'multi.xmind'); missing = path.join(dir, 'missing.xmind');
  unsupported = path.join(dir, 'bad.txt'); corrupt = path.join(dir, 'bad.xmind');
  await writeFile(good, await multiSheetFixture());
  await writeFile(unsupported, 'text'); await writeFile(corrupt, 'not a zip');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

it('isolates mixed file errors and preserves input indices and order', async () => {
  const files = [good, missing, lakeboard, unsupported, corrupt];
  const result = await readMindMaps(files, 'md');
  expect(result).toMatchObject({ total: 5, succeeded: 2, failed: 3 });
  expect(result.results.map(({ index, file }) => ({ index, file }))).toEqual([{ index: 0, file: good }, { index: 2, file: lakeboard }]);
  expect(result.errors).toEqual([1, 3, 4].map(index => ({ index, file: files[index], error: expect.any(String) })));
  expect((await readMindMaps([good, good], 'md', { sheet: 'absent' })).failed).toBe(2);
});

it('counts returned nodes, truncates at total budget and skips remaining files', async () => {
  const result = await readMindMaps([good, good, good], 'json', { maxNodes: 4, maxTotalNodes: 6 });
  expect(result).toMatchObject({ succeeded: 2, failed: 1, nodeCount: 6, truncated: true });
  expect(result.results.map(entry => entry.result.nodeCount)).toEqual([4, 2]);
  expect(result.errors[0]).toEqual({ index: 2, file: good, error: 'Skipped: total node budget (6) used up. Pass a higher maxTotalNodes or fewer files.' });
  expect(result.warnings).toContain(result.errors[0].error);
  expect((await readMindMaps([good, good], 'json', { maxDepth: 0 })).nodeCount).toBe(6);
});

it('validates batch limits before reading', async () => {
  for (const files of [[], Array(51).fill(good)]) await expect(readMindMaps(files, 'md')).rejects.toThrow('1 to 50');
  for (const options of [{ maxNodes: 0 }, { maxNodes: 50001 }, { maxNodes: 1.5 }, { maxTotalNodes: 0 }, { maxTotalNodes: 200001 }, { maxTotalNodes: 1.5 }, { maxDepth: -1 }, { maxDepth: 0.5 }]) {
    await expect(readMindMaps([good], 'md', options)).rejects.toThrow('integer');
  }
  await expect(readMindMaps([good], 'wrong' as 'md')).rejects.toThrow('Unsupported format');
  expect((await readMindMaps([good, good], 'md')).succeeded).toBe(2);
});

it('inspects full and selected counts without content', async () => {
  for (const file of [good, lakeboard]) {
    for (const options of [{}, { sheet: 1 }]) {
      const inspected = await inspectMindMap(file, options);
      const read = await readMindMap(file, 'json', options);
      expect(inspected).toMatchObject({ schemaVersion: 1, file: path.resolve(file), nodeCount: read.nodeCount, maxDepth: read.maxDepth, sheets: read.sheets, bytes: (await stat(file)).size });
      expect(inspected).not.toHaveProperty('content');
    }
  }
  await expect(inspectMindMap(missing)).rejects.toThrow('File not found');
  await expect(inspectMindMap(good, { sheet: 'absent' })).rejects.toThrow('not found');
});

it('exposes read-only MCP tools, strips batch content metadata and never writes files', async () => {
  const server = createServer(); const client = new Client({ name: 'batch-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const before = await readdir(dir);
  try {
    const { tools } = await client.listTools();
    for (const name of ['convert', 'convert_many', 'inspect']) {
      expect(tools.find(tool => tool.name === name)?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
    }
    expect(tools.find(tool => tool.name === 'from_markdown')?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: false });
    const batch = await client.callTool({ name: 'convert_many', arguments: { paths: [good, missing], format: 'json' } });
    expect(batch.isError).toBe(false);
    expect(batch.structuredContent).toMatchObject({ succeeded: 1, failed: 1 });
    const entries = batch.structuredContent!.results as { result: Record<string, unknown> }[];
    expect(entries[0].result).not.toHaveProperty('content');
    expect(batch.content).toMatchObject([{ text: expect.stringContaining(`## ${good}`) }]);
    const inspected = await client.callTool({ name: 'inspect', arguments: { path: good, sheet: 2 } });
    expect(inspected.isError).toBeFalsy();
    expect(inspected.structuredContent).toEqual(await inspectMindMap(good, { sheet: 2 }));
    expect(inspected.content).toMatchObject([{ text: expect.stringMatching(/3 sheets, 3 nodes, max depth 2, \d+ KB/) }]);
    expect((await client.callTool({ name: 'inspect', arguments: { path: missing } })).isError).toBe(true);
    expect((await client.callTool({ name: 'convert_many', arguments: { paths: [] } })).isError).toBe(true);
    expect(await readdir(dir)).toEqual(before);
  } finally { await client.close(); await server.close(); }
});
