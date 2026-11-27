# Contributing to lakeboard-converter

Thank you for your interest in improving `lakeboard-converter`. This guide keeps contributions predictable and aligned with the project's architecture.

## Prerequisites

- Node.js 20.12 or newer (CI runs Node 22 on Ubuntu and Windows)

## Local Setup & Verification

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run build:web
```

All PRs must pass `npm run typecheck` and `npm test` on both Linux and Windows.

## Architecture & Boundaries

- **Parsers** live in `src/core/`; **renderers** live in `src/render/`.
- **Adding an input format** should require adding one parser and wiring detection in `src/core/read-source.ts`, without changing renderers.
- **Public seams**:
  - `convertFile` / `convertBuffer` (`src/index.ts`) for human-facing conversion
  - `readMindMap`, `buildMindMap`, `readMindMaps`, `inspectMindMap` (`src/agent.ts`, re-exported from `src/index.ts`) for agents
  - Tests should exercise these seams, the MCP server (`createServer` in `src/mcp.ts`), or the CLI (`src/cli.ts`).
- **Conversion contract**: structural omissions (relationships, summaries, encrypted bodies, non-web links, notes without plain text) must be counted in `losses` rather than silently dropped. See [docs/conversion.md](./docs/conversion.md).
- **MCP safety**: `convert`, `convert_many`, and `inspect` are strictly read-only. `from_markdown` is the only writer and may write only to an explicit path in an existing directory without implicit `mkdir` or overwrite. Any new writing tool requires a design issue first.

## Fixtures & Privacy

- Put test fixtures in `test-fixtures/` only.
- **Never commit real user mind maps.** Write minimal synthetic fixtures that cover the structure or edge case you are testing.

## Submitting Changes

1. Open an issue first for new formats, breaking output changes, or new MCP tools.
2. Keep pull requests small and focused, with tests covering new behavior and edge cases.
3. For releases, keep `package.json` (`version`) and `server.json` (`version` and `packages[0].version`) in sync.
