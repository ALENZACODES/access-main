/** User-invoked only: no network, no telemetry, no periodic work. */
import { lstat, realpath, readFile, open } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validDate, parseInventory, matrix } from './offline-coverage-matrix.mjs';
import { exportMatrix } from './offline-coverage-report.mjs';
const KEYS = new Set(['--input', '--output', '--today', '--format', '--language', '--stale-days']);
export function parseArgs(args) {
  if (!Array.isArray(args) || args.length % 2) return null;
  const result = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]];
    if (!KEYS.has(key) || typeof value !== 'string' || !value || Object.hasOwn(result, key)) return null;
    result[key] = value;
  }
  if (!result['--input'] || !validDate(result['--today']) || !['en','fr'].includes(result['--language'] ?? 'en') || !['html','csv','json','text'].includes(result['--format'] ?? 'html')) return null;
  if (result['--stale-days'] !== undefined && (!/^\d{1,5}$/u.test(result['--stale-days']) || Number(result['--stale-days']) > 36500)) return null;
  return result;
}
export async function readSafe(path) {
  const full = resolve(path), stat = await lstat(full);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 6_000_000 || await realpath(full) !== full) throw Error('UNSAFE_INPUT');
  return readFile(full, 'utf8');
}
export async function writeSafe(path, content) {
  const full = resolve(path), dir = dirname(full);
  if (await realpath(dir) !== dir) throw Error('UNSAFE_OUTPUT');
  const file = await open(full, 'wx', 0o600);
  try { await file.writeFile(content, 'utf8'); } finally { await file.close(); }
}
export async function run(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const p = parseArgs(args);
  if (!p) { stderr.write('ARGUMENTS: --input file --today YYYY-MM-DD [--format html|csv|json|text] [--language en|fr] [--stale-days N] [--output new-file]\n'); return 2; }
  try {
    const inventory = parseInventory(await readSafe(p['--input']), { today: p['--today'] });
    if (!inventory.ok) { stderr.write(`INVALID_INVENTORY ${JSON.stringify(inventory.issues)}\n`); return 2; }
    const data = matrix(inventory.value, { today: p['--today'], staleDays: Number(p['--stale-days'] ?? 365) });
    const result = exportMatrix(data, { format: p['--format'] ?? 'html', language: p['--language'] ?? 'en' });
    if (p['--output']) await writeSafe(p['--output'], result);
    else stdout.write(result);
    return 0;
  } catch (e) { stderr.write(`REVIEW_FAILED ${e.code ?? e.message}\n`); return 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
