export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
};

/** Decode XML and common HTML character references. Unknown references are left in place. */
export function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (all, body: string) => {
    if (body[0] !== '#') return ENTITIES[body] ?? all;
    const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return all;
    return String.fromCodePoint(code);
  });
}

export function childElements(element: XmlElement, name?: string): XmlElement[] {
  const expected = name?.toLowerCase();
  return element.children.filter((node): node is XmlElement => typeof node !== 'string' && (expected === undefined || node.name.toLowerCase() === expected));
}

export function childText(element: XmlElement): string {
  return element.children.filter((node): node is string => typeof node === 'string').join('');
}

export function attr(element: XmlElement, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(element.attributes, name)) return element.attributes[name];
  const found = Object.keys(element.attributes).find(key => key.toLowerCase() === name.toLowerCase());
  return found === undefined ? undefined : element.attributes[found];
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

function skipDeclaration(source: string, index: number): number {
  let depth = 0;
  let quote = '';
  for (let cursor = index + 2; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '[') { depth += 1; continue; }
    if (char === ']') { depth -= 1; continue; }
    if (char === '>' && depth <= 0) return cursor + 1;
  }
  throw new Error('Unterminated XML declaration');
}

function readStartTag(source: string, index: number): { name: string; attributes: Record<string, string>; selfClosing: boolean; end: number } {
  let cursor = index + 1;
  const nameStart = cursor;
  while (cursor < source.length && !/[\s/>]/.test(source[cursor])) cursor += 1;
  if (cursor === nameStart) throw new Error(`Malformed XML tag at offset ${index}`);
  const name = source.slice(nameStart, cursor);
  const attributes: Record<string, string> = {};
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source.startsWith('/>', cursor)) return { name, attributes, selfClosing: true, end: cursor + 2 };
    if (source[cursor] === '>') return { name, attributes, selfClosing: false, end: cursor + 1 };
    const attrStart = cursor;
    while (cursor < source.length && !/[\s=/>]/.test(source[cursor])) cursor += 1;
    const attrName = source.slice(attrStart, cursor);
    if (!attrName) throw new Error(`Malformed XML tag at offset ${index}`);
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '=') throw new Error(`Malformed XML attribute ${attrName}`);
    cursor += 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error(`Malformed XML attribute ${attrName}`);
    cursor += 1;
    const valueStart = cursor;
    while (cursor < source.length && source[cursor] !== quote) cursor += 1;
    if (cursor >= source.length) throw new Error(`Unterminated XML attribute ${attrName}`);
    attributes[localName(attrName)] = decodeXml(source.slice(valueStart, cursor));
    cursor += 1;
  }
  throw new Error(`Unterminated XML tag <${name}>`);
}

/** Parse one XML document. Namespaces are reduced to local names. External entities are not resolved. */
export function parseXml(input: string): XmlElement {
  const source = input.replace(/^\uFEFF/, '');
  const root: XmlElement = { name: '', attributes: {}, children: [] };
  const stack: XmlElement[] = [root];
  let index = 0;
  const current = () => stack[stack.length - 1];

  while (index < source.length) {
    if (source.startsWith('<?', index)) {
      const end = source.indexOf('?>', index + 2);
      if (end < 0) throw new Error('Unterminated XML processing instruction');
      index = end + 2;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      if (end < 0) throw new Error('Unterminated XML comment');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9);
      if (end < 0) throw new Error('Unterminated XML CDATA section');
      current().children.push(source.slice(index + 9, end));
      index = end + 3;
      continue;
    }
    if (source.startsWith('<!', index)) {
      index = skipDeclaration(source, index);
      continue;
    }
    if (source[index] === '<') {
      if (source[index + 1] === '/') {
        const end = source.indexOf('>', index + 2);
        if (end < 0) throw new Error('Unterminated XML end tag');
        const name = localName(source.slice(index + 2, end).trim());
        const open = stack.pop();
        if (!open || stack.length === 0 || open.name !== name) throw new Error(`Mismatched XML end tag </${name}>`);
        index = end + 1;
        continue;
      }
      const tag = readStartTag(source, index);
      const element: XmlElement = { name: localName(tag.name), attributes: tag.attributes, children: [] };
      current().children.push(element);
      if (!tag.selfClosing) stack.push(element);
      index = tag.end;
      continue;
    }
    const next = source.indexOf('<', index);
    const text = source.slice(index, next < 0 ? source.length : next);
    if (text) current().children.push(decodeXml(text));
    index = next < 0 ? source.length : next;
  }

  if (stack.length !== 1) throw new Error(`Unclosed XML element <${stack[stack.length - 1]?.name}>`);
  const elements = root.children.filter((node): node is XmlElement => typeof node !== 'string');
  const stray = root.children.some(node => typeof node === 'string' && node.trim());
  if (stray || elements.length !== 1) throw new Error('XML document must contain one root element');
  return elements[0];
}
