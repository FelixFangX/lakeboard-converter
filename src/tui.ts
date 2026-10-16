import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { select, input, confirm, search, Separator } from '@inquirer/prompts';
import { convertFile } from './index.js';
import type { MarkdownStyle } from './core/types.js';

const SUPPORTED_EXTENSIONS = ['.lakeboard', '.xmind'];

// ─── Colors (ANSI escape sequences, no dependency needed) ───

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ─── File browser ───

interface FileEntry {
  name: string;
  fullPath: string;
  isDir: boolean;
  ext: string;
}

async function listDir(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    const ext = isDir ? '' : path.extname(entry.name).toLowerCase();
    result.push({ name: entry.name, fullPath, isDir, ext });
  }

  result.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

async function scanForFiles(
  dirPath: string,
  maxDepth = 3,
  currentDepth = 0,
): Promise<FileEntry[]> {
  if (currentDepth > maxDepth) return [];

  const found: FileEntry[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const deeper = await scanForFiles(fullPath, maxDepth, currentDepth + 1);
        found.push(...deeper);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          found.push({ name: entry.name, fullPath, isDir: false, ext });
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }

  return found;
}

// ─── Banner ───

function printBanner(): void {
  console.log();
  console.log(bold('  ╔══════════════════════════════════════════╗'));
  console.log(bold('  ║') + cyan('   🗺  MindMap Converter  v0.2.0          ') + bold('║'));
  console.log(bold('  ║') + dim('   .lakeboard / .xmind → Markdown        ') + bold('║'));
  console.log(bold('  ╚══════════════════════════════════════════╝'));
  console.log();
}

// ─── Step: Select input file ───

async function selectInputFile(): Promise<string> {
  const cwd = process.cwd();

  const quickScan = await scanForFiles(cwd, 3);

  if (quickScan.length > 0) {
    const mode = await select({
      message: 'How do you want to choose the input file?',
      choices: [
        {
          name: `Pick from files found in the current directory ${dim(`(${quickScan.length} found)`)}`,
          value: 'auto' as const,
        },
        { name: 'Enter a file path', value: 'manual' as const },
        { name: 'Browse directories', value: 'browse' as const },
      ],
    });

    if (mode === 'auto') {
      const filePath = await search({
        message: 'Choose a file to convert:',
        source: async (term) => {
          const filtered = term
            ? quickScan.filter((f) => f.fullPath.toLowerCase().includes(term.toLowerCase()))
            : quickScan;

          return filtered.map((f) => {
            const rel = path.relative(cwd, f.fullPath);
            const badge = f.ext === '.xmind' ? magenta('[XMind]') : cyan('[Lakeboard]');
            return {
              name: `${badge} ${rel}`,
              value: f.fullPath,
            };
          });
        },
      });
      return filePath;
    }

    if (mode === 'manual') {
      return inputFilePath();
    }

    return browseForFile(cwd);
  }

  const mode = await select({
    message: 'No .lakeboard / .xmind files found in the current directory',
    choices: [
      { name: 'Enter a file path', value: 'manual' as const },
      { name: 'Browse directories', value: 'browse' as const },
    ],
  });

  if (mode === 'manual') {
    return inputFilePath();
  }

  return browseForFile(cwd);
}

async function inputFilePath(): Promise<string> {
  const filePath = await input({
    message: 'File path:',
    validate: async (value) => {
      if (!value.trim()) return 'Please enter a file path';
      const resolved = path.resolve(value.trim());
      const ext = path.extname(resolved).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return `Unsupported file format: ${ext} (supported: ${SUPPORTED_EXTENSIONS.join(', ')})`;
      }
      try {
        const s = await stat(resolved);
        if (!s.isFile()) return 'Path is not a file';
      } catch {
        return 'File does not exist';
      }
      return true;
    },
  });

  return path.resolve(filePath.trim());
}

async function browseForFile(startDir: string): Promise<string> {
  let currentDir = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const entries = await listDir(currentDir);

    const supportedFiles = entries.filter((e) => !e.isDir && SUPPORTED_EXTENSIONS.includes(e.ext));
    const dirs = entries.filter((e) => e.isDir);

    type BrowseChoice = { name: string; value: string; description?: string };

    const choices: (BrowseChoice | Separator)[] = [];

    if (currentDir !== path.parse(currentDir).root) {
      choices.push({ name: `${dim('..')} ${dim('(parent directory)')}`, value: '__PARENT__' });
    }

    if (supportedFiles.length > 0) {
      choices.push(new Separator(dim('── Convertible files ──')));
      for (const f of supportedFiles) {
        const badge = f.ext === '.xmind' ? magenta('[XMind]') : cyan('[LB]');
        choices.push({ name: `${badge} ${f.name}`, value: f.fullPath });
      }
    }

    if (dirs.length > 0) {
      choices.push(new Separator(dim('── Directories ──')));
      for (const d of dirs) {
        choices.push({ name: `📁 ${d.name}/`, value: `__DIR__:${d.fullPath}` });
      }
    }

    if (choices.length === 0) {
      console.log(yellow('  This directory is empty'));
      currentDir = path.dirname(currentDir);
      continue;
    }

    const selected = await select({
      message: `Browse: ${dim(currentDir)}`,
      choices,
      pageSize: 20,
    });

    if (selected === '__PARENT__') {
      currentDir = path.dirname(currentDir);
      continue;
    }

    if (typeof selected === 'string' && selected.startsWith('__DIR__:')) {
      currentDir = selected.slice(7);
      continue;
    }

    return selected;
  }
}

// ─── Step: Select output format ───

async function selectFormat(): Promise<'md' | 'xmind' | 'both'> {
  return select({
    message: 'Export format:',
    choices: [
      {
        name: `${green('Markdown')} ${dim('.md')}`,
        value: 'md' as const,
        description: 'Export as a Markdown file',
      },
      {
        name: `${magenta('XMind')} ${dim('.xmind')}`,
        value: 'xmind' as const,
        description: 'Export as an XMind file',
      },
      {
        name: `${green('Markdown')} + ${magenta('XMind')} ${dim('(both)')}`,
        value: 'both' as const,
        description: 'Export both Markdown and XMind',
      },
    ],
    default: 'md',
  });
}

// ─── Step: Select markdown style ───

async function selectMarkdownStyle(): Promise<MarkdownStyle> {
  return select({
    message: 'Markdown style:',
    choices: [
      {
        name: `Generic Markdown ${dim('(H1 title + nested list)')}`,
        value: 'generic' as const,
        description: 'Root node as H1, children as a nested list, with notes and links',
      },
      {
        name: `XMind import style ${dim('(plain nested list, one line per node)')}`,
        value: 'xmind' as const,
        description: 'Nested list format suited for importing into XMind',
      },
    ],
    default: 'generic',
  });
}

// ─── Step: Select output directory ───

async function selectOutputDir(inputPath: string): Promise<string | undefined> {
  const inputDir = path.dirname(inputPath);

  const choice = await select({
    message: 'Output location:',
    choices: [
      {
        name: `Same directory as the input file ${dim(`(${inputDir})`)}`,
        value: 'same' as const,
      },
      {
        name: 'Custom output directory',
        value: 'custom' as const,
      },
    ],
    default: 'same',
  });

  if (choice === 'same') return undefined;

  const outDir = await input({
    message: 'Output directory path:',
    default: './output',
    validate: (value) => {
      if (!value.trim()) return 'Please enter a directory path';
      return true;
    },
  });

  return outDir.trim();
}

// ─── Step: Overwrite ───

async function askOverwrite(): Promise<boolean> {
  return confirm({
    message: 'Overwrite output files if they already exist?',
    default: true,
  });
}

// ─── Print result ───

function printResult(
  outputs: string[],
  nodeCount: number,
  maxDepth: number,
  elapsed: number,
): void {
  console.log();
  console.log(green(bold('  ✔ Conversion complete')));
  console.log();
  console.log(`  ${dim('Nodes:')}     ${bold(String(nodeCount))}`);
  console.log(`  ${dim('Max depth:')} ${bold(String(maxDepth))}`);
  console.log(`  ${dim('Time:')}      ${bold(`${elapsed}ms`)}`);
  console.log();

  for (const output of outputs) {
    const ext = path.extname(output).toLowerCase();
    const icon = ext === '.xmind' ? magenta('◆') : green('◆');
    console.log(`  ${icon} ${path.relative(process.cwd(), output)}`);
  }

  console.log();
}

// ─── Main TUI loop ───

export async function runInteractiveTUI(): Promise<void> {
  printBanner();

  let continueLoop = true;

  while (continueLoop) {
    try {
      const inputFile = await selectInputFile();
      console.log(dim(`  → Selected: ${path.relative(process.cwd(), inputFile)}`));
      console.log();

      const format = await selectFormat();

      let markdownStyle: MarkdownStyle = 'generic';
      if (format === 'md' || format === 'both') {
        markdownStyle = await selectMarkdownStyle();
      }

      const outDir = await selectOutputDir(inputFile);
      const overwrite = await askOverwrite();

      console.log();
      console.log(dim('  Converting...'));

      const start = Date.now();
      const result = await convertFile({
        input: inputFile,
        format,
        markdownStyle,
        outDir,
        overwrite,
      });
      const elapsed = Date.now() - start;

      printResult(result.outputs, result.nodeCount, result.maxDepth, elapsed);

      continueLoop = await confirm({
        message: 'Convert another file?',
        default: false,
      });

      if (continueLoop) {
        console.log();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('User force closed') ||
          error.message.includes('ExitPromptError'))
      ) {
        console.log();
        console.log(dim('  Exited'));
        process.exit(0);
      }

      console.log();
      console.log(red(`  ✖ Error: ${error instanceof Error ? error.message : String(error)}`));
      console.log();

      continueLoop = await confirm({
        message: 'Try again?',
        default: true,
      }).catch(() => false);
    }
  }

  console.log();
  console.log(dim('  Thanks for using MindMap Converter 👋'));
  console.log();
}
