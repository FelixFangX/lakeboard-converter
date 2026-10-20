# AGENTS.md

- Build/test: `npm ci && npm run typecheck && npm test` (CI runs the same on Node 22).
- Seams: `convertFile`/`convertBuffer` (src/index.ts) for humans, `readMindMap`, `buildMindMap`, `readMindMaps` and `inspectMindMap` (src/agent.ts, exported from src/index.ts) for agents. Test only through these, the MCP server (`createServer` in src/mcp.ts) or the CLI.
- Parsers live in `src/core/`, renderers in `src/render/`. A new input format = one parser, no renderer changes.
- MCP `convert`, `convert_many` and `inspect` are read-only. `from_markdown` is the only writer and may write only the explicit output path: no mkdir and no overwrite without the flag. New writing tools need a spec issue.
- Keep `server.json` and `package.json` versions in sync.
- Fixtures: `test-fixtures/` only. Never commit real user mind maps.
- Publishing (maintainer; needs npm + GitHub sign-in): `npm run build && npm publish`, then `mcp-publisher login github && mcp-publisher publish` (uses `server.json`; `mcpName` in package.json must equal `server.json` name `io.github.FelixFangX/lakeboard-converter`). Bump all three versions together.
