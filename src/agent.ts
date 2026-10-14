import path from 'node:path';
import type { MindMapDocument, SourceFormat, TopicNode } from './core/types.js';
import { parseLakeboardFile } from './core/parse-lakeboard.js';
import { parseXmindFile } from './core/parse-xmind.js';
import { renderGenericMarkdown, renderXmindMarkdown } from './render/markdown.js';

export type AgentFormat = 'md' | 'json' | 'outline';
export const AGENT_FORMATS: readonly AgentFormat[] = ['md', 'json', 'outline'];

export interface AgentTopic {
  title: string;
  notes?: string;
  labels?: string[];
  href?: string;
  children: AgentTopic[];
}

/** Stable, versioned result shape for agents and `--json` callers. */
export interface AgentReadResult {
  schemaVersion: 1;
  file: string;
  source: SourceFormat;
  format: AgentFormat;
  nodeCount: number;
  maxDepth: number;
  content: string | AgentTopic;
}

function toAgentTopic(node: TopicNode): AgentTopic {
  const out: AgentTopic = { title: node.title, children: node.children.map(toAgentTopic) };
  if (node.notes) out.notes = node.notes;
  if (node.labels?.length) out.labels = node.labels;
  if (node.href) out.href = node.href;
  return out;
}

async function parse(file: string): Promise<MindMapDocument> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.lakeboard') return parseLakeboardFile(file);
  if (ext === '.xmind') return parseXmindFile(file);
  throw new Error(`Unsupported file type "${ext}" (expected .lakeboard or .xmind)`);
}

/** Read a mind map file and return it in an agent-friendly format. Never writes files. */
export async function readMindMap(file: string, format: AgentFormat): Promise<AgentReadResult> {
  if (!AGENT_FORMATS.includes(format)) {
    throw new Error(`Unsupported format "${format}" (expected one of ${AGENT_FORMATS.join(', ')})`);
  }
  const doc = await parse(file);
  const content =
    format === 'json' ? toAgentTopic(doc.root) : format === 'md' ? renderGenericMarkdown(doc) : renderXmindMarkdown(doc);
  return {
    schemaVersion: 1,
    file: path.resolve(file),
    source: doc.format,
    format,
    nodeCount: doc.nodeCount,
    maxDepth: doc.maxDepth,
    content,
  };
}
