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
  const color = ext === 'xmind' ? '#eb367f' : '#0072f5';
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
      <rect width="28" height="28" rx="6" fill="#171717" />
      <path d="M8 10h4v4H8zM16 10h4v4h-4zM12 14h4v4h-4z" fill="#fff" fillOpacity="0.9" />
      <circle cx="14" cy="9" r="2" fill="#fff" />
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
            <h1 className="hero-title">思维导图 → Markdown</h1>
            <p className="hero-subtitle">
              将语雀 .lakeboard 或 XMind .xmind 思维导图文件转换为结构化 Markdown，支持节点、备注、标签和链接
            </p>
          </section>
        )}

        {!file ? (
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
            <div className="upload-zone-title">
              拖放文件到此处，或点击选择
            </div>
            <div className="upload-zone-desc">
              支持 .lakeboard（语雀画板）和 .xmind（XMind Zen/2020+）格式
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <span className="badge badge-blue">.lakeboard</span>
              <span className="badge badge-blue">.xmind</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".lakeboard,.xmind"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
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
              <button className="file-remove" onClick={handleReset} title="移除文件">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="options-bar">
              <div className="option-group">
                <span className="option-label">Style</span>
                <select
                  className="option-select"
                  value={markdownStyle}
                  onChange={(e) => handleStyleChange(e.target.value as MarkdownStyle)}
                >
                  <option value="generic">通用 Markdown</option>
                  <option value="xmind">XMind 导入风格</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                </svg>
                {error}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', justifyContent: 'center' }}>
                <div className="spinner" />
                <span style={{ color: 'var(--gray-500)', fontSize: 14 }}>转换中…</span>
              </div>
            )}

            {markdown && document && !loading && (
              <div className="result-area">
                <div className="result-header">
                  <div className="result-info">
                    <span className="result-stat">
                      节点 <strong>{document.nodeCount}</strong>
                    </span>
                    <span className="result-stat">
                      深度 <strong>{document.maxDepth}</strong>
                    </span>
                  </div>
                  <div className="result-actions">
                    <button className="btn btn-secondary btn-sm" onClick={handleCopy} aria-label="复制 Markdown 到剪贴板">
                      {copied ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--success-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8.5l3 3 7-7" />
                          </svg>
                          已复制
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="5" width="9" height="9" rx="1.5" />
                            <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
                          </svg>
                          复制
                        </>
                      )}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2v9M4 8l4 4 4-4M2 13h12" />
                      </svg>
                      下载 .md
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
                        树形预览
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
      </main>

      <footer className="footer">
        MindMap Converter · 支持 .lakeboard 和 .xmind 格式 ·{' '}
        <a href="https://github.com/FelixFangX/lakeboard-converter" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
