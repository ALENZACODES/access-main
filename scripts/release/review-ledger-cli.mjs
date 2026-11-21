/** Explicit manual CLI. No network, telemetry, credential handling or scheduling. */
import { lstat, realpath, readFile, open } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BYTES, validDay, parseLedger } from './review-ledger-contract.mjs';
import { renderReport } from './review-ledger-report.mjs';
import { compareLedgers } from './review-ledger-compare.mjs';
import { reviewQueue } from './review-ledger-queue.mjs';
const FLAGS = new Set(['--after', '--before', '--output', '--format', '--language', '--today', '--mode']);
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length % 2 !== 0) return { ok: false, error: 'ARGUMENTS' };
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index], value = argv[index + 1];
    if (!FLAGS.has(name) || typeof value !== 'string' || !value || Object.hasOwn(args, name)) return { ok: false, error: 'ARGUMENTS' };
    args[name] = value;
  }
  if (!args['--after']) return { ok: false, error: 'AFTER_REQUIRED' };
  if (!['html', 'text', 'csv', 'json'].includes(args['--format'] ?? 'html')) return { ok: false, error: 'FORMAT_INVALID' };
  if (!['en', 'fr'].includes(args['--language'] ?? 'en')) return { ok: false, error: 'LANGUAGE_INVALID' };
  if (!['report', 'queue', 'compare'].includes(args['--mode'] ?? 'report')) return { ok: false, error: 'MODE_INVALID' };
  if (!validDay(args['--today'] ?? new Date().toISOString().slice(0, 10))) return { ok: false, error: 'TODAY_INVALID' };
  if (args['--mode'] === 'compare' && !args['--before']) return { ok: false, error: 'BEFORE_REQUIRED' };
  return { ok: true, args };
}
export async function safeRead(path) {
  if (typeof path !== 'string' || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const full = resolve(path);
  const stats = await lstat(full);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_BYTES) throw Error('UNSAFE_INPUT');
  if (await realpath(full) !== full) throw Error('UNSAFE_INPUT');
  const handle = await open(full, 'r');
  try {
    const safeStats = await handle.stat();
    if (!safeStats.isFile() || safeStats.size > MAX_BYTES || safeStats.ino !== stats.ino || safeStats.dev !== stats.dev) throw Error('UNSAFE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function safeWrite(path, content) {
  if (typeof path !== 'string' || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const full = resolve(path), parent = dirname(full);
  if (await realpath(parent) !== parent || !basename(full) || basename(full) === '.') throw Error('UNSAFE_OUTPUT');
  const handle = await open(full, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
  return full;
}
function explain(issues) { return JSON.stringify(issues.map(({ code, path }) => ({ code, path }))); }
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { stderr.write(`ARGUMENTS ${parsed.error}: --after FILE [--before FILE] [--mode report|compare|queue] [--format html|text|csv|json] [--language en|fr] [--today YYYY-MM-DD] [--output NEW_FILE]\n`); return 2; }
  const args = parsed.args;
  const today = args['--today'] ?? new Date().toISOString().slice(0, 10);
  try {
    const after = parseLedger(await safeRead(args['--after']), { today });
    if (!after.ok) { stderr.write(`INVALID_AFTER ${explain(after.issues)}\n`); return 2; }
    let before = null;
    if (args['--before']) {
      before = parseLedger(await safeRead(args['--before']), { today });
      if (!before.ok) { stderr.write(`INVALID_BEFORE ${explain(before.issues)}\n`); return 2; }
    }
    const mode = args['--mode'] ?? 'report';
    let output;
    if (mode === 'compare') {
      const result = compareLedgers(before.value, after.value, { today });
      if (!result.ok) { stderr.write(`INVALID_COMPARISON ${explain(result.issues)}\n`); return 2; }
      output = `${JSON.stringify(result, null, 2)}\n`;
    } else if (mode === 'queue') {
      const result = reviewQueue(after.value, { today });
      if (!result.ok) { stderr.write(`INVALID_QUEUE ${explain(result.issues)}\n`); return 2; }
      output = `${JSON.stringify(result, null, 2)}\n`;
    } else {
      const rendered = renderReport(after.value, { before: before?.value ?? null, language: args['--language'] ?? 'en', format: args['--format'] ?? 'html', today });
      if (!rendered.ok) { stderr.write(`INVALID_REPORT ${explain(rendered.issues)}\n`); return 2; }
      output = rendered.text;
    }
    if (args['--output']) await safeWrite(args['--output'], output);
    else stdout.write(output);
    return 0;
  } catch (cause) { stderr.write(`IO_ERROR ${cause.code ?? cause.message}\n`); return 2; }
}
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
