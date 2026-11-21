/** Explicit user-run audit handoff reader; no network calls or automatic exports. */
import { open, lstat, realpath, readFile } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChain, MAX_BYTES, validDay } from './offline-receipt-chain.mjs';
import { renderReceiptChain } from './offline-receipt-chain-report.mjs';
const KEYS = new Set(['--after', '--before', '--format', '--language', '--output', '--today']);
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) return { ok: false, code: 'ARGUMENTS' };
  const args = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!KEYS.has(k) || typeof v !== 'string' || !v || Object.hasOwn(args, k)) return { ok: false, code: 'ARGUMENTS' };
    args[k] = v;
  }
  if (!args['--after'] || !['html', 'json', 'csv', 'text'].includes(args['--format'] ?? 'html') || !['en', 'fr'].includes(args['--language'] ?? 'en') || !validDay(args['--today'] ?? new Date().toISOString().slice(0,10))) return { ok: false, code: 'ARGUMENTS' };
  return { ok: true, args };
}
export async function readLocal(filename) {
  if (typeof filename !== 'string' || filename.includes('\0')) throw new Error('UNSAFE_INPUT');
  const full = resolve(filename);
  const st = await lstat(full);
  if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_BYTES) throw new Error('UNSAFE_INPUT');
  if (await realpath(full) !== full) throw new Error('UNSAFE_INPUT');
  return readFile(full, 'utf8');
}
export async function writeNew(filename, body) {
  if (typeof filename !== 'string' || filename.includes('\0') || typeof body !== 'string') throw new Error('UNSAFE_OUTPUT');
  const full = resolve(filename), parent = dirname(full);
  if (await realpath(parent) !== parent || basename(full) === '.' || basename(full) === '..') throw new Error('UNSAFE_OUTPUT');
  const handle = await open(full, 'wx', 0o600);
  try { await handle.writeFile(body, 'utf8'); } finally { await handle.close(); }
  return full;
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { stderr.write('ARGUMENTS: --after file [--before file] [--format html|json|csv|text] [--language en|fr] [--today YYYY-MM-DD] [--output new-file]\n'); return 2; }
  const a = parsed.args, today = a['--today'] ?? new Date().toISOString().slice(0,10);
  try {
    const after = parseChain(await readLocal(a['--after']), { today });
    if (!after.ok) { stderr.write(`INVALID_AFTER ${after.issues.map(x => x.code).join(',')}\n`); return 2; }
    const before = a['--before'] ? parseChain(await readLocal(a['--before']), { today }) : null;
    if (before && !before.ok) { stderr.write(`INVALID_BEFORE ${before.issues.map(x => x.code).join(',')}\n`); return 2; }
    const result = renderReceiptChain(after.value, { before: before?.value, language: a['--language'] ?? 'en', format: a['--format'] ?? 'html', today });
    if (!result.ok) { stderr.write('INVALID_RENDER_OPTIONS\n'); return 2; }
    if (a['--output']) await writeNew(a['--output'], result.text);
    else stdout.write(result.text);
    return 0;
  } catch (error) { stderr.write(`LOCAL_IO_ERROR ${error.code ?? error.message}\n`); return 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
