import { createFallbackIds } from './fallback-ids.js';
import { normalizeTree } from './normalize.js';
import type { MindMapDocument, SourceFormat, TopicNode } from './types.js';
import { validateTree } from './validate.js';

/** Assign stable ids, normalize titles, and wrap one tree as a single-sheet document. */
export function buildSheetDocument(format: SourceFormat, sheetTitle: string, root: TopicNode, sourcePath?: string, idPrefix = format): MindMapDocument {
  const nodes: TopicNode[] = [];
  const collect = (node: TopicNode): void => { nodes.push(node); node.children.forEach(collect); };
  collect(root);
  const fallback = createFallbackIds(nodes.filter(node => node.id), () => []);
  const assign = (node: TopicNode, nodePath: string, order: number): void => {
    if (!node.id) node.id = fallback(`${idPrefix}-${nodePath}`);
    node.order = order;
    if (!node.title.trim()) node.title = '(untitled)';
    node.children.forEach((child, index) => assign(child, `${nodePath}.${index}`, index));
  };
  assign(root, '0', 0);
  const normalized = normalizeTree(root);
  const stats = validateTree(normalized);
  return {
    sourcePath,
    format,
    sheets: [{ index: 1, title: sheetTitle.trim() || normalized.title, root: normalized, ...stats }],
    root: normalized,
    ...stats,
  };
}
