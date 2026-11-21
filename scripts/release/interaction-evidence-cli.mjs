/** Opt-in local file renderer; no server calls or automatic filesystem scanning. */
import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { day, LIMITS, parse } from './interaction-evidence-contract.mjs';
import { render } from './interaction-evidence-report.mjs';
const FLAGS = new Set(['--after', '--before', '--output', '--language', '--format', '--today']);
export function args(argv) {
  if (!Array.isArray(argv) || !argv.length || argv.length % 2) return { ok: false, error: 'ARGUMENTS' };
  const values = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i], value = argv[i + 1];
    if (!FLAGS.has(name) || typeof value !== 'string' || !value || Object.hasOwn(values, name)) return { ok: false, error: 'ARGUMENTS' };
    values[name] = value;
  }
  if (!values['--after'] || !['html', 'text', 'json', 'csv'].includes(values['--format'] ?? 'html') ||
    !['en', 'fr'].includes(values['--language'] ?? 'en') || !day(values['--today'] ?? new Date().toISOString().slice(0, 10))) return { ok: false, error: 'ARGUMENTS' };
  return { ok: true, values };
}
export async function safeRead(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const file = resolve(path), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.bytes || await realpath(file) !== file) throw Error('UNSAFE_INPUT');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > LIMITS.bytes || stat.dev !== info.dev || stat.ino !== info.ino) throw Error('UNSAFE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function safeWrite(path, content) {
  if (typeof path !== 'string' || !path || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const file = resolve(path), dir = dirname(file);
  if (await realpath(dir) !== dir || !basename(file) || basename(file) === '.' || basename(file) === '..') throw Error('UNSAFE_OUTPUT');
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
  return file;
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const input = args(argv);
  if (!input.ok) { stderr.write('ARGUMENTS: --after FILE [--before FILE] [--language en|fr] [--format html|text|csv|json] [--today YYYY-MM-DD] [--output NEW_FILE]\n'); return 2; }
  const v = input.values, today = v['--today'] ?? new Date().toISOString().slice(0, 10);
  try {
    const after = parse(await safeRead(v['--after']), { today });
    if (!after.ok) { stderr.write(`INVALID_AFTER ${after.issues.map(x => x.code).join(',')}\n`); return 2; }
    const before = v['--before'] ? parse(await safeRead(v['--before']), { today }) : null;
    if (before && !before.ok) { stderr.write(`INVALID_BEFORE ${before.issues.map(x => x.code).join(',')}\n`); return 2; }
    const report = render(after.value, { before: before?.value, today, language: v['--language'] ?? 'en', format: v['--format'] ?? 'html' });
    if (!report.ok) { stderr.write(`INVALID_REPORT ${report.issues.map(x => x.code).join(',')}\n`); return 2; }
    if (v['--output']) await safeWrite(v['--output'], report.text);
    else stdout.write(report.text);
    return 0;
  } catch (error) { stderr.write(`LOCAL_ERROR ${error.code ?? error.message}\n`); return 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
