# lakeboard-converter

[English](./README.md) | 简体中文

一个将语雀画板 `.lakeboard` 和 XMind `.xmind` 思维导图转换为 Markdown 的命令行、MCP 服务和 Web 工具（[convert.ledring.dev](https://convert.ledring.dev)）。

## 功能特性

- 解析 `.lakeboard` 文件（语雀画板）
- 解析 `.xmind` 文件（XMind Zen/2020+ 格式）
- 保留节点层级、顺序、备注和链接；XMind 标签目前只在 JSON 输出（`--format json`）中保留，Markdown 暂不输出；`.xmind` 只读取第一个画布（sheet）
- 导出通用 Markdown
- 导出适合 XMind 导入的 Markdown
- 直接生成 `.xmind` 文件
- **交互式 TUI** — 引导式文件选择与转换流程
- **Web 界面** 支持拖拽上传、Markdown 预览和树形结构查看

## 环境要求

- Node.js 20.12+

## 安装

```bash
git clone https://github.com/FelixFangX/lakeboard-converter.git
cd lakeboard-converter
npm install
```

## 快速使用

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

Web 界面文字为英文（标题 `Mind map → Markdown`），提供：
- 拖拽上传 `.lakeboard` 和 `.xmind` 文件（`Drop a file here, or click to choose one`）
- 实时转换为 Markdown（转换中显示 `Converting…`）
- 切换 `Generic Markdown` / `XMind import style` 两种 Markdown 风格
- Markdown 源码视图和树形结构预览（`Tree preview`），并显示 `Nodes` / `Depth` 统计
- 一键复制（`Copy` → `Copied`）和下载 `.md` 文件（`Download .md`）

## 面向代理（MCP 和 `--json`）

代理可使用一个只读工具 `convert(path, format)`，其中 `format` 为 `md`、`json`（主题树）或 `outline`（紧凑缩进文本）。需要 Node 20.12+。

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

### 从源码运行

```bash
npm run build
node /abs/path/lakeboard-converter/dist/cli.js mcp
node dist/cli.js read ./test-fixtures/test.lakeboard --format json --json
node dist/cli.js convert ./test-fixtures/test.xmind -f md --out-dir out --json
```

每个 JSON 结果包含 `schemaVersion: 1`、`source`、`format`、`nodeCount`、`maxDepth` 和 `content`。使用 `--json` 时，错误输出为 `{"error": "..."}`，退出码为 1。贡献指南见 [AGENTS.md](./AGENTS.md)。

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
