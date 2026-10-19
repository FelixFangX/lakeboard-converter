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

export type SourceFormat = 'lakeboard' | 'xmind';

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
