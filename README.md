# lakeboard-converter

English | [简体中文](./README.zh-CN.md)

CLI & Web tool to convert Yuque Lakeboard (`.lakeboard`) and XMind (`.xmind`) mind maps into Markdown.

## Features

- Parse `.lakeboard` files (Yuque)
- Parse `.xmind` files (XMind Zen/2020+)
- Preserve topic hierarchy, ordering, notes, labels, and links
- Export generic Markdown
- Export XMind-friendly Markdown
- Generate `.xmind` files directly
- **Interactive TUI** — guided step-by-step file selection and conversion
- **Web UI** with drag-and-drop file upload, Markdown preview, and tree view

## Requirements

- Node.js 18+

## Install

```bash
git clone https://github.com/FelixFangX/lakeboard-converter.git
cd lakeboard-converter
npm install
```

## Quick usage

### Interactive TUI mode (recommended)

```bash
npm run dev
```

Launches an interactive terminal interface that guides you through:
1. Selecting an input file (auto-discovery, file browser, or manual path entry)
2. Choosing the output format (Markdown / XMind / both)
3. Selecting the Markdown style (generic or XMind-friendly)
4. Setting the output directory
5. Conversion and result display

### Non-interactive CLI mode

For scripting and CI pipelines, use the `convert` subcommand directly:

```bash
# From a .lakeboard file
npm run convert -- "/path/to/example.lakeboard" --format md --markdown-style generic

# From a .xmind file
npm run convert -- "/path/to/example.xmind" --format md --markdown-style generic

# Export both Markdown and XMind
npm run convert -- "/path/to/example.lakeboard" --format both --out-dir ./dist

# Overwrite existing files
npm run convert -- "/path/to/example.xmind" --format both --overwrite
```

### Web mode

```bash
# Development server
npm run dev:web

# Build for production
npm run build:web
```

The Web UI provides:
- Drag-and-drop file upload for `.lakeboard` and `.xmind` files
- Real-time conversion to Markdown
- Toggle between Generic and XMind Markdown styles
- Markdown source view and tree structure preview
- Copy to clipboard and download `.md` file

## CLI options (non-interactive mode)

| Option | Description |
| --- | --- |
| `--format` | Output format: `md`, `xmind`, or `both` |
| `--markdown-style` | Markdown style: `generic` or `xmind` |
| `--output` | Output file path for a single export target |
| `--out-dir` | Output directory |
| `--overwrite` | Allow overwriting existing files |

## Supported input formats

| Format | Extension | Notes |
| --- | --- | --- |
| Yuque Lakeboard | `.lakeboard` | JSON-based mind map format |
| XMind | `.xmind` | ZIP archive with `content.json` (XMind Zen/2020+ only) |

## Output formats

### Generic Markdown
- Root node becomes an H1 heading
- Child nodes become nested lists
- Notes rendered as blockquotes, links as Markdown links
- Good for Git, docs, and general Markdown tools

### XMind-friendly Markdown
- Single-root nested list output
- Each topic is rendered on one line
- Multi-line text is flattened for easier XMind import

### XMind
- Generates a minimal `.xmind` package directly
- Includes `content.json`, `metadata.json`, and `manifest.json`
- Focuses on preserving text, hierarchy, and order

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Launch interactive TUI |
| `npm run dev:web` | Start Web UI development server |
| `npm run build` | Build CLI for production |
| `npm run build:web` | Build Web UI for production |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run tests |
| `npm run convert` | Non-interactive CLI convert command |

## Development

```bash
npm run build        # Build CLI
npm run build:web    # Build Web UI
npm run typecheck    # Type checking
npm run test         # Run tests
```

## Limitations

- Preserves text, hierarchy, and order, but not styling, color, or layout
- XMind 8 (legacy XML format) is not supported — only XMind Zen/2020+ (JSON-based)
- New `.lakeboard` variants may require parser updates
