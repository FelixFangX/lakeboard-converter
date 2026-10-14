import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MarkdownStyle, MindMapDocument, SourceFormat } from './core/types.js';
import { parseLakeboardFile, parseLakeboardContent } from './core/parse-lakeboard.js';
import { parseXmindFile, parseXmindBuffer } from './core/parse-xmind.js';
import { renderGenericMarkdown, renderXmindMarkdown } from './render/markdown.js';
import { renderXmind } from './render/xmind.js';

export type { MindMapDocument, TopicNode, SourceFormat, MarkdownStyle } from './core/types.js';
export { parseLakeboardFile } from './core/parse-lakeboard.js';
export { parseXmindFile, parseXmindBuffer } from './core/parse-xmind.js';
export { renderGenericMarkdown, renderXmindMarkdown } from './render/markdown.js';
export { renderXmind } from './render/xmind.js';
export { readMindMap, AGENT_FORMATS } from './agent.js';
export type { AgentFormat, AgentReadResult, AgentTopic } from './agent.js';

export interface ConvertResult {
  outputs: string[];
  nodeCount: number;
  maxDepth: number;
}

export interface ConvertInputOptions {
  input: string;
  format: 'md' | 'xmind' | 'both';
  markdownStyle: MarkdownStyle;
  output?: string;
  outDir?: string;
  overwrite?: boolean;
}

function detectSourceFormat(filePath: string): SourceFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.lakeboard') return 'lakeboard';
  if (ext === '.xmind') return 'xmind';
  throw new Error(`不支持的输入文件格式：${ext}（仅支持 .lakeboard 和 .xmind）`);
}

async function ensureWritable(filePath: string, overwrite = false): Promise<void> {
  try {
    await stat(filePath);
    if (!overwrite) {
      throw new Error(`输出文件已存在：${filePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function resolveOutputPaths(options: ConvertInputOptions): { mdPath?: string; xmindPath?: string } {
  const parsed = path.parse(options.input);
  const baseDir = options.outDir ? path.resolve(options.outDir) : parsed.dir;
  const baseName = parsed.name;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    if (options.format === 'both') {
      throw new Error('--output 仅支持单一导出格式，请改用 --out-dir');
    }
    return options.format === 'md' ? { mdPath: outputPath } : { xmindPath: outputPath };
  }

  const mdSuffix = options.markdownStyle === 'xmind' ? '.xmind-import.md' : '.md';
  return {
    mdPath: options.format === 'md' || options.format === 'both' ? path.join(baseDir, `${baseName}${mdSuffix}`) : undefined,
    xmindPath: options.format === 'xmind' || options.format === 'both' ? path.join(baseDir, `${baseName}.xmind`) : undefined,
  };
}

async function parseInputFile(filePath: string): Promise<MindMapDocument> {
  const sourceFormat = detectSourceFormat(filePath);
  if (sourceFormat === 'xmind') {
    return parseXmindFile(filePath);
  }
  return parseLakeboardFile(filePath);
}

export async function convertFile(options: ConvertInputOptions): Promise<ConvertResult> {
  const document = await parseInputFile(options.input);
  const { mdPath, xmindPath } = resolveOutputPaths(options);
  const outputs: string[] = [];

  if (options.outDir) {
    await mkdir(path.resolve(options.outDir), { recursive: true });
  }

  if (mdPath) {
    await ensureWritable(mdPath, options.overwrite);
    const markdown = options.markdownStyle === 'xmind' ? renderXmindMarkdown(document) : renderGenericMarkdown(document);
    await writeFile(mdPath, markdown, 'utf-8');
    outputs.push(mdPath);
  }

  if (xmindPath) {
    await ensureWritable(xmindPath, options.overwrite);
    const xmind = await renderXmind(document);
    await writeFile(xmindPath, xmind);
    outputs.push(xmindPath);
  }

  return {
    outputs,
    nodeCount: document.nodeCount,
    maxDepth: document.maxDepth,
  };
}

export async function convertBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  sourceFormat: SourceFormat,
  markdownStyle: MarkdownStyle = 'generic',
): Promise<{ markdown: string; document: MindMapDocument }> {
  let document: MindMapDocument;

  if (sourceFormat === 'xmind') {
    document = await parseXmindBuffer(buffer);
  } else {
    const bytes = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    document = parseLakeboardContent(bytes.toString('utf-8'));
  }

  const markdown =
    markdownStyle === 'xmind' ? renderXmindMarkdown(document) : renderGenericMarkdown(document);

  return { markdown, document };
}
