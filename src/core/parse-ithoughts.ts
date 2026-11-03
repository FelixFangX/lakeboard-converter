import JSZip from 'jszip';
import { buildSheetDocument } from './document.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { attr, childElements, parseXml, type XmlElement } from './xml.js';

function externalHref(value: string | undefined): string | undefined {
  const href = value?.trim() ?? '';
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function toTopic(element: XmlElement): TopicNode {
  const href = externalHref(attr(element, 'link') || attr(element, 'url'));
  const notes = (attr(element, 'note') ?? '').trim();
  const topic: TopicNode = {
    id: attr(element, 'uuid') || attr(element, 'id') || '',
    title: attr(element, 'text') ?? '',
    order: 0,
    children: childElements(element, 'topic').map(toTopic),
  };
  if (notes) topic.notes = notes;
  if (href) topic.href = href;
  return topic;
}

function topicsOf(root: XmlElement): TopicNode[] {
  if (root.name.toLowerCase() === 'topic') return [toTopic(root)];
  return childElements(root, 'topic').map(toTopic);
}

/** Read iThoughts `mapdata.xml`. Hierarchy is nested `topic` elements; text, note, and link are attributes. */
export function parseIThoughtsXml(content: string, sourcePath?: string): MindMapDocument {
  let xml: XmlElement;
  try {
    xml = parseXml(content);
  } catch (error) {
    throw new Error(`Failed to parse iThoughts file: ${error instanceof Error ? error.message : String(error)}`);
  }
  const nodes = topicsOf(xml);
  if (!nodes.length) throw new Error('iThoughts file has no topic');
  const root = nodes.length === 1 ? nodes[0] : { id: '', title: 'Mind map', order: 0, children: nodes };
  return buildSheetDocument('ithoughts', root.title, root, sourcePath);
}

function decodeUtf8(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return new TextDecoder().decode(bytes);
}

/** Read an `.itmz` zip, or the raw `mapdata.xml` it contains. */
export async function parseIThoughtsBuffer(buffer: ArrayBuffer | Uint8Array, sourcePath?: string): Promise<MindMapDocument> {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new Error('Cannot unzip .itmz file: it may be corrupt or not a valid ZIP archive');
    }
    const entry = zip.file('mapdata.xml') ?? zip.file(/(?:^|\/)mapdata\.xml$/i)[0];
    if (!entry) throw new Error('iThoughts file is missing mapdata.xml');
    return parseIThoughtsXml(await entry.async('string'), sourcePath);
  }
  return parseIThoughtsXml(decodeUtf8(bytes), sourcePath);
}
