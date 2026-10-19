# Changelog

All notable changes to this project are documented here, following Keep a Changelog.

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
