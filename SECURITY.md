# Security Policy

## Supported Versions

Security fixes are applied to the latest minor release (`0.6.x`).

## Security Model & Built-in Safeguards

`lakeboard-converter` is designed to process untrusted mind-map files conservatively across Web, CLI, and MCP:

- **Local-first browser conversion**: The web app at [convert.ledring.dev](https://convert.ledring.dev) runs entirely in your browser. Dropped files are never uploaded to a server.
- **Bounded ZIP archive handling** (`.xmind`, `.mmap`, `.itmz`, `.smmx`): The reader parses the ZIP central directory directly and streams only the target content entry (`content.json`, `content.xml`, `Document.xml`, `mapdata.xml`, or `mindmap.xml`) through a bounded raw-deflate cap:
  - 32 MiB maximum compressed container size (checked before reading from disk)
  - 32 MiB maximum inflated output bytes (enforced on the inflate stream, not just header metadata)
  - 1024 maximum entries in the central directory
  - 10 second wall-clock inflate limit
  - 512 byte maximum member name length
  - Rejects encrypted archives, multi-disk archives, and path traversal (`..`) in member names
- **HTML & link handling**: The web UI renders topic titles, notes, and hrefs as plain text without `dangerouslySetInnerHTML`. HTML notes strip `<script>` and `<style>` elements (including their contents) before extracting plain text. Note that XMind Zen `href` values are copied into Markdown output as stored (see [docs/conversion.md](./docs/conversion.md) for details).
- **MCP least privilege**: `convert`, `convert_many`, and `inspect` are read-only. `from_markdown` is the only tool that writes to disk; it requires an explicit `.xmind` output path inside an existing directory, never creates directories, refuses to overwrite without `overwrite: true`, and caps Markdown input at 2 MB.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities in public GitHub issues.

Report privately via [GitHub Security Advisories](https://github.com/FelixFangX/lakeboard-converter/security/advisories/new) with:

- Affected version and surface (Web, CLI, or MCP)
- A minimal synthetic reproducer (do not attach private user files)
- Expected vs. actual behavior and potential impact

We aim to acknowledge reports within 72 hours and coordinate a fix before public disclosure.
