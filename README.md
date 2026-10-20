<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/header-dark.svg">
  <img alt="lakeboard-converter — Mind maps to Markdown your agents can read." src="./docs/assets/header-light.svg" width="100%">
</picture>

**Convert Yuque Lakeboard (`.lakeboard`) and XMind (`.xmind`) mind maps into Markdown or a fresh `.xmind`.** Comes as a CLI, a guided TUI, an MCP server and a drag-and-drop web UI ([convert.ledring.dev](https://convert.ledring.dev)). English | [简体中文](./README.zh-CN.md)

## Quickstart

Open [convert.ledring.dev](https://convert.ledring.dev) to convert a file in your browser.

Or use the CLI without installing it globally (requires Node 20.12+):

```bash
npx -y lakeboard-converter convert ./map.xmind --format md --out-dir ./out
```

Read Markdown to stdout without writing files:

```bash
npx -y lakeboard-converter read ./map.xmind --format md
```

Start the MCP server:

```bash
npx -y lakeboard-converter mcp
```

### Development

```bash
git clone https://github.com/FelixFangX/lakeboard-converter.git
cd lakeboard-converter && npm ci
npm run convert -- ./test-fixtures/test.lakeboard --format md --out-dir ./out
```

## Usage

| Mode | Command |
|---|---|
| Guided TUI | `npm run dev` |
| CLI | `npm run convert -- <file> --format md\|xmind\|both [--markdown-style generic\|xmind] [--out-dir DIR] [--output FILE] [--overwrite]` |
| Web UI | `npm run dev:web` (production build: `npm run build:web`) |
| Library (from source) | `import { convertBuffer, convertFile } from './src/index.js'` |

Existing output files are never overwritten unless you pass `--overwrite`.

## Web UI

Live demo: https://convert.ledring.dev

The web UI runs entirely in your browser: files never leave your machine. It is self-hosted with no third-party requests, including fonts. Run `npm run dev:web` locally, or try the bundled Lakeboard and XMind samples.

### Deploy (Cloudflare Workers)

With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set in your environment:

```bash
npm ci && npm run deploy:web
```

`wrangler.jsonc` serves `dist-web/` as static assets with single-page application fallback.

To deploy a preview build to `lakeboard-convert-preview.<subdomain>.workers.dev` instead (it has no custom domain), run `npm run build:web && npx wrangler@3 deploy --env preview`.

## For agents (MCP and `--json`)

Requires Node 20.12+. The MCP server provides four tools:

- `convert(path, format?, sheet?, maxNodes?, maxDepth?)`: read one mind map as `md` (default), `json` (topic tree) or `outline` (compact indented text).
- `from_markdown(markdown, output?, overwrite?, title?, maxNodes?)`: build an XMind file from a Markdown outline.
- `convert_many(paths, format?, sheet?, maxNodes?, maxTotalNodes?, maxDepth?)`: read several mind maps with a shared node budget.
- `inspect(path, sheet?)`: return file size and topic counts without content.

`convert`, `convert_many` and `inspect` are read-only. `from_markdown` writes only to the output path you pass.

Start the MCP server:

```bash
npx -y lakeboard-converter mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "lakeboard-converter": {
      "command": "npx",
      "args": ["-y", "lakeboard-converter", "mcp"]
    }
  }
}
```

Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lakeboard-converter": {
      "command": "npx",
      "args": ["-y", "lakeboard-converter", "mcp"]
    }
  }
}
```

Codex CLI (`~/.codex/config.toml`):

```toml
[mcp_servers.lakeboard-converter]
command = "npx"
args = ["-y", "lakeboard-converter", "mcp"]
```

Read a file from the CLI, or install the CLI globally:

```bash
npx -y lakeboard-converter read ./map.xmind --format md
npm i -g lakeboard-converter
```

### Markdown to XMind

`from_markdown` accepts headings, nested lists, numbered lists, links, trailing `code` labels and `> notes`. Multiple sheets use repeated `# Sheet` / `## Root` sections, each sheet heading containing exactly one root heading. Text before the first heading or list item is ignored with a warning.

To write a file, pass an absolute `.xmind` output path in an existing folder. No folders are created, and an existing file requires `overwrite: true`. Without `output`, the tool returns the file in `structuredContent.base64`. Markdown input is capped at 2 MB (UTF-8). `maxNodes` defaults to 2000 (1–50000); omitted topics are reported with `truncated` and `warnings`.

CLI `build` requires `-o`, resolves it to an absolute path, and uses `--overwrite` to allow replacement:

```bash
npx -y lakeboard-converter build plan.md -o plan.xmind
```

### Batch and size checks

`convert_many` accepts 1–50 absolute paths. `maxNodes` applies per file; `maxTotalNodes` defaults to 10000 (1–200000) across the batch. Text contains the converted content; `structuredContent` contains per-file metadata and errors without `content`. Per-file errors do not fail the MCP call. CLI multi-file `read` returns per-file results and errors too, and exits 1 if any file fails. Use `--max-total-nodes` to change its total budget.

`inspect` returns bytes, node counts, depth and sheet metadata without content.

```bash
npx -y lakeboard-converter read a.xmind b.lakeboard --json
npx -y lakeboard-converter inspect a.xmind --json
```

### From source

```bash
npm run build
node /abs/path/lakeboard-converter/dist/cli.js mcp
node dist/cli.js read ./test-fixtures/test.lakeboard --format json --json
node dist/cli.js convert ./test-fixtures/test.xmind -f md --out-dir out --json
```

Every single-file CLI read JSON result has `schemaVersion: 1`, `source`, `format`, `nodeCount`, `maxDepth` and `content`. Errors with `--json` print `{"error": "..."}` and exit 1. See [AGENTS.md](./AGENTS.md) for contributors.

## Output and limits

All XMind sheets are included. A Lakeboard document has one sheet named after its root. Untitled XMind sheets use `Sheet N`. With multiple sheets, generic Markdown uses `# <sheet title>` followed by `## <root title>` and the topic list. A single sheet keeps `# <root title>`. First-level list items start at column 0; deeper items use two more spaces. Notes align with the item's content column. Linked topics use `[Title](url)` directly, including headings, with brackets in titles escaped. Generic Markdown labels follow the title as code spans, such as ``- Split vendor chunk `P1` `tech-debt` ``. Outlines use `- Title [P1, tech-debt]` and a sheet heading before each outline when there are several sheets.

XMind-import Markdown uses one root list per sheet separated by a blank line, without headings. It omits labels so they do not become part of imported topic titles.

CLI `read`, `convert` and `inspect` accept `--sheet <index|name>` (1-based index or exact case-insensitive title). MCP accepts `sheet` as a string or integer. Selection is recorded in `selectedSheet`; unknown selections list available sheets.

```bash
lakeboard-converter read /absolute/path/map.xmind --sheet Roadmap --max-nodes 5000 --max-depth 3 --json
lakeboard-converter convert ./map.xmind --sheet 2 --format md
```

`readMindMap(file, format, options)` and CLI `read` / MCP default to `maxNodes: 2000`; valid values are integers from 1 to 50000. Optional `maxDepth` is a nonnegative integer. **The root is depth 0**, so a root with children only has `maxDepth: 1`. Limits prune topics in pre-order across sheets. `truncated` and `warnings` report omitted topics. Increase the limits or select a sheet to read more. File conversion has no size limit. CLI read without `--json` and MCP text append warnings as `> Note: ...`.

Use absolute paths for MCP: for `convert`, relative paths resolve against the server's working directory, which may differ from your terminal's. CLI read and MCP `convert` expand leading `~` or `~/` (also `~\` on Windows) using the home directory. Missing relative paths report the resolved path and server working directory.

### Single-file read JSON and MCP convert results

CLI `read --json` keeps `schemaVersion: 1` and the existing fields, adding `sheets: [{ index, title, nodeCount, maxDepth }]`, optional `selectedSheet: { index, title }`, `truncated`, and `warnings`. Counts describe the selected input before truncation; `maxDepth` always counts the root as depth 0.

For `format: "json"`, `content` is a topic tree for one sheet. Starting in 0.4.0, multiple sheets produce `{ sheets: [{ index, title, root: AgentTopic }] }`. Limits apply to these trees as well as Markdown and outlines.

MCP `convert` returns one plain text block containing Markdown, outline text, or pretty-printed JSON trees. It also returns `structuredContent` with `{ schemaVersion, file, source, format, nodeCount, maxDepth, sheets, selectedSheet?, truncated, warnings }`, validated against the tool's registered `outputSchema`. The text is no longer a JSON-stringified result envelope. Warnings are appended as a final `> Note: ...` line. Errors use `isError: true` with a clear message; the tool remains read-only.

Cursor CLI in headless mode (`cursor-agent -p`) needs `--force` (plus `--approve-mcps`) or the tool call is rejected.

## How it works

```text
.lakeboard ─┐                          ┌─ renderGenericMarkdown → # root + nested list
            ├─ parse → MindMapDocument ─┼─ renderXmindMarkdown  → root list per sheet for XMind import
.xmind ─────┘     (TopicNode tree)      └─ renderXmind          → minimal .xmind package
```

The **seam** is `convertBuffer` / `convertFile` in `src/index.ts`. Every input format parses into one `MindMapDocument`, so a new format needs one parser and no renderer changes. The CLI and TUI use that seam. The web UI uses its browser converter with shared fallback ID allocation; agents use `readMindMap`, `readMindMaps`, `inspectMindMap` and `buildMindMap` in `src/agent.ts`, exported from `src/index.ts`. Only `buildMindMap` writes, when given an explicit output path.

Keeps text, hierarchy, order, notes and links. All XMind sheets are read. Labels appear inline in generic Markdown and outlines. Drops styling, colour and layout. XMind 8 (legacy XML) isn't supported.

## Testing

```bash
npm test            # vitest specs at the convert, readMindMap and MCP seams, using test-fixtures/
npm run typecheck
```

## License

[MIT](./LICENSE)
