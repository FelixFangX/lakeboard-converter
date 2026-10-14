#!/usr/bin/env node
import { Command } from 'commander';
import { convertFile } from './index.js';
import { readMindMap, type AgentFormat } from './agent.js';

const program = new Command();

program
  .name('lakeboard-converter')
  .description('将 .lakeboard / .xmind 思维导图文件转换为 Markdown 或 XMind 格式')
  .version('0.3.0');

program
  .command('convert')
  .description('转换指定文件（非交互式）')
  .argument('<input>', '输入文件路径（支持 .lakeboard 和 .xmind）')
  .option('-f, --format <format>', '导出格式：md | xmind | both', 'both')
  .option('--markdown-style <style>', 'Markdown 风格：generic | xmind', 'generic')
  .option('-o, --output <path>', '单一导出格式时指定输出文件')
  .option('--out-dir <dir>', '输出目录')
  .option('--overwrite', '允许覆盖已有文件', false)
  .option('--json', 'print a machine-readable JSON result', false)
  .action(async (input, options) => {
    try {
      if (!['md', 'xmind', 'both'].includes(options.format)) {
        throw new Error(`不支持的 format: ${options.format}`);
      }
      if (!['generic', 'xmind'].includes(options.markdownStyle)) {
        throw new Error(`不支持的 markdown-style: ${options.markdownStyle}`);
      }

      const result = await convertFile({
        input,
        format: options.format,
        markdownStyle: options.markdownStyle,
        output: options.output,
        outDir: options.outDir,
        overwrite: options.overwrite,
      });

      if (options.json) {
        console.log(JSON.stringify({ schemaVersion: 1, ...result }));
        return;
      }
      console.log(`转换完成：节点 ${result.nodeCount} 个，最大深度 ${result.maxDepth}`);
      for (const output of result.outputs) {
        console.log(`已生成: ${output}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(options.json ? JSON.stringify({ error: message }) : message);
      process.exitCode = 1;
    }
  });

program
  .command('read')
  .description('Print a mind map to stdout for agents and scripts (never writes files)')
  .argument('<input>', '.lakeboard or .xmind file')
  .option('-f, --format <format>', 'md | json | outline', 'md')
  .option('--json', 'wrap the result in a stable JSON envelope', false)
  .action(async (input, options) => {
    try {
      const result = await readMindMap(input, options.format as AgentFormat);
      if (options.json) console.log(JSON.stringify(result));
      else process.stdout.write(typeof result.content === 'string' ? result.content : `${JSON.stringify(result.content, null, 2)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(options.json ? JSON.stringify({ error: message }) : message);
      process.exitCode = 1;
    }
  });

program
  .command('mcp')
  .description('Start the read-only MCP server on stdio')
  .action(async () => {
    const { createServer } = await import('./mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    await createServer().connect(new StdioServerTransport());
  });

const args = process.argv.slice(2);
const hasSubcommand = args.length > 0 && (args[0] === 'convert' || args[0] === 'read' || args[0] === 'mcp' || args[0] === 'help' || args[0] === '--help' || args[0] === '-h' || args[0] === '--version' || args[0] === '-V');

if (hasSubcommand) {
  program.parseAsync(process.argv);
} else {
  import('./tui.js').then(({ runInteractiveTUI }) => runInteractiveTUI()).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
