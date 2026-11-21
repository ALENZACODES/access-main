#!/usr/bin/env node
/** Manual, offline and read-only audit of two recorded release snapshots. */
import { Buffer } from 'node:buffer';
import { readFile, lstat, open, realpath } from 'node:fs/promises';
import { dirname, resolve, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareRegressionSnapshots, regressionGate } from './interaction-regression-compare.mjs';
import { parseRegressionSnapshot } from './interaction-regression-contract.mjs';
import { analyzeCoverage } from './interaction-regression-coverage.mjs';
import { reportByFormat } from './interaction-regression-report.mjs';

const MAX_FILE_BYTES = 8_000_000;
const ALLOWED_FORMATS = new Set(['text', 'json', 'csv', 'html']);

export const CLI_OPTIONS = Object.freeze([
  '--before', '--after', '--policy', '--language', '--format', '--output', '--today',
]);

export function parseCliArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) {
    return { ok: false, issues: ['ARGUMENTS_INVALID'], options: null };
  }
  if (argv.includes('--help') && argv.length === 1) {
    return { ok: true, help: true, issues: [], options: null };
  }
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!CLI_OPTIONS.includes(name) || typeof value !== 'string' ||
      !value.trim() || value.startsWith('--') || Object.hasOwn(args, name)) {
      return { ok: false, issues: ['ARGUMENT_INVALID'], options: null };
    }
    args[name] = value;
  }
  if (!args['--before'] || !args['--after']) {
    return { ok: false, issues: ['REQUIRED_PATHS'], options: null };
  }
  if (args['--before'] === args['--after']) {
    return { ok: false, issues: ['DUPLICATE_INPUT_PATH'], options: null };
  }
  const language = args['--language'] ?? 'en';
  const format = args['--format'] ?? 'text';
  if (!['en', 'fr'].includes(language) || !ALLOWED_FORMATS.has(format)) {
    return { ok: false, issues: ['FORMAT_OR_LANGUAGE'], options: null };
  }
  if (args['--today'] && !/^\d{4}-\d{2}-\d{2}$/u.test(args['--today'])) {
    return { ok: false, issues: ['DATE_INVALID'], options: null };
  }
  return { ok: true, help: false, issues: [], options: {
    before: args['--before'], after: args['--after'], policy: args['--policy'] ?? null,
    output: args['--output'] ?? null,
    language, format, today: args['--today'] ?? null,
  } };
}

export function cliHelp() {
  return 'Usage: node interaction-regression-cli.mjs --before FILE --after FILE ' +
    '[--policy FILE] [--language en|fr] [--format text|json|csv|html] ' +
    '[--output NEW_FILE] [--today YYYY-MM-DD]\n' +
    'Files stay on this device. This command does not fetch URLs or schedule tasks.\n';
}

export async function readSafeInput(file, maxBytes = MAX_FILE_BYTES) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('INPUT_PATH');
  const absolute = resolve(file);
  const pathSegments = absolute.split(sep).filter(Boolean);
  let current = absolute.startsWith(sep) ? sep : dirname(absolute);
  // Inspect every component; symlink parents are not allowed.
  if (absolute.startsWith(sep)) {
    for (const part of pathSegments) {
      current = resolve(current, part);
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error('SYMLINK_INPUT');
    }
  }
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
    throw new Error('INVALID_INPUT_FILE');
  }
  const resolved = await realpath(absolute);
  if (resolved !== absolute) throw new Error('INPUT_PATH_CHANGED');
  const content = await readFile(absolute, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > maxBytes) throw new Error('INPUT_BYTES');
  return content;
}

export async function writeNewFile(file, content) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('OUTPUT_PATH');
  const absolute = resolve(file);
  const parent = dirname(absolute);
  if (basename(absolute).startsWith('.')) throw new Error('HIDDEN_OUTPUT');
  const stat = await lstat(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('OUTPUT_PARENT');
  const handle = await open(absolute, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
  return absolute;
}

export async function runRegressionCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const args = parseCliArguments(argv);
  if (!args.ok) {
    stderr.write(`Input error: ${args.issues.join(', ')}\n`);
    return 2;
  }
  if (args.help) {
    stdout.write(cliHelp());
    return 0;
  }
  const options = args.options;
  let earlier;
  let later;
  let policy = null;
  try {
    const beforeText = await readSafeInput(options.before);
    const afterText = await readSafeInput(options.after);
    earlier = parseRegressionSnapshot(beforeText, { today: options.today });
    later = parseRegressionSnapshot(afterText, { today: options.today });
    if (options.policy) policy = JSON.parse(await readSafeInput(options.policy));
  } catch {
    stderr.write('Could not read the selected local input files.\n');
    return 2;
  }
  if (!earlier.ok || !later.ok) {
    stderr.write('Source record validation failed.\n');
    return 2;
  }
  const comparison = compareRegressionSnapshots(earlier.snapshot, later.snapshot, {
    today: options.today,
  });
  if (!comparison.ok) {
    stderr.write(`Could not compare recorded checks: ${comparison.issues.map((p) => p.code).join(', ')}\n`);
    return 2;
  }
  const coverage = policy ? analyzeCoverage(later.snapshot, policy, { today: options.today }) : null;
  if (coverage && !coverage.ok) {
    stderr.write('Coverage policy has missing or invalid values.\n');
    return 2;
  }
  const output = reportByFormat(comparison, coverage, {
    language: options.language, format: options.format,
  });
  if (!output.ok) {
    stderr.write('The report could not be created.\n');
    return 2;
  }
  if (options.output) {
    try {
      await writeNewFile(options.output, output.text);
    } catch {
      stderr.write('The output file already exists or cannot be created.\n');
      return 2;
    }
  } else stdout.write(output.text);
  return regressionGate(comparison).status === 'FAIL' ? 1 : 0;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  const code = await runRegressionCli(process.argv.slice(2));
  process.exitCode = code;
}
