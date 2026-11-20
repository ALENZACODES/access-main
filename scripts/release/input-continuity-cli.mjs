/** Explicit local audit CLI: read existing JSON and optionally create one report. */
import { readFile, lstat, realpath, open } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './input-continuity-contract.mjs';
import { render } from './input-continuity-report.mjs';

export const FLAGS = Object.freeze(['--after', '--before', '--output', '--format', '--language', '--today']);
export function args(argv) {
 if (!Array.isArray(argv)) return { ok: false, error: 'ARGUMENTS' };
 const values = {};
 for (let index = 0; index < argv.length; index += 2) {
  const key = argv[index], value = argv[index + 1];
  if (!FLAGS.includes(key) || typeof value !== 'string' || !value || values[key]) return { ok: false, error: 'ARGUMENTS' };
  values[key] = value;
 }
 if (!values['--after'] || !['text', 'csv', 'html', 'json'].includes(values['--format'] ?? 'text') || !['en', 'fr'].includes(values['--language'] ?? 'en')) return { ok: false, error: 'ARGUMENTS' };
 return { ok: true, values };
}
export async function safeInput(path) {
 if (typeof path !== 'string' || path.includes('\0')) throw new Error('UNSAFE_INPUT');
 const full = resolve(path), stats = await lstat(full);
 if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 6_000_000) throw new Error('UNSAFE_INPUT');
 const actual = await realpath(full);
 if (actual !== full) throw new Error('UNSAFE_INPUT');
 return readFile(full, 'utf8');
}
export async function safeOutput(path, text) {
 if (typeof path !== 'string' || path.includes('\0') || typeof text !== 'string') throw new Error('UNSAFE_OUTPUT');
 const full = resolve(path), dir = dirname(full), actual = await realpath(dir);
 if (actual !== dir || !basename(full) || basename(full) === '.' || basename(full) === '..' || full === dir) throw new Error('UNSAFE_OUTPUT');
 const file = await open(full, 'wx', 0o600);
 try { await file.writeFile(text, 'utf8'); }
 finally { await file.close(); }
 return full;
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
 const parsed = args(argv);
 if (!parsed.ok) { stderr.write('ARGUMENTS: --after file [--before file] [--format text|csv|html|json] [--language en|fr] [--output file]\n'); return 2; }
 const v = parsed.values;
 try {
  const after = parse(await safeInput(v['--after']), { today: v['--today'] ?? '2026-11-20' });
  if (!after.ok) { stderr.write(`INVALID_AFTER ${after.issues.map(x => x.code).join(',')}\n`); return 2; }
  const before = v['--before'] ? parse(await safeInput(v['--before']), { today: v['--today'] ?? '2026-11-20' }) : null;
  if (before && !before.ok) { stderr.write(`INVALID_BEFORE ${before.issues.map(x => x.code).join(',')}\n`); return 2; }
  const report = render(after.value, { before: before?.value, format: v['--format'] ?? 'text', language: v['--language'] ?? 'en', today: v['--today'] ?? '2026-11-20' });
  if (!report.ok) { stderr.write(`REPORT ${report.issues.map(x => x.code).join(',')}\n`); return 2; }
  if (v['--output']) await safeOutput(v['--output'], report.text);
  else stdout.write(report.text);
  return 0;
 } catch (error) { stderr.write(`INPUT_OUTPUT_ERROR ${error.code ?? error.message}\n`); return 2; }
}
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
