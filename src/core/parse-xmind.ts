import { createFallbackIds } from './fallback-ids.js';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { normalizeTree } from './normalize.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { validateTree } from './validate.js';

interface XMindTopic {
  id?: string;
  title?: string;
  children?: {
    attached?: XMindTopic[];
  };
  notes?: {
    plain?: { content?: string };
  };
  labels?: string[];
  href?: string;
}

interface XMindSheet {
  id?: string;
  title?: string;
  rootTopic?: XMindTopic;
}

function convertXMindTopic(topic: XMindTopic, order: number, path: string, fallbackId: (base: string) => string): TopicNode {
  const children = topic.children?.attached ?? [];
  return {
    id: topic.id ?? fallbackId(`xmind-node-${path}`),
    title: topic.title ?? '(untitled)',
    order,
    children: children.map((child, index) => convertXMindTopic(child, index, `${path}.${index}`, fallbackId)),
    notes: topic.notes?.plain?.content,
    labels: topic.labels,
    href: topic.href,
  };
}

export async function parseXmindFile(filePath: string): Promise<MindMapDocument> {
  const buffer = await readFile(filePath);
  return parseXmindBuffer(buffer, filePath);
}

export async function parseXmindBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  sourcePath?: string,
): Promise<MindMapDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('Cannot unzip .xmind file: it may be corrupt or not a valid ZIP archive');
  }

  const contentFile = zip.file('content.json');
  if (!contentFile) {
    throw new Error('.xmind file is missing content.json; it is probably an old XMind 8 file (only XMind Zen/2020+ is supported)');
  }

  let sheets: XMindSheet[];
  try {
    const contentStr = await contentFile.async('string');
    sheets = JSON.parse(contentStr) as XMindSheet[];
  } catch {
    throw new Error('Failed to parse content.json in the .xmind file');
  }

  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('No sheets found in the .xmind file');
  }

  const fallbackId = createFallbackIds(sheets.flatMap(sheet => sheet.rootTopic ? [sheet.rootTopic] : []), topic => topic.children?.attached ?? []);
  const parsedSheets = sheets.map((sheet, offset) => {
    if (!sheet.rootTopic) throw new Error(`Sheet ${offset + 1} in the .xmind file has no rootTopic`);
    const root = normalizeTree(convertXMindTopic(sheet.rootTopic, 0, `${offset}-0`, fallbackId));
    return { index: offset + 1, title: sheet.title?.trim() || `Sheet ${offset + 1}`, root, ...validateTree(root) };
  });
  return {
    sourcePath,
    format: 'xmind', sheets: parsedSheets, root: parsedSheets[0].root,
    nodeCount: parsedSheets.reduce((sum, sheet) => sum + sheet.nodeCount, 0),
    maxDepth: Math.max(...parsedSheets.map(sheet => sheet.maxDepth)),
  };
}
