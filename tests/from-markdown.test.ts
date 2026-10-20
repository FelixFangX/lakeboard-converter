import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMindMap, convertBuffer, parseMarkdownOutline, parseXmindBuffer, readMindMap, renderGenericMarkdown } from '../src/index.js';
import { createServer } from '../src/mcp.js';
import { multiSheetFixture } from '../test-fixtures/multi-sheet.js';

const dirs: string[] = [];
async function temp() { const dir = await mkdtemp(path.join(os.tmpdir(), 'from-markdown-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

it('round-trips headings, lists, links, labels and notes through XMind', async () => {
  const file = path.join(await temp(), 'map.xmind');
  await buildMindMap('# Root\n## Plan\n- [Docs \\[v1\\]](https://example.com) `P1`\n  > First\n  > Second\n  1. Child\n    + Deep\n## Next\n', { output: file });
  expect((await readMindMap(file, 'md')).content).toBe('# Root\n- Plan\n  - [Docs \\[v1\\]](https://example.com) `P1`\n    > First\n    > Second\n    - Child\n      - Deep\n- Next\n');
});

it('preserves the renderer fixed point for all three fixtures', async () => {
  for (const [data, format] of [[await readFile(new URL('../test-fixtures/test.xmind', import.meta.url)), 'xmind'], [await readFile(new URL('../test-fixtures/test.lakeboard', import.meta.url)), 'lakeboard'], [await multiSheetFixture(), 'xmind']] as const) {
    const { markdown } = await convertBuffer(data, format);
    expect(renderGenericMarkdown(parseMarkdownOutline(markdown))).toBe(markdown);
  }
});

it('returns valid base64 without writing files', async () => {
  const dir = await temp();
  const result = await buildMindMap('# Root\n- Child');
  expect((await parseXmindBuffer(Buffer.from(result.base64!, 'base64'))).nodeCount).toBe(2);
  expect(await readdir(dir)).toEqual([]);
  expect(result.output).toBeUndefined();
});

it('refuses overwrites and invalid paths and accepts explicit overwrites', async () => {
  const dir = await temp(); const output = path.join(dir, 'map.xmind');
  await buildMindMap('# Root', { output });
  await expect(buildMindMap('# Other', { output })).rejects.toThrow(output);
  await buildMindMap('# Other', { output, overwrite: true });
  expect((await readMindMap(output, 'md')).content).toBe('# Other\n');
  await expect(buildMindMap('# Root', { output: 'relative.xmind' })).rejects.toThrow('absolute');
  await expect(buildMindMap('# Root', { output: path.join(dir, 'map.md') })).rejects.toThrow('.xmind');
  await expect(buildMindMap('# Root', { output: path.join(dir, 'missing', 'map.xmind') })).rejects.toThrow('parent directory');
});

it('rejects empty outlines, oversized input and invalid limits', async () => {
  for (const markdown of ['', '  \n', 'Just a paragraph']) await expect(buildMindMap(markdown)).rejects.toThrow('heading or list');
  await expect(buildMindMap('# ' + 'a'.repeat(2 * 1024 * 1024))).rejects.toThrow('2 MB');
  for (const maxNodes of [0, 50001, 1.5]) await expect(buildMindMap('# Root', { maxNodes })).rejects.toThrow('integer');
});

it('truncates in preorder and reports statistics for written sheets', async () => {
  const result = await buildMindMap('# A\n## Root\n- One\n  - Two\n\n# B\n## Other\n- Three', { maxNodes: 2 });
  expect(result).toMatchObject({ truncated: true, nodeCount: 2, maxDepth: 1, sheets: [{ index: 1, title: 'A', nodeCount: 2, maxDepth: 1 }] });
  expect(result.warnings[0]).toContain('2 of 5');
});

it('supports wrappers, tabs, literal code notes and deterministic IDs', () => {
  const markdown = '- One\n\t- Two\n- Three\n\nParagraph\n```md\n# Literal\n```';
  const doc = parseMarkdownOutline(markdown, { title: 'Custom' });
  expect(doc.root.title).toBe('Custom');
  expect(doc.root.children[0].children[0].title).toBe('Two');
  expect(doc.root.children[1].notes).toBe('Paragraph\n```md\n# Literal\n```');
  expect(parseMarkdownOutline(markdown, { title: 'Custom' })).toEqual(doc);
});

it('preserves multiline titles and arbitrary code label fences', () => {
  const doc = parseMarkdownOutline('# Root\ncontinued\n- [A \\[B\\]\\\\\n  C](https://example.com) `` a`b `` `P1`\n  > note\n  > next');
  const markdown = renderGenericMarkdown(doc);
  expect(markdown).toBe('# Root\ncontinued\n- [A \\[B\\]\\\\\n  C](https://example.com) `` a`b `` `P1`\n  > note\n  > next\n');
});

it('registers from_markdown with schema-validated results and errors', async () => {
  const server = createServer(); const client = new Client({ name: 'build-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const tool = (await client.listTools()).tools.find(tool => tool.name === 'from_markdown')!;
    expect(tool.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(tool.outputSchema?.required).toContain('bytes');
    // The SDK client validates structuredContent against the advertised output schema.
    const result = await client.callTool({ name: 'from_markdown', arguments: { markdown: '# Root' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ schemaVersion: 1, source: 'markdown', nodeCount: 1 });
    expect((await client.callTool({ name: 'from_markdown', arguments: { markdown: '' } })).isError).toBe(true);
  } finally { await client.close(); await server.close(); }
});

it('uses the root title for a single sheet and warns about ignored preamble lines', async () => {
  const result = await buildMindMap('Preamble\n\nAnother line\n```\n# Literal\n```\n# Root\n- Child');
  expect(result.sheets[0].title).toBe('Root');
  expect(result.warnings).toEqual(['Ignored 5 lines before the first heading or list item.']);
  expect((await buildMindMap('- Root', { title: 'Custom' })).sheets[0].title).toBe('Custom');
  expect((await buildMindMap('# Root')).warnings).toEqual([]);
});
