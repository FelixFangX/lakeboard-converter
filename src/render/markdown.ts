import type { MindMapDocument, TopicNode } from '../core/types.js';
import { flattenMultilineText } from '../utils/text.js';

function title(node: TopicNode): string {
  const text = node.href ? `[${node.title.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')}](${node.href})` : node.title;
  return text + (node.labels ?? []).map(label => {
    const fence = '`'.repeat(Math.max(0, ...(label.match(/`+/g) ?? []).map(s => s.length)) + 1);
    const padding = label.includes('`') || /^ | $/.test(label) ? ' ' : '';
    return ` ${fence}${padding}${label}${padding}${fence}`;
  }).join('');
}

function walkGeneric(lines: string[], node: TopicNode, depth: number, multi: boolean): void {
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const text = title(node).split('\n');
  lines.push(depth === 0 ? `${multi ? '##' : '#'} ${text[0]}` : `${indent}- ${text[0]}`);
  text.slice(1).forEach(line => lines.push(`${depth === 0 ? '' : indent + '  '}${line}`));
  if (node.notes) {
    const noteIndent = depth === 0 ? '' : indent + '  ';
    lines.push(`${noteIndent}> ${node.notes.split('\n').join(`\n${noteIndent}> `)}`);
  }
  node.children.forEach(child => walkGeneric(lines, child, depth + 1, multi));
}

function walkList(lines: string[], node: TopicNode, depth: number, outline: boolean): void {
  const labels = outline && node.labels?.length ? ` [${node.labels.join(', ')}]` : '';
  lines.push(`${'    '.repeat(depth)}- ${flattenMultilineText(node.title)}${labels}`);
  node.children.forEach(child => walkList(lines, child, depth + 1, outline));
}

export function renderGenericMarkdown(document: MindMapDocument): string {
  return document.sheets.map(sheet => {
    const lines: string[] = document.sheets.length > 1 ? [`# ${sheet.title}`] : [];
    walkGeneric(lines, sheet.root, 0, document.sheets.length > 1);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

export function renderXmindMarkdown(document: MindMapDocument): string {
  return renderLists(document, false);
}

export function renderOutline(document: MindMapDocument): string {
  return renderLists(document, true);
}

function renderLists(document: MindMapDocument, outline: boolean): string {
  return document.sheets.map(sheet => {
    const lines = outline && document.sheets.length > 1 ? [`# ${sheet.title}`] : [];
    walkList(lines, sheet.root, 0, outline);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}
