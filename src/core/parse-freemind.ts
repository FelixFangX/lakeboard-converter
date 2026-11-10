import { buildSheetDocument } from './document.js';
import { LossTally } from './losses.js';
import { elementToPlain } from './rich-text.js';
import type { MindMapDocument, SourceFormat, TopicNode } from './types.js';
import { attr, childElements, parseXml, type XmlElement } from './xml.js';

function rich(element: XmlElement, type: string): string {
  const match = childElements(element, 'richcontent').find(item => (attr(item, 'TYPE') ?? '').toUpperCase() === type);
  return match ? elementToPlain(match) : '';
}

function isFreeplane(map: XmlElement): boolean {
  if (/freeplane/i.test(attr(map, 'version') ?? '')) return true;
  const pending = childElements(map);
  while (pending.length) {
    const element = pending.pop()!;
    const name = element.name.toLowerCase();
    if (name === 'attribute' || name === 'hook') return true;
    if (name === 'richcontent' && (attr(element, 'TYPE') ?? '').toUpperCase() === 'NODE') return true;
    pending.push(...childElements(element));
  }
  return false;
}

function toTopic(element: XmlElement, tally: LossTally): TopicNode {
  if ((attr(element, 'ENCRYPTED') ?? '').toLowerCase() === 'true') tally.add('encrypted');
  tally.add('relationship', childElements(element, 'arrowlink').length);
  const richTitle = rich(element, 'NODE');
  const plain = attr(element, 'TEXT') ?? attr(element, 'LOCALIZED_TEXT')?.replace(/_/g, ' ') ?? '';
  const notes = rich(element, 'NOTE');
  const href = (attr(element, 'LINK') ?? '').trim();
  const labels = childElements(element, 'attribute').map(item => {
    const name = attr(item, 'NAME') ?? '';
    const value = attr(item, 'VALUE') ?? '';
    return name ? `${name}=${value}` : value;
  }).filter(Boolean);
  const topic: TopicNode = {
    id: attr(element, 'ID') ?? '',
    title: richTitle || plain,
    order: 0,
    children: childElements(element, 'node').map(child => toTopic(child, tally)),
  };
  if (notes) topic.notes = notes;
  if (href) topic.href = href;
  if (labels.length) topic.labels = labels;
  return topic;
}

/** Read a FreeMind or Freeplane `.mm` map. Freeplane is recognized from its version or from attributes, hooks, and rich node text. */
export function parseFreeMindContent(content: string, sourcePath?: string): MindMapDocument {
  let xml: XmlElement;
  try {
    xml = parseXml(content);
  } catch (error) {
    throw new Error(`Failed to parse FreeMind file: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (xml.name.toLowerCase() !== 'map') throw new Error('Input is not a FreeMind or Freeplane map');
  const tally = new LossTally();
  const nodes = childElements(xml, 'node').map(node => toTopic(node, tally));
  if (!nodes.length) throw new Error('FreeMind file has no root node');
  const format: SourceFormat = isFreeplane(xml) ? 'freeplane' : 'freemind';
  const root = nodes.length === 1 ? nodes[0] : { id: '', title: 'Mind map', order: 0, children: nodes };
  return buildSheetDocument(format, root.title, root, sourcePath, format, tally.list());
}
