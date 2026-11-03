import { buildSheetDocument } from './document.js';
import { htmlToPlain } from './rich-text.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { attr, childElements, childText, parseXml, type XmlElement } from './xml.js';

function outlineNote(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const note = /<\/?[a-z][\s\S]*>/i.test(value) ? htmlToPlain(value) : value.trim();
  return note || undefined;
}

function outlineTopic(element: XmlElement): TopicNode {
  const notes = outlineNote(attr(element, '_note') ?? attr(element, 'note'));
  const href = (attr(element, 'url') || attr(element, 'htmlUrl') || '').trim();
  const labels = (attr(element, 'category') ?? '').split(',').map(label => label.trim()).filter(Boolean);
  const topic: TopicNode = {
    id: '',
    title: (attr(element, 'text') ?? attr(element, 'title') ?? childText(element)).trim(),
    order: 0,
    children: childElements(element, 'outline').map(outlineTopic),
  };
  if (notes) topic.notes = notes;
  if (href) topic.href = href;
  if (labels.length) topic.labels = labels;
  return topic;
}

function headTitle(element: XmlElement): string {
  const head = childElements(element, 'head')[0];
  if (!head) return '';
  const title = childElements(head, 'title')[0];
  return (title ? childText(title) : attr(head, 'title') ?? '').trim();
}

/** Read an OPML 1.0 or 2.0 outline. One top-level outline is the root; several are wrapped by the head title. */
export function parseOpmlContent(content: string, sourcePath?: string): MindMapDocument {
  let xml: XmlElement;
  try {
    xml = parseXml(content);
  } catch (error) {
    throw new Error(`Failed to parse OPML file: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (xml.name.toLowerCase() !== 'opml') throw new Error('Input is not an OPML file');
  const body = childElements(xml, 'body')[0];
  if (!body) throw new Error('OPML file is missing a body');
  const outlines = childElements(body, 'outline').map(outlineTopic);
  if (!outlines.length) throw new Error('OPML file has no outlines');
  const title = headTitle(xml);
  const root = outlines.length === 1 ? outlines[0] : { id: '', title: title || 'Mind map', order: 0, children: outlines };
  return buildSheetDocument('opml', outlines.length === 1 ? (title || root.title) : root.title, root, sourcePath);
}
