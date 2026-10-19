import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { convertBuffer } from '../src/index.js';
import { convertFile as webConvert, type TopicNode } from '../web/src/converter.js';

function nodes(root: TopicNode): TopicNode[] {
  return [root, ...root.children.flatMap(nodes)];
}

async function fixture(format: 'lakeboard' | 'xmind'): Promise<Buffer> {
  const prefix = format === 'lakeboard' ? 'node-' : 'xmind-node-0-';
  const tree = {
    title: 'Root', html: 'Root',
    children: [
      { title: 'Left', html: 'Left', children: [{ title: 'Leaf', html: 'Leaf' }] },
      { title: 'Right', html: 'Right', children: [{ title: 'Leaf', html: 'Leaf' }] },
      { id: `${prefix}0`, title: 'Reserved', html: 'Reserved' },
      { id: `${prefix}0-1`, title: 'Reserved suffix', html: 'Reserved suffix' },
    ],
  };
  if (format === 'lakeboard') return Buffer.from(JSON.stringify({ format, diagramData: { body: [tree] } }));
  const xmind = (node: typeof tree | (typeof tree.children)[number]): unknown => ({
    ...node, children: { attached: ('children' in node ? node.children ?? [] : []).map(xmind) },
  });
  const zip = new JSZip();
  zip.file('content.json', JSON.stringify([
    { title: 'First', rootTopic: xmind(tree) },
    { title: 'Second', rootTopic: { title: 'Other', children: { attached: [{ id: 'xmind-node-1-0', title: 'Child' }, { id: 'xmind-node-0-0.0', title: 'Cross-sheet reservation' }] } } },
  ]));
  return zip.generateAsync({ type: 'nodebuffer' });
}

for (const format of ['lakeboard', 'xmind'] as const) {
  describe(`${format} fallback IDs`, () => {
    for (const target of ['core', 'web'] as const) {
      it(`${target}: assigns deterministic unique path IDs and preserves explicit IDs and sibling order`, async () => {
        const data = await fixture(format);
        const convert = () => target === 'core'
          ? convertBuffer(data, format)
          : webConvert(new File([new Uint8Array(data)], `map.${format}`));
        const result = await convert();
        const all = result.document.sheets.flatMap(sheet => nodes(sheet.root));
        expect(new Set(all.map(node => node.id)).size).toBe(all.length);
        const prefix = format === 'lakeboard' ? 'node-' : 'xmind-node-0-';
        if (format === 'xmind') {
          expect(result.document.sheets[1].root.id).toBe('xmind-node-1-0-1');
          expect(result.document.root.children[0].id).toBe('xmind-node-0-0.0-1');
        }
        expect(result.document.root.id).toBe(`${prefix}0-2`);
        expect(result.document.root.children.map(node => node.order)).toEqual([0, 1, 2, 3]);
        expect(result.document.root.children[0].children[0].id).toBe(`${prefix}0.0.0`);
        expect(result.document.root.children[1].children[0].id).toBe(`${prefix}0.1.0`);
        expect(result.document.root.children.slice(2).map(node => node.id)).toEqual([`${prefix}0`, `${prefix}0-1`]);
        expect((await convert()).document).toEqual(result.document);
        const peer = target === 'core'
          ? await webConvert(new File([new Uint8Array(data)], `map.${format}`))
          : await convertBuffer(data, format);
        expect(peer.markdown).toBe(result.markdown);
        expect(peer.document.sheets.map(sheet => nodes(sheet.root).map(node => node.id))).toEqual(result.document.sheets.map(sheet => nodes(sheet.root).map(node => node.id)));
      });
    }
  });
}
