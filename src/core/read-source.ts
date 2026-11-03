import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MindMapDocument, SourceFormat } from './types.js';
import { parseCsvContent } from './parse-csv.js';
import { parseFreeMindContent } from './parse-freemind.js';
import { parseIThoughtsBuffer } from './parse-ithoughts.js';
import { parseLakeboardContent } from './parse-lakeboard.js';
import { parseMarkdownOutline } from './parse-markdown.js';
import { parseMindManagerBuffer } from './parse-mindmanager.js';
import { parseOpmlContent } from './parse-opml.js';
import { parseSimpleMindBuffer } from './parse-simplemind.js';
import { parseXmindBuffer } from './parse-xmind.js';

export const SUPPORTED_INPUT_EXTENSIONS = ['.opml', '.mm', '.md', '.markdown', '.lakeboard', '.xmind', '.mmap', '.itmz', '.smmx', '.csv'] as const;

export function supportedInputList(): string {
  return SUPPORTED_INPUT_EXTENSIONS.join(', ');
}

export function unsupportedInputMessage(ext: string): string {
  return `Unsupported input format: ${ext || '(none)'} (supported: ${supportedInputList()})`;
}

export function formatForExtension(ext: string): SourceFormat | undefined {
  switch (ext.toLowerCase()) {
    case '.opml': return 'opml';
    case '.mm': return 'freemind';
    case '.md':
    case '.markdown': return 'markdown';
    case '.lakeboard': return 'lakeboard';
    case '.xmind': return 'xmind';
    case '.mmap': return 'mindmanager';
    case '.itmz': return 'ithoughts';
    case '.smmx': return 'simplemind';
    case '.csv': return 'csv';
    default: return undefined;
  }
}

export function decodeUtf8(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return new TextDecoder().decode(bytes);
}

export function parseTextDocument(format: SourceFormat, text: string, sourcePath?: string): MindMapDocument & { warnings?: string[] } {
  if (format === 'lakeboard') return parseLakeboardContent(text, sourcePath);
  if (format === 'opml') return parseOpmlContent(text, sourcePath);
  if (format === 'freemind' || format === 'freeplane') return parseFreeMindContent(text, sourcePath);
  if (format === 'markdown') {
    const document = parseMarkdownOutline(text);
    return { ...document, format: 'markdown', sourcePath };
  }
  if (format === 'csv') return parseCsvContent(text, sourcePath);
  throw new Error(unsupportedInputMessage(`.${format}`));
}

export async function parseSourceBuffer(buffer: ArrayBuffer | Uint8Array, sourceFormat: SourceFormat, sourcePath?: string): Promise<MindMapDocument & { warnings?: string[] }> {
  if (sourceFormat === 'xmind') return parseXmindBuffer(buffer, sourcePath);
  if (sourceFormat === 'mindmanager') return parseMindManagerBuffer(buffer, sourcePath);
  if (sourceFormat === 'ithoughts') return parseIThoughtsBuffer(buffer, sourcePath);
  if (sourceFormat === 'simplemind') return parseSimpleMindBuffer(buffer, sourcePath);
  return parseTextDocument(sourceFormat, decodeUtf8(buffer), sourcePath);
}

export async function parseXmindFile(filePath: string): Promise<MindMapDocument> {
  return parseXmindBuffer(await readFile(filePath), filePath);
}

export async function readMindMapFile(filePath: string): Promise<MindMapDocument & { warnings?: string[] }> {
  const format = formatForExtension(path.extname(filePath));
  if (!format) throw new Error(unsupportedInputMessage(path.extname(filePath).toLowerCase()));
  if (format === 'xmind') return parseXmindFile(filePath);
  const buffer = await readFile(filePath);
  return parseSourceBuffer(buffer, format, filePath);
}
