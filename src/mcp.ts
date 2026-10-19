#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readMindMap } from './agent.js';

const { version } = createRequire(import.meta.url)('../package.json');

export function createServer(): McpServer {
  const server = new McpServer({ name: 'lakeboard-converter', version });
  server.registerTool(
    'convert',
    {
      title: 'Read a mind map',
      description:
        'Read a Yuque Lakeboard (.lakeboard) or XMind (.xmind) mind map from a local path. ' +
        'format "md" = nested Markdown list, "json" = topic tree, "outline" = compact indented text. Read-only.',
      inputSchema: {
        path: z.string().describe('Absolute or working-directory-relative path to a .lakeboard or .xmind file'),
        format: z.enum(['md', 'json', 'outline']).default('md'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, format }) => {
      try {
        const result = await readMindMap(path, format);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
      }
    },
  );
  return server;
}

export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  createServer()
    .connect(new StdioServerTransport())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
