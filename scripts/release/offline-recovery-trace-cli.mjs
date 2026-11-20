/** Read-only offline trace audit and create-only exports. No timers or network. */
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { formatRecoveryDocument, comparisonText, coverageText, triageText } from './offline-recovery-trace-report.mjs';
import { analyzeRecoveryTraces } from './offline-recovery-trace-analysis.mjs';
import { parseTraceDocument, TRACE_LIMITS } from './offline-recovery-trace-contract.mjs';

export const CLI_COMMANDS = Object.freeze(['audit', 'compare', 'coverage', 'triage']);
export function parseArgs(argv) {
  if (!Array.isArray(argv)) return { ok: false, error: 'ARGUMENTS' };
  if (argv.includes('--help')) return { ok: true, help: true };
  const command = argv[0] ?? 'audit';
  if (!CLI_COMMANDS.includes(command)) return { ok: false, error: 'COMMAND' };
  const result = { command, locale: 'en', format: 'text', input: null, previous: null, output: null };
  const keys = new Map([['--input','input'],['--previous','previous'],['--output','output'],
    ['--locale','locale'],['--format','format']]);
  for (let i = 1; i < argv.length; i += 2) {
    const key = keys.get(argv[i]);
    if (!key || i + 1 >= argv.length || result[key] !== null &&
      !['locale','format'].includes(key)) return { ok: false, error: 'ARGUMENTS' };
    result[key] = argv[i + 1];
  }
  if (!result.input || command === 'compare' && !result.previous ||
    !['en','fr'].includes(result.locale) || !['text','json','html','csv'].includes(result.format)) {
    return { ok: false, error: 'ARGUMENTS' };
  }
  if (command !== 'audit' && result.format !== 'text') return { ok: false, error: 'FORMAT' };
  return { ok: true, ...result };
}
export async function safeRead(path) {
  if (typeof path !== 'string' || !path.trim()) return { ok: false, error: 'PATH' };
  try {
    const absolute = resolve(path);
    const stats = await lstat(absolute);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > TRACE_LIMITS.bytes) {
      return { ok: false, error: 'INPUT_FILE' };
    }
    const actual = await realpath(absolute);
    if (actual !== absolute) return { ok: false, error: 'INPUT_SYMLINK' };
    const contents = await readFile(absolute, 'utf8');
    if (Buffer.byteLength(contents, 'utf8') > TRACE_LIMITS.bytes) return { ok: false, error: 'INPUT_BYTES' };
    return { ok: true, text: contents };
  } catch { return { ok: false, error: 'INPUT_FILE' }; }
}
export async function safeWrite(path, text) {
  if (typeof path !== 'string' || !path.trim() || !text ||
      Buffer.byteLength(text, 'utf8') > 12_000_000) return { ok: false, error: 'OUTPUT_FILE' };
  try {
    const target = resolve(path);
    const parent = resolve(dirname(target));
    if (await realpath(parent) !== parent || basename(target).startsWith('.')) {
      return { ok: false, error: 'OUTPUT_PATH' };
    }
    await writeFile(target, text, { flag: 'wx', mode: 0o600 });
    return { ok: true };
  } catch { return { ok: false, error: 'OUTPUT_FILE' }; }
}
export async function runRecoveryCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const args = parseArgs(argv);
  if (!args.ok) { stderr.write(`Invalid arguments: ${args.error}\n`); return 2; }
  if (args.help) {
    stdout.write('Usage: offline-recovery-trace-cli.mjs audit|compare|coverage|triage --input FILE ' +
      '[--previous FILE] [--locale en|fr] [--format text|html|csv|json] [--output FILE]\n');
    return 0;
  }
  const input = await safeRead(args.input);
  if (!input.ok) { stderr.write(`Input unavailable: ${input.error}\n`); return 2; }
  const parsed = parseTraceDocument(input.text);
  if (!parsed.ok) { stderr.write(`Invalid trace document: ${parsed.problems.map((x)=>x.code).join(',')}\n`); return 2; }
  const document = JSON.parse(input.text);
  let report;
  if (args.command === 'compare') {
    const previous = await safeRead(args.previous);
    if (!previous.ok) { stderr.write(`Previous input unavailable: ${previous.error}\n`); return 2; }
    if (!parseTraceDocument(previous.text).ok) { stderr.write('Previous trace document invalid\n'); return 2; }
    report = comparisonText(JSON.parse(previous.text), document, args.locale);
  } else if (args.command === 'coverage') report = coverageText(document, args.locale);
  else if (args.command === 'triage') report = triageText(document, args.locale);
  else report = formatRecoveryDocument(document, args.format, args.locale).text;
  if (report === null) { stderr.write('Unable to create report\n'); return 2; }
  if (args.output) {
    const saved = await safeWrite(args.output, report);
    if (!saved.ok) { stderr.write(`Output unavailable: ${saved.error}\n`); return 2; }
  } else stdout.write(report);
  const check = analyzeRecoveryTraces(document);
  return check.ok ? 0 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runRecoveryCli(process.argv.slice(2));
}
