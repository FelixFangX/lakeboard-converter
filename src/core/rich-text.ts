import { decodeXml, type XmlElement, type XmlNode } from './xml.js';

const BLOCKS = new Set(['p', 'div', 'li', 'tr', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function collapseWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function renderNodes(nodes: XmlNode[]): string {
  let text = '';
  for (const node of nodes) {
    if (typeof node === 'string') { text += node; continue; }
    const name = node.name.toLowerCase();
    if (name === 'br') { text += '\n'; continue; }
    text += renderNodes(node.children);
    if (BLOCKS.has(name)) text += '\n';
  }
  return text;
}

/** Plain text of an HTML string. Tags are removed before entity decoding so `&lt;` stays visible. */
export function htmlToPlain(html: string): string {
  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|blockquote|pre|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return collapseWhitespace(decodeXml(stripped));
}

/** Plain text of parsed XHTML. A CDATA blob of HTML is parsed as markup instead of literal tags. */
export function elementToPlain(element: XmlElement): string {
  const hasElements = element.children.some(node => typeof node !== 'string');
  if (!hasElements) return htmlToPlain(element.children.filter((node): node is string => typeof node === 'string').join(''));
  return collapseWhitespace(renderNodes(element.children));
}
