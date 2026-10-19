import { createFallbackIds } from '../../src/core/fallback-ids.js';
import JSZip from 'jszip';

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
  format: 'lakeboard' | 'xmind';
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

// ─── XMind parser ───

interface XMindTopic {
  id?: string;
  title?: string;
  children?: {
    attached?: XMindTopic[];
  };
  notes?: {
    plain?: { content?: string };
  };
  labels?: string[];
  href?: string;
}

interface XMindSheet {
  id?: string;
  title?: string;
  rootTopic?: XMindTopic;
}

function convertXMindTopic(topic: XMindTopic, order: number, path: string, fallbackId: (base: string) => string): TopicNode {
  const children = topic.children?.attached ?? [];
  return {
    id: topic.id ?? fallbackId(`xmind-node-${path}`),
    title: topic.title ?? '(untitled)',
    order,
    children: children.map((child, index) => convertXMindTopic(child, index, `${path}.${index}`, fallbackId)),
    notes: topic.notes?.plain?.content,
    labels: topic.labels,
    href: topic.href,
  };
}

async function parseXmindBuffer(buffer: ArrayBuffer): Promise<MindMapDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(
      'Cannot unzip .xmind file: it may be corrupt or not a valid ZIP archive',
    );
  }

  const contentFile = zip.file('content.json');
  if (!contentFile) {
    throw new Error(
      '.xmind file is missing content.json; it is probably an old XMind 8 file (only XMind Zen/2020+ is supported)',
    );
  }

  let sheets: XMindSheet[];
  try {
    const contentStr = await contentFile.async('string');
    sheets = JSON.parse(contentStr) as XMindSheet[];
  } catch {
    throw new Error('Failed to parse content.json in the .xmind file');
  }

  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('No sheets found in the .xmind file');
  }

  const fallbackId = createFallbackIds(sheets.flatMap(sheet => sheet.rootTopic ? [sheet.rootTopic] : []), topic => topic.children?.attached ?? []);
  const parsedSheets = sheets.map((sheet, offset) => {
    if (!sheet.rootTopic) throw new Error(`Sheet ${offset + 1} in the .xmind file has no rootTopic`);
    const root = normalizeTree(convertXMindTopic(sheet.rootTopic, 0, `${offset}-0`, fallbackId));
    return { index: offset + 1, title: sheet.title?.trim() || `Sheet ${offset + 1}`, root, ...validateTree(root) };
  });
  return {
    format: 'xmind', sheets: parsedSheets, root: parsedSheets[0].root,
    nodeCount: parsedSheets.reduce((sum, sheet) => sum + sheet.nodeCount, 0),
    maxDepth: Math.max(...parsedSheets.map(sheet => sheet.maxDepth)),
  };
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

export async function convertFile(
  file: File,
  style: MarkdownStyle = 'generic',
): Promise<{ markdown: string; document: MindMapDocument }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  let document: MindMapDocument;

  if (ext === 'xmind') {
    const buffer = await file.arrayBuffer();
    document = await parseXmindBuffer(buffer);
  } else if (ext === 'lakeboard') {
    const text = await file.text();
    document = parseLakeboardContent(text);
  } else {
    throw new Error(`Unsupported file format: .${ext} (only .lakeboard and .xmind are supported)`);
  }

  const markdown = renderMarkdown(document, style);
  return { markdown, document };
}

// Keep parser details out of UI messages, including unexpected third-party errors.
export function webErrorKey(error: unknown): import('./i18n.js').TranslationKey {
  const message = error instanceof Error ? error.message : '';
  const patterns = [
    [/^The sample could not be loaded/, 'errorSample'],
    [/^Cannot unzip/, 'errorZip'],
    [/^\.xmind file is missing content.json/, 'errorOld'],
    [/^Failed to parse content.json/, 'errorXmindJson'],
    [/^No sheets found/, 'errorSheets'],
    [/^Sheet .*no rootTopic/, 'errorRoot'],
    [/^Failed to parse .lakeboard file/, 'errorLakeJson'],
    [/^Input is not a supported lakeboard/, 'errorLakeFormat'],
    [/^lakeboard file is missing/, 'errorBody'],
    [/^No convertible mindmap/, 'errorMindmap'],
    [/^Unsupported file format/, 'errorFormat'],
  ] as const;
  return patterns.find(([pattern]) => pattern.test(message))?.[1] ?? 'errorGeneric';
}
