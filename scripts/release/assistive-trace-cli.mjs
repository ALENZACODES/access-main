/** Manual CLI for reading local captures, no scheduling or network. */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { dirname, resolve, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTrace } from './assistive-trace-contract.mjs';
import { exportReport } from './assistive-trace-report.mjs';
import { compareReplays } from './assistive-trace-replay.mjs';

export const CLI_MODES = Object.freeze(['report', 'compare']);
const ARGUMENTS = new Set(['--input', '--previous', '--output', '--format', '--locale', '--today', '--help']);
export function parseArgs(argv) {
  const args = { input: null, previous: null, output: null, format: 'text', locale: 'en', today: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!ARGUMENTS.has(key)) return { ok: false, code: 'ARGUMENT_UNKNOWN', args: null };
    if (key === '--help') { args.help = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) return { ok: false, code: 'ARGUMENT_VALUE', args: null };
    const field = key.slice(2);
    if (args[field] !== null && !['format', 'locale'].includes(field)) return { ok: false, code: 'ARGUMENT_DUPLICATE', args: null };
    args[field] = value;
  }
  if (args.help) return { ok: true, code: null, args };
  if (!args.input) return { ok: false, code: 'INPUT_REQUIRED', args: null };
  if (!['json', 'html', 'csv', 'text'].includes(args.format)) return { ok: false, code: 'FORMAT_INVALID', args: null };
  if (!['fr', 'en'].includes(args.locale)) return { ok: false, code: 'LOCALE_INVALID', args: null };
  if (args.previous && args.format !== 'json') return { ok: false, code: 'COMPARE_JSON_ONLY', args: null };
  return { ok: true, code: null, args };
}
export async function safeInput(path) {
  const absolute = resolve(path);
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) return { ok: false, code: 'INPUT_UNSAFE', text: null };
    const canonical = await realpath(absolute);
    if (canonical !== absolute) return { ok: false, code: 'INPUT_UNSAFE', text: null };
    const text = await readFile(absolute, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 8_000_000) return { ok: false, code: 'INPUT_LIMIT', text: null };
    return { ok: true, code: null, text };
  } catch { return { ok: false, code: 'INPUT_READ', text: null }; }
}
export async function safeOutput(path, text) {
  const absolute = resolve(path);
  if (basename(absolute).startsWith('.')) return { ok: false, code: 'OUTPUT_UNSAFE' };
  try {
    const dir = dirname(absolute);
    const canonical = await realpath(dir);
    if (canonical !== dir || !absolute.startsWith(canonical + sep)) return { ok: false, code: 'OUTPUT_UNSAFE' };
    await writeFile(absolute, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return { ok: true, code: null };
  } catch { return { ok: false, code: 'OUTPUT_WRITE' }; }
}
export async function runCli(argv, io = process) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { io.stderr.write(`${parsed.code}\n`); return 2; }
  if (parsed.args.help) { io.stdout.write('Usage: --input path [--previous path] [--format text|html|csv|json] [--locale en|fr] [--output path]\n'); return 0; }
  const input = await safeInput(parsed.args.input);
  if (!input.ok) { io.stderr.write(`${input.code}\n`); return 2; }
  const options = parsed.args.today ? { today: parsed.args.today } : {};
  const current = parseTrace(input.text, options);
  if (!current.ok) { io.stderr.write(`${current.problems.map((p) => p.code).join(',')}\n`); return 2; }
  let result;
  if (parsed.args.previous) {
    const oldFile = await safeInput(parsed.args.previous);
    if (!oldFile.ok) { io.stderr.write(`${oldFile.code}\n`); return 2; }
    const prior = parseTrace(oldFile.text, options);
    if (!prior.ok) { io.stderr.write(`${prior.problems.map((p) => p.code).join(',')}\n`); return 2; }
    const compared = compareReplays(prior.document, current.document, options);
    if (!compared.ok) { io.stderr.write('COMPARE_INVALID\n'); return 2; }
    result = JSON.stringify(compared, null, 2) + '\n';
  } else {
    const exported = exportReport(current.document, parsed.args.format, parsed.args.locale, options);
    if (!exported.ok) { io.stderr.write(`${exported.problems.map((p) => p.code).join(',')}\n`); return 2; }
    result = exported.content;
  }
  if (parsed.args.output) {
    const output = await safeOutput(parsed.args.output, result);
    if (!output.ok) { io.stderr.write(`${output.code}\n`); return 2; }
  } else io.stdout.write(result);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, () => { process.exitCode = 2; });
}
