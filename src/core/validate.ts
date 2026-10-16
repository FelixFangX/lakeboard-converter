import type { TopicNode } from './types.js';

export interface ValidationResult {
  nodeCount: number;
  maxDepth: number;
}

export function validateTree(root: TopicNode): ValidationResult {
  const ids = new Set<string>();
  let nodeCount = 0;
  let maxDepth = 0;

  const visit = (node: TopicNode, depth: number): void => {
    if (ids.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }

    ids.add(node.id);
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);

    node.children.forEach((child, index) => {
      if (child.order !== index) {
        throw new Error(`Node ${child.id} has an invalid order: expected ${index}, got ${child.order}`);
      }
      visit(child, depth + 1);
    });
  };

  visit(root, 0);

  return { nodeCount, maxDepth };
}
