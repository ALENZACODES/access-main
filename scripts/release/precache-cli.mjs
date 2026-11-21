#!/usr/bin/env node
/** Manual, offline-only precache inspection. No scheduled execution. */
import { Buffer } from 'node:buffer';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parsePrecache, PRECACHE_MAX_DOCUMENT_BYTES } from './precache-contract.mjs';
import { auditFiles } from './precache-files.mjs';
import { renderReport, changeReport } from './precache-report.mjs';

export const CLI_ACTIONS = Object.freeze(['inspect', 'scan', 'compare']);
const FLAGS = new Set(['--manifest', '--root', '--previous', '--format', '--lang', '--output', '--today']);
const FORMATS = new Set(['text', 'csv', 'html', 'json']);
const HELP = `Offline release precache review
Usage: node precache-cli.mjs inspect --manifest FILE [--format text|csv|html|json] [--lang en|fr]
       node precache-cli.mjs scan --manifest FILE --root DIRECTORY [--format json]
       node precache-cli.mjs compare --previous FILE --manifest FILE [--format text|csv|html|json]
Use --output FILE to create a new report; existing files are not overwritten.
All operations are local and read-only, apart from a requested report output.
`;
function issue(code, path) { return { code, path }; }
export function parseArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || args.includes('--help')) {
    return { ok: true, help: true, args: null, errors: [] };
  }
  const [action, ...remaining] = args;
  if (!CLI_ACTIONS.includes(action)) return { ok: false, help: false, args: null, errors: [issue('ACTION', '/action')] };
  const parsed = { action, format: 'text', lang: 'en' };
  for (let i = 0; i < remaining.length; i += 2) {
    const flag = remaining[i];
    const value = remaining[i + 1];
    if (!FLAGS.has(flag) || value === undefined || value.startsWith('--')) {
      return { ok: false, help: false, args: null, errors: [issue('ARGUMENT', '/flags')] };
    }
    const key = flag.slice(2);
    if (Object.hasOwn(parsed, key) && key !== 'format' && key !== 'lang') {
      return { ok: false, help: false, args: null, errors: [issue('DUPLICATE_FLAG', `/${key}`)] };
    }
    parsed[key] = value;
  }
  if (!parsed.manifest || action === 'scan' && !parsed.root || action === 'compare' && !parsed.previous) {
    return { ok: false, help: false, args: null, errors: [issue('REQUIRED_FLAG', '/flags')] };
  }
  if (!FORMATS.has(parsed.format) || !['en', 'fr'].includes(parsed.lang)) {
    return { ok: false, help: false, args: null, errors: [issue('OUTPUT_CHOICE', '/flags')] };
  }
  if (action === 'scan' && parsed.format !== 'json') {
    return { ok: false, help: false, args: null, errors: [issue('SCAN_JSON_REQUIRED', '/format')] };
  }
  if (parsed.today && !/^\d{4}-\d{2}-\d{2}$/u.test(parsed.today)) {
    return { ok: false, help: false, args: null, errors: [issue('TODAY_DATE', '/today')] };
  }
  return { ok: true, help: false, args: parsed, errors: [] };
}
async function loadJson(path, options) {
  try {
    const stat = await lstat(resolve(path));
    if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, errors: [issue('INPUT_FILE', '/')] };
    if (stat.size > PRECACHE_MAX_DOCUMENT_BYTES) return { ok: false, errors: [issue('INPUT_LIMIT', '/')] };
    const data = await readFile(resolve(path), 'utf8');
    if (Buffer.byteLength(data, 'utf8') > PRECACHE_MAX_DOCUMENT_BYTES) return { ok: false, errors: [issue('INPUT_LIMIT', '/')] };
    const checked = parsePrecache(data, options);
    if (!checked.ok) return { ok: false, errors: checked.errors };
    return { ok: true, value: JSON.parse(data) };
  } catch { return { ok: false, errors: [issue('INPUT_READ', '/')] }; }
}
export async function runPrecacheCli(argv, io = {}) {
  const parsed = parseArgs(argv);
  const output = io.stdout ?? process.stdout;
  const errors = io.stderr ?? process.stderr;
  if (parsed.help) { output.write(HELP); return 0; }
  if (!parsed.ok) { errors.write(parsed.errors.map(item => item.code).join('\n') + '\n'); return 2; }
  const { action, manifest: file, root, previous, format, lang, today, output: destination } = parsed.args;
  const current = await loadJson(file, { today });
  if (!current.ok) { errors.write(current.errors.map(item => item.code).join('\n') + '\n'); return 2; }
  let report;
  if (action === 'inspect') {
    report = renderReport(current.value, { format, lang, today });
  } else if (action === 'compare') {
    const old = await loadJson(previous, { today });
    if (!old.ok) { errors.write(old.errors.map(item => item.code).join('\n') + '\n'); return 2; }
    report = changeReport(old.value, current.value, { format, lang, today });
  } else {
    const scan = await auditFiles(root, current.value, { today });
    report = { ok: scan.ok, errors: scan.problems, content: JSON.stringify(scan, null, 2) + '\n' };
  }
  if (!report.ok) { errors.write(report.errors.map(item => item.code).join('\n') + '\n'); return 2; }
  try {
    if (destination) await writeFile(resolve(destination), report.content, { flag: 'wx' });
    else output.write(report.content);
  } catch { errors.write('OUTPUT_WRITE\n'); return 2; }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPrecacheCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 2; });
}
