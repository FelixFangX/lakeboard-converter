import { readFile } from 'node:fs/promises';
import { normalizeTree } from './normalize.js';
import type { MindMapDocument, TopicNode } from './types.js';
import { validateTree } from './validate.js';
import { normalizeInlineText } from '../utils/text.js';

interface RawNode {
  id?: string;
  html?: string;
  children?: RawNode[];
  type?: string;
}

interface RawLakeboardFile {
  format?: string;
  diagramData?: {
    body?: RawNode[];
  };
}

function convertNode(node: RawNode, order: number): TopicNode {
  return {
    id: node.id ?? `node-${order}`,
    title: normalizeInlineText(node.html ?? '') || '(untitled)',
    order,
    rawHtml: node.html,
    children: (node.children ?? []).map((child, index) => convertNode(child, index)),
  };
}

function parseLakeboardData(data: RawLakeboardFile, sourcePath?: string): MindMapDocument {
  if (data.format !== 'lakeboard') {
    throw new Error('Input is not a supported lakeboard JSON file');
  }

  const body = data.diagramData?.body;
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('lakeboard file is missing diagramData.body');
  }

  const rootRaw = body.find((node) => node.type === 'mindmap') ?? body[0];
  if (!rootRaw) {
    throw new Error('No convertible mindmap root node found');
  }

  const root = normalizeTree(convertNode(rootRaw, 0));
  const { nodeCount, maxDepth } = validateTree(root);

  return {
    sourcePath,
    format: 'lakeboard',
    root,
    nodeCount,
    maxDepth,
  };
}

export async function parseLakeboardFile(filePath: string): Promise<MindMapDocument> {
  const content = await readFile(filePath, 'utf-8');
  return parseLakeboardContent(content, filePath);
}

export function parseLakeboardContent(content: string, sourcePath?: string): MindMapDocument {
  let data: RawLakeboardFile;

  try {
    data = JSON.parse(content) as RawLakeboardFile;
  } catch (error) {
    throw new Error(`Failed to parse .lakeboard file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return parseLakeboardData(data, sourcePath);
}
