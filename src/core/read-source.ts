import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ARCHIVE_LIMITS, ZipLimitError } from './bounded-zip.js';
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

const ZIP_KIND: Partial<Record<SourceFormat, string>> = {
  xmind: '.xmind',
  mindmanager: '.mmap',
  ithoughts: '.itmz',
  simplemind: '.smmx',
};

async function readZipFile(filePath: string, kind: string): Promise<Buffer> {
  try {
    const info = await stat(filePath);
    if (info.size > ARCHIVE_LIMITS.maxArchiveBytes) {
      throw new ZipLimitError(`Cannot unzip ${kind} file: the archive is larger than ${ARCHIVE_LIMITS.maxArchiveBytes / 1024 / 1024} MiB.`, 0);
    }
  } catch (error) {
    if (error instanceof ZipLimitError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return readFile(filePath);
}

export async function parseXmindFile(filePath: string): Promise<MindMapDocument> {
  return parseXmindBuffer(await readZipFile(filePath, '.xmind'), filePath);
}

export async function readMindMapFile(filePath: string): Promise<MindMapDocument & { warnings?: string[] }> {
  const format = formatForExtension(path.extname(filePath));
  if (!format) throw new Error(unsupportedInputMessage(path.extname(filePath).toLowerCase()));
  const kind = ZIP_KIND[format];
  const buffer = await (kind ? readZipFile(filePath, kind) : readFile(filePath));
  if (format === 'xmind') return parseXmindBuffer(buffer, filePath);
  return parseSourceBuffer(buffer, format, filePath);
}
