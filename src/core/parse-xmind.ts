import { createFallbackIds } from './fallback-ids.js';
import JSZip from 'jszip';
import { elementToPlain } from './rich-text.js';
import { normalizeTree } from './normalize.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { validateTree } from './validate.js';
import { attr, childElements, childText, parseXml, type XmlElement } from './xml.js';

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

function textOf(element: XmlElement | undefined): string {
  return element ? childText(element).trim() : '';
}

function externalHref(value: string | undefined): string | undefined {
  const href = value?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

/** XMind 8 stores the map in content.xml. Zen/2020+ stores the same tree in content.json. */
function convertXMind8Topic(topic: XmlElement): TopicNode {
  const notes = childElements(topic, 'notes')[0];
  const plain = notes ? childElements(notes, 'plain')[0] : undefined;
  const html = notes ? childElements(notes, 'html')[0] : undefined;
  const note = (plain ? elementToPlain(plain) : html ? elementToPlain(html) : '').trim();
  const labels = childElements(topic, 'labels')
    .flatMap(group => childElements(group, 'label').map(label => textOf(label) || elementToPlain(label).trim()))
    .filter(Boolean);
  const children = childElements(topic, 'children').flatMap(group => childElements(group, 'topics').flatMap(topics => {
    const type = (attr(topics, 'type') ?? 'attached').toLowerCase();
    if (type !== 'attached' && type !== 'detached') return [];
    return childElements(topics, 'topic').map(convertXMind8Topic);
  }));
  const node: TopicNode = {
    id: attr(topic, 'id') ?? '',
    title: textOf(childElements(topic, 'title')[0]),
    order: 0,
    children,
  };
  if (note) node.notes = note;
  const href = externalHref(attr(topic, 'href'));
  if (href) node.href = href;
  if (labels.length) node.labels = labels;
  return node;
}

function documentFromSheets(sheets: { title: string; root: TopicNode }[], sourcePath?: string): MindMapDocument {
  const fallbackId = createFallbackIds(sheets.map(sheet => sheet.root), topic => topic.children);
  const parsedSheets = sheets.map((sheet, offset) => {
    const assign = (node: TopicNode, nodePath: string, order: number): void => {
      if (!node.id) node.id = fallbackId(`xmind-node-${nodePath}`);
      node.order = order;
      if (!node.title.trim()) node.title = '(untitled)';
      node.children.forEach((child, index) => assign(child, `${nodePath}.${index}`, index));
    };
    assign(sheet.root, `${offset}-0`, 0);
    const root = normalizeTree(sheet.root);
    return { index: offset + 1, title: sheet.title.trim() || `Sheet ${offset + 1}`, root, ...validateTree(root) };
  });
  return {
    sourcePath,
    format: 'xmind',
    sheets: parsedSheets,
    root: parsedSheets[0].root,
    nodeCount: parsedSheets.reduce((sum, sheet) => sum + sheet.nodeCount, 0),
    maxDepth: Math.max(...parsedSheets.map(sheet => sheet.maxDepth)),
  };
}

function parseXMind8(xml: string, sourcePath?: string): MindMapDocument {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (error) {
    throw new Error(`Failed to parse content.xml in the .xmind file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const sheets = childElements(root, 'sheet').map(sheet => {
    const topic = childElements(sheet, 'topic')[0];
    return { title: textOf(childElements(sheet, 'title')[0]), topic };
  });
  if (!sheets.length) throw new Error('No sheets found in the .xmind file');
  return documentFromSheets(sheets.map((sheet, offset) => {
    if (!sheet.topic) throw new Error(`Sheet ${offset + 1} in the .xmind file has no rootTopic`);
    return { title: sheet.title, root: convertXMind8Topic(sheet.topic) };
  }), sourcePath);
}

export async function parseXmindBuffer(
  buffer: ArrayBuffer | Uint8Array,
  sourcePath?: string,
): Promise<MindMapDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('Cannot unzip .xmind file: it may be corrupt or not a valid ZIP archive');
  }

  const contentFile = zip.file('content.json');
  if (!contentFile) {
    const legacy = zip.file('content.xml') ?? zip.file(/(?:^|\/)content\.xml$/i)[0];
    if (!legacy) throw new Error('.xmind file has neither content.json nor content.xml');
    return parseXMind8(await legacy.async('string'), sourcePath);
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
    sourcePath,
    format: 'xmind', sheets: parsedSheets, root: parsedSheets[0].root,
    nodeCount: parsedSheets.reduce((sum, sheet) => sum + sheet.nodeCount, 0),
    maxDepth: Math.max(...parsedSheets.map(sheet => sheet.maxDepth)),
  };
}
