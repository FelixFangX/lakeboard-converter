import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { App } from '../web/src/App.js';
import { detectLanguage, en, zh, persistLanguage, t } from '../web/src/i18n.js';

const cjk = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

afterEach(() => vi.unstubAllGlobals());

describe('web translations', () => {
  it('has matching keys, CJK-free English and translated Chinese prose', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    const allowed = new Set(['markdown', 'markdownHeading', 'xmind']);
    for (const [key, value] of Object.entries(en)) {
      expect(value, key).not.toMatch(cjk);
      if (!allowed.has(key)) expect(zh[key as keyof typeof en], key).toMatch(cjk);
    }
  });

  it('renders English with Chinese only in the language toggle', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('<span lang="zh-CN">中文</span>');
    expect(html.replace('<span lang="zh-CN">中文</span>', '')).not.toMatch(cjk);
    expect(html).toContain('<span lang="zh-CN">中文</span><span class="sr-only">Switch to Chinese</span>');
    expect(html).not.toContain('aria-label="Switch to Chinese"');
    expect(html).toContain(`aria-label="${en.chooseAria}"`);
    expect(html).toContain(`<p class="drop-title">${en.drop}</p>`);
  });

  it('starts dropzone accessible names with the visible label in both languages', () => {
    for (const dictionary of [en, zh]) {
      expect(dictionary.chooseAria.startsWith(dictionary.drop)).toBe(true);
    }
  });

  it('prefers and persists the query, then storage, then browser language', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('window', { location: { search: '?lang=zh' } });
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(detectLanguage()).toBe('zh');
    expect(storage.get('ledring-lang')).toBe('zh');
    window.location.search = '';
    expect(detectLanguage()).toBe('zh');
    persistLanguage('en');
    expect(detectLanguage()).toBe('en');
    storage.clear();
    vi.stubGlobal('navigator', { languages: ['zh-Hans'], language: 'en-US' });
    expect(detectLanguage()).toBe('zh');
    window.location.search = '?lang=en';
    expect(detectLanguage()).toBe('en');
  });

  it('works when storage is unavailable and uses a localized fallback', () => {
    vi.stubGlobal('window', { location: { search: '?lang=zh' } });
    vi.stubGlobal('localStorage', { setItem() { throw new Error('blocked'); } });
    expect(detectLanguage()).toBe('zh');
    expect(t('zh', 'errorGeneric')).toBe('无法转换此文件。');
  });
});

it('localizes metadata and every state title in both languages', async () => {
  const { updateLanguage } = await import('../web/src/i18n.js');
  const { updateTabLED } = await import('../web/src/tab-led.js');
  const metadata = new Map<string, string>();
  const doc = {
    documentElement: { lang: '', dataset: {} }, title: '',
    querySelector: (selector: string) => selector === '#favicon' ? null : {
      setAttribute: (_name: string, value: string) => metadata.set(selector, value),
    },
  };
  vi.stubGlobal('document', doc);
  for (const language of ['zh', 'en'] as const) {
    updateLanguage(language);
    expect(doc.documentElement.lang).toBe(language === 'zh' ? 'zh-CN' : 'en');
    for (const value of metadata.values()) {
      if (language === 'en') expect(value).not.toMatch(cjk);
      else expect(value).toMatch(cjk);
    }
    for (const state of ['idle', 'armed', 'processing', 'done', 'error'] as const) {
      updateTabLED(state, language);
      if (language === 'en') expect(doc.title).not.toMatch(cjk);
      else expect(doc.title).toMatch(cjk);
      expect(doc.documentElement.dataset).toEqual({ state });
    }
  }
});

it('renders natural Chinese on the initial render when requested', async () => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { search: '?lang=zh' } });
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  const { App: ChineseApp } = await import('../web/src/App.js');
  const html = renderToStaticMarkup(createElement(ChineseApp));
  expect(html).toContain('思维导图转换器');
  expect(html).toContain('<span lang="en">EN</span><span class="sr-only">切换到英文</span>');
  expect(html).not.toContain('aria-label="切换到英文"');
  expect(html).toContain(`aria-label="${zh.chooseAria}"`);
  expect(html).toContain(`<p class="drop-title">${zh.drop}</p>`);
  expect(html).toContain('<span lang="en">EN</span>');
  expect(html).not.toContain('Choose file');
});

it('converts both Chinese samples without changing their structure', async () => {
  const { readFile } = await import('node:fs/promises');
  const { convertFile } = await import('../web/src/converter.js');
  for (const extension of ['lakeboard', 'xmind']) {
    const load = async (suffix: string) => {
      const data = await readFile(new URL(`../web/public/samples/sample${suffix}.${extension}`, import.meta.url));
      return convertFile(new File([data], `sample.${extension}`));
    };
    const original = await load('');
    const chinese = await load('.zh');
    expect(chinese.document.nodeCount).toBe(original.document.nodeCount);
    expect(chinese.document.maxDepth).toBe(original.document.maxDepth);
    expect(chinese.markdown).toContain('示例根节点');
    if (extension === 'xmind') expect(chinese.markdown).toContain('这是分支甲的备注');
  }
});

it('maps known conversion failures and hides unknown error details', async () => {
  const { convertFile, webErrorKey } = await import('../web/src/converter.js');
  for (const [name, content, key] of [
    ['broken.xmind', 'broken archive', 'errorZip'],
    ['broken.lakeboard', '{', 'errorLakeJson'],
    ['wrong.lakeboard', '{}', 'errorLakeFormat'],
    ['empty.lakeboard', '{"format":"lakeboard"}', 'errorBody'],
    ['wrong.txt', '', 'errorFormat'],
  ] as const) {
    try {
      await convertFile(new File([content], name));
      expect.fail('Conversion should fail');
    } catch (error) {
      expect(webErrorKey(error)).toBe(key);
      expect(t('zh', webErrorKey(error))).toMatch(cjk);
    }
  }
  expect(webErrorKey(new Error('Private parser details 中文'))).toBe('errorGeneric');
  expect(webErrorKey('unexpected value')).toBe('errorGeneric');
});
