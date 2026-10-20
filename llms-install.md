# Installing lakeboard-converter as an MCP server

This server runs locally over stdio and has no API keys, accounts or environment variables. It needs Node.js 20.12 or newer.

## Configuration

Add this entry to the client's MCP settings (for Cline: `cline_mcp_settings.json`):

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

Nothing else is required. The first start downloads the package from npm.

## Verify

Ask the agent to call the `convert` tool on any `.xmind` or `.lakeboard` file with an absolute path, for example:

```
convert({ "path": "/absolute/path/to/map.xmind", "format": "md" })
```

`convert` is read-only. Arguments:

- `path` (required): absolute path to a `.xmind` (XMind Zen / 2020+) or `.lakeboard` file. A leading `~` or `~/` (also `~\` on Windows) is expanded. Relative paths resolve against the server's working directory, so prefer absolute paths.
- `format`: `md` (default), `json` or `outline`.
- `sheet`: 1-based index or title of one XMind sheet. All sheets are returned by default.
- `maxNodes` (default 2000, max 50000) and `maxDepth` (root is depth 0). Output past the limit is cut and flagged as `truncated`.

## Tools

- `convert(path, format?, sheet?, maxNodes?, maxDepth?)`: read one mind map; `format` defaults to `md`.
- `from_markdown(markdown, output?, overwrite?, title?, maxNodes?)`: build XMind from Markdown. Write only to an explicit absolute `.xmind` path in an existing folder, with `overwrite: true` required to replace a file. Without `output`, return `structuredContent.base64`. Input is capped at 2 MB; `maxNodes` defaults to 2000 (max 50000).
- `convert_many(paths, format?, sheet?, maxNodes?, maxTotalNodes?, maxDepth?)`: read 1–50 absolute paths with per-file results and errors. `maxTotalNodes` defaults to 10000; `structuredContent` contains metadata without content. Per-file errors do not fail the call.
- `inspect(path, sheet?)`: return bytes and topic counts without content; pass an absolute path.

`convert`, `convert_many` and `inspect` are read-only. `from_markdown` is the only writer and writes only where told; it does not create folders.

## Troubleshooting

- `File not found ... (resolved to ...)`: pass an absolute path.
- `missing content.json`: the file is an XMind 8 (legacy XML) file, which is not supported.
- `npx` not found: install Node.js 20.12+ and restart the client.
