import { buildSheetDocument } from './document.js';
import type { MindMapDocument, TopicNode } from './types.js';

/** Parse an outline CSV. Quoted fields and `""` escapes are kept; a spreadsheet row is not an outline. */
export function parseCsvRows(content: string): string[][] {
  const source = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (quoted) throw new Error('CSV outline has an unterminated quote');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(entry => entry.some(value => value.trim()));
}

function isLevelHeader(row: string[]): boolean {
  const filled = row.map(value => value.trim()).filter(Boolean);
  return filled.length >= 2 && filled.every(value => /^level\s*\d+$/i.test(value));
}

/**
 * Read a CSV outline: each row has one topic, and the column is its depth.
 * A `Level 1,Level 2` header is skipped. Rows with several topics are rejected.
 */
export function parseCsvContent(content: string, sourcePath?: string): MindMapDocument {
  let rows: string[][];
  try {
    rows = parseCsvRows(content);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CSV outline')) throw error;
    throw new Error(`Failed to parse CSV outline: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (rows.length && isLevelHeader(rows[0])) rows = rows.slice(1);
  if (!rows.length) throw new Error('CSV outline has no topics');
  const roots: TopicNode[] = [];
  const stack: { depth: number; node: TopicNode }[] = [];
  for (const row of rows) {
    const filled = row.map((value, index) => [index, value.trim()] as const).filter(([, value]) => value);
    if (filled.length !== 1) throw new Error('CSV outline rows must contain one topic');
    const [depth, title] = filled[0];
    while (stack.length && stack.at(-1)!.depth >= depth) stack.pop();
    if (depth > 0 && !stack.length) throw new Error('CSV outline skips a level');
    const node: TopicNode = { id: '', title, order: 0, children: [] };
    const parent = stack.at(-1)?.node;
    const siblings = parent ? parent.children : roots;
    node.order = siblings.length;
    siblings.push(node);
    stack.push({ depth, node });
  }
  const root = roots.length === 1 ? roots[0] : { id: '', title: 'Mind map', order: 0, children: roots };
  return buildSheetDocument('csv', root.title, root, sourcePath);
}
