# lakeboard-converter

Yuque Lakeboard (`.lakeboard`) and XMind (`.xmind`) mind maps are not text. This converts them to Markdown.

[convert.ledring.dev](https://convert.ledring.dev) runs in the browser. The file is not uploaded.

```bash
npx -y lakeboard-converter convert ./map.xmind --format md --out-dir ./out
```

Node.js 20.12 or newer. The npm package is `lakeboard-converter` 0.5.0.

```bash
npx -y lakeboard-converter mcp
```

English | [简体中文](./README.zh-CN.md)

## Usage

`convert` does not replace an existing file unless you pass `--overwrite`. `--format` is `md`, `xmind`, or `both` (default `both`). `--markdown-style` is `generic` (default) or `xmind`. XMind 8 XML is not supported.

```bash
npm install -g lakeboard-converter
npx -y lakeboard-converter read ./map.xmind --format md
npx -y lakeboard-converter build plan.md -o plan.xmind
```

`lakeboard-converter` with no subcommand opens the guided prompts.

`read` prints `md` (default), `json`, or `outline`. The default node cap is 2000 (`--max-nodes`, from 1 to 50000). The root is depth 0. Since 0.4.0, JSON for more than one sheet is `{ sheets: [{ index, title, root }] }`. `--sheet` is a 1-based index or a sheet title.

The MCP tools are `convert`, `convert_many`, and `inspect` (read-only) and `from_markdown` (writes a `.xmind` only at the path you pass, in a folder that already exists). Set `overwrite` to replace a file. With no path, `from_markdown` returns the file as base64. Markdown input is capped at 2 MB. `convert_many` takes 1 to 50 files.

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
