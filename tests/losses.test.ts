import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import JSZip from 'jszip';
import { buildMindMap, convertBuffer, convertFile, inspectMindMap, readMindMap } from '../src/index.js';
import { lossSentence } from '../src/core/losses.js';
import { createServer } from '../src/mcp.js';
import { convertFile as webConvert } from '../web/src/converter.js';

const run = promisify(execFile);
const fixture = (name: string) => path.join(__dirname, '..', 'test-fixtures', name);
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'losses-'));
  dirs.push(dir);
  return dir;
}

/** Synthetic XMind Zen workbook. Not a user file. */
async function zenZip(sheets: unknown[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(sheets));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const zenSheet = {
  title: 'Plan',
  relationships: [{ id: 'r1' }, { id: 'r2' }],
  rootTopic: {
    id: 'root',
    title: 'Root',
    href: 'xmind:#alpha',
    notes: {},
    children: {
      attached: [
        { id: 'alpha', title: 'Alpha', notes: { plain: { content: 'Keep me' } } },
        { id: 'html', title: 'Html', notes: { plain: { content: '   ' }, html: { content: '<p>Soon</p>' } } },
        { id: 'img', title: 'Img', notes: { html: { content: '<img src="a.png">' } } },
      ],
      detached: [{ id: 'float', title: 'Floating' }],
      summary: [{ id: 'sum', title: 'Summary of Alpha', notes: { html: { content: '<img alt="skip">' } } }],
    },
  },
};

const zenLosses = [
  { code: 'relationship', count: 2 },
  { code: 'summary', count: 1 },
  { code: 'rich-note', count: 2 },
];

it('keeps XMind Zen floating topics and HTML notes, and reports what it drops', async () => {
  const bytes = await zenZip([zenSheet]);
  const { markdown, document } = await convertBuffer(bytes, 'xmind');
  expect(markdown).toBe([
    '# [Root](xmind:#alpha)',
    '- Alpha',
    '  > Keep me',
    '- Html',
    '  > Soon',
    '- Img',
    '- Floating',
    '',
  ].join('\n'));
  expect(markdown).not.toContain('Summary of Alpha');
  expect(document.losses).toEqual(zenLosses);
  expect(document.losses?.map(lossSentence)).toEqual([
    'Dropped 2 relationships.',
    'Dropped 1 summary topic.',
    'Dropped 2 notes with no plain text.',
  ]);

  const selected = await convertBuffer(await zenZip([
    { title: 'One', rootTopic: { id: 'a', title: 'A' } },
    { title: 'Two', relationships: [{}], rootTopic: { id: 'b', title: 'B' } },
  ]), 'xmind', 'generic', { sheet: 1 });
  expect(selected.markdown).toBe('# A\n');
  expect(selected.document.losses).toEqual([{ code: 'relationship', count: 1 }]);

  const clean = await convertBuffer(await readFile(fixture('test.xmind')), 'xmind');
  expect(clean.document.losses).toEqual([]);
  expect(clean.markdown.startsWith('# XMind Test Root')).toBe(true);
});

it('reports XMind 8 summaries, relationships, internal links and notes with no text', async () => {
  const xml = `<?xml version="1.0"?>
<xmap-content>
  <sheet>
    <title>S</title>
    <topic id="r"><title>Root</title>
      <children>
        <topics type="attached"><topic id="a"><title>A</title>
          <notes><html><xhtml:img src="a.png"/></html></notes>
        </topic></topics>
        <topics type="summary"><topic id="s"><title>Sum</title></topic></topics>
        <topics type="detached"><topic id="d" href="file:///tmp/a"><title>Float</title></topic></topics>
      </children>
    </topic>
    <relationships><relationship id="rel"/></relationships>
  </sheet>
</xmap-content>`;
  const zip = new JSZip();
  zip.file('content.xml', xml);
  const { markdown, document } = await convertBuffer(await zip.generateAsync({ type: 'nodebuffer' }), 'xmind');
  expect(markdown).toBe('# Root\n- A\n- Float\n');
  expect(markdown).not.toContain('file:');
  expect(markdown).not.toContain('Sum');
  expect(document.losses).toEqual([
    { code: 'relationship', count: 1 },
    { code: 'summary', count: 1 },
    { code: 'internal-link', count: 1 },
    { code: 'rich-note', count: 1 },
  ]);
});

it('reports FreeMind arrows and encrypted titles, MindManager rich notes, and non-web links', async () => {
  const edges = await readMindMap(fixture('freemind-edges.mm'), 'md');
  expect(edges.content).toContain('- Secret');
  expect(edges.losses).toEqual([
    { code: 'relationship', count: 1 },
    { code: 'encrypted', count: 1 },
  ]);
  expect(edges.warnings).toEqual([
    'Dropped 1 relationship.',
    'Kept 1 encrypted topic as title only.',
  ]);

  const mind = await convertBuffer(Buffer.from(`<Map><OneTopic><Topic Text="Root">
    <NotesData><Font/></NotesData>
    <SubTopics><Topic Text="Child"><NotesData PlainText="Kept"/></Topic></SubTopics>
  </Topic></OneTopic></Map>`), 'mindmanager');
  expect(mind.markdown).toBe('# Root\n- Child\n  > Kept\n');
  expect(mind.document.losses).toEqual([{ code: 'rich-note', count: 1 }]);

  const thoughts = await convertBuffer(Buffer.from('<map><topic text="Root" link="xmind:#nope"><topic text="Web" link="https://example.com"/></topic></map>'), 'ithoughts');
  expect(thoughts.markdown).toBe('# Root\n- [Web](https://example.com)\n');
  expect(thoughts.document.losses).toEqual([{ code: 'internal-link', count: 1 }]);

  const simple = await convertBuffer(Buffer.from(`<mindmap><relations><relation id="1"/></relations>
    <topic id="r" text="Root"><link diagramref="other"/></topic></mindmap>`), 'simplemind');
  expect(simple.markdown).toBe('# Root\n');
  expect(simple.document.losses).toEqual([
    { code: 'relationship', count: 1 },
    { code: 'internal-link', count: 1 },
  ]);

  const opml = await convertBuffer(Buffer.from('<opml version="2.0"><head><title>Inbox</title></head><body><outline text="A"/></body></opml>'), 'opml');
  expect(opml.document.losses).toEqual([]);
  expect(await buildMindMap('# Root')).not.toHaveProperty('losses');
});

it('surfaces the same losses on read, inspect, convert, MCP and the web converter', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'lossy.xmind');
  const bytes = await zenZip([zenSheet]);
  await writeFile(file, bytes);

  const read = await readMindMap(file, 'md', { maxNodes: 1 });
  expect(read.losses).toEqual(zenLosses);
  expect(read.warnings[0]).toBe('Dropped 2 relationships.');
  expect(read.warnings.at(-1)).toContain('Output truncated at 1 of');
  expect(await inspectMindMap(file)).toMatchObject({ losses: zenLosses, nodeCount: 5 });

  const cli = process.execPath;
  const args = ['--import', 'tsx', 'src/cli.ts'];
  const readCli = await run(cli, [...args, 'read', file], { cwd: path.join(__dirname, '..') });
  expect(readCli.stdout).toContain('- Floating');
  expect(readCli.stdout).toContain('> Note: Dropped 2 relationships. Dropped 1 summary topic. Dropped 2 notes with no plain text.');
  const inspectCli = await run(cli, [...args, 'inspect', file], { cwd: path.join(__dirname, '..') });
  expect(inspectCli.stdout).toMatch(/5 nodes, max depth 1/);
  expect(inspectCli.stdout.trim().endsWith('> Note: Dropped 2 relationships. Dropped 1 summary topic. Dropped 2 notes with no plain text.')).toBe(true);
  const converted = await run(cli, [...args, 'convert', file, '--format', 'md', '--out-dir', dir, '--json'], { cwd: path.join(__dirname, '..') });
  expect(JSON.parse(converted.stdout).losses).toEqual(zenLosses);
  const human = await run(cli, [...args, 'convert', file, '--format', 'md', '--out-dir', dir, '--overwrite'], { cwd: path.join(__dirname, '..') });
  expect(human.stdout).toContain('Done: 5 nodes, max depth 1');
  expect(human.stdout).toContain('> Note: Dropped 2 relationships.');

  const clean = await run(cli, [...args, 'convert', fixture('test.xmind'), '--format', 'md', '--out-dir', dir, '--overwrite'], { cwd: path.join(__dirname, '..') });
  expect(clean.stdout).not.toContain('> Note:');
  expect(clean.stdout).toContain('Done:');

  const server = createServer();
  const client = new Client({ name: 'losses', version: '1' });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(local), client.connect(remote)]);
  try {
    const inspected = await client.callTool({ name: 'inspect', arguments: { path: file } });
    expect(inspected.structuredContent).toMatchObject({ losses: zenLosses });
    expect(inspected.content).toMatchObject([{ text: expect.stringContaining('> Note: Dropped 2 relationships.') }]);
    const convertedTool = await client.callTool({ name: 'convert', arguments: { path: file, format: 'md' } });
    expect(convertedTool.structuredContent).toMatchObject({ losses: zenLosses });
    expect(convertedTool.content).toMatchObject([{ text: expect.stringContaining('> Soon') }]);
    expect(convertedTool.content).toMatchObject([{ text: expect.stringContaining('> Note: Dropped 2 relationships. Dropped 1 summary topic. Dropped 2 notes with no plain text.') }]);
  } finally {
    await client.close();
    await server.close();
  }

  const web = await webConvert(new File([new Uint8Array(bytes)], 'lossy.xmind'), 'generic');
  const core = await convertBuffer(bytes, 'xmind');
  expect(web.markdown).toBe(core.markdown);
  expect(web.document.losses).toEqual(core.document.losses);

  const written = await convertFile({ input: file, format: 'md', markdownStyle: 'generic', outDir: dir, overwrite: true });
  expect(written.losses).toEqual(zenLosses);
});
