/** Manual, bounded offline drill command. Does not run background workflows. */
import { readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { parseDrill, DRILL_LIMITS } from './offline-drill-core.mjs';
import { reportByFormat } from './offline-drill-report.mjs';
import { evaluateDrill } from './offline-drill-matrix.mjs';

export const FORMATS = Object.freeze(['text', 'csv', 'html', 'json']);
const OPTIONS = new Set(['--input', '--output', '--format', '--language', '--today', '--help']);
export function readOptions(argv) {
  if (!Array.isArray(argv)) return { ok: false, problem: 'ARGS_INVALID' };
  const options = Object.create(null);
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!OPTIONS.has(key) || Object.hasOwn(options, key)) {
      return { ok: false, problem: 'ARGS_INVALID' };
    }
    if (key === '--help') {
      if (argv.length !== 1) return { ok: false, problem: 'ARGS_INVALID' };
      return { ok: true, help: true, values: {} };
    }
    const value = argv[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) {
      return { ok: false, problem: 'ARGS_VALUE' };
    }
    options[key] = value;
  }
  if (!options['--input']) return { ok: false, problem: 'ARGS_INPUT' };
  if (options['--format'] && !FORMATS.includes(options['--format'])) {
    return { ok: false, problem: 'ARGS_FORMAT' };
  }
  if (options['--language'] && !['en', 'fr'].includes(options['--language'])) {
    return { ok: false, problem: 'ARGS_LANGUAGE' };
  }
  if (options['--today'] && !/^\d{4}-\d\d-\d\d$/u.test(options['--today'])) {
    return { ok: false, problem: 'ARGS_DATE' };
  }
  if (options['--output'] === options['--input']) {
    return { ok: false, problem: 'OUTPUT_EQUALS_INPUT' };
  }
  return { ok: true, help: false, values: {
    input: options['--input'], output: options['--output'] ?? null,
    format: options['--format'] ?? 'text',
    language: options['--language'] ?? 'en', today: options['--today'],
  } };
}
export function helpText() {
  return [
    'Offline Degradation Drill',
    'Use --input local.json [--format text|csv|html|json] [--language en|fr]',
    'Optional --output file writes a NEW file and never overwrites.',
    'Optional --today YYYY-MM-DD provides a deterministic date boundary.',
    'This command reads local captures only. UNKNOWN remains UNKNOWN.',
  ].join('\n') + '\n';
}
export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const fs = io.fs ?? { readFile, writeFile };
  const parsed = readOptions(argv);
  if (!parsed.ok) { stderr.write(`${parsed.problem}\n`); return 2; }
  if (parsed.help) { stdout.write(helpText()); return 0; }
  let input;
  try {
    input = await fs.readFile(parsed.values.input, 'utf8');
  } catch {
    stderr.write('INPUT_READ_FAILED\n'); return 2;
  }
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > DRILL_LIMITS.maxBytes) {
    stderr.write('INPUT_LIMIT\n'); return 2;
  }
  const options = { today: parsed.values.today };
  const decoded = parseDrill(input, options);
  if (!decoded.ok) {
    stderr.write(decoded.problems.map((x) => `${x.code} ${x.path}`).join('\n') + '\n');
    return 2;
  }
  const report = reportByFormat(decoded.document, parsed.values.format, parsed.values.language, options);
  if (typeof report !== 'string') { stderr.write('REPORT_INVALID\n'); return 2; }
  if (parsed.values.output) {
    try {
      await fs.writeFile(parsed.values.output, report, { flag: 'wx', mode: 0o600 });
    } catch { stderr.write('OUTPUT_WRITE_FAILED\n'); return 2; }
  } else stdout.write(report);
  const evaluated = evaluateDrill(decoded.document, options);
  return evaluated.ok ? 0 : 2;
}
export function isDirectEntrypoint(importUrl, invoked) {
  if (typeof invoked !== 'string' || !invoked) return false;
  try { return importUrl === pathToFileURL(invoked).href; }
  catch { return false; }
}
if (isDirectEntrypoint(import.meta.url, process.argv[1])) {
  const code = await runCli(process.argv.slice(2));
  if (code) process.exitCode = code;
}
