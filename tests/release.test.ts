import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { multiSheetFixture } from '../test-fixtures/multi-sheet.js';
import { convertBuffer, convertFile, readMindMap } from '../src/index.js';
import { createServer } from '../src/mcp.js';
import { convertFile as webConvert } from '../web/src/converter.js';

let dir: string;
let file: string;
let buffer: Buffer;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'release-'));
  file = path.join(dir, 'multi.xmind');
  buffer = await multiSheetFixture();
  await writeFile(file, buffer);
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('0.4.0 output', () => {
  it('renders all sheets, inline labels, links, notes and list indentation', async () => {
    const { markdown, document } = await convertBuffer(buffer, 'xmind');
    expect(document.sheets).toHaveLength(3);
    expect(document.nodeCount).toBe(9);
    expect(document.maxDepth).toBe(2);
    for (const title of ['Roadmap', 'i18n', 'Retro']) expect(markdown).toContain(`# ${title}\n## [Root`);
    expect(markdown).toContain('`root-label`');
    expect(markdown).toContain('- [LCP \\[image\\]\n  中文](https://example.com/image) `P1` `tech-debt`');
    expect(markdown).toContain('  > First note\n  > Second note\n  - Leaf');
    expect(markdown).not.toContain('[Link]');
    const outline = await readMindMap(file, 'outline');
    expect(outline.content).toContain('# i18n\n- Root 2 [root-label]');
    expect(outline.content).toContain('[P1, tech-debt]');
    const imported = await convertBuffer(buffer, 'xmind', 'xmind');
    expect(imported.markdown).toContain('\n\n- Root 2');
    expect(imported.markdown).not.toMatch(/P1|root-label|^#/m);
  });

  it('selects sheets by index or case-insensitive title and reports selection', async () => {
    for (const sheet of [2, 'I18N']) {
      const result = await readMindMap(file, 'json', { sheet });
      expect(result.selectedSheet).toEqual({ index: 2, title: 'i18n' });
      expect(result.nodeCount).toBe(3);
      expect(result.maxDepth).toBe(2);
      expect(result.sheets).toEqual([
        { index: 1, title: 'Roadmap', nodeCount: 3, maxDepth: 2 },
        { index: 2, title: 'i18n', nodeCount: 3, maxDepth: 2 },
        { index: 3, title: 'Retro', nodeCount: 3, maxDepth: 2 },
      ]);
      expect(result.content).toMatchObject({ title: 'Root 2' });
    }
    await expect(readMindMap(file, 'md', { sheet: 'x' })).rejects.toThrow('Sheet "x" not found. Available: 1 Roadmap, 2 i18n, 3 Retro');
    const result = await convertFile({ input: file, format: 'md', markdownStyle: 'generic', sheet: 'Retro', output: path.join(dir, 'selected.md') });
    expect(result.selectedSheet).toEqual({ index: 3, title: 'Retro' });
    expect(await readFile(result.outputs[0], 'utf8')).toContain('# [Root 3]');
  });

  it('returns multi-sheet JSON and truncates in preorder across sheets', async () => {
    const result = await readMindMap(file, 'json', { maxNodes: 4 });
    expect(result.content).toMatchObject({ sheets: [{ root: { title: 'Root 1', children: [{ children: [{ title: 'Leaf' }] }] } }, { root: { title: 'Root 2', children: [] } }] });
    expect(result.truncated).toBe(true);
    expect(result.warnings[0]).toContain('4 of 9 nodes');
    expect(result.sheets).toHaveLength(3);
    const depth = await readMindMap(file, 'json', { maxDepth: 0 });
    expect(depth.truncated).toBe(true);
    expect(depth.warnings[0]).toContain('maxDepth 0');
    expect(depth.content).toMatchObject({ sheets: [{ root: { children: [] } }, { root: { children: [] } }, { root: { children: [] } }] });
    expect((await readMindMap(file, 'md')).truncated).toBe(false);
  });

  it('defaults to 2000 nodes and validates read limits', async () => {
    const zip = new JSZip();
    zip.file('content.json', JSON.stringify([{ rootTopic: { id: 'wide-root', title: 'Wide', children: { attached: Array.from({ length: 2001 }, (_, index) => ({ id: `wide-${index}`, title: `Node ${index}` })) } } }]));
    const wide = path.join(dir, 'wide.xmind');
    await writeFile(wide, await zip.generateAsync({ type: 'nodebuffer' }));
    const limited = await readMindMap(wide, 'json');
    expect(limited.truncated).toBe(true);
    expect(limited.warnings[0]).toContain('2000 of 2002 nodes');
    expect(limited.content).toMatchObject({ children: expect.arrayContaining([{ title: 'Node 1998', children: [] }]) });
    expect((await readMindMap(wide, 'md', { maxNodes: 3000 })).truncated).toBe(false);
    for (const options of [{ maxNodes: 0 }, { maxNodes: 50001 }, { maxDepth: -1 }, { maxDepth: 1.5 }]) {
      await expect(readMindMap(file, 'md', options)).rejects.toThrow(/must be an integer/);
    }
  });

  it('expands home paths and explains relative missing paths', async () => {
    const spy = vi.spyOn(os, 'homedir').mockReturnValue(dir);
    try {
      expect((await readMindMap('~/multi.xmind', 'md')).file).toBe(file);
      await expect(readMindMap('~/missing.xmind', 'md')).rejects.toThrow(`File not found: ~/missing.xmind (resolved to ${path.join(dir, 'missing.xmind')})`);
    }
    finally { spy.mockRestore(); }
    await expect(readMindMap('missing.xmind', 'md')).rejects.toThrow(`File not found: missing.xmind (resolved to ${path.resolve('missing.xmind')}). Relative paths resolve against the server's working directory ${process.cwd()}; pass an absolute path.`);
  });

  it('uses fallback sheet titles', async () => {
    const zip = new JSZip();
    zip.file('content.json', JSON.stringify([{ rootTopic: { title: 'Root' } }, { title: '', rootTopic: { title: 'Other' } }]));
    expect((await convertBuffer(await zip.generateAsync({ type: 'nodebuffer' }), 'xmind')).markdown).toContain('# Sheet 2\n## Other');
  });

  it('matches browser and core Markdown for both styles and input formats', async () => {
    for (const [data, extension] of [[buffer, 'xmind'], [await readFile(new URL('../test-fixtures/test.lakeboard', import.meta.url)), 'lakeboard'], [await readFile(new URL('../test-fixtures/test.xmind', import.meta.url)), 'xmind']] as const) {
      for (const style of ['generic', 'xmind'] as const) {
        expect((await webConvert(new File([new Uint8Array(data)], `map.${extension}`), style)).markdown).toBe((await convertBuffer(data, extension, style)).markdown);
      }
    }
  });

  it('returns plain MCP text and schema-validated structured metadata', async () => {
    const server = createServer();
    const client = new Client({ name: 'release-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      const { tools } = await client.listTools();
      expect(tools[0].outputSchema?.required).toContain('warnings');
      const result = await client.callTool({ name: 'convert', arguments: { path: file, sheet: 1 } });
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([{ type: 'text', text: (await readMindMap(file, 'md', { sheet: 1 })).content }]);
      const { content: _, ...metadata } = await readMindMap(file, 'md', { sheet: 1 });
      expect(result.structuredContent).toEqual(metadata);
      const limited = await client.callTool({ name: 'convert', arguments: { path: file, maxNodes: 1 } });
      expect(limited.content).toMatchObject([{ text: expect.stringContaining('> Note: Output truncated') }]);
    } finally { await client.close(); await server.close(); }
  });
});
