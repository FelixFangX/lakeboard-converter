# Changelog

All notable changes to this project are documented here, following Keep a Changelog.

## [Unreleased]

### Fixed

- XMind Zen floating topics are kept after attached topics. An HTML note is used when plain text is missing. Both used to disappear with a successful exit.

### Added

- `losses` on `convert`, `read`, and `inspect` (CLI, library, and MCP), plus the same sentence in the web result. Codes: `relationship`, `summary`, `encrypted`, `internal-link`, `rich-note`. See `docs/conversion.md`.
- Read OPML (`.opml`), FreeMind and Freeplane (`.mm`), Markdown outlines (`.md`, `.markdown`, including markmap front matter and indented outlines), MindManager (`.mmap`), XMind 8 (`content.xml` in `.xmind`), iThoughts (`.itmz`), SimpleMind (`.smmx`), and one-topic-per-row CSV (`.csv`) to Markdown. `inspect` reports the format in `source`.
- The browser converter accepts the same inputs and shows a format badge with the Markdown preview.

### Changed

- CLI help lists the input formats. XMind Zen `content.json` and Lakeboard reads are unchanged. XMind 8 `content.xml` is read from the same `.xmind` zip.

## [0.5.0] - 2026-10-20

### Added

- Build XMind from Markdown with the `from_markdown` tool and `build` CLI. Write to an explicit absolute `.xmind` path, never overwrite without the flag, or return base64 when no path is supplied to the tool.
- Read batches with `convert_many` and multi-file CLI `read`, with per-file results and errors and a total node budget.
- Check counts and file size without content with the `inspect` tool and CLI.

### Fixed

- Expand `~\` home paths on Windows (PR #25).

### Changed

- The MCP server is no longer purely read-only. `from_markdown` is the only tool that writes, and only to the path you pass.

## [0.4.1] - 2026-10-19

### Fixed

- Topics without an ID no longer get duplicate fallback IDs across branches, which made the tree validator reject the file. Fallback IDs are now path-based, skip IDs already used in the file, and are shared by the CLI, MCP server and web app. Only fallback IDs of ID-less topics in JSON output change.
- The TUI banner shows the installed package version instead of v0.2.0.

### Changed

- README quickstarts start with the web app and `npx` before cloning the repo.

## [0.4.0] - 2026-10-19

### Added

- Read all XMind sheets, with per-sheet metadata and sheet selection in CLI and MCP.
- Add node and depth limits to agent reads, with truncation metadata and warnings.
- Expand home paths and explain how missing relative paths resolve.
- Register an MCP output schema and return structured metadata alongside plain text.

### Changed

- Separate multiple sheets with headings in generic Markdown and outlines, or blank lines in XMind-import Markdown.
- Render labels inline in generic Markdown and outlines. XMind-import Markdown omits labels to preserve imported titles.
- Link topic titles directly, escape brackets in linked titles, and remove separate link lines.
- Start first-level Markdown items at column 0 and align notes with item content.
- Return multi-sheet JSON trees as `{ sheets: [{ index, title, root }] }`; retain a single topic tree for one sheet.
- Return Markdown, outlines or pretty JSON directly in MCP text, with warnings appended; keep schemaVersion 1.
- Apply the same Markdown changes in the browser and show all sheets in its tree preview.

## [0.3.0]

### Added

- first npm + MCP Registry release
