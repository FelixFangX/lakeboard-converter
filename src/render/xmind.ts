import JSZip from 'jszip';
import type { MindMapDocument, TopicNode } from '../core/types.js';

interface XMindTopic {
  id: string;
  title: string;
  children?: {
    attached: XMindTopic[];
  };
}

function toXmindTopic(node: TopicNode): XMindTopic {
  const topic: XMindTopic = {
    id: node.id,
    title: node.title,
  };

  if (node.children.length > 0) {
    topic.children = {
      attached: node.children.map(toXmindTopic),
    };
  }

  return topic;
}

export async function renderXmind(document: MindMapDocument): Promise<Buffer> {
  const zip = new JSZip();
  const now = new Date().toISOString();

  const content = [
    {
      id: document.root.id,
      class: 'sheet',
      title: document.root.title,
      rootTopic: toXmindTopic(document.root),
    },
  ];

  const metadata = {
    creator: { name: 'lakeboard-converter' },
    modifier: { name: 'lakeboard-converter' },
    createdTime: now,
    modifiedTime: now,
  };

  const manifest = {
    'file-entries': {
      'content.json': {},
      'metadata.json': {},
    },
  };

  zip.file('content.json', JSON.stringify(content, null, 2));
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'nodebuffer' });
}
