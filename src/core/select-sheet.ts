import type { MindMapDocument } from './types.js';

export function selectSheet(document: MindMapDocument, selection?: string | number): MindMapDocument {
  if (selection === undefined) return document;
  const sheet = document.sheets.find(sheet =>
    typeof selection === 'number' || /^\d+$/.test(selection)
      ? sheet.index === Number(selection)
      : sheet.title.toLowerCase() === selection.toLowerCase());
  if (!sheet) throw new Error(`Sheet "${selection}" not found. Available: ${document.sheets.map(s => `${s.index} ${s.title}`).join(', ')}`);
  return { ...document, sheets: [sheet], root: sheet.root, nodeCount: sheet.nodeCount, maxDepth: sheet.maxDepth };
}
