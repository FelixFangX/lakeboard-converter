# Conversion contract

This note records what a read keeps, what it reports, and what this change deliberately left alone. It is not a claim that the converter is production-ready.

## What a read keeps

The tree is the topic text, in file order. Attached topics come first. Floating topics (XMind detached topics, MindManager floating topics) follow them. Plain notes are kept. `http`, `https`, and `mailto` links are kept.

An HTML note is used only when plain text is missing or blank and the HTML still yields text. A plain note wins when both are present.

XMind Zen copies `href` as stored, including `xmind:` links. Dropping those links would change Markdown that existing files already produce. XMind 8, iThoughts, and SimpleMind already omit links that are not `http`, `https`, or `mailto`.

## What a read reports

Omissions the parser can see are `losses`: `{ code, count }` in this order. Zero counts are left out. The same facts are English sentences in `warnings` (after any parser warning, before a truncation warning) and, on the CLI, a `> Note:` line. `--json` includes `losses` and does not add a second prose channel. The web result shows the same English sentence, or the Chinese sentence when the page is in Chinese.

| Code | Meaning | Sentence |
| --- | --- | --- |
| `relationship` | A relationship, arrow, or relation was not copied | `Dropped N relationship(s).` |
| `summary` | A summary topic was not added to the tree | `Dropped N summary topic(s).` |
| `encrypted` | A FreeMind encrypted topic kept its title | `Kept N encrypted topic(s) as title only.` |
| `internal-link` | A link was omitted because it is not `http`, `https`, or `mailto` | `Dropped N internal link(s).` |
| `rich-note` | A note had no plain text to keep | `Dropped N note(s) with no plain text.` |

`losses: []` means none of those five were seen. It does not mean styles survived. `--sheet` still reports losses for the whole file, because the parsers count them before a sheet is chosen.

`from_markdown` / `build` does not return `losses`. That path writes XMind from Markdown.

## What stays unreported

Styles, icons, and layout are omitted on every file. A warning for them would fire on ordinary maps and hide the omissions above. Summary topics are counted and are not inserted as children. Encrypted bodies are not decrypted.

## Archive limits

`.xmind`, `.mmap`, `.itmz`, and `.smmx` are ZIP files. The reader does not ask JSZip to inflate them. It reads the central directory, then inflates only the content member (content.json, content.xml, Document.xml, mapdata.xml, or mindmap.xml) with a raw deflate stream that throws from the output callback. The overflowing chunk is not kept. Header sizes are not the limit: a header that claims 16 uncompressed bytes still stops if the stream produces more than the cap, and a header that claims more than the cap is refused before inflate.

| Limit | Value |
| --- | --- |
| Compressed container, checked before `readFile` when the path is on disk | 32 MiB |
| Members in the central directory, including directories | 1024 |
| Inflated bytes retained for the content member | 32 MiB |
| Wall clock for that inflate | 10 seconds |
| Member name | 512 bytes |
| Compression on the content member | store or deflate |
| Rejected outright | encryption, multi-disk, `..` in a member name |

Other members are counted and are not inflated. Nested zips inside a member are not opened. CRC32 is not checked. A file under these caps can still be hostile in other ways. Per-sheet loss counts, styles, and encrypted node bodies remain out of scope.

Measured on Node v22.23.4, Linux 6.12, 4 vCPU: a synthetic raw-deflate member of 96 MiB of zeros (97,846 compressed bytes, central-directory uncompressed size 16) stops after 33,554,432 bytes. `VmHWM` for that process rose by 37,056,512 bytes, not by the 96 MiB the stream would have produced. The fixture is built in the test and is not a user file. Windows CI runs the same stop count and the rejection itself; `/proc` high-water data is Linux-only.

A rejected file leaves the page on the idle converter. The error callout is scrolled into view. The sample cards on that page are the built-in example, not output from the rejected file. CLI and MCP print the specific limit on stderr or `isError` and do not write a Markdown file.

## Links and HTML notes

XMind Zen `href` values are copied into the Markdown as stored, including `xmind:` and `javascript:` links. The page renders titles, notes, and those hrefs as text. It does not turn a topic href into an `<a>` and it does not use `dangerouslySetInnerHTML`. A later Markdown viewer can still activate a `javascript:` link. HTML notes drop `script` and `style` elements, including their text, before the remaining markup becomes a plain note.

## Fixtures

Cases in `tests/losses.test.ts` and the files in `test-fixtures/` are synthetic maps written for this repository. They are not user exports and carry no third-party content license.

```bash
npm ci && npm run typecheck && npm test
node --import tsx src/cli.ts read test-fixtures/freemind-edges.mm
node --import tsx src/cli.ts inspect test-fixtures/freemind-edges.mm
```

The first command prints the Markdown and a `> Note:` line for the arrow and the encrypted title. The second prints the size line, then the same note.

On Node v22.23.4, Linux 6.12, one `convertBuffer` of a 602-byte synthetic Zen file (5 topics) took 3 ms after the module had loaded. The process RSS was about 88 MB. That is a single small file on this machine, not a capacity result.
