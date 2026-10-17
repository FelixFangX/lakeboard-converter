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

function convertLakeboardNode(node: RawLakeboardNode, order: number): TopicNode {
  return {
    id: node.id ?? `node-${order}`,
    title: normalizeInlineText(node.html ?? '') || '(untitled)',
    order,
    children: (node.children ?? []).map((child, index) =>
      convertLakeboardNode(child, index),
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

  const root = normalizeTree(convertLakeboardNode(rootRaw, 0));
  const { nodeCount, maxDepth } = validateTree(root);

  return { format: 'lakeboard', root, nodeCount, maxDepth };
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

function convertXMindTopic(topic: XMindTopic, order: number): TopicNode {
  const children = topic.children?.attached ?? [];
  return {
    id: topic.id ?? `xmind-node-${order}`,
    title: topic.title ?? '(untitled)',
    order,
    children: children.map((child, index) => convertXMindTopic(child, index)),
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

  const sheet = sheets[0];
  if (!sheet.rootTopic) {
    throw new Error('The first sheet in the .xmind file has no rootTopic');
  }

  const root = normalizeTree(convertXMindTopic(sheet.rootTopic, 0));
  const { nodeCount, maxDepth } = validateTree(root);

  return { format: 'xmind', root, nodeCount, maxDepth };
}

// ─── Markdown renderer ───

function renderGenericNode(
  lines: string[],
  node: TopicNode,
  depth: number,
): void {
  const indent = '  '.repeat(depth);
  if (depth === 0) {
    lines.push(`# ${node.title}`);
  } else {
    const text = node.title.split('\n');
    lines.push(`${indent}- ${text[0]}`);
    for (const line of text.slice(1)) {
      lines.push(`${indent}  ${line}`);
    }
  }

  if (node.notes) {
    const noteIndent = depth === 0 ? '' : `${indent}  `;
    lines.push(
      `${noteIndent}> ${node.notes.split('\n').join(`\n${noteIndent}> `)}`,
    );
  }

  if (node.href) {
    const linkIndent = depth === 0 ? '' : `${indent}  `;
    lines.push(`${linkIndent}[Link](${node.href})`);
  }
}

function walkGeneric(lines: string[], node: TopicNode, depth: number): void {
  renderGenericNode(lines, node, depth);
  node.children.forEach((child) => walkGeneric(lines, child, depth + 1));
}

function walkXmindStyle(
  lines: string[],
  node: TopicNode,
  depth: number,
): void {
  const indent = '    '.repeat(depth);
  lines.push(`${indent}- ${flattenMultilineText(node.title)}`);
  node.children.forEach((child) => walkXmindStyle(lines, child, depth + 1));
}

function renderMarkdown(
  document: MindMapDocument,
  style: MarkdownStyle,
): string {
  const lines: string[] = [];
  if (style === 'xmind') {
    walkXmindStyle(lines, document.root, 0);
  } else {
    walkGeneric(lines, document.root, 0);
  }
  return `${lines.join('\n')}\n`;
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
    [/^The first sheet.*no rootTopic/, 'errorRoot'],
    [/^Failed to parse .lakeboard file/, 'errorLakeJson'],
    [/^Input is not a supported lakeboard/, 'errorLakeFormat'],
    [/^lakeboard file is missing/, 'errorBody'],
    [/^No convertible mindmap/, 'errorMindmap'],
    [/^Unsupported file format/, 'errorFormat'],
  ] as const;
  return patterns.find(([pattern]) => pattern.test(message))?.[1] ?? 'errorGeneric';
}
