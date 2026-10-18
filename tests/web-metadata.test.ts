import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('web launch metadata', () => {
  it('declares the canonical URL and social preview', async () => {
    const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
    expect(html).toContain('<link rel="canonical" href="https://convert.ledring.dev/"');
    expect(html).toContain('<meta property="og:image" content="https://convert.ledring.dev/og.png"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
  });

  it('advertises the sitemap to crawlers', async () => {
    const robots = await readFile(new URL('../web/public/robots.txt', import.meta.url), 'utf8');
    expect(robots).toContain('Sitemap: https://convert.ledring.dev/sitemap.xml');
  });
});
