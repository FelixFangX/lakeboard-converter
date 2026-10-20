#!/usr/bin/env node
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { batchText, inspectSummary, inspectMindMap, readMindMaps, buildMindMap, readMindMap } from './agent.js';

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
  const sheetSchema = z.union([z.string(), z.number().int().min(1)]).optional();
  const sheetMetadata = z.object({ index: z.number().int(), title: z.string(), nodeCount: z.number().int(), maxDepth: z.number().int() });
  const readMetadata = z.object({
    schemaVersion: z.literal(1), file: z.string(), source: z.enum(['lakeboard', 'xmind']),
    format: z.enum(['md', 'json', 'outline']), nodeCount: z.number().int(), maxDepth: z.number().int(),
    sheets: z.array(sheetMetadata), selectedSheet: z.object({ index: z.number().int(), title: z.string() }).optional(),
    truncated: z.boolean(), warnings: z.array(z.string()),
  });
  server.registerTool('convert_many', {
    title: 'Read several mind maps',
    description: 'Read 1 to 50 local mind maps sequentially. Pass absolute paths. Content is returned in text; structuredContent contains per-file metadata only, without content. Node limits apply per file and across the batch. Read-only.',
    inputSchema: {
      paths: z.array(z.string().refine(value => path.isAbsolute(value), 'Pass an absolute path')).min(1).max(50),
      format: z.enum(['md', 'json', 'outline']).default('md'), sheet: sheetSchema,
      maxNodes: z.number().int().min(1).max(50000).optional(),
      maxTotalNodes: z.number().int().min(1).max(200000).optional(), maxDepth: z.number().int().min(0).optional(),
    },
    outputSchema: {
      schemaVersion: z.literal(1), format: z.enum(['md', 'json', 'outline']), total: z.number().int(),
      succeeded: z.number().int(), failed: z.number().int(), nodeCount: z.number().int(), truncated: z.boolean(), warnings: z.array(z.string()),
      results: z.array(z.object({ index: z.number().int(), file: z.string(), ok: z.literal(true), result: readMetadata })),
      errors: z.array(z.object({ index: z.number().int(), file: z.string(), error: z.string() })),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ paths, format, ...options }) => {
    try {
      const result = await readMindMaps(paths, format, options);
      const structuredContent = { ...result, results: result.results.map(entry => {
        const { content: _, ...metadata } = entry.result;
        return { ...entry, result: metadata };
      }) };
      return { isError: false, content: [{ type: 'text', text: batchText(result) }], structuredContent };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
  server.registerTool('inspect', {
    title: "Check a mind map's size",
    description: 'Parse a local mind map and count topics without rendering content. Pass an absolute path. Read-only.',
    inputSchema: { path: z.string().refine(value => path.isAbsolute(value), 'Pass an absolute path'), sheet: sheetSchema },
    outputSchema: {
      schemaVersion: z.literal(1), file: z.string(), source: z.enum(['lakeboard', 'xmind']), bytes: z.number().int(),
      nodeCount: z.number().int(), maxDepth: z.number().int(), sheets: z.array(sheetMetadata),
      selectedSheet: z.object({ index: z.number().int(), title: z.string() }).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ path, ...options }) => {
    try {
      const result = await inspectMindMap(path, options);
      return { content: [{ type: 'text', text: inspectSummary(result) }], structuredContent: { ...result } };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
  server.registerTool('from_markdown', {
    title: 'Build an XMind file from Markdown',
    description: 'Build an XMind file from a Markdown outline (headings and nested lists; links, `code` labels and > notes are kept). ' +
      'Pass an absolute .xmind output path to write the file (its folder must exist; an existing file is only replaced with overwrite: true), or omit output to get the file as base64 in structuredContent.base64. Nothing else is written. Large outlines are cut at maxNodes (default 2000) and flagged as truncated.',
    inputSchema: {
      markdown: z.string(), output: z.string().describe('Absolute .xmind path').optional(),
      overwrite: z.boolean().default(false), title: z.string().optional(),
      maxNodes: z.number().int().min(1).max(50000).optional(),
    },
    outputSchema: {
      schemaVersion: z.literal(1), source: z.literal('markdown'), output: z.string().optional(), base64: z.string().optional(),
      bytes: z.number().int(), nodeCount: z.number().int(), maxDepth: z.number().int(),
      sheets: z.array(z.object({ index: z.number().int(), title: z.string(), nodeCount: z.number().int(), maxDepth: z.number().int() })),
      truncated: z.boolean(), warnings: z.array(z.string()),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ markdown, ...options }) => {
    try {
      const result = await buildMindMap(markdown, options);
      const size = `${Math.ceil(result.bytes / 1024)} KB`;
      const summary = result.output ? `Wrote ${result.output} (${result.nodeCount} nodes, ${size})` : `Built .xmind (${result.nodeCount} nodes, ${size}); base64 in structuredContent.base64`;
      return { content: [{ type: 'text', text: summary + (result.warnings.length ? `\n> Note: ${result.warnings.join(' ')}` : '') }], structuredContent: { ...result } };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
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
