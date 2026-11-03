import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import JSZip from 'jszip';
import { buildMindMap, convertBuffer, convertFile, inspectMindMap, readMindMap, readMindMaps } from '../src/index.js';
import { createServer } from '../src/mcp.js';
import { convertFile as webConvert } from '../web/src/converter.js';

const run = promisify(execFile);
const fixture = (name: string) => path.join(__dirname, '..', 'test-fixtures', name);
const text = (name: string) => readFile(fixture(name), 'utf8');

const opml = [
  '# Launch plan',
  '- Alpha',
  '  > Ship the reader',
  '- Beta & friends',
  '  - [Docs](https://example.com/docs) `P1` `docs`',
  '- Gamma & co',
  '  - 计划',
  '',
].join('\n');

const freemind = [
  '# FreeMind root',
  '- Alpha',
  '  - Alpha.1',
  '- [Beta](https://example.com/beta)',
  '  > A note',
  '  > Second line',
  '- Gamma & co',
  '  - 计划',
  '',
].join('\n');

const freeplane = [
  '# Freeplane root',
  '- plain `owner=Ada`',
  '- Rich title',
  '  - Child',
  '',
].join('\n');

const markmap = [
  '# Markmap root',
  '- Evidence',
  '  - Alpha',
  '    - Alpha.1',
  '  - [Docs](https://example.com/docs)',
  '- Questions',
  '  > Open',
  '',
].join('\n');

const mindmanager = [
  '# MindManager root',
  '- Alpha',
  '  - Alpha.1',
  '    > Ship it',
  '- [Beta](https://example.com/beta) `P1`',
  '- Floating',
  '',
].join('\n');

async function packedMindManager(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('Document.xml', await readFile(fixture('mindmanager.xml')));
  return zip.generateAsync({ type: 'nodebuffer' });
}

it('reads OPML outlines as Markdown, including notes, links and categories', async () => {
  const { markdown, document } = await convertBuffer(await readFile(fixture('outline.opml')), 'opml');
  expect(markdown).toBe(opml);
  expect(document).toMatchObject({ format: 'opml', nodeCount: 6, maxDepth: 2 });
  const wrapped = await convertBuffer(Buffer.from('<opml version="2.0"><head><title>Inbox</title></head><body><outline text="A"/><outline text="B"/></body></opml>'), 'opml');
  expect(wrapped.markdown).toBe('# Inbox\n- A\n- B\n');
  await expect(convertBuffer(Buffer.from('<opml version="2.0"><head><title>Empty</title></head><body></body></opml>'), 'opml')).rejects.toThrow('no outlines');
  await expect(convertBuffer(Buffer.from('<map></map>'), 'opml')).rejects.toThrow('not an OPML');
  await expect(convertBuffer(Buffer.from('\uFEFF<nope'), 'opml')).rejects.toThrow('Failed to parse OPML');
});

it('reads FreeMind and Freeplane maps, including folded topics, rich notes and attributes', async () => {
  const mind = await convertBuffer(await readFile(fixture('freemind.mm')), 'freemind');
  expect(mind.markdown).toBe(freemind);
  expect(mind.document).toMatchObject({ format: 'freemind', nodeCount: 6, maxDepth: 2 });
  const plane = await convertBuffer(await readFile(fixture('freeplane.mm')), 'freemind');
  expect(plane.markdown).toBe(freeplane);
  expect(plane.document.format).toBe('freeplane');
  const detected = await convertBuffer(Buffer.from('<map version="1.0.1"><node TEXT="Root"><attribute NAME="k" VALUE="v"/></node></map>'), 'freemind');
  expect(detected.document.format).toBe('freeplane');
  expect(detected.markdown).toBe('# Root `k=v`\n');
  const noted = await convertBuffer(Buffer.from('<map version="1.0.1"><node TEXT="Root"><richcontent TYPE="NOTE"><![CDATA[<p>A &amp; B</p>]]></richcontent></node></map>'), 'freemind');
  expect(noted.markdown).toBe('# Root\n> A & B\n');
  expect(noted.document.format).toBe('freemind');
  await expect(convertBuffer(Buffer.from('<map></map>'), 'freemind')).rejects.toThrow('no root node');
});

it('reads markmap headings and ignores front matter and markmap comments', async () => {
  const { markdown, document } = await convertBuffer(await readFile(fixture('markmap.md')), 'markdown');
  expect(markdown).toBe(markmap);
  expect(document).toMatchObject({ format: 'markdown', nodeCount: 6, maxDepth: 3 });
  const built = await buildMindMap('---\ntitle: Demo\n---\n<!-- markmap: markmap.initialExpandLevel = 2 -->\n# Root\n- Child');
  expect(built.warnings).toEqual([]);
  expect(built.nodeCount).toBe(2);
  const read = await readMindMap(fixture('markmap.md'), 'md');
  expect(read.warnings).toEqual([]);
  expect(read.source).toBe('markdown');
});

it('reads MindManager zip and raw Document.xml, including notes, links, categories and floating topics', async () => {
  const xml = await readFile(fixture('mindmanager.xml'));
  const zipped = await packedMindManager();
  const fromZip = await convertBuffer(zipped, 'mindmanager');
  const fromXml = await convertBuffer(xml, 'mindmanager');
  const fromFile = await convertBuffer(await readFile(fixture('mindmanager.mmap')), 'mindmanager');
  expect(fromZip.markdown).toBe(mindmanager);
  expect(fromXml.markdown).toBe(mindmanager);
  expect(fromFile.markdown).toBe(mindmanager);
  expect(fromZip.document).toMatchObject({ format: 'mindmanager', nodeCount: 5, maxDepth: 2 });
  const legacy = await convertBuffer(Buffer.from('<Map><Topic Text="Root"><Topic Text="Child"/></Topic></Map>'), 'mindmanager');
  expect(legacy.markdown).toBe('# Root\n- Child\n');
  await expect(convertBuffer(Buffer.from('<Map></Map>'), 'mindmanager')).rejects.toThrow('no central topic');
  await expect(convertBuffer(Buffer.from('PK\x03\x04broken'), 'mindmanager')).rejects.toThrow('Cannot unzip .mmap');
});

it('inspects and reads each new format end to end, including Markdown extensions', async () => {
  const cases = [
    ['outline.opml', 'opml', opml],
    ['freemind.mm', 'freemind', freemind],
    ['freeplane.mm', 'freeplane', freeplane],
    ['markmap.md', 'markdown', markmap],
    ['mindmanager.mmap', 'mindmanager', mindmanager],
  ] as const;
  for (const [name, source, markdown] of cases) {
    const read = await readMindMap(fixture(name), 'md');
    const inspected = await inspectMindMap(fixture(name));
    expect(read).toMatchObject({ source, content: markdown, nodeCount: inspected.nodeCount, maxDepth: inspected.maxDepth });
    expect(inspected.source).toBe(source);
    expect(inspected).not.toHaveProperty('content');
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'formats-'));
  try {
    const outline = path.join(dir, 'plan.markdown');
    await writeFile(outline, '# Root\n- Child\n');
    expect((await readMindMap(outline, 'outline')).source).toBe('markdown');
    const input = path.join(dir, 'plan.opml');
    await writeFile(input, await text('outline.opml'));
    const written = await convertFile({ input, format: 'md', markdownStyle: 'generic', outDir: dir });
    expect(await readFile(written.outputs[0], 'utf8')).toBe(opml);
    const batch = await readMindMaps([fixture('outline.opml'), fixture('freemind.mm')], 'md');
    expect(batch).toMatchObject({ succeeded: 2, failed: 0 });
    expect(batch.results.map(entry => entry.result.source)).toEqual(['opml', 'freemind']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  expect((await inspectMindMap(fixture('test.xmind'))).source).toBe('xmind');
  expect((await inspectMindMap(fixture('test.lakeboard'))).source).toBe('lakeboard');
});

it('lists every input format in CLI help and prints OPML from read', async () => {
  const help = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help']);
  const readHelp = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'read', '--help']);
  const inspectHelp = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'inspect', '--help']);
  const convertHelp = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'convert', '--help']);
  for (const extension of ['.opml', '.mm', '.md', '.markdown', '.lakeboard', '.xmind', '.mmap']) {
    expect(help.stdout).toContain(extension);
    expect(readHelp.stdout).toContain(extension);
    expect(inspectHelp.stdout).toContain(extension);
    expect(convertHelp.stdout).toContain(extension);
  }
  const read = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'read', fixture('outline.opml')]);
  expect(read.stdout).toBe(opml);
  const inspected = await run(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'inspect', fixture('freeplane.mm'), '--json']);
  expect(JSON.parse(inspected.stdout).source).toBe('freeplane');
}, 30000);

it('reports the format from MCP inspect and keeps the browser output identical', async () => {
  const server = createServer();
  const client = new Client({ name: 'formats', version: '1' });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(local), client.connect(remote)]);
  try {
    const inspected = await client.callTool({ name: 'inspect', arguments: { path: fixture('outline.opml') } });
    expect(inspected.isError).toBeFalsy();
    expect(inspected.structuredContent).toMatchObject({ source: 'opml', nodeCount: 6 });
    expect((inspected.content as { text: string }[])[0].text).toContain('opml:');
    const plane = await client.callTool({ name: 'inspect', arguments: { path: fixture('freeplane.mm') } });
    expect(plane.structuredContent).toMatchObject({ source: 'freeplane' });
    const converted = await client.callTool({ name: 'convert', arguments: { path: fixture('freemind.mm'), format: 'md' } });
    expect((converted.content as { text: string }[])[0].text).toBe(freemind);
  } finally {
    await client.close();
    await server.close();
  }

  const packed = await packedMindManager();
  const files = [
    ['outline.opml', 'opml'],
    ['freemind.mm', 'freemind'],
    ['freeplane.mm', 'freemind'],
    ['markmap.md', 'markdown'],
    ['mindmanager.mmap', 'mindmanager'],
  ] as const;
  for (const [name, format] of files) {
    const data = name === 'mindmanager.mmap' ? packed : await readFile(fixture(name));
    for (const style of ['generic', 'xmind'] as const) {
      const browser = await webConvert(new File([new Uint8Array(data)], name), style);
      const core = await convertBuffer(data, format, style);
      expect(browser.markdown).toBe(core.markdown);
      expect(browser.document.nodeCount).toBe(core.document.nodeCount);
    }
  }
});
