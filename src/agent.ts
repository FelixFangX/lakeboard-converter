import { parseMarkdownOutline } from './core/parse-markdown.js';
import { validateTree } from './core/validate.js';
import { renderXmind } from './render/xmind.js';
import path from 'node:path';
import os from 'node:os';
import { stat, writeFile } from 'node:fs/promises';
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

async function resolveInput(file: string): Promise<{ resolved: string; bytes: number }> {
  const expanded = file === '~' ? os.homedir() : (file.startsWith('~/') || (path.sep === '\\' && file.startsWith('~\\'))) ? path.join(os.homedir(), file.slice(2)) : file;
  const resolved = path.resolve(expanded);
  let bytes: number;
  try { bytes = (await stat(resolved)).size; } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new Error(`File not found: ${file}${expanded !== file ? ` (resolved to ${resolved})` : path.isAbsolute(expanded) ? '' : ` (resolved to ${resolved}). Relative paths resolve against the server's working directory ${process.cwd()}; pass an absolute path.`}`);
  }
  return { resolved, bytes };
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
  const { resolved } = await resolveInput(file);
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
  const sheets = original.sheets.flatMap(sheet => { const root = prune(sheet.root, 0); return root ? [{ ...sheet, root, ...validateTree(root) }] : []; });
  const doc = { ...original, sheets, root: sheets[0].root, nodeCount: count, maxDepth: Math.max(...sheets.map(s => s.maxDepth)) };
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

export interface AgentInspectResult {
  schemaVersion: 1;
  file: string;
  source: SourceFormat;
  bytes: number;
  nodeCount: number;
  maxDepth: number;
  sheets: AgentReadResult['sheets'];
  selectedSheet?: AgentReadResult['selectedSheet'];
}

/** Parse and count topics without rendering content. */
export async function inspectMindMap(file: string, options: { sheet?: string | number } = {}): Promise<AgentInspectResult> {
  const { resolved, bytes } = await resolveInput(file);
  const parsed = await parse(resolved);
  const selected = selectSheet(parsed, options.sheet);
  return {
    schemaVersion: 1, file: resolved, source: parsed.format, bytes,
    nodeCount: selected.nodeCount, maxDepth: selected.maxDepth,
    sheets: parsed.sheets.map(({ index, title, nodeCount, maxDepth }) => ({ index, title, nodeCount, maxDepth })),
    ...(options.sheet !== undefined ? { selectedSheet: { index: selected.sheets[0].index, title: selected.sheets[0].title } } : {}),
  };
}

export function inspectSummary(result: AgentInspectResult): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(result.sheets.length, 'sheet')}, ${result.nodeCount} nodes, max depth ${result.maxDepth}, ${Math.ceil(result.bytes / 1024)} KB`;
}

export interface BatchReadOptions extends ReadOptions { maxTotalNodes?: number }
export interface AgentBatchReadResult {
  schemaVersion: 1;
  format: AgentFormat;
  total: number;
  succeeded: number;
  failed: number;
  nodeCount: number;
  truncated: boolean;
  warnings: string[];
  results: { index: number; file: string; ok: true; result: AgentReadResult }[];
  errors: { index: number; file: string; error: string }[];
}

/** Read sequentially, isolating file errors and sharing a total output budget. Indices are zero-based. */
export async function readMindMaps(files: string[], format: AgentFormat, options: BatchReadOptions = {}): Promise<AgentBatchReadResult> {
  if (!Array.isArray(files) || files.length < 1 || files.length > 50 || files.some(file => typeof file !== 'string')) throw new Error('files must contain 1 to 50 paths');
  if (!AGENT_FORMATS.includes(format)) throw new Error(`Unsupported format "${format}" (expected one of ${AGENT_FORMATS.join(', ')})`);
  const maxNodes = options.maxNodes ?? 2000;
  const maxTotalNodes = options.maxTotalNodes ?? 10000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 50000) throw new Error('maxNodes must be an integer from 1 to 50000');
  if (!Number.isInteger(maxTotalNodes) || maxTotalNodes < 1 || maxTotalNodes > 200000) throw new Error('maxTotalNodes must be an integer from 1 to 200000');
  if (options.maxDepth !== undefined && (!Number.isInteger(options.maxDepth) || options.maxDepth < 0)) throw new Error('maxDepth must be an integer >= 0');
  const batch: AgentBatchReadResult = { schemaVersion: 1, format, total: files.length, succeeded: 0, failed: 0, nodeCount: 0, truncated: false, warnings: [], results: [], errors: [] };
  const skipped = `Skipped: total node budget (${maxTotalNodes}) used up. Pass a higher maxTotalNodes or fewer files.`;
  for (const [index, file] of files.entries()) {
    if (batch.nodeCount >= maxTotalNodes) {
      batch.errors.push({ index, file, error: skipped });
      if (!batch.warnings.includes(skipped)) batch.warnings.push(skipped);
      batch.truncated = true;
      continue;
    }
    try {
      const result = await readMindMap(file, format, { ...options, maxNodes: Math.min(maxNodes, maxTotalNodes - batch.nodeCount) });
      batch.results.push({ index, file, ok: true, result });
      batch.nodeCount += result.nodeCount;
      batch.truncated ||= result.truncated;
    } catch (error) {
      batch.errors.push({ index, file, error: error instanceof Error ? error.message : String(error) });
    }
  }
  batch.succeeded = batch.results.length;
  batch.failed = batch.errors.length;
  return batch;
}

export function batchText(batch: AgentBatchReadResult): string {
  const parts = batch.results.map(({ file, result }) => `## ${file}\n\n${typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}${result.warnings.length ? `\n> Note: ${result.warnings.join(' ')}` : ''}`);
  if (batch.errors.length) parts.push('Errors:\n' + batch.errors.map(({ file, error }) => `${file}: ${error}`).join('\n'));
  if (batch.warnings.length) parts.push(`> Note: ${batch.warnings.join(' ')}`);
  return parts.join('\n\n');
}

export interface BuildOptions { output?: string; overwrite?: boolean; title?: string; maxNodes?: number }
export interface AgentBuildResult {
  schemaVersion: 1;
  source: 'markdown';
  output?: string;
  base64?: string;
  bytes: number;
  nodeCount: number;
  maxDepth: number;
  sheets: { index: number; title: string; nodeCount: number; maxDepth: number }[];
  truncated: boolean;
  warnings: string[];
}

/** Build XMind bytes, writing only when an explicit absolute output is supplied. */
export async function buildMindMap(markdown: string, options: BuildOptions = {}): Promise<AgentBuildResult> {
  if (Buffer.byteLength(markdown, 'utf8') > 2 * 1024 * 1024) throw new Error('Markdown input exceeds the 2 MB limit');
  const maxNodes = options.maxNodes ?? 2000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 50000) throw new Error('maxNodes must be an integer from 1 to 50000');
  let output: string | undefined;
  if (options.output !== undefined) {
    const file = options.output;
    const expanded = file === '~' ? os.homedir() : (file.startsWith('~/') || (path.sep === '\\' && file.startsWith('~\\'))) ? path.join(os.homedir(), file.slice(2)) : file;
    if (!path.isAbsolute(expanded)) throw new Error('Output must be an absolute path; pass an absolute .xmind path');
    if (path.extname(expanded).toLowerCase() !== '.xmind') throw new Error('Output must end in .xmind');
    output = path.resolve(expanded);
    const parent = path.dirname(output);
    try { if (!(await stat(parent)).isDirectory()) throw new Error(`Output parent is not a directory: ${parent}`); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Output parent directory does not exist: ${parent}`);
      throw error;
    }
  }
  const original = parseMarkdownOutline(markdown, options);
  let count = 0;
  const prune = (node: TopicNode): TopicNode | undefined => {
    if (count >= maxNodes) return undefined;
    count++;
    return { ...node, children: node.children.flatMap(child => { const kept = prune(child); return kept ? [kept] : []; }) };
  };
  const sheets = original.sheets.flatMap(sheet => {
    const root = prune(sheet.root);
    return root ? [{ ...sheet, root, ...validateTree(root) }] : [];
  });
  const doc = { ...original, sheets, root: sheets[0].root, nodeCount: count, maxDepth: Math.max(...sheets.map(s => s.maxDepth)) };
  const bytes = await renderXmind(doc);
  if (output) {
    try { await writeFile(output, bytes, { flag: options.overwrite ? 'w' : 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Output file already exists: ${output}`);
      throw error;
    }
  }
  const truncated = count < original.nodeCount;
  return {
    schemaVersion: 1, source: 'markdown', ...(output ? { output } : { base64: bytes.toString('base64') }),
    bytes: bytes.length, nodeCount: count, maxDepth: doc.maxDepth,
    sheets: sheets.map(({ index, title, nodeCount, maxDepth }) => ({ index, title, nodeCount, maxDepth })),
    truncated, warnings: [...original.warnings, ...(truncated ? [`Output truncated at ${count} of ${original.nodeCount} nodes. Pass a higher maxNodes to include more topics.`] : [])],
  };
}
