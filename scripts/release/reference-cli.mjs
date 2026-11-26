/** Local, explicit, non-network file audit. Reject symlinks, oversized input and overwrites. */
import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, parseManifest, validDate } from './reference-contract.mjs';
import { reviewReferences } from './reference-review.mjs';
import { compareReferenceSets } from './reference-delta.mjs';
import { renderReport } from './reference-report.mjs';
const FLAGS = Object.freeze(['--after', '--before', '--output', '--language', '--format', '--today', '--stale-days']);
export function parseArgs(args) {
  if (!Array.isArray(args) || args.length < 2 || args.length % 2) return { ok: false, problem: 'ARGUMENTS' };
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!FLAGS.includes(flag) || typeof value !== 'string' || !value || Object.hasOwn(values, flag)) return { ok: false, problem: 'ARGUMENTS' };
    values[flag] = value;
  }
  if (!values['--after'] || !['en', 'fr'].includes(values['--language'] ?? 'en') ||
      !['text', 'html', 'csv', 'json'].includes(values['--format'] ?? 'text') ||
      !validDate(values['--today'] ?? '2026-11-21')) return { ok: false, problem: 'ARGUMENTS' };
  if (values['--stale-days'] !== undefined && (!/^\d{1,4}$/u.test(values['--stale-days']) || +values['--stale-days'] < 1 || +values['--stale-days'] > 3650)) return { ok: false, problem: 'ARGUMENTS' };
  if (values['--before'] && resolve(values['--before']) === resolve(values['--after'])) return { ok: false, problem: 'DUPLICATE_INPUT' };
  if (values['--output'] && [values['--before'], values['--after']].filter(Boolean).some(path => resolve(path) === resolve(values['--output']))) return { ok: false, problem: 'OUTPUT_EQUALS_INPUT' };
  return { ok: true, values };
}
export async function readLocalFile(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.bytes || await realpath(absolute) !== absolute) throw Error('UNSAFE_INPUT');
  const handle = await open(absolute, 'r');
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size > LIMITS.bytes || current.ino !== info.ino || current.dev !== info.dev) throw Error('UNSAFE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function writeLocalFile(path, content) {
  if (typeof path !== 'string' || !path || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const absolute = resolve(path);
  if (!basename(absolute) || ['.', '..'].includes(basename(absolute))) throw Error('UNSAFE_OUTPUT');
  const parent = dirname(absolute);
  if (await realpath(parent) !== parent) throw Error('UNSAFE_OUTPUT');
  const handle = await open(absolute, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
  return absolute;
}
export async function execute(args, { read = readLocalFile, write = writeLocalFile, stdout = globalThis.process.stdout, stderr = globalThis.process.stderr } = {}) {
  const parsed = parseArgs(args);
  if (!parsed.ok) { stderr.write(`${parsed.problem}\n`); return 2; }
  const options = parsed.values;
  const today = options['--today'] ?? '2026-11-21';
  try {
    const after = parseManifest(await read(options['--after']), { today });
    if (!after.ok) { stderr.write(`AFTER:${after.problems.join(',')}\n`); return 2; }
    let before = null;
    if (options['--before']) {
      const result = parseManifest(await read(options['--before']), { today });
      if (!result.ok) { stderr.write(`BEFORE:${result.problems.join(',')}\n`); return 2; }
      before = result.value;
    }
    const review = reviewReferences(after.value, { today, staleDays: Number(options['--stale-days'] ?? 180) });
    if (!review.ok) { stderr.write(`REVIEW:${review.problems.join(',')}\n`); return 2; }
    const comparison = before ? compareReferenceSets(before, after.value, { today }) : null;
    if (comparison && !comparison.ok) { stderr.write(`COMPARE:${comparison.problems.join(',')}\n`); return 2; }
    const output = renderReport(review.value, { format: options['--format'] ?? 'text', language: options['--language'] ?? 'en', delta: comparison?.value ?? null });
    if (options['--output']) await write(options['--output'], output);
    else stdout.write(output);
    return 0;
  } catch (error) { stderr.write(`LOCAL_IO:${error instanceof Error ? error.message : 'ERROR'}\n`); return 2; }
}
if (globalThis.process.argv[1] && resolve(globalThis.process.argv[1]) === fileURLToPath(import.meta.url)) globalThis.process.exitCode = await execute(globalThis.process.argv.slice(2));
