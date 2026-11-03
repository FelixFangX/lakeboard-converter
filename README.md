# lakeboard-converter

Mind maps your agents can actually read.

Agents cannot open a mind map. Turn the file into Markdown.

[![npm](https://img.shields.io/npm/v/lakeboard-converter)](https://www.npmjs.com/package/lakeboard-converter)
[![license](https://img.shields.io/github/license/FelixFangX/lakeboard-converter)](./LICENSE)

**[Convert a map](https://convert.ledring.dev)** — in the browser. The file is not uploaded.

| Format | Read → Markdown | Write |
| --- | --- | --- |
| OPML `.opml` | Yes | — |
| FreeMind and Freeplane `.mm` | Yes | — |
| Markdown outline `.md`, `.markdown` | Yes | XMind |
| Lakeboard `.lakeboard` | Yes | XMind |
| XMind Zen / 2020+ `.xmind` | Yes | XMind |
| MindManager `.mmap` | Yes | — |

Not kept: XMind 8 XML, styles, layout, icons, relationships, and encrypted nodes. MindManager notes are read from PlainText. The package name stays `lakeboard-converter`. The `mindmap-converter` command is the same program.

English | [简体中文](./README.zh-CN.md)

## Usage

Requires Node.js 20.12 or newer. `convert` does not replace an existing file unless you pass `--overwrite`. `--format` is `md`, `xmind`, or `both` (default `both`). `--markdown-style` is `generic` (default) or `xmind`.

```bash
npm install -g lakeboard-converter
npx -y lakeboard-converter read ./map.opml --format md
npx -y lakeboard-converter build plan.md -o plan.xmind
```

`lakeboard-converter` with no subcommand opens the guided prompts.

`read` prints `md` (default), `json`, or `outline`. The default node cap is 2000 (`--max-nodes`, from 1 to 50000). The root is depth 0. Since 0.4.0, JSON for more than one sheet is `{ sheets: [{ index, title, root }] }`. `--sheet` is a 1-based index or a sheet title.

The MCP tools are `convert`, `convert_many`, and `inspect` (read-only) and `from_markdown` (writes a `.xmind` only at the path you pass, in a folder that already exists). `inspect` reports the format in `source`. Set `overwrite` to replace a file. With no path, `from_markdown` returns the file as base64. Markdown input is capped at 2 MB. `convert_many` takes 1 to 50 files.

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

## License

[MIT](./LICENSE)
