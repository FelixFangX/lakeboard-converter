import { createFallbackIds } from '../../src/core/fallback-ids.js';
import { parseCsvContent } from '../../src/core/parse-csv.js';
import { parseFreeMindContent } from '../../src/core/parse-freemind.js';
import { parseIThoughtsBuffer } from '../../src/core/parse-ithoughts.js';
import { parseMarkdownOutline } from '../../src/core/parse-markdown.js';
import { parseMindManagerBuffer } from '../../src/core/parse-mindmanager.js';
import { parseOpmlContent } from '../../src/core/parse-opml.js';
import { parseSimpleMindBuffer } from '../../src/core/parse-simplemind.js';
import { parseXmindBuffer } from '../../src/core/parse-xmind.js';
import type { SourceFormat } from '../../src/core/types.js';

export interface TopicNode {
  id: string;
  title: string;
  order: number;
  children: TopicNode[];
  notes?: string;
  labels?: string[];
  href?: string;
}

export interface MindMapDocument {
  sheets: { index: number; title: string; root: TopicNode; nodeCount: number; maxDepth: number }[];
  format: SourceFormat;
  root: TopicNode;
  nodeCount: number;
  maxDepth: number;
}

export type MarkdownStyle = 'generic' | 'xmind';

// ─── HTML utilities ───

const HTML_TAG_RE = /<[^>]+>/g;
const ZERO_WIDTH_RE = /[\u200b\ufeff]/g;
const NBSP_RE = /\u00a0/g;

const htmlEntityMap: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
    (entity) => htmlEntityMap[entity] ?? entity,
  );
}

function stripHtml(input: string): string {
  return input.replace(HTML_TAG_RE, '');
}

function normalizeInlineText(input: string): string {
  const text = decodeHtmlEntities(stripHtml(input))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(ZERO_WIDTH_RE, '')
    .replace(NBSP_RE, ' ');

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function flattenMultilineText(input: string, separator = ' ⏎ '): string {
  return normalizeInlineText(input).split('\n').join(separator);
}

// ─── Validation ───

function validateTree(root: TopicNode): { nodeCount: number; maxDepth: number } {
  let nodeCount = 0;
  let maxDepth = 0;

  const visit = (node: TopicNode, depth: number): void => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    node.children.forEach((child) => visit(child, depth + 1));
  };

  visit(root, 0);
  return { nodeCount, maxDepth };
}

function normalizeTree(root: TopicNode): TopicNode {
  const clone = (node: TopicNode): TopicNode => ({
    ...node,
    title: node.title.trim(),
    children: node.children.map(clone),
  });
  return clone(root);
}

// ─── Lakeboard parser ───

interface RawLakeboardNode {
  id?: string;
  html?: string;
  children?: RawLakeboardNode[];
  type?: string;
}

interface RawLakeboardFile {
  format?: string;
  diagramData?: {
    body?: RawLakeboardNode[];
  };
}

function convertLakeboardNode(node: RawLakeboardNode, order: number, path: string, fallbackId: (base: string) => string): TopicNode {
  return {
    id: node.id ?? fallbackId(`node-${path}`),
    title: normalizeInlineText(node.html ?? '') || '(untitled)',
    order,
    children: (node.children ?? []).map((child, index) =>
      convertLakeboardNode(child, index, `${path}.${index}`, fallbackId),
    ),
  };
}

function parseLakeboardContent(content: string): MindMapDocument {
  let data: RawLakeboardFile;
  try {
    data = JSON.parse(content) as RawLakeboardFile;
  } catch {
    throw new Error('Failed to parse .lakeboard file: invalid JSON');
  }

  if (data.format !== 'lakeboard') {
    throw new Error('Input is not a supported lakeboard JSON file');
  }

  const body = data.diagramData?.body;
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('lakeboard file is missing diagramData.body');
  }

  const rootRaw = body.find((node) => node.type === 'mindmap') ?? body[0];
  if (!rootRaw) {
    throw new Error('No convertible mindmap root node found');
  }

  const fallbackId = createFallbackIds(body, node => node.children ?? []);
  const root = normalizeTree(convertLakeboardNode(rootRaw, 0, '0', fallbackId));
  const { nodeCount, maxDepth } = validateTree(root);

  return { format: 'lakeboard', root, nodeCount, maxDepth, sheets: [{ index: 1, title: root.title, root, nodeCount, maxDepth }] };
}

// ─── Markdown renderer ───

function title(node: TopicNode): string {
  const text = node.href ? `[${node.title.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')}](${node.href})` : node.title;
  return text + (node.labels ?? []).map(label => {
    const fence = '`'.repeat(Math.max(0, ...(label.match(/`+/g) ?? []).map(s => s.length)) + 1);
    const padding = label.includes('`') || /^ | $/.test(label) ? ' ' : '';
    return ` ${fence}${padding}${label}${padding}${fence}`;
  }).join('');
}

function walkGeneric(lines: string[], node: TopicNode, depth: number, multi: boolean): void {
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const text = title(node).split('\n');
  lines.push(depth === 0 ? `${multi ? '##' : '#'} ${text[0]}` : `${indent}- ${text[0]}`);
  text.slice(1).forEach(line => lines.push(`${depth === 0 ? '' : indent + '  '}${line}`));
  if (node.notes) {
    const noteIndent = depth === 0 ? '' : indent + '  ';
    lines.push(`${noteIndent}> ${node.notes.split('\n').join(`\n${noteIndent}> `)}`);
  }
  node.children.forEach(child => walkGeneric(lines, child, depth + 1, multi));
}

function walkList(lines: string[], node: TopicNode, depth: number, outline: boolean): void {
  const labels = outline && node.labels?.length ? ` [${node.labels.join(', ')}]` : '';
  lines.push(`${'    '.repeat(depth)}- ${flattenMultilineText(node.title)}${labels}`);
  node.children.forEach(child => walkList(lines, child, depth + 1, outline));
}

function renderGenericMarkdown(document: MindMapDocument): string {
  return document.sheets.map(sheet => {
    const lines: string[] = document.sheets.length > 1 ? [`# ${sheet.title}`] : [];
    walkGeneric(lines, sheet.root, 0, document.sheets.length > 1);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function renderXmindMarkdown(document: MindMapDocument): string {
  return renderLists(document, false);
}

function renderOutline(document: MindMapDocument): string {
  return renderLists(document, true);
}

function renderLists(document: MindMapDocument, outline: boolean): string {
  return document.sheets.map(sheet => {
    const lines = outline && document.sheets.length > 1 ? [`# ${sheet.title}`] : [];
    walkList(lines, sheet.root, 0, outline);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function renderMarkdown(document: MindMapDocument, style: MarkdownStyle): string {
  return style === 'xmind' ? renderXmindMarkdown(document) : renderGenericMarkdown(document);
}

// ─── Public API ───

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

export async function convertFile(
  file: File,
  style: MarkdownStyle = 'generic',
): Promise<{ markdown: string; document: MindMapDocument }> {
  const ext = extensionOf(file.name);

  let document: MindMapDocument;

  if (ext === '.xmind') {
    document = await parseXmindBuffer(await file.arrayBuffer());
  } else if (ext === '.lakeboard') {
    document = parseLakeboardContent(await file.text());
  } else if (ext === '.opml') {
    document = parseOpmlContent(await file.text());
  } else if (ext === '.mm') {
    document = parseFreeMindContent(await file.text());
  } else if (ext === '.md' || ext === '.markdown') {
    const parsed = parseMarkdownOutline(await file.text());
    document = { ...parsed, format: 'markdown' };
  } else if (ext === '.mmap') {
    document = await parseMindManagerBuffer(await file.arrayBuffer());
  } else if (ext === '.itmz') {
    document = await parseIThoughtsBuffer(await file.arrayBuffer());
  } else if (ext === '.smmx') {
    document = await parseSimpleMindBuffer(await file.arrayBuffer());
  } else if (ext === '.csv') {
    document = parseCsvContent(await file.text());
  } else {
    throw new Error(`Unsupported file format: ${ext || '(none)'} (supported: .opml, .mm, .md, .markdown, .lakeboard, .xmind, .mmap, .itmz, .smmx, .csv)`);
  }

  const markdown = renderMarkdown(document, style);
  return { markdown, document };
}

// Keep parser details out of UI messages, including unexpected third-party errors.
export function webErrorKey(error: unknown): import('./i18n.js').TranslationKey {
  const message = error instanceof Error ? error.message : '';
  const patterns = [
    [/^The sample could not be loaded/, 'errorSample'],
    [/^Cannot unzip \.xmind/, 'errorZip'],
    [/^\.xmind file has neither content.json nor content.xml/, 'errorOld'],
    [/^Failed to parse content.json/, 'errorXmindJson'],
    [/^Failed to parse content.xml/, 'errorXmindXml'],
    [/^No sheets found/, 'errorSheets'],
    [/^Sheet .*no rootTopic/, 'errorRoot'],
    [/^Failed to parse .lakeboard file/, 'errorLakeJson'],
    [/^Input is not a supported lakeboard/, 'errorLakeFormat'],
    [/^lakeboard file is missing/, 'errorBody'],
    [/^No convertible mindmap/, 'errorMindmap'],
    [/^Failed to parse OPML|^Input is not an OPML|^OPML file/, 'errorOpml'],
    [/^Failed to parse FreeMind|^Input is not a FreeMind|^FreeMind file/, 'errorFreeMind'],
    [/^Markdown must contain/, 'errorMarkdown'],
    [/^Cannot unzip \.mmap|^MindManager file|^Failed to parse MindManager/, 'errorMindManager'],
    [/^Cannot unzip \.itmz|^iThoughts file|^Failed to parse iThoughts/, 'errorIThoughts'],
    [/^Cannot unzip \.smmx|^SimpleMind file|^Failed to parse SimpleMind|^Input is not a SimpleMind/, 'errorSimpleMind'],
    [/^CSV outline|^Failed to parse CSV/, 'errorCsv'],
    [/^Unsupported file format/, 'errorFormat'],
  ] as const;
  return patterns.find(([pattern]) => pattern.test(message))?.[1] ?? 'errorGeneric';
}
