import React, { useState, useCallback, useRef } from 'react';
import { convertFile, type MindMapDocument, type MarkdownStyle, type TopicNode } from './converter.js';

type ViewMode = 'source' | 'tree';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TreeNodeView({ node, isRoot }: { node: TopicNode; isRoot?: boolean }) {
  return (
    <div className={`tree-node ${isRoot ? 'tree-root' : ''}`}>
      <div className="tree-item">
        <span className="tree-dot" />
        <div>
          <span className="tree-title">{node.title}</span>
          {node.notes && <div className="tree-note">{node.notes}</div>}
          {node.labels && node.labels.length > 0 && (
            <div className="tree-labels">
              {node.labels.map((label, i) => (
                <span key={i} className="badge badge-blue">{label}</span>
              ))}
            </div>
          )}
          {node.href && (
            <div className="tree-note">
              <a href={node.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link-blue)', textDecoration: 'none' }}>
                {node.href}
              </a>
            </div>
          )}
        </div>
      </div>
      {node.children.map((child) => (
        <TreeNodeView key={child.id} node={child} />
      ))}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg className="upload-zone-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 32V16" />
      <path d="M16 22l8-8 8 8" />
      <rect x="6" y="6" width="36" height="36" rx="4" />
    </svg>
  );
}

function FileIcon({ ext }: { ext: string }) {
  const color = 'var(--gray-500)';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="18" height="20" rx="3" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1.5" />
      <text x="12" y="15" textAnchor="middle" fill={color} fontSize="6" fontWeight="600" fontFamily="var(--font-mono)">
        {ext.toUpperCase()}
      </text>
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg className="logo-icon" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="var(--logo-bg)" />
      <path d="M8 10h4v4H8zM16 10h4v4h-4zM12 14h4v4h-4z" fill="var(--logo-fg)" fillOpacity="0.9" />
      <circle cx="14" cy="9" r="2" fill="var(--logo-fg)" />
    </svg>
  );
}

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [markdownStyle, setMarkdownStyle] = useState<MarkdownStyle>('generic');
  const [markdown, setMarkdown] = useState<string>('');
  const [document, setDocument] = useState<MindMapDocument | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('source');
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (selectedFile: File, style: MarkdownStyle) => {
    setLoading(true);
    setError('');
    try {
      const result = await convertFile(selectedFile, style);
      setMarkdown(result.markdown);
      setDocument(result.document);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMarkdown('');
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    await processFile(selectedFile, markdownStyle);
  }, [markdownStyle, processFile]);

  const handleSample = useCallback(async (format: 'lakeboard' | 'xmind') => {
    setLoading(true);
    setError('');
    try {
      const name = `sample.${format}`;
      const response = await fetch(`/samples/${name}`);
      if (!response.ok) throw new Error('Could not load the sample. Please try again.');
      const blob = await response.blob();
      await handleFileSelect(new File([blob], name, { type: blob.type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [handleFileSelect]);

  const handleStyleChange = useCallback(async (style: MarkdownStyle) => {
    setMarkdownStyle(style);
    if (file) {
      await processFile(file, style);
    }
  }, [file, processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const textarea = window.document.createElement('textarea');
      textarea.value = markdown;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      window.document.body.appendChild(textarea);
      textarea.select();
      window.document.execCommand('copy');
      window.document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [markdown]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'output';
    a.download = `${baseName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [markdown, file]);

  const handleReset = useCallback(() => {
    setFile(null);
    setMarkdown('');
    setDocument(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const ext = file?.name.split('.').pop()?.toLowerCase() ?? '';

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <a className="logo" href="/">
            <LogoIcon />
            <span className="logo-text">MindMap Converter</span>
          </a>
          <div className="nav-links">
            <span className="badge badge-blue">.lakeboard</span>
            <span className="badge badge-blue">.xmind</span>
            <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>→</span>
            <span className="badge badge-green">.md</span>
          </div>
        </div>
      </header>

      <main className="main">
        {!file && (
          <section className="hero">
            <h1 className="hero-title">Mind map → Markdown</h1>
            <p className="hero-subtitle">
              Convert Yuque .lakeboard or XMind .xmind mind maps into structured Markdown, keeping nodes, notes, labels and links
            </p>
            <p className="privacy-note">Runs in your browser — files never leave your device.</p>
          </section>
        )}

        {!file ? (
          <>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Choose a Lakeboard or XMind file"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              <div className="upload-zone-title">
                Drop a file here, or click to choose one
              </div>
              <div className="upload-zone-desc">
                Supports .lakeboard (Yuque board) and .xmind (XMind Zen/2020+)
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <span className="badge badge-blue">.lakeboard</span>
                <span className="badge badge-blue">.xmind</span>
              </div>
              <input
                ref={fileInputRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                type="file"
                accept=".lakeboard,.xmind"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
            <div className="sample-options" aria-busy={loading}>
              <span>No file handy? Try a sample:</span>
              <button type="button" className="btn btn-secondary btn-sm" data-testid="sample-lakeboard" disabled={loading} onClick={() => handleSample('lakeboard')}>
                Lakeboard sample
              </button>
              <button type="button" className="btn btn-secondary btn-sm" data-testid="sample-xmind" disabled={loading} onClick={() => handleSample('xmind')}>
                XMind sample
              </button>
            </div>

          </>
        ) : (
          <>
            <div className="file-info">
              <div className="file-icon">
                <FileIcon ext={ext} />
              </div>
              <div className="file-details">
                <div className="file-name">{file.name}</div>
                <div className="file-meta">
                  {formatBytes(file.size)} · {document?.format === 'xmind' ? 'XMind' : 'Lakeboard'}
                </div>
              </div>
              <button className="file-remove" onClick={handleReset} title="Remove file" aria-label="Remove file">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="options-bar">
              <div className="option-group">
                <label className="option-label" htmlFor="markdown-style">Style</label>
                <select
                  id="markdown-style"
                  className="option-select"
                  value={markdownStyle}
                  onChange={(e) => handleStyleChange(e.target.value as MarkdownStyle)}
                >
                  <option value="generic">Generic Markdown</option>
                  <option value="xmind">XMind import style</option>
                </select>
              </div>
            </div>

            {markdown && document && (
              <div className="result-area">
                <div className="result-header">
                  <div className="result-info">
                    <span className="result-stat">
                      Nodes <strong>{document.nodeCount}</strong>
                    </span>
                    <span className="result-stat">
                      Depth <strong>{document.maxDepth}</strong>
                    </span>
                  </div>
                  <div className="result-actions">
                    <button className="btn btn-secondary btn-sm" onClick={handleCopy} aria-label="Copy Markdown to clipboard">
                      {copied ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--success-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8.5l3 3 7-7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="5" width="9" height="9" rx="1.5" />
                            <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2v9M4 8l4 4 4-4M2 13h12" />
                      </svg>
                      Download .md
                    </button>
                  </div>
                </div>

                <div className="preview-card">
                  <div className="preview-toolbar">
                    <div className="preview-tabs">
                      <button
                        className={`preview-tab ${viewMode === 'source' ? 'active' : ''}`}
                        onClick={() => setViewMode('source')}
                      >
                        Markdown
                      </button>
                      <button
                        className={`preview-tab ${viewMode === 'tree' ? 'active' : ''}`}
                        onClick={() => setViewMode('tree')}
                      >
                        Tree preview
                      </button>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', fontFamily: 'var(--font-mono)' }}>
                      {markdown.split('\n').length} lines
                    </span>
                  </div>
                  <div className="preview-content">
                    {viewMode === 'source' ? (
                      <pre>{markdown}</pre>
                    ) : (
                      <div className="tree-view">
                        <TreeNodeView node={document.root} isRoot />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div className="conversion-status" role="status" aria-live="polite">
          {loading && <><div className="spinner" /><span>Converting…</span></>}
        </div>
        {error && <div className="error-message" role="alert">{error} Try another .lakeboard or .xmind file.</div>}
      </main>

      <footer className="footer">
        MindMap Converter · supports .lakeboard and .xmind ·{' '}
        <a href="https://github.com/FelixFangX/lakeboard-converter" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
