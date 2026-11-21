/** Manual, offline-only export command for human evidence disagreement review. */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegister, CONFLICT_LIMITS } from './offline-conflict-contract.mjs';
import { reportByFormat, deltaTextReport } from './offline-conflict-report.mjs';

export const CLI_OPTIONS = Object.freeze(['--input', '--before', '--output', '--format', '--lang', '--today', '--help']);
const OPTION_SET = new Set(CLI_OPTIONS);
const FORMAT = new Set(['text', 'html', 'csv', 'json']);
const LANGUAGE = new Set(['en', 'fr']);
export function parseCliArgs(args) {
  if (!Array.isArray(args) || args.some(x => typeof x !== 'string')) return { ok: false, error: 'ARGUMENTS' };
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!OPTION_SET.has(name) || Object.hasOwn(result, name)) return { ok: false, error: 'OPTION' };
    if (name === '--help') { result.help = true; continue; }
    const value = args[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) return { ok: false, error: 'VALUE' };
    result[name] = value;
  }
  if (result.help) return { ok: true, help: true };
  if (!result['--input']) return { ok: false, error: 'INPUT_REQUIRED' };
  if (result['--format'] && !FORMAT.has(result['--format'])) return { ok: false, error: 'FORMAT' };
  if (result['--lang'] && !LANGUAGE.has(result['--lang'])) return { ok: false, error: 'LANGUAGE' };
  if (result['--before'] && result['--format'] && result['--format'] !== 'text') return { ok: false, error: 'DELTA_FORMAT' };
  return { ok: true, input: result['--input'], previous: result['--before'] ?? null,
    output: result['--output'] ?? null, format: result['--format'] ?? 'text',
    language: result['--lang'] ?? 'en', today: result['--today'] ?? null };
}
export function usage() {
  return 'Usage: node offline-conflict-cli.mjs --input register.json [--before older.json] [--output report.txt] [--format text|csv|html|json] [--lang en|fr] [--today YYYY-MM-DD]\n';
}
async function safeWalk(file, lastMustExist) {
  if (typeof file !== 'string' || !file || file.includes('\u0000')) return false;
  const resolved = resolve(file);
  const root = parse(resolved).root;
  const rest = resolved.slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < rest.length; index += 1) {
    current = resolve(current, rest[index]);
    try {
      const meta = await lstat(current);
      if (meta.isSymbolicLink()) return false;
      if (index !== rest.length - 1 && !meta.isDirectory()) return false;
      if (index === rest.length - 1 && lastMustExist && !meta.isFile()) return false;
      if (index === rest.length - 1 && !lastMustExist) return false;
    } catch (error) {
      if (error.code !== 'ENOENT' || index !== rest.length - 1 || lastMustExist) return false;
    }
  }
  return true;
}
export async function readRegisterFile(path, options = {}) {
  if (!await safeWalk(path, true)) return { ok: false, problems: [{ code: 'FILE_PATH', path: '/' }], value: null };
  let data;
  try { data = await readFile(resolve(path)); }
  catch { return { ok: false, problems: [{ code: 'FILE_READ', path: '/' }], value: null }; }
  if (data.byteLength > CONFLICT_LIMITS.bytes) return { ok: false, problems: [{ code: 'INPUT_SIZE', path: '/' }], value: null };
  return parseRegister(data.toString('utf8'), options);
}
export async function writeNewReport(path, content) {
  if (!await safeWalk(path, false)) return false;
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 12_000_000) return false;
  try {
    await writeFile(resolve(path), content, { flag: 'wx', mode: 0o600 });
    return true;
  } catch { return false; }
}
export async function runConflictCli(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const parsed = parseCliArgs(args);
  if (!parsed.ok) { stderr.write(`Invalid input: ${parsed.error}\n${usage()}`); return 2; }
  if (parsed.help) { stdout.write(usage()); return 0; }
  const options = parsed.today ? { today: parsed.today } : {};
  const input = await readRegisterFile(parsed.input, options);
  if (!input.ok) { stderr.write('The supplied evidence register was not accepted.\n'); return 2; }
  let report;
  if (parsed.previous) {
    const older = await readRegisterFile(parsed.previous, options);
    if (!older.ok) { stderr.write('The earlier register was not accepted.\n'); return 2; }
    report = deltaTextReport(older.value, input.value, parsed.language, options);
  } else report = reportByFormat(input.value, parsed.format, parsed.language, options);
  if (!report.ok) { stderr.write('The requested report could not be created.\n'); return 2; }
  if (parsed.output) {
    if (!await writeNewReport(parsed.output, report.text)) {
      stderr.write('Output must be a new regular file in an existing directory.\n');
      return 2;
    }
  } else stdout.write(report.text);
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runConflictCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 2; });
}
