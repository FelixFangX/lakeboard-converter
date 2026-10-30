import { initialLanguage, persistLanguage, updateLanguage, t, type TranslationKey } from './i18n.js';
import { webErrorKey } from './converter.js';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { convertFile, type MindMapDocument, type MarkdownStyle, type TopicNode } from './converter.js';
import { updateTabLED, type InstrumentState } from './tab-led.js';

function Ring({ large = false }: { large?: boolean }) {
  return <span aria-hidden="true" className={`ring ${large ? 'ring-l' : 'ring-s'}`} />;
}
function Ruler() {
  return <div className="ruler" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>;
}
function Tree({ node, root = false }: { node: TopicNode; root?: boolean }) {
  return <div className={`tree-node ${root ? 'tree-root' : ''}`}><div className="tree-item"><span className="tree-dot" aria-hidden="true" /><div><span className="tree-title">{node.title}</span>{node.notes && <p>{node.notes}</p>}{node.labels?.map((label, i) => <span className="chip" key={i}>{label}</span>)}{node.href && <p>{node.href}</p>}</div></div>{node.children.map(child => <Tree key={child.id} node={child} />)}</div>;
}
function bytes(size: number) { return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`; }

export function App() {
  const [language, setLanguage] = useState(initialLanguage);
  const text = (key: TranslationKey) => t(language, key);
  const [state, setState] = useState<InstrumentState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<MarkdownStyle>('generic');
  const [markdown, setMarkdown] = useState('');
  const [map, setMap] = useState<MindMapDocument | null>(null);
  const [error, setError] = useState<TranslationKey | ''>('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'markdown' | 'tree'>('markdown');
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => { updateLanguage(language); updateTabLED(state, language); }, [state, language]);
  useEffect(() => () => { ++operation.current; clearTimeout(timer.current); clearTimeout(copyTimer.current); }, []);

  const run = useCallback(async (source: File | 'lakeboard' | 'xmind', nextStyle: MarkdownStyle) => {
    const id = ++operation.current;
    clearTimeout(timer.current);
    setBusy(true); setError(''); setCopied(false);
    setState(map ? 'done' : 'idle');
    timer.current = setTimeout(() => setState('processing'), 150);
    try {
      let selected = source;
      if (typeof selected === 'string') {
        try {
          const response = await fetch(`/samples/sample.${language === 'zh' ? 'zh.' : ''}${selected}`);
          if (!response.ok) throw new Error('The sample could not be loaded.');
          const blob = await response.blob();
          selected = new File([blob], `sample.${selected}`, { type: blob.type });
        } catch {
          throw new Error('The sample could not be loaded.');
        }
      }
      const result = await convertFile(selected, nextStyle);
      if (id !== operation.current) return;
      setFile(selected); setMarkdown(result.markdown); setMap(result.document); setView('markdown'); setState('done');
    } catch (e) {
      if (id !== operation.current) return;
      setError(webErrorKey(e)); setMap(null); setMarkdown(''); setState('error');
    } finally {
      if (id === operation.current) { clearTimeout(timer.current); setBusy(false); }
    }
  }, [map, language]);
  const reset = () => {
    ++operation.current; clearTimeout(timer.current); setBusy(false); setMap(null); setFile(null); setMarkdown(''); setError(''); setCopied(false); setState('idle');
    if (input.current) input.current.value = '';
  };
  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = `${file?.name.replace(/\.[^.]+$/, '') ?? 'output'}.md`; a.click(); URL.revokeObjectURL(url);
  }, [markdown, file]);
  const copy = async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(markdown);
      else throw new Error('Clipboard unavailable');
    } catch {
      const area = document.createElement('textarea'); area.setAttribute('data-user-content', ''); area.value = markdown; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      const success = document.execCommand('copy'); area.remove();
      if (!success) return;
    }
    setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => { const pasted = e.clipboardData?.files[0]; if (pasted) { e.preventDefault(); void run(pasted, style); } };
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && map) { e.preventDefault(); download(); } };
    window.addEventListener('paste', paste); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('paste', paste); window.removeEventListener('keydown', key); };
  }, [run, style, map, download]);
  const lines = markdown.split('\n').length;
  const errorSentence = error ? text(error) : '';
  const status = state === 'done' ? `${text('done')} · ${lines} ${text('lines')} · ${bytes(new Blob([markdown]).size)}` : state === 'error' ? `${text('error')} · ${errorSentence} ${text('retryStatus')}` : text(state);
  return <div className="layout">
    <header className="header"><div className="header-inner"><a className="brand" href="https://ledring.dev" aria-label={text('home')}><Ring /><span className="label">{text('brand')}</span></a><span className="header-divider" /><span className="tool-name">{text('tool')}</span><a className="github" href="https://github.com/FelixFangX/lakeboard-converter" aria-label={text('github')}><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg></a><button className="language-toggle label" onClick={() => { const next = language === 'en' ? 'zh' : 'en'; persistLanguage(next); setLanguage(next); }}><span lang={language === 'en' ? 'zh-CN' : 'en'}>{language === 'en' ? '中文' : 'EN'}</span><span className="sr-only">{text('switchLanguage')}</span></button></div></header>
    <main className={map ? 'main has-output' : 'main'}>
      <input ref={input} hidden type="file" accept=".lakeboard,.xmind" onChange={e => { const selected = e.target.files?.[0]; if (selected) void run(selected, style); e.target.value = ''; }} />
      {map ? <div className="output-heading"><span className="label">{text('output')}</span><span className="chip file-chip" data-user-content>{file?.name} → {file?.name.replace(/\.[^.]+$/, '')}.md</span></div> : <div className="hero-copy"><span className="label">{text('convert')}</span><h1>{text('hero')}<br /><span>{text('heroEnd')}</span></h1><p className="lead">{text('lead')}</p><div className="spec-list">.lakeboard → .md<br />.xmind → .md<br />{text('local')}</div></div>}
      {!map && <section className="input-panel"><div className="well dropzone" data-testid="dropzone" role="button" tabIndex={0} aria-label={text('chooseAria')} aria-busy={busy}
        onClick={() => input.current?.click()} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); if (!busy) setState('armed'); }} onDragLeave={e => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) { if (!busy) setState(error ? 'error' : 'idle'); } }} onDrop={e => { e.preventDefault(); const dropped = e.dataTransfer.files[0]; if (dropped) void run(dropped, style); else setState(error ? 'error' : 'idle'); }}>
        <Ruler /><Ring large /><p className="drop-title">{state === 'armed' ? text('release') : text('drop')}</p><button className="primary" onClick={e => { e.stopPropagation(); input.current?.click(); }}>{text('choose')}</button><span className="shortcut"><kbd>⌘ / Ctrl V</kbd> {text('paste')}</span>
        <div className="samples" onClick={e => e.stopPropagation()}><span>{text('samples')}</span> <button data-testid="sample-lakeboard" aria-label={text('sampleLakeboard')} disabled={busy} onClick={() => void run('lakeboard', style)}>Lakeboard</button><span>·</span><button data-testid="sample-xmind" aria-label={text('sampleXmind')} disabled={busy} onClick={() => void run('xmind', style)}>XMind</button></div>
      </div><p className="hardware label">{text('hardware')}</p></section>}
      <div className={map ? undefined : 'feedback'}>
        <div className="status label" data-testid="status-line" role="status" aria-live="polite">{status}</div>
        {error && <div className="error-callout"><p>{errorSentence}</p><button data-testid="reset" onClick={reset}>{text('retry')}</button></div>}
      </div>
      {map && <section className="results" data-view={view}>
        <div className="output-controls"><div className="segments" aria-label={text('view')}><button aria-pressed={view === 'markdown'} onClick={() => setView('markdown')}>Markdown</button><button aria-pressed={view === 'tree'} onClick={() => setView('tree')}>{text('tree')}</button></div><label className="style-control">{text('style')} <select value={style} onChange={e => { const next = e.target.value as MarkdownStyle; setStyle(next); if (file) void run(file, next); }}><option value="generic">{text('generic')}</option><option value="xmind">XMind</option></select></label><button className="reset" data-testid="reset" onClick={reset}>{text('another')}</button></div>
        <div className="panes"><section className="tree-pane"><h2 className="label">{text('treeHeading')}</h2><div data-user-content>{map.sheets.map(sheet => <div key={sheet.index}>{map.sheets.length > 1 && <h3>{sheet.title}</h3>}<Tree node={sheet.root} root /></div>)}</div></section><section className="well markdown-pane"><Ruler /><div className="markdown-heading"><h2 className="label">{text('markdownHeading')}</h2><div className="actions"><button className={`primary copy ${copied ? 'copied' : ''}`} data-testid="copy" onClick={() => void copy()}>{copied && <Ring />}{copied ? text('copied') : text('copy')}</button><button data-testid="download" onClick={download}>{text('download')} <kbd className="shortcut">⌘ / Ctrl S</kbd></button></div></div><div className="code-scroll"><div className="code-lines" aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</div><pre data-testid="markdown-output" data-user-content>{markdown}</pre></div></section></div>
      </section>}
    </main><footer className="footer"><span>{text('footer')}</span></footer>
  </div>;
}
