import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readMindMap } from '../src/agent.js';
import { createServer } from '../src/mcp.js';

const fixture = (name: string) => path.join(__dirname, '..', 'test-fixtures', name);
const run = promisify(execFile);

describe('readMindMap: agent-readable output', () => {
  it('returns markdown with stable metadata', async () => {
    const r = await readMindMap(fixture('test.lakeboard'), 'md');
    expect(r.schemaVersion).toBe(1);
    expect(r.source).toBe('lakeboard');
    expect(r.format).toBe('md');
    expect(r.content).toContain('# Lakeboard Test Root');
    expect(r.nodeCount).toBeGreaterThanOrEqual(5);
  });

  it('returns the topic tree as json without raw html', async () => {
    const r = await readMindMap(fixture('test.lakeboard'), 'json');
    const tree = r.content as { title: string; children: { title: string }[] };
    expect(tree.title).toBe('Lakeboard Test Root');
    expect(tree.children.map((c) => c.title)).toEqual(['Branch Alpha', 'Branch Beta', 'Branch Gamma']);
    expect(JSON.stringify(tree)).not.toContain('rawHtml');
  });

  it('returns a compact outline for xmind files', async () => {
    const r = await readMindMap(fixture('test.xmind'), 'outline');
    expect(r.source).toBe('xmind');
    expect(typeof r.content).toBe('string');
    expect((r.content as string).split('\n')[0]).not.toMatch(/^\s/);
  });

  it('rejects unsupported formats and files', async () => {
    await expect(readMindMap(fixture('test.lakeboard'), 'pdf' as never)).rejects.toThrow(/format/);
    await expect(readMindMap(fixture('create-test-xmind.ts'), 'md')).rejects.toThrow();
  });
});

describe('MCP server: convert tool', () => {
  async function connect() {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([createServer().connect(a), client.connect(b)]);
    return client;
  }

  it('lists a single read-only convert tool', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['convert']);
    expect(tools[0].annotations?.readOnlyHint).toBe(true);
  });

  it('converts a lakeboard file to json via a tool call', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'convert', arguments: { path: fixture('test.lakeboard'), format: 'json' } });
    const text = (res.content as { type: string; text: string }[])[0].text;
    const body = JSON.parse(text);
    expect(body.title).toBe('Lakeboard Test Root');
    expect(res.isError).toBeFalsy();
  });

  it('returns a tool error instead of crashing on a missing file', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'convert', arguments: { path: '/nope.lakeboard', format: 'md' } });
    expect(res.isError).toBe(true);
  });
});

describe('CLI --json', () => {
  it('read prints one JSON document', async () => {
    const { stdout } = await run('npx', ['tsx', 'src/cli.ts', 'read', fixture('test.lakeboard'), '--format', 'outline', '--json']);
    const body = JSON.parse(stdout);
    expect(body.format).toBe('outline');
    expect(body.content).toContain('Branch Alpha');
  }, 20000);
});

describe('CLI mcp subcommand', () => {
  it('answers an MCP initialize over stdio', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('npx', ['tsx', 'src/cli.ts', 'mcp']);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
    const line: string = await new Promise((resolve) => child.stdout.once('data', (d) => resolve(String(d))));
    child.kill();
    expect(JSON.parse(line).result.serverInfo.name).toBe('lakeboard-converter');
  }, 20000);
});
