import { openZip } from './bounded-zip.js';
import { buildSheetDocument } from './document.js';
import { LossTally } from './losses.js';
import { elementToPlain } from './rich-text.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { attr, childElements, parseXml, type XmlElement } from './xml.js';

function externalHref(value: string | undefined): string | undefined {
  const href = value?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function topicTitle(topic: XmlElement): string {
  return (attr(topic, 'text') ?? '').replace(/\\N/g, '\n').trim();
}

function topicNotes(topic: XmlElement): string {
  const own = childElements(topic, 'note').map(note => elementToPlain(note).trim()).filter(Boolean);
  const outer = childElements(topic, 'children').flatMap(group => childElements(group, 'text')
    .flatMap(text => childElements(text, 'note').map(note => elementToPlain(note).trim())));
  return [...own, ...outer.filter(Boolean)].join('\n');
}

function topicHref(topic: XmlElement, tally: LossTally): string | undefined {
  const link = childElements(topic, 'link')[0];
  if (!link) return undefined;
  const raw = (attr(link, 'urllink') || attr(link, 'url') || attr(link, 'href') || attr(link, 'diagramref') || '').trim();
  const href = externalHref(raw);
  if (raw && !href) tally.add('internal-link');
  return href;
}

function toTopic(element: XmlElement, children: TopicNode[], tally: LossTally): TopicNode {
  const topic: TopicNode = { id: attr(element, 'id') || attr(element, 'guid') || '', title: topicTitle(element), order: 0, children };
  const notes = topicNotes(element);
  const href = topicHref(element, tally);
  if (notes) topic.notes = notes;
  if (href) topic.href = href;
  return topic;
}

function nestedTopics(element: XmlElement): XmlElement[] {
  const direct = childElements(element, 'topic');
  if (direct.length) return direct;
  return childElements(element).flatMap(nestedTopics);
}

function treeFromParents(topics: XmlElement[], tally: LossTally): TopicNode[] {
  const nodes = new Map<string, TopicNode>();
  const pending: { parent: string; node: TopicNode }[] = [];
  topics.forEach((topic, index) => {
    const id = attr(topic, 'id') || `simplemind-${index}`;
    const node = toTopic(topic, [], tally);
    node.id = id;
    nodes.set(id, node);
    pending.push({ parent: attr(topic, 'parent') ?? '-1', node });
  });
  const roots: TopicNode[] = [];
  for (const entry of pending) {
    const parent = entry.parent === '-1' || entry.parent === '' ? undefined : nodes.get(entry.parent);
    (parent ? parent.children : roots).push(entry.node);
  }
  return roots;
}

function allTopics(element: XmlElement): XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    if (node.name.toLowerCase() === 'topic') found.push(node);
    childElements(node).forEach(visit);
  };
  visit(element);
  return found;
}

function mapTitle(map: XmlElement, fallback: string): string {
  const meta = childElements(map, 'meta')[0];
  const title = meta ? childElements(meta, 'title')[0] : undefined;
  const text = title ? (attr(title, 'text') || elementToPlain(title)).trim() : '';
  return text || fallback;
}

function mindmaps(root: XmlElement): XmlElement[] {
  if (root.name.toLowerCase() === 'mindmap') return [root];
  const maps = childElements(root, 'mindmap');
  return maps.length ? maps : [root];
}

function fromNested(topic: XmlElement, tally: LossTally): TopicNode {
  return toTopic(topic, childElements(topic, 'topic').map(child => fromNested(child, tally)), tally);
}

function rootsOf(map: XmlElement, tally: LossTally): TopicNode[] {
  const topics = allTopics(map);
  if (topics.some(topic => attr(topic, 'parent') !== undefined)) return treeFromParents(topics, tally);
  return nestedTopics(map).map(topic => fromNested(topic, tally));
}

/** Read SimpleMind `document/mindmap.xml`. Topics are linked by `parent` (`-1` is the central topic) or nested. */
export function parseSimpleMindXml(content: string, sourcePath?: string): MindMapDocument {
  let xml: XmlElement;
  try {
    xml = parseXml(content);
  } catch (error) {
    throw new Error(`Failed to parse SimpleMind file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const name = xml.name.toLowerCase();
  if (name !== 'simplemind-mindmaps' && name !== 'mindmap' && !childElements(xml, 'mindmap').length && !allTopics(xml).length) {
    throw new Error('Input is not a SimpleMind map');
  }
  const tally = new LossTally();
  for (const map of mindmaps(xml)) {
    for (const group of childElements(map, 'relations')) {
      const relations = childElements(group, 'relation');
      tally.add('relationship', relations.length || childElements(group).length);
    }
  }
  const maps = mindmaps(xml).map(map => {
    const nodes = rootsOf(map, tally);
    if (!nodes.length) throw new Error('SimpleMind file has no topics');
    const root = nodes.length === 1 ? nodes[0] : { id: '', title: mapTitle(map, 'Mind map'), order: 0, children: nodes };
    return buildSheetDocument('simplemind', mapTitle(map, root.title), root, sourcePath);
  });
  const losses = tally.list();
  if (maps.length === 1) return { ...maps[0], losses };
  const sheets = maps.map((map, index) => ({ ...map.sheets[0], index: index + 1 }));
  return {
    sourcePath,
    format: 'simplemind',
    sheets,
    root: sheets[0].root,
    nodeCount: sheets.reduce((sum, sheet) => sum + sheet.nodeCount, 0),
    maxDepth: Math.max(...sheets.map(sheet => sheet.maxDepth)),
    losses,
  };
}

function decodeUtf8(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return new TextDecoder().decode(bytes);
}

/** Read a `.smmx` zip, or the raw `mindmap.xml` some editions write without compression. */
export async function parseSimpleMindBuffer(buffer: ArrayBuffer | Uint8Array, sourcePath?: string): Promise<MindMapDocument> {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = openZip(bytes, '.smmx');
    const name = zip.names.find(entry => entry === 'document/mindmap.xml') ?? zip.names.find(entry => /(?:^|\/)mindmap\.xml$/i.test(entry));
    if (!name) throw new Error('SimpleMind file is missing document/mindmap.xml');
    return parseSimpleMindXml(zip.readText(name), sourcePath);
  }
  return parseSimpleMindXml(decodeUtf8(bytes), sourcePath);
}
