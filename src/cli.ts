#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { convertFile } from './index.js';
import { readMindMap, type AgentFormat } from './agent.js';

const { version } = createRequire(import.meta.url)('../package.json');
const program = new Command();

program
  .name('lakeboard-converter')
  .description('Convert .lakeboard / .xmind mind maps to Markdown or XMind')
  .version(version);

program
  .command('convert')
  .description('Convert a file (non-interactive)')
  .argument('<input>', 'Input file path (.lakeboard or .xmind)')
  .option('-f, --format <format>', 'Export format: md | xmind | both', 'both')
  .option('--markdown-style <style>', 'Markdown style: generic | xmind', 'generic')
  .option('-o, --output <path>', 'Output file path (single export format only)')
  .option('--out-dir <dir>', 'Output directory')
  .option('--overwrite', 'Allow overwriting existing files', false)
  .option('--json', 'print a machine-readable JSON result', false)
  .action(async (input, options) => {
    try {
      if (!['md', 'xmind', 'both'].includes(options.format)) {
        throw new Error(`Unsupported format: ${options.format}`);
      }
      if (!['generic', 'xmind'].includes(options.markdownStyle)) {
        throw new Error(`Unsupported markdown-style: ${options.markdownStyle}`);
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
      console.log(`Done: ${result.nodeCount} nodes, max depth ${result.maxDepth}`);
      for (const output of result.outputs) {
        console.log(`Wrote: ${output}`);
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
