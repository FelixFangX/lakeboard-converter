import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { convertBuffer, convertFile, parseXmindBuffer } from '../src/index.js';

const fixture = (name: string) => path.join(__dirname, '..', 'test-fixtures', name);
const lakeboard = () => readFile(fixture('test.lakeboard'));
const xmind = () => readFile(fixture('test.xmind'));

describe('convertBuffer: .lakeboard → Markdown', () => {
  it('keeps the root and branch titles in order', async () => {
    const { markdown } = await convertBuffer(await lakeboard(), 'lakeboard');
    const iRoot = markdown.indexOf('Lakeboard Test Root');
    const iAlpha = markdown.indexOf('Alpha');
    const iBeta = markdown.indexOf('Branch Beta');
    expect(iRoot).toBeGreaterThanOrEqual(0);
    expect(iAlpha).toBeGreaterThan(iRoot);
    expect(iBeta).toBeGreaterThan(iAlpha);
  });
  it('renders the full outline: root as heading, children as nested list', async () => {
    const { markdown } = await convertBuffer(await lakeboard(), 'lakeboard');
    expect(markdown.trim()).toBe(
      [
        '# Lakeboard Test Root',
        '- Branch Alpha',
        '  - Sub-item Alpha.1',
        '  - Sub-item Alpha.2',
        '- Branch Beta',
        '  - Sub-item Beta.1',
        '- Branch Gamma',
      ].join('\n'),
    );
  });
  it('reports node count and depth', async () => {
    const { document } = await convertBuffer(await lakeboard(), 'lakeboard');
    expect(document.nodeCount).toBeGreaterThanOrEqual(5);
    expect(document.maxDepth).toBeGreaterThanOrEqual(2);
  });
  it('strips HTML markup from titles', async () => {
    const { markdown } = await convertBuffer(await lakeboard(), 'lakeboard');
    expect(markdown).not.toMatch(/<\/?(p|strong)>/);
  });
});

describe('convertBuffer: .xmind → Markdown', () => {
  it('produces Markdown with the same structure stats as parsing', async () => {
    const buf = await xmind();
    const { markdown, document } = await convertBuffer(buf, 'xmind');
    const parsed = await parseXmindBuffer(buf);
    expect(markdown.length).toBeGreaterThan(0);
    expect(markdown).toContain(parsed.root.title);
    expect(document.nodeCount).toBe(parsed.nodeCount);
  });
});

describe('convertFile', () => {
  it('writes .md next to the input and refuses to overwrite by default', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lbc-'));
    const input = path.join(dir, 'map.lakeboard');
    await copyFile(fixture('test.lakeboard'), input);
    const res = await convertFile({ input, format: 'md', markdownStyle: 'generic' });
    expect(res.outputs).toEqual([path.join(dir, 'map.md')]);
    await expect(convertFile({ input, format: 'md', markdownStyle: 'generic' })).rejects.toThrow();
  });
  it('round-trips: lakeboard → .xmind → parse keeps node count', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lbc-'));
    const input = path.join(dir, 'map.lakeboard');
    await copyFile(fixture('test.lakeboard'), input);
    const { nodeCount, outputs } = await convertFile({ input, format: 'xmind', markdownStyle: 'generic' });
    const back = await parseXmindBuffer(await readFile(outputs[0]));
    expect(back.nodeCount).toBe(nodeCount);
  });
  it('rejects unsupported extensions', async () => {
    await expect(convertFile({ input: 'x.txt', format: 'md', markdownStyle: 'generic' })).rejects.toThrow(/Unsupported input format: \.txt/);
  });
});
