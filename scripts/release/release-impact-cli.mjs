#!/usr/bin/env node
/** Manual offline release-impact command. No network, scheduling, or silent overwrites. */
import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { MAX_INPUT_BYTES, parseManifest, dateValid } from './release-impact-contract.mjs';
import { renderReport } from './release-impact-report.mjs';
import { checkAssets } from './release-impact-integrity.mjs';
const FLAGS = new Set(['--after', '--before', '--output', '--language', '--format', '--today', '--assets-root']);
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length % 2 !== 0) return { ok: false, error: 'ARGUMENTS' };
  const values = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!FLAGS.has(flag) || !value || typeof value !== 'string' || Object.hasOwn(values, flag)) return { ok: false, error: 'ARGUMENTS' };
    values[flag] = value;
  }
  if (!values['--after'] || !values['--output']) return { ok: false, error: 'REQUIRED_OPTIONS' };
  if (values['--language'] && !['en', 'fr'].includes(values['--language'])) return { ok: false, error: 'LANGUAGE_INVALID' };
  if (values['--format'] && !['html', 'csv', 'text', 'json'].includes(values['--format'])) return { ok: false, error: 'FORMAT_INVALID' };
  if (values['--today'] && !dateValid(values['--today'])) return { ok: false, error: 'DATE_INVALID' };
  return { ok: true, values };
}
export async function readLocal(path) {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) throw Error('UNSAFE_INPUT');
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_INPUT_BYTES || info.size === 0 || await realpath(absolute) !== absolute) throw Error('UNSAFE_INPUT');
  const handle = await open(absolute, 'r');
  try {
    const latest = await handle.stat();
    if (!latest.isFile() || latest.size > MAX_INPUT_BYTES || latest.dev !== info.dev || latest.ino !== info.ino) throw Error('UNSAFE_INPUT');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export async function writeLocal(path, content) {
  if (typeof path !== 'string' || path === '' || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const absolute = resolve(path);
  const parent = dirname(absolute);
  if (await realpath(parent) !== parent || !basename(absolute) || basename(absolute) === '.' || basename(absolute) === '..') throw Error('UNSAFE_OUTPUT');
  const handle = await open(absolute, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); }
  finally { await handle.close(); }
  return absolute;
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const input = parseArgs(argv);
  if (!input.ok) { stderr.write(`${input.error}\n`); return 1; }
  const args = input.values;
  const today = args['--today'] ?? new Date().toISOString().slice(0, 10);
  try {
    const after = parseManifest(await readLocal(args['--after']), { today });
    if (!after.ok) { stderr.write(`${after.issues.map(row => row.code).join(',')}\n`); return 1; }
    let before = null;
    if (args['--before']) {
      const old = parseManifest(await readLocal(args['--before']), { today });
      if (!old.ok) { stderr.write(`${old.issues.map(row => row.code).join(',')}\n`); return 1; }
      before = old.value;
    }
    if (args['--assets-root']) {
      const integrity = await checkAssets(args['--assets-root'], after.value, { today });
      if (!integrity.ok || integrity.value.failed) { stderr.write(`INTEGRITY_FAILURE ${integrity.value?.findings.map(x => x.code).join(',') ?? integrity.issues.map(x => x.code).join(',')}\n`); return 1; }
    }
    const output = renderReport(after.value, { before, language: args['--language'] ?? 'en', format: args['--format'] ?? 'html', today });
    if (!output.ok) { stderr.write(`${output.issues.map(row => row.code).join(',')}\n`); return 1; }
    await writeLocal(args['--output'], output.value.content);
    stdout.write(`RELEASE_IMPACT_REPORT_CREATED ${output.value.format}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
