#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readMindMap } from './agent.js';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'lakeboard-converter', version: '0.3.0' });
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

const isMain = process.argv[1] && /mcp\.(js|ts)$/.test(process.argv[1]);
if (isMain) {
  createServer()
    .connect(new StdioServerTransport())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
