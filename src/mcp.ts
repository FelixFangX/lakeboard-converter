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
        'Pass an absolute path. Read a Yuque Lakeboard (.lakeboard) or XMind (.xmind) mind map from a local path. ' +
        'All sheets are included (each under its sheet title); pass sheet (1-based index or title) to read one. Large maps are cut at maxNodes (default 2000) and flagged as truncated. ' +
        'format "md" = nested Markdown list, "json" = topic tree, "outline" = compact indented text. Read-only.',
      inputSchema: {
        path: z.string().describe('Absolute path to a .lakeboard or .xmind file'),
        sheet: z.union([z.string(), z.number().int().min(1)]).optional(),
        maxNodes: z.number().int().min(1).max(50000).optional(),
        maxDepth: z.number().int().min(0).optional(),
        format: z.enum(['md', 'json', 'outline']).default('md'),
      },
      outputSchema: {
        schemaVersion: z.literal(1), file: z.string(), source: z.enum(['lakeboard', 'xmind']),
        format: z.enum(['md', 'json', 'outline']), nodeCount: z.number().int(), maxDepth: z.number().int(),
        sheets: z.array(z.object({ index: z.number().int(), title: z.string(), nodeCount: z.number().int(), maxDepth: z.number().int() })),
        selectedSheet: z.object({ index: z.number().int(), title: z.string() }).optional(),
        truncated: z.boolean(), warnings: z.array(z.string()),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, format, ...options }) => {
      try {
        const result = await readMindMap(path, format, options);
        const { content, ...structuredContent } = result;
        const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        return { content: [{ type: 'text', text: text + (result.warnings.length ? `\n> Note: ${result.warnings.join(' ')}` : '') }], structuredContent };
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
