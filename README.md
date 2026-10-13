<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/header-dark.svg">
  <img alt="lakeboard-converter — Mind maps to Markdown your agents can read." src="./docs/assets/header-light.svg" width="100%">
</picture>

**Convert Yuque Lakeboard (`.lakeboard`) and XMind (`.xmind`) mind maps into Markdown or a fresh `.xmind`.** Comes as a CLI, a guided TUI and a drag-and-drop web UI. English | [简体中文](./README.zh-CN.md)

## Quickstart

```bash
git clone https://github.com/FelixFangX/lakeboard-converter.git
cd lakeboard-converter && npm ci
npm run convert -- ./test-fixtures/test.lakeboard --format md --out-dir ./out
```

Requires Node 18+.

## Usage

| Mode | Command |
|---|---|
| Guided TUI | `npm run dev` |
| CLI | `npm run convert -- <file> --format md\|xmind\|both [--markdown-style generic\|xmind] [--out-dir DIR] [--output FILE] [--overwrite]` |
| Web UI | `npm run dev:web` (production build: `npm run build:web`) |
| Library (from source) | `import { convertBuffer, convertFile } from './src/index.js'` |

Existing output files are never overwritten unless you pass `--overwrite`.

## How it works

```text
.lakeboard ─┐                          ┌─ renderGenericMarkdown → # root + nested list
            ├─ parse → MindMapDocument ─┼─ renderXmindMarkdown  → single-root list for XMind import
.xmind ─────┘     (TopicNode tree)      └─ renderXmind          → minimal .xmind package
```

The **seam** is `convertBuffer` / `convertFile` in `src/index.ts`. Every input format parses into one `MindMapDocument`, so a new format needs one parser and no renderer changes. The CLI, TUI and web UI are thin adapters over that seam.

Keeps text, hierarchy, order, notes, labels and links. Drops styling, colour and layout. XMind 8 (legacy XML) isn't supported.

## Testing

```bash
npm test            # vitest specs at the convert seam, using test-fixtures/
npm run typecheck
```

## License

[MIT](./LICENSE)
