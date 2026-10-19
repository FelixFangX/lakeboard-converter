import JSZip from 'jszip';

// Synthetic topics only. A fixed ZIP timestamp makes the generated fixture deterministic.
export async function multiSheetFixture(): Promise<Buffer> {
  const zip = new JSZip();
  const sheets = ['Roadmap', 'i18n', 'Retro'].map((title, index) => ({
    title,
    rootTopic: {
      id: `root-${index}`, title: `Root ${index + 1}`, labels: ['root-label'], href: 'https://example.com/root',
      children: { attached: [{
        id: `child-${index}`, title: 'LCP [image]\n中文', labels: ['P1', 'tech-debt'],
        notes: { plain: { content: 'First note\nSecond note' } }, href: 'https://example.com/image',
        children: { attached: [{ id: `leaf-${index}`, title: 'Leaf' }] },
      }] },
    },
  }));
  zip.file('content.json', JSON.stringify(sheets), { date: new Date('2026-01-01T00:00:00Z') });
  return zip.generateAsync({ type: 'nodebuffer' });
}
