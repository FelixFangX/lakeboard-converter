#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { convertFile } from './index.js';
import { batchText, inspectSummary, inspectMindMap, readMindMaps, buildMindMap, readMindMap, type AgentFormat } from './agent.js';

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
  .option('--sheet <index|name>', 'Select a sheet by index or title')
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
        sheet: options.sheet,
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
      if (result.selectedSheet) console.log(`Sheet ${result.selectedSheet.index}: ${result.selectedSheet.title}`);
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
  .argument('<inputs...>', '.lakeboard or .xmind files')
  .option('--max-total-nodes <n>', 'Maximum batch output nodes (default: 10000)', Number)
  .option('--max-nodes <n>', 'Maximum output nodes (default: 2000)', Number)
  .option('--max-depth <n>', 'Maximum topic depth (root = 0)', Number)
  .option('-f, --format <format>', 'md | json | outline', 'md')
  .option('--sheet <index|name>', 'Select a sheet by index or title')
  .option('--json', 'wrap the result in a stable JSON envelope', false)
  .action(async (input, options) => {
    try {
      if (input.length > 1) {
        const batch = await readMindMaps(input, options.format as AgentFormat, options);
        console.log(options.json ? JSON.stringify(batch) : batchText(batch));
        if (batch.failed) process.exitCode = 1;
        return;
      }
      const result = await readMindMap(input[0], options.format as AgentFormat, options);
      if (options.json) console.log(JSON.stringify(result));
      else {
        process.stdout.write(typeof result.content === 'string' ? result.content : `${JSON.stringify(result.content, null, 2)}\n`);
        if (result.warnings.length) process.stdout.write(`> Note: ${result.warnings.join(' ')}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(options.json ? JSON.stringify({ error: message }) : message);
      process.exitCode = 1;
    }
  });

program
  .command('inspect')
  .description('Check mind map size without rendering content')
  .argument('<input>', '.lakeboard or .xmind file')
  .option('--sheet <index|name>', 'Select a sheet by index or title')
  .option('--json', 'Print a machine-readable JSON result', false)
  .action(async (input, options) => {
    try {
      const result = await inspectMindMap(input, options);
      if (options.json) console.log(JSON.stringify(result));
      else {
        console.log(inspectSummary(result));
        console.log('Index\tTitle\tNodes\tMax depth');
        for (const sheet of result.sheets) console.log(`${sheet.index}\t${sheet.title}\t${sheet.nodeCount}\t${sheet.maxDepth}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(options.json ? JSON.stringify({ error: message }) : message);
      process.exitCode = 1;
    }
  });

program
  .command('build')
  .description('Build an XMind file from a Markdown outline')
  .argument('<input>', 'Markdown file, or - for stdin')
  .requiredOption('-o, --output <path>', 'Output .xmind path')
  .option('--overwrite', 'Allow overwriting existing files', false)
  .option('--title <title>', 'Title for a wrapper root')
  .option('--max-nodes <n>', 'Maximum output nodes (default: 2000)', Number)
  .option('--json', 'Print a machine-readable JSON result', false)
  .action(async (input, options) => {
    try {
      let markdown: string;
      if (input === '-') {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
        markdown = Buffer.concat(chunks).toString('utf8');
      } else markdown = await readFile(input, 'utf8');
      const result = await buildMindMap(markdown, { ...options, output: path.resolve(options.output) });
      const { base64: _, ...metadata } = result;
      console.log(options.json ? JSON.stringify(metadata) : `Wrote ${result.output} (${result.nodeCount} nodes, ${Math.ceil(result.bytes / 1024)} KB)`);
      if (!options.json && result.warnings.length) console.log(`> Note: ${result.warnings.join(' ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(options.json ? JSON.stringify({ error: message }) : message);
      process.exitCode = 1;
    }
  });

program
  .command('mcp')
  .description('Start the MCP server on stdio')
  .action(async () => {
    const { createServer } = await import('./mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    await createServer().connect(new StdioServerTransport());
  });

const args = process.argv.slice(2);
const hasSubcommand = args.length > 0 && (args[0] === 'inspect' || args[0] === 'build' || args[0] === 'convert' || args[0] === 'read' || args[0] === 'mcp' || args[0] === 'help' || args[0] === '--help' || args[0] === '-h' || args[0] === '--version' || args[0] === '-V');

if (hasSubcommand) {
  program.parseAsync(process.argv);
} else {
  import('./tui.js').then(({ runInteractiveTUI }) => runInteractiveTUI()).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
