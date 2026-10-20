# lakeboard-converter

[English](./README.md) | 简体中文

一个将语雀画板 `.lakeboard` 和 XMind `.xmind` 思维导图转换为 Markdown 的命令行、MCP 服务和 Web 工具（[convert.ledring.dev](https://convert.ledring.dev)）。

## 功能特性

- 解析 `.lakeboard` 文件（语雀画板）
- 解析 `.xmind` 文件（XMind Zen/2020+ 格式）
- 保留节点层级、顺序、备注和链接；XMind 标签会显示在通用 Markdown 和大纲中；读取 `.xmind` 的所有画布（sheet）
- 导出通用 Markdown
- 导出适合 XMind 导入的 Markdown
- 直接生成 `.xmind` 文件
- **交互式 TUI** — 引导式文件选择与转换流程
- **Web 界面** 支持拖拽上传、Markdown 预览和树形结构查看

## 环境要求

- Node.js 20.12+

## 快速使用

打开 [convert.ledring.dev](https://convert.ledring.dev)，在浏览器中转换文件。点击右上角「中文」切换语言，或直接使用 [中文界面](https://convert.ledring.dev/?lang=zh)。

也可以无需全局安装，直接运行 CLI（需要 Node.js 20.12+）：

```bash
npx -y lakeboard-converter convert ./map.xmind --format md --out-dir ./out
```

将 Markdown 输出到终端，不写入文件：

```bash
npx -y lakeboard-converter read ./map.xmind --format md
```

启动 MCP 服务器：

```bash
npx -y lakeboard-converter mcp
```

### 本地开发

```bash
git clone https://github.com/FelixFangX/lakeboard-converter.git
cd lakeboard-converter
npm ci
```

以下命令在本地源码目录中运行。

### 交互式 TUI 模式（推荐）

```bash
npm run dev
```

启动交互式终端界面。界面文字为英文，引导你完成：
1. 选择输入文件（`How do you want to choose the input file?`）：从当前目录自动发现的文件中选（`Pick from files found in the current directory`）、手动输入路径（`Enter a file path`）或浏览目录（`Browse directories`）
2. 选择导出格式（`Export format:`）：Markdown / XMind / 全部（`(both)`）
3. 选择 Markdown 风格（`Markdown style:`）：`Generic Markdown` 或 `XMind import style`
4. 设置输出位置（`Output location:`）：`Same directory as the input file` 或 `Custom output directory`
5. 确认是否覆盖已有文件（`Overwrite output files if they already exist?`），执行转换并展示结果（`✔ Conversion complete`，以及 `Nodes:` / `Max depth:` / `Time:`）

### 非交互式 CLI 模式

适用于脚本和 CI 流水线，直接使用 `convert` 子命令：

```bash
# 从 .lakeboard 文件
npm run convert -- "/path/to/example.lakeboard" --format md --markdown-style generic

# 从 .xmind 文件
npm run convert -- "/path/to/example.xmind" --format md --markdown-style generic

# 同时导出 Markdown 和 XMind
npm run convert -- "/path/to/example.lakeboard" --format both --out-dir ./dist

# 覆盖已有文件
npm run convert -- "/path/to/example.xmind" --format both --overwrite
```

CLI 输出为英文，例如转换成功时：

```text
Done: 42 nodes, max depth 4
Wrote: /path/to/example.md
```

常见报错（英文原文）：

| 报错 | 含义 |
| --- | --- |
| `Unsupported input format: .txt (only .lakeboard and .xmind are supported)` | 输入扩展名不受支持 |
| `Output file already exists: …` | 输出文件已存在，需加 `--overwrite` |
| `--output only works with a single export format; use --out-dir instead` | `--output` 只能配合单一导出格式 |
| `.xmind file is missing content.json; it is probably an old XMind 8 file (only XMind Zen/2020+ is supported)` | 旧版 XMind 8 文件，不受支持 |

### Web 模式

```bash
# 启动开发服务器
npm run dev:web

# 构建生产版本
npm run build:web
```

Web 界面支持中文和英文，以下以英文界面文字为例，提供：
- 拖拽上传 `.lakeboard` 和 `.xmind` 文件（`Drop a file here, or click to choose one`）
- 实时转换为 Markdown（转换中显示 `Converting…`）
- 切换 `Generic Markdown` / `XMind import style` 两种 Markdown 风格
- Markdown 源码视图和树形结构预览（`Tree preview`），并显示 `Nodes` / `Depth` 统计
- 一键复制（`Copy` → `Copied`）和下载 `.md` 文件（`Download .md`）

## 面向 Agent（MCP 和 `--json`）

需要 Node 20.12+。MCP 服务器提供四个工具：

- `convert(path, format?, sheet?, maxNodes?, maxDepth?)`：读取单个思维导图，格式为 `md`（默认）、`json`（主题树）或 `outline`（紧凑缩进文本）。
- `from_markdown(markdown, output?, overwrite?, title?, maxNodes?)`：从 Markdown 大纲生成 XMind 文件。
- `convert_many(paths, format?, sheet?, maxNodes?, maxTotalNodes?, maxDepth?)`：读取多个思维导图，共用总节点预算。
- `inspect(path, sheet?)`：返回文件大小和节点统计，不返回内容。

`convert`、`convert_many` 和 `inspect` 只读。`from_markdown` 仅写入你明确传入的输出路径。

启动 MCP 服务器：

```bash
npx -y lakeboard-converter mcp
```

Claude Desktop (`claude_desktop_config.json`):

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

Cursor（`.cursor/mcp.json` 或 `~/.cursor/mcp.json`）：

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

Codex CLI (`~/.codex/config.toml`):

```toml
[mcp_servers.lakeboard-converter]
command = "npx"
args = ["-y", "lakeboard-converter", "mcp"]
```

通过 CLI 读取文件，或全局安装 CLI：

```bash
npx -y lakeboard-converter read ./map.xmind --format md
npm i -g lakeboard-converter
```

### Markdown 转 XMind

`from_markdown` 接受标题、嵌套列表、编号列表、链接、末尾的 `code` 标签和 `> 备注`。多个画布使用重复的 `# Sheet` / `## Root` 结构，每个画布标题下恰好包含一个根标题。首个标题或列表项之前的文本会被忽略，并返回警告。

写文件时，必须传入绝对 `.xmind` 输出路径，且所在目录必须已存在。工具不会创建目录，覆盖已有文件需要 `overwrite: true`。不传 `output` 时，文件以 base64 返回在 `structuredContent.base64` 中。Markdown 输入上限为 2 MB（UTF-8）。`maxNodes` 默认为 2000（范围 1–50000）；省略的节点通过 `truncated` 和 `warnings` 报告。

CLI `build` 必须指定 `-o`，会将其解析为绝对路径；允许覆盖时使用 `--overwrite`：

```bash
npx -y lakeboard-converter build plan.md -o plan.xmind
```

### 批量读取与大小检查

`convert_many` 接受 1–50 个绝对路径。`maxNodes` 限制每个文件，`maxTotalNodes` 限制整个批次，默认为 10000（范围 1–200000）。文本中包含转换后的内容；`structuredContent` 包含各文件的元数据和错误，不含 `content`。单个文件出错不会使 MCP 调用失败。CLI 多文件 `read` 也返回各文件的结果和错误；任何文件失败时退出码为 1。使用 `--max-total-nodes` 调整总预算。

`inspect` 返回字节数、节点数、深度和画布元数据，不返回内容。

```bash
npx -y lakeboard-converter read a.xmind b.lakeboard --json
npx -y lakeboard-converter inspect a.xmind --json
```

### 从源码运行

```bash
npm run build
node /abs/path/lakeboard-converter/dist/cli.js mcp
node dist/cli.js read ./test-fixtures/test.lakeboard --format json --json
node dist/cli.js convert ./test-fixtures/test.xmind -f md --out-dir out --json
```

单文件 CLI `read --json` 结果包含 `schemaVersion: 1`、`source`、`format`、`nodeCount`、`maxDepth` 和 `content`。使用 `--json` 时，错误输出为 `{"error": "..."}`，退出码为 1。贡献指南见 [AGENTS.md](./AGENTS.md)。

## CLI 参数（非交互式模式）

| 参数 | 说明 | `--help` 中的英文说明 |
| --- | --- | --- |
| `--format` | 导出格式：`md`、`xmind`、`both` | `Export format: md \| xmind \| both` |
| `--markdown-style` | Markdown 风格：`generic` 或 `xmind` | `Markdown style: generic \| xmind` |
| `--output` | 单一导出目标的输出文件路径 | `Output file path (single export format only)` |
| `--out-dir` | 输出目录 | `Output directory` |
| `--overwrite` | 允许覆盖已有文件 | `Allow overwriting existing files` |

## 支持的输入格式

| 格式 | 扩展名 | 说明 |
| --- | --- | --- |
| 语雀画板 | `.lakeboard` | JSON 格式的思维导图 |
| XMind | `.xmind` | ZIP 归档包含 `content.json`（仅支持 XMind Zen/2020+ 格式） |

## 输出格式

### 通用 Markdown

- 根节点输出为一级标题
- 子节点输出为嵌套列表
- 备注以引用块形式渲染，链接以 Markdown 链接渲染
- 适合 Git、文档系统和通用 Markdown 工具

### XMind 导入友好 Markdown

- 输出为单根节点嵌套列表
- 每个节点单行输出
- 多行文本会压平成单行，便于导入 XMind

### XMind

- 直接生成最小可用 `.xmind` 包
- 包含 `content.json`、`metadata.json` 和 `manifest.json`
- 重点保留文本、层级和顺序

## 脚本说明

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | 启动交互式 TUI |
| `npm run dev:web` | 启动 Web 界面开发服务器 |
| `npm run build` | 构建 CLI 生产版本 |
| `npm run build:web` | 构建 Web 界面生产版本 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行测试 |
| `npm run convert` | 非交互式 CLI convert 命令 |

## 开发

```bash
npm run build        # 构建 CLI
npm run build:web    # 构建 Web 界面
npm run typecheck    # 类型检查
npm run test         # 运行测试
```

## 当前限制

- 保留文本、层级和顺序，但不保留样式、颜色和布局信息
- 不支持 XMind 8（旧版 XML 格式），仅支持 XMind Zen/2020+（JSON 格式）
- 如果遇到新的 `.lakeboard` 结构变体，可能需要补充解析逻辑


## 输出与限制

读取 XMind 的所有画布。Lakeboard 只有一个画布，标题为根节点标题。无标题的 XMind 画布使用 `Sheet N`。多个画布的通用 Markdown 分别使用 `# <画布标题>`、`## <根节点标题>` 和列表；单个画布仍使用 `# <根节点标题>`。第一级列表不缩进，之后每级增加两个空格；备注与列表项的正文列对齐。链接直接放在节点文字上，例如 `[标题](url)`，标题中的方括号会转义。标签显示为行内代码，例如 ``- 拆分依赖包 `P1` `tech-debt` ``；大纲使用 `- 标题 [P1, tech-debt]`，多个画布各有一个标题。

XMind 导入样式每个画布使用一个根列表，以空行分隔，不使用标题，也不输出标签，避免标签污染重新导入的节点标题。

CLI 的 `read`、`convert` 和 `inspect` 都支持 `--sheet <index|name>`，按从 1 开始的序号或不区分大小写的完整标题选择画布。MCP 的 `sheet` 接受字符串或整数。选择结果记录在 `selectedSheet` 中；找不到时会列出可用画布。

```bash
lakeboard-converter read /absolute/path/map.xmind --sheet Roadmap --max-nodes 5000 --max-depth 3 --json
lakeboard-converter convert ./map.xmind --sheet 2 --format md
```

`readMindMap(file, format, options)`、CLI `read` 和 MCP 默认使用 `maxNodes: 2000`，接受 1 到 50000 的整数。可选的 `maxDepth` 为非负整数。根节点深度为 0，因此只有根节点和一层子节点的文档 `maxDepth` 为 1。限制按画布顺序进行前序遍历截断；`truncated` 和 `warnings` 说明截断情况。可以提高限制或选择单个画布。写文件的 `convert` 不受大小限制。CLI 非封装输出与 MCP 文本会追加 `> Note: ...` 警告。

MCP 请使用绝对路径。`convert` 的相对路径以服务器工作目录为基准，可能与终端目录不同。CLI `read` 和 MCP `convert` 支持将开头的 `~` 或 `~/`（Windows 上还支持 `~\`）展开为用户主目录。相对路径不存在时，错误会提供解析后的绝对路径和服务器工作目录。

### 单文件读取 JSON 与 MCP convert 结果

CLI `read --json` 保留 `schemaVersion: 1` 和已有字段，新增 `sheets: [{ index, title, nodeCount, maxDepth }]`、可选的 `selectedSheet: { index, title }`、`truncated` 和 `warnings`。统计值描述截断前选中的输入；`maxDepth` 始终以根节点深度 0 计算。

`format: "json"` 的 `content` 在单画布时仍为节点树。自 0.4.0 起，多画布时为 `{ sheets: [{ index, title, root: AgentTopic }] }`。节点树同样受输出限制影响。

MCP `convert` 返回一个纯文本块，内容为 Markdown、大纲或格式化 JSON 节点树，不再把整个结果封装后序列化到文本中。同时返回 `structuredContent`：`{ schemaVersion, file, source, format, nodeCount, maxDepth, sheets, selectedSheet?, truncated, warnings }`，并注册对应的 `outputSchema`。警告追加到文本最后一行 `> Note: ...`。错误仍返回 `isError: true` 和明确说明，工具保持只读。

Cursor CLI 的无界面模式（`cursor-agent -p`）需要 `--force`（以及 `--approve-mcps`），否则工具调用会被拒绝。
