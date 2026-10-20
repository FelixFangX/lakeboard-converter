import type { MindMapDocument, TopicNode } from './types.js';
import { validateTree } from './validate.js';

function decodeTitle(node: TopicNode): void {
  let text = node.title;
  const labels: string[] = [];
  // Match from the left so backticks inside a padded code span stay literal.
  const spans = / (`+)(?!`)([\s\S]*?)\1(?!`)/g;
  let match: RegExpExecArray | null;
  let start = -1;
  let end = 0;
  while ((match = spans.exec(text))) {
    if (start < 0 || match.index !== end) { start = match.index; labels.length = 0; }
    let label = match[2];
    if (label.startsWith(' ') && label.endsWith(' ')) label = label.slice(1, -1);
    labels.push(label);
    end = spans.lastIndex;
  }
  if (start >= 0 && end === text.length) { node.labels = labels; text = text.slice(0, start); }
  const link = /^\[((?:\\[\s\S]|[^\\])*?)\]\(([\s\S]*)\)$/.exec(text);
  if (link) { node.title = link[1].replace(/\\([\[\]\\])/g, '$1'); node.href = link[2]; }
  else node.title = text;
  node.children.forEach(decodeTitle);
}

/** Adjacent plain lines continue titles; blank-separated paragraphs become notes.
 * Fenced blocks are literal note lines, including fences; their contents are never parsed as topics.
 */
export function parseMarkdownOutline(markdown: string, options: { title?: string } = {}): MindMapDocument & { warnings: string[] } {
  const roots: TopicNode[] = [];
  const levels = new Map<TopicNode, number>();
  const headings: { level: number; node: TopicNode }[] = [];
  const lists: { indent: number; node: TopicNode }[] = [];
  let ignoredLines = 0;
  let current: TopicNode | undefined;
  let continuationIndent = 0;
  let blank = false;
  let fence: { char: string; length: number } | undefined;
  const note = (line: string) => { if (current) current.notes = current.notes === undefined ? line : `${current.notes}\n${line}`; };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trimStart();
    if (!current && line.trim() && (fence || !/^(#{1,6})[ \t]+|^\s*(?:[-*+]|\d+[.)])[ \t]+/.test(line))) ignoredLines++;
    const marker = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence) {
      note(trimmed);
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; note(trimmed); blank = true; continue; }
    if (!line.trim()) { blank = true; continue; }
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    const item = /^(\s*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/.exec(line);
    if (heading || item) {
      const node: TopicNode = { id: '', title: heading ? heading[2] : item![2], order: 0, children: [] };
      let parent: TopicNode | undefined;
      if (heading) {
        const level = heading[1].length;
        levels.set(node, level);
        while (headings.length && headings.at(-1)!.level >= level) headings.pop();
        parent = headings.at(-1)?.node;
        headings.push({ level, node }); lists.length = 0; continuationIndent = 0;
      } else {
        const indent = item![1].replace(/\t/g, '    ').length;
        while (lists.length && lists.at(-1)!.indent >= indent) lists.pop();
        parent = lists.at(-1)?.node ?? headings.at(-1)?.node;
        lists.push({ indent, node }); continuationIndent = indent + 2;
      }
      const siblings = parent ? parent.children : roots;
      node.order = siblings.length; siblings.push(node); current = node; blank = false;
    } else if (current) {
      const quoted = /^\s*> ?(.*)$/.exec(line);
      if (quoted) note(quoted[1]);
      else if (blank || current.notes !== undefined) note(trimmed);
      else current.title += '\n' + line.replace(/^\t/g, '    ').slice(continuationIndent);
    }
  }
  if (!roots.length) throw new Error('Markdown must contain at least one heading or list item');
  // Multiple level-one headings with exactly one level-two child are the renderer's sheet form.
  const sheetForm = roots.length > 1 && roots.every(root => levels.get(root) === 1 &&
    root.children.length === 1 && levels.get(root.children[0]) === 2 && root.notes === undefined);
  const entries = sheetForm ? roots.map(node => ({ title: node.title, root: node.children[0] })) : [{ title: options.title ?? 'Mind map', root: roots.length === 1 ? roots[0] : { id: '', title: options.title ?? 'Mind map', order: 0, children: roots } }];
  const sheets = entries.map(({ title, root }, index) => {
    const assign = (node: TopicNode, nodePath: string, order: number): void => {
      node.id = `markdown-node-${nodePath}`; node.order = order;
      node.children.forEach((child, i) => assign(child, `${nodePath}.${i}`, i));
    };
    assign(root, `${index}-0`, 0); decodeTitle(root);
    return { index: index + 1, title: !sheetForm && options.title === undefined ? root.title : title, root, ...validateTree(root) };
  });
  return { warnings: ignoredLines ? [`Ignored ${ignoredLines} ${ignoredLines === 1 ? 'line' : 'lines'} before the first heading or list item.`] : [], format: 'xmind', sheets, root: sheets[0].root, nodeCount: sheets.reduce((n, s) => n + s.nodeCount, 0), maxDepth: Math.max(...sheets.map(s => s.maxDepth)) };
}
