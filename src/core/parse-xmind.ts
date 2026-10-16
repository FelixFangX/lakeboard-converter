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

function convertXMindTopic(topic: XMindTopic, order: number): TopicNode {
  const children = topic.children?.attached ?? [];
  return {
    id: topic.id ?? `xmind-node-${order}`,
    title: topic.title ?? '(untitled)',
    order,
    children: children.map((child, index) => convertXMindTopic(child, index)),
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

  const sheet = sheets[0];
  if (!sheet.rootTopic) {
    throw new Error('The first sheet in the .xmind file has no rootTopic');
  }

  const root = normalizeTree(convertXMindTopic(sheet.rootTopic, 0));
  const { nodeCount, maxDepth } = validateTree(root);

  return {
    sourcePath,
    format: 'xmind',
    root,
    nodeCount,
    maxDepth,
  };
}
