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

The tool is read-only. Arguments:

- `path` (required): absolute path to a `.xmind` (XMind Zen / 2020+) or `.lakeboard` file. A leading `~` is expanded. Relative paths resolve against the server's working directory, so prefer absolute paths.
- `format`: `md` (default), `json` or `outline`.
- `sheet`: 1-based index or title of one XMind sheet. All sheets are returned by default.
- `maxNodes` (default 2000, max 50000) and `maxDepth` (root is depth 0). Output past the limit is cut and flagged as `truncated`.

## Troubleshooting

- `File not found ... (resolved to ...)`: pass an absolute path.
- `missing content.json`: the file is an XMind 8 (legacy XML) file, which is not supported.
- `npx` not found: install Node.js 20.12+ and restart the client.
