import path from 'node:path';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import { selectSheet } from './core/select-sheet.js';
import type { MindMapDocument, SourceFormat, TopicNode } from './core/types.js';
import { parseLakeboardFile } from './core/parse-lakeboard.js';
import { parseXmindFile } from './core/parse-xmind.js';
import { renderGenericMarkdown, renderOutline } from './render/markdown.js';

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
  sheets: { index: number; title: string; nodeCount: number; maxDepth: number }[];
  selectedSheet?: { index: number; title: string };
  truncated: boolean;
  warnings: string[];
  content: string | AgentTopic | { sheets: { index: number; title: string; root: AgentTopic }[] };
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

export interface ReadOptions { sheet?: string | number; maxNodes?: number; maxDepth?: number }

/** Read a mind map without writing files. Depth limits count the root as depth 0. */
export async function readMindMap(file: string, format: AgentFormat, options: ReadOptions = {}): Promise<AgentReadResult> {
  if (!AGENT_FORMATS.includes(format)) {
    throw new Error(`Unsupported format "${format}" (expected one of ${AGENT_FORMATS.join(', ')})`);
  }
  const maxNodes = options.maxNodes ?? 2000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 50000) throw new Error('maxNodes must be an integer from 1 to 50000');
  if (options.maxDepth !== undefined && (!Number.isInteger(options.maxDepth) || options.maxDepth < 0)) throw new Error('maxDepth must be an integer >= 0');
  const expanded = file === '~' ? os.homedir() : file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file;
  const resolved = path.resolve(expanded);
  try { await stat(resolved); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new Error(`File not found: ${file}${expanded !== file ? ` (resolved to ${resolved})` : path.isAbsolute(expanded) ? '' : ` (resolved to ${resolved}). Relative paths resolve against the server's working directory ${process.cwd()}; pass an absolute path.`}`);
  }
  const parsed = await parse(resolved);
  const original = selectSheet(parsed, options.sheet);
  let count = 0;
  let depthCut = false;
  let sizeCut = false;
  const prune = (node: TopicNode, depth: number): TopicNode | undefined => {
    if (options.maxDepth !== undefined && depth > options.maxDepth) { depthCut = true; return undefined; }
    if (count >= maxNodes) { sizeCut = true; return undefined; }
    count++;
    return { ...node, children: node.children.flatMap(child => { const kept = prune(child, depth + 1); return kept ? [kept] : []; }) };
  };
  const sheets = original.sheets.flatMap(sheet => { const root = prune(sheet.root, 0); return root ? [{ ...sheet, root }] : []; });
  const doc = { ...original, sheets, root: sheets[0].root };
  const warnings: string[] = [];
  if (sizeCut) warnings.push(`Output truncated at ${count} of ${original.nodeCount} nodes. Pass a higher maxNodes or pick a sheet.`);
  if (depthCut) warnings.push(`Output truncated at maxDepth ${options.maxDepth}. Pass a higher maxDepth to include deeper topics.`);
  const content =
    format === 'json' ? (original.sheets.length === 1 ? toAgentTopic(doc.root) : { sheets: doc.sheets.map(s => ({ index: s.index, title: s.title, root: toAgentTopic(s.root) })) }) : format === 'md' ? renderGenericMarkdown(doc) : renderOutline(doc);
  return {
    schemaVersion: 1,
    file: resolved,
    sheets: parsed.sheets.map(({ index, title, nodeCount, maxDepth }) => ({ index, title, nodeCount, maxDepth })),
    ...(options.sheet !== undefined ? { selectedSheet: { index: original.sheets[0].index, title: original.sheets[0].title } } : {}),
    truncated: sizeCut || depthCut,
    warnings,
    source: doc.format,
    format,
    nodeCount: doc.nodeCount,
    maxDepth: doc.maxDepth,
    content,
  };
}
