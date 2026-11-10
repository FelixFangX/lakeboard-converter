import { ZipLimitError, openZip } from './bounded-zip.js';
import { createFallbackIds } from './fallback-ids.js';
import { LossTally } from './losses.js';
import { elementToPlain, htmlToPlain } from './rich-text.js';
import { normalizeTree } from './normalize.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { validateTree } from './validate.js';
import { attr, childElements, childText, parseXml, type XmlElement } from './xml.js';

interface XMindTopic {
  id?: string;
  title?: string;
  children?: {
    attached?: XMindTopic[];
    detached?: XMindTopic[];
    summary?: XMindTopic[];
  };
  notes?: {
    plain?: { content?: string };
    html?: { content?: string };
  };
  labels?: string[];
  href?: string;
}

interface XMindSheet {
  id?: string;
  title?: string;
  rootTopic?: XMindTopic;
  relationships?: unknown[];
}

/** Main branches, then floating topics. Summary topics are not children of the tree. */
function zenChildren(topic: XMindTopic): XMindTopic[] {
  return [...(topic.children?.attached ?? []), ...(topic.children?.detached ?? [])];
}

function zenNote(topic: XMindTopic): string | undefined {
  const plain = topic.notes?.plain?.content;
  if (typeof plain === 'string' && plain.trim()) return plain;
  const html = topic.notes?.html?.content;
  if (typeof html === 'string' && html.trim()) {
    const text = htmlToPlain(html);
    if (text) return text;
  }
  return undefined;
}

function zenNoteUnreadable(topic: XMindTopic): boolean {
  if (!topic.notes || zenNote(topic)) return false;
  const html = topic.notes.html?.content;
  if (typeof html === 'string' && html.trim()) return true;
  return Object.keys(topic.notes).some(key => key !== 'plain' && key !== 'html');
}

function tallyZenTopic(topic: XMindTopic, tally: LossTally): void {
  tally.add('summary', topic.children?.summary?.length ?? 0);
  if (zenNoteUnreadable(topic)) tally.add('rich-note');
  for (const summary of topic.children?.summary ?? []) tallyZenTopic(summary, tally);
  for (const child of zenChildren(topic)) tallyZenTopic(child, tally);
}

function convertXMindTopic(topic: XMindTopic, order: number, path: string, fallbackId: (base: string) => string): TopicNode {
  const note = zenNote(topic);
  const node: TopicNode = {
    id: topic.id ?? fallbackId(`xmind-node-${path}`),
    title: topic.title ?? '(untitled)',
    order,
    children: zenChildren(topic).map((child, index) => convertXMindTopic(child, index, `${path}.${index}`, fallbackId)),
    labels: topic.labels,
    href: topic.href,
  };
  if (note) node.notes = note;
  return node;
}

function textOf(element: XmlElement | undefined): string {
  return element ? childText(element).trim() : '';
}

function externalHref(value: string | undefined): string | undefined {
  const href = value?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function tallyXmind8Topic(topic: XmlElement, tally: LossTally): void {
  const href = attr(topic, 'href')?.trim();
  if (href && !externalHref(href)) tally.add('internal-link');
  const notes = childElements(topic, 'notes')[0];
  if (notes) {
    const plain = childElements(notes, 'plain')[0];
    const html = childElements(notes, 'html')[0];
    const kept = (plain ? elementToPlain(plain) : html ? elementToPlain(html) : '').trim();
    const payload = (element: XmlElement | undefined) => Boolean(element && (childText(element).trim() || childElements(element).length > 0));
    const other = childElements(notes).some(child => !['plain', 'html'].includes(child.name.toLowerCase()));
    if (!kept && (payload(plain) || payload(html) || other)) tally.add('rich-note');
  }
  for (const group of childElements(topic, 'children')) {
    for (const topics of childElements(group, 'topics')) {
      const type = (attr(topics, 'type') ?? 'attached').toLowerCase();
      const nested = childElements(topics, 'topic');
      if (type !== 'attached' && type !== 'detached') tally.add('summary', nested.length);
      nested.forEach(child => tallyXmind8Topic(child, tally));
    }
  }
}

function tallyXmind8(root: XmlElement, tally: LossTally): void {
  for (const sheet of childElements(root, 'sheet')) {
    tally.add('relationship', childElements(sheet, 'relationship').length);
    for (const group of childElements(sheet, 'relationships')) tally.add('relationship', childElements(group, 'relationship').length);
    const topic = childElements(sheet, 'topic')[0];
    if (topic) tallyXmind8Topic(topic, tally);
  }
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
  const tally = new LossTally();
  tallyXmind8(root, tally);
  const sheets = childElements(root, 'sheet').map(sheet => {
    const topic = childElements(sheet, 'topic')[0];
    return { title: textOf(childElements(sheet, 'title')[0]), topic };
  });
  if (!sheets.length) throw new Error('No sheets found in the .xmind file');
  const document = documentFromSheets(sheets.map((sheet, offset) => {
    if (!sheet.topic) throw new Error(`Sheet ${offset + 1} in the .xmind file has no rootTopic`);
    return { title: sheet.title, root: convertXMind8Topic(sheet.topic) };
  }), sourcePath);
  return { ...document, losses: tally.list() };
}

export async function parseXmindBuffer(
  buffer: ArrayBuffer | Uint8Array,
  sourcePath?: string,
): Promise<MindMapDocument> {
  const zip = openZip(buffer, '.xmind');
  const jsonName = zip.names.find(name => name === 'content.json');
  const xmlName = zip.names.find(name => name === 'content.xml') ?? zip.names.find(name => /(?:^|\/)content\.xml$/i.test(name));
  if (!jsonName) {
    if (!xmlName) throw new Error('.xmind file has neither content.json nor content.xml');
    return parseXMind8(zip.readText(xmlName), sourcePath);
  }

  let sheets: XMindSheet[];
  try {
    const contentStr = zip.readText(jsonName);
    sheets = JSON.parse(contentStr) as XMindSheet[];
  } catch (error) {
    if (error instanceof ZipLimitError) throw error;
    throw new Error('Failed to parse content.json in the .xmind file');
  }

  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('No sheets found in the .xmind file');
  }

  const tally = new LossTally();
  for (const sheet of sheets) {
    if (Array.isArray(sheet.relationships)) tally.add('relationship', sheet.relationships.length);
    if (sheet.rootTopic) tallyZenTopic(sheet.rootTopic, tally);
  }
  const fallbackId = createFallbackIds(sheets.flatMap(sheet => sheet.rootTopic ? [sheet.rootTopic] : []), topic => [...zenChildren(topic), ...(topic.children?.summary ?? [])]);
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
    losses: tally.list(),
  };
}
