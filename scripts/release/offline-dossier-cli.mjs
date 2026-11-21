/** Manual-only CLI. No network, telemetry, automation or silent overwrites. */
import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validDate } from './offline-dossier-contract.mjs';
import { auditDossier, readDossierManifest } from './offline-dossier-audit.mjs';
import { renderDossierAudit } from './offline-dossier-report.mjs';
const OPTIONS = new Set(['--manifest', '--root', '--output', '--format', '--language', '--today', '--concurrency']);
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) return { ok: false, error: 'ARGUMENTS' };
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!OPTIONS.has(key) || !value || typeof value !== 'string' || Object.hasOwn(args, key)) return { ok: false, error: 'ARGUMENTS' };
    args[key] = value;
  }
  if (!args['--manifest'] || !args['--root'] || !['html', 'json', 'csv', 'text'].includes(args['--format'] ?? 'text') ||
    !['en', 'fr'].includes(args['--language'] ?? 'en') ||
    !validDate(args['--today'] ?? new Date().toISOString().slice(0, 10)) ||
    (args['--concurrency'] && !/^(?:[1-9]|1[0-6])$/u.test(args['--concurrency']))) return { ok: false, error: 'ARGUMENTS' };
  return { ok: true, args };
}
export async function safeOutput(path, content) {
  if (typeof path !== 'string' || !path || path.includes('\0') || typeof content !== 'string') throw Error('UNSAFE_OUTPUT');
  const absolute = resolve(path), parent = dirname(absolute), stat = await lstat(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(parent) !== parent || basename(absolute) === '..') throw Error('UNSAFE_OUTPUT');
  const handle = await open(absolute, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
  return absolute;
}
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) { stderr.write('ARGUMENTS: --manifest file --root folder [--format text|html|json|csv] [--language en|fr] [--today YYYY-MM-DD] [--output new-file]\n'); return 2; }
  const args = parsed.args, today = args['--today'] ?? new Date().toISOString().slice(0, 10);
  try {
    const dossier = await readDossierManifest(args['--manifest'], { today });
    if (!dossier.ok) { stderr.write(`INVALID_MANIFEST ${JSON.stringify(dossier.issues)}\n`); return 2; }
    const audited = await auditDossier(dossier.value, args['--root'], { concurrency: Number(args['--concurrency'] ?? 4) });
    const report = renderDossierAudit(audited, { language: args['--language'] ?? 'en', format: args['--format'] ?? 'text', today });
    if (!report.ok) { stderr.write(`REPORT_ERROR ${report.error}\n`); return 2; }
    if (args['--output']) await safeOutput(args['--output'], report.text);
    else stdout.write(report.text);
    return audited.complete ? 0 : 1;
  } catch (error) {
    stderr.write(`DOSSIER_ERROR ${error.code ?? error.message}\n`);
    return 2;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
