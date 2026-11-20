/** User-invoked review; no uploads, telemetry, network, or scheduled work. */
import { lstat, readFile, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, MAX_BYTES, day } from './offline-evidence-review-contract.mjs';
import { render } from './offline-evidence-review-report.mjs';
const KNOWN = new Set(['--after', '--before', '--output', '--format', '--language', '--today']);
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length % 2) return { ok: false, error: 'ARGUMENTS' };
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!KNOWN.has(k) || typeof v !== 'string' || !v || Object.hasOwn(args, k)) return { ok: false, error: 'ARGUMENTS' };
    args[k] = v;
  }
  if (!args['--after'] || !['html', 'text', 'json', 'csv'].includes(args['--format'] ?? 'html') || !['en', 'fr'].includes(args['--language'] ?? 'en') || !day(args['--today'] ?? new Date().toISOString().slice(0, 10))) return { ok: false, error: 'ARGUMENTS' };
  return { ok: true, args };
}
export async function safeRead(path) {
  if (typeof path !== 'string' || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const full = resolve(path), stat = await lstat(full);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw Error('UNSAFE_INPUT');
  if (await realpath(full) !== full) throw Error('UNSAFE_INPUT');
  return readFile(full, 'utf8');
}
export async function safeWrite(path, content) {
  if (typeof path !== 'string' || path.includes('\0')) throw Error('UNSAFE_OUTPUT');
  const full = resolve(path), parent = dirname(full);
  if (await realpath(parent) !== parent || !basename(full) || basename(full) === '.') throw Error('UNSAFE_OUTPUT');
  const handle = await open(full, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const input = parseArgs(argv);
  if (!input.ok) { stderr.write('ARGUMENTS: --after file [--before file] [--output new-file] [--format html|json|csv|text] [--language en|fr] [--today YYYY-MM-DD]\n'); return 2; }
  const x = input.args, today = x['--today'] ?? new Date().toISOString().slice(0, 10);
  try {
    const after = parse(await safeRead(x['--after']), { today });
    if (!after.ok) { stderr.write(`INVALID_AFTER ${JSON.stringify(after.issues)}\n`); return 2; }
    let before = null;
    if (x['--before']) {
      before = parse(await safeRead(x['--before']), { today });
      if (!before.ok) { stderr.write(`INVALID_BEFORE ${JSON.stringify(before.issues)}\n`); return 2; }
    }
    const result = render(after.value, { before: before?.value, language: x['--language'] ?? 'en', format: x['--format'] ?? 'html', today });
    if (!result.ok) { stderr.write('RENDER_ERROR\n'); return 2; }
    if (x['--output']) await safeWrite(x['--output'], result.text);
    else stdout.write(result.text);
    return 0;
  } catch (error) { stderr.write(`READ_WRITE_ERROR ${error.code ?? error.message}\n`); return 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
