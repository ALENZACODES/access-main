/** Opt-in local file review. Never scans directories, starts a server, or overwrites an existing report. */
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, parseManifest, dateValid } from './document-outline-contract.mjs';
import { renderReport } from './document-outline-report.mjs';
const FLAGS = new Set(['--after', '--before', '--output', '--language', '--format', '--today']);
export function parseArgs(args) {
  if (!Array.isArray(args) || !args.length || args.length % 2 !== 0) return { ok: false, error: 'ARGUMENTS' };
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!FLAGS.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) return { ok: false, error: 'ARGUMENTS' };
    values[key] = value;
  }
  if (!values['--after'] || !['en', 'fr'].includes(values['--language'] ?? 'en') ||
      !['html','text','json','csv'].includes(values['--format'] ?? 'html') ||
      !dateValid(values['--today'] ?? new Date().toISOString().slice(0,10))) return { ok: false, error: 'ARGUMENTS' };
  return { ok: true, values };
}
export async function safeRead(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const file = resolve(path), stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.bytes || await realpath(file) !== file) throw Error('UNSAFE_INPUT');
  const handle = await open(file, 'r');
  try {
    const next = await handle.stat();
    if (!next.isFile() || next.dev !== stat.dev || next.ino !== stat.ino || next.size > LIMITS.bytes) throw Error('UNSAFE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function safeWrite(path, content) {
  if (typeof path !== 'string' || !path || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const file = resolve(path);
  if (await realpath(dirname(file)) !== dirname(file)) throw Error('UNSAFE_OUTPUT');
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); }
  finally { await handle.close(); }
  return file;
}
const errCode = e => e?.message === 'UNSAFE_INPUT' || e?.message === 'UNSAFE_OUTPUT' ? e.message : 'FILE_ERROR';
export async function run(argv, { stdout = globalThis.process.stdout, stderr = globalThis.process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { stderr.write('ARGUMENTS: --after FILE [--before FILE] [--output NEW_FILE] [--language en|fr] [--format html|csv|json|text] [--today YYYY-MM-DD]\n'); return 2; }
  const v = parsed.values, today = v['--today'] ?? new Date().toISOString().slice(0,10);
  let after, before = null;
  try {
    const raw = await safeRead(v['--after']);
    after = parseManifest(raw, { today });
    if (v['--before']) before = parseManifest(await safeRead(v['--before']), { today });
  } catch(e) { stderr.write(`${errCode(e)}\n`); return 2; }
  if (!after.ok || (before !== null && !before.ok)) { stderr.write('INVALID_MANIFEST\n'); return 2; }
  const out = renderReport(after.value, { today, before: before?.value ?? null,
    language: v['--language'] ?? 'en', format: v['--format'] ?? 'html' });
  if (!out.ok) { stderr.write('INVALID_REPORT\n'); return 2; }
  if (v['--output']) {
    try { await safeWrite(v['--output'], out.content); }
    catch(e) { stderr.write(`${errCode(e)}\n`); return 2; }
  } else stdout.write(out.content);
  return 0;
}
if (globalThis.process.argv[1] && resolve(globalThis.process.argv[1]) === fileURLToPath(import.meta.url)) {
  globalThis.process.exitCode = await run(globalThis.process.argv.slice(2));
}
