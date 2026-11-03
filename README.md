# lakeboard-converter

A mind map locked in one tool’s format is a dead end. This is the bridge from that file to Markdown, for agents and for people.

[![npm](https://img.shields.io/npm/v/lakeboard-converter)](https://www.npmjs.com/package/lakeboard-converter)
[![license](https://img.shields.io/github/license/FelixFangX/lakeboard-converter)](./LICENSE)

**[Convert a map](https://convert.ledring.dev)** — in the browser. The file stays on your machine.

```markdown
# Launch plan
- Alpha
  > Ship the reader
- [Docs](https://example.com/docs) `P1`
```

```bash
npm install -g lakeboard-converter
```

`lakeboard-converter read ./map.opml` prints Markdown. The same command reads every format below. `mindmap-converter` is the same program. The package name stays `lakeboard-converter`.

| Format | Read → Markdown | Write |
| --- | --- | --- |
| OPML `.opml`, including MindNode OPML export | Yes | — |
| FreeMind and Freeplane `.mm` | Yes | — |
| Markdown outline `.md`, `.markdown` | Yes. Headings, lists, markmap front matter, and indented outlines | XMind |
| Lakeboard `.lakeboard` | Yes | XMind |
| XMind Zen and XMind 8 `.xmind` | Yes | XMind |
| MindManager `.mmap` | Yes | — |
| iThoughts `.itmz` | Yes | — |
| SimpleMind `.smmx` | Yes | — |
| CSV outline `.csv` | Yes. One topic per row; the column is the depth | — |

Not kept: styles, layout, icons, relationships, and encrypted nodes. MindManager notes are plain text. A CSV row with several topics is rejected. The native MindNode package is not read; export OPML.

English | [简体中文](./README.zh-CN.md)

## Usage

Requires Node.js 20.12 or newer. `convert` does not replace an existing file unless you pass `--overwrite`. `--format` is `md`, `xmind`, or `both` (default `both`). `--markdown-style` is `generic` (default) or `xmind`.

```bash
lakeboard-converter read ./map.opml
lakeboard-converter build plan.md -o plan.xmind
```

`lakeboard-converter` with no subcommand opens the guided prompts.

`read` prints `md` (default), `json`, or `outline`. The default node cap is 2000 (`--max-nodes`, from 1 to 50000). The root is depth 0. Since 0.4.0, JSON for more than one sheet is `{ sheets: [{ index, title, root }] }`. `--sheet` is a 1-based index or a sheet title.

The MCP tools are `convert`, `convert_many`, and `inspect` (read-only) and `from_markdown` (writes a `.xmind` only at the path you pass, in a folder that already exists). `inspect` reports the format in `source`. Set `overwrite` to replace a file. With no path, `from_markdown` returns the file as base64. Markdown input is capped at 2 MB. `convert_many` takes 1 to 50 files.

```json
{
  "mcpServers": {
    "lakeboard-converter": {
      "command": "lakeboard-converter",
      "args": ["mcp"]
    }
  }
}
```

## License

[MIT](./LICENSE)
