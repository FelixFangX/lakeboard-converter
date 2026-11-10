import JSZip from 'jszip';
import { buildSheetDocument } from './document.js';
import { LossTally } from './losses.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { attr, childElements, childText, parseXml, type XmlElement } from './xml.js';

function topicTitle(topic: XmlElement): string {
  const own = attr(topic, 'PlainText') || attr(topic, 'Text');
  if (own?.trim()) return own.trim();
  const text = childElements(topic, 'Text')[0];
  if (!text) return '';
  return (attr(text, 'PlainText') || attr(text, 'Text') || childText(text)).trim();
}

function descendants(topic: XmlElement, name: string): XmlElement[] {
  const expected = name.toLowerCase();
  const found: XmlElement[] = [];
  const visit = (element: XmlElement): void => {
    for (const child of childElements(element)) {
      if (child.name.toLowerCase() === 'topic') continue;
      if (child.name.toLowerCase() === expected) found.push(child);
      visit(child);
    }
  };
  visit(topic);
  return found;
}

function topicsIn(parent: XmlElement, containerName: string): XmlElement[] {
  return childElements(parent, containerName).flatMap(container => childElements(container, 'Topic'));
}

function subTopics(topic: XmlElement): XmlElement[] {
  const containers = childElements(topic, 'SubTopics');
  if (containers.length) return containers.flatMap(container => childElements(container, 'Topic'));
  return childElements(topic, 'Topic');
}

function toTopic(topic: XmlElement, tally: LossTally): TopicNode {
  const note = descendants(topic, 'NotesData')[0];
  const plain = note ? attr(note, 'PlainText') : undefined;
  const notes = (note ? plain ?? childText(note) : '').trim();
  if (note && !notes && childElements(note).length > 0 && !plain?.trim()) tally.add('rich-note');
  const link = descendants(topic, 'Hyperlink')[0];
  const href = (link ? attr(link, 'Url') || attr(link, 'Uri') || attr(link, 'Href') || '' : '').trim();
  const labels = descendants(topic, 'Category').map(item => (attr(item, 'Name') ?? childText(item)).trim()).filter(Boolean);
  const children = [
    ...subTopics(topic),
    ...topicsIn(topic, 'FloatingTopics'),
    ...topicsIn(topic, 'CalloutTopics'),
  ].map(child => toTopic(child, tally));
  const node: TopicNode = { id: attr(topic, 'OId') || attr(topic, 'ID') || '', title: topicTitle(topic), order: 0, children };
  if (notes) node.notes = notes;
  if (href) node.href = href;
  if (labels.length) node.labels = labels;
  return node;
}

function findMap(root: XmlElement): { map: XmlElement; topic: XmlElement } | undefined {
  const maps = root.name.toLowerCase() === 'map' ? [root] : childElements(root, 'Map');
  for (const map of maps.length ? maps : [root]) {
    const central = childElements(map, 'OneTopic')[0];
    const topic = central ? childElements(central, 'Topic')[0] : childElements(map, 'Topic')[0];
    if (topic) return { map, topic };
  }
  return undefined;
}

/** Read MindManager `Document.xml`. Topic text, PlainText notes, links, and category names are kept. */
export function parseMindManagerXml(content: string, sourcePath?: string): MindMapDocument {
  let xml: XmlElement;
  try {
    xml = parseXml(content);
  } catch (error) {
    throw new Error(`Failed to parse MindManager file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const found = findMap(xml);
  if (!found) throw new Error('MindManager file has no central topic');
  const tally = new LossTally();
  const root = toTopic(found.topic, tally);
  const extras = ['FloatingTopics', 'DetachedTopics', 'CalloutTopics'].flatMap(name => topicsIn(found.map, name)).map(topic => toTopic(topic, tally));
  root.children.push(...extras);
  return buildSheetDocument('mindmanager', root.title, root, sourcePath, 'mindmanager', tally.list());
}

function decodeUtf8(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return new TextDecoder().decode(bytes);
}

/** Read a `.mmap` zip (or a raw `Document.xml` buffer). Rich-text notes without PlainText are skipped. */
export async function parseMindManagerBuffer(buffer: ArrayBuffer | Uint8Array, sourcePath?: string): Promise<MindMapDocument> {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new Error('Cannot unzip .mmap file: it may be corrupt or not a valid ZIP archive');
    }
    const entry = zip.file(/(?:^|\/)document\.xml$/i)[0];
    if (!entry) throw new Error('MindManager file is missing Document.xml');
    return parseMindManagerXml(await entry.async('string'), sourcePath);
  }
  return parseMindManagerXml(decodeUtf8(bytes), sourcePath);
}
