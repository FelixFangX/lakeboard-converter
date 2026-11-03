export interface TopicNode {
  id: string;
  title: string;
  order: number;
  children: TopicNode[];
  rawHtml?: string;
  notes?: string;
  labels?: string[];
  href?: string;
}

export const SOURCE_FORMATS = ['lakeboard', 'xmind', 'opml', 'freemind', 'freeplane', 'markdown', 'mindmanager'] as const;
export type SourceFormat = typeof SOURCE_FORMATS[number];

export interface MindMapSheet {
  index: number;
  title: string;
  root: TopicNode;
  nodeCount: number;
  maxDepth: number;
}

export interface MindMapDocument {
  sheets: MindMapSheet[];
  sourcePath?: string;
  format: SourceFormat;
  root: TopicNode;
  nodeCount: number;
  maxDepth: number;
}

/** @deprecated Use MindMapDocument instead */
export type LakeboardDocument = MindMapDocument;

export type MarkdownStyle = 'generic' | 'xmind';

export interface ConvertOptions {
  overwrite?: boolean;
}
