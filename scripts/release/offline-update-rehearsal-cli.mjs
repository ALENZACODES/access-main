/** Explicit, offline CLI only. Nothing runs unless a person invokes it. */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRehearsal, goodDay } from './offline-update-rehearsal-contract.mjs';
import { compareRehearsals } from './offline-update-rehearsal-compare.mjs';
import { renderReport, changeReport } from './offline-update-rehearsal-report.mjs';

export const CLI_ACTIONS = Object.freeze(['inspect', 'compare']);
const USAGE = 'Usage: offline-update-rehearsal-cli.mjs inspect --input file.json [--format text|html|csv|json] [--locale en|fr] [--output report.txt] [--today YYYY-MM-DD]\n       offline-update-rehearsal-cli.mjs compare --before old.json --after new.json [--locale en|fr] [--output report.txt] [--today YYYY-MM-DD]\n';
function fail(code, path) { return { code, path }; }
export function parseArguments(args) {
  if (!Array.isArray(args) || args.includes('--help') || args.includes('-h')) return { ok: false, help: true, problems: [], options: null };
  const [action, ...rest] = args;
  if (!CLI_ACTIONS.includes(action)) return { ok: false, help: false, problems: [fail('ACTION_INVALID', '/action')], options: null };
  const values = {};
  const expected = new Set(['--input', '--before', '--after', '--format', '--locale', '--output', '--today']);
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!expected.has(key) || value === undefined || value.startsWith('--') || key in values) {
      return { ok: false, help: false, problems: [fail('ARGUMENT_INVALID', '/arguments')], options: null };
    }
    values[key] = value;
  }
  if (action === 'inspect' && (!values['--input'] || values['--before'] || values['--after'])) {
    return { ok: false, help: false, problems: [fail('INPUT_REQUIRED', '/input')], options: null };
  }
  if (action === 'compare' && (!values['--before'] || !values['--after'] || values['--input'])) {
    return { ok: false, help: false, problems: [fail('PAIR_REQUIRED', '/before')], options: null };
  }
  if (values['--locale'] && !['en', 'fr'].includes(values['--locale'])) {
    return { ok: false, help: false, problems: [fail('LOCALE_INVALID', '/locale')], options: null };
  }
  if (values['--format'] && !['text', 'html', 'csv', 'json'].includes(values['--format'])) {
    return { ok: false, help: false, problems: [fail('FORMAT_INVALID', '/format')], options: null };
  }
  if (action === 'compare' && values['--format'] && values['--format'] !== 'text') {
    return { ok: false, help: false, problems: [fail('COMPARE_FORMAT', '/format')], options: null };
  }
  if (values['--today'] && !goodDay(values['--today'])) {
    return { ok: false, help: false, problems: [fail('DATE_INVALID', '/today')], options: null };
  }
  return { ok: true, help: false, problems: [], options: {
    action, input: values['--input'], before: values['--before'], after: values['--after'],
    format: values['--format'] ?? 'text', language: values['--locale'] ?? 'en',
    output: values['--output'] ?? null, today: values['--today'],
  } };
}
export function fileInside(root, candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('\0')) return false;
  const target = resolve(root, candidate);
  const back = relative(root, target);
  return back !== '..' && !back.startsWith(`..${sep}`) && !isAbsolute(back);
}
async function safeRead(path) {
  if (resolve(await realpath(path)) !== resolve(path)) throw new Error('INPUT_REDIRECT');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 6_000_000) throw new Error('INPUT_NOT_REGULAR');
  return readFile(path, 'utf8');
}
async function safeWrite(path, content) {
  const folder = dirname(path);
  const realFolder = await realpath(folder);
  if (resolve(realFolder) !== resolve(folder)) throw new Error('OUTPUT_PARENT_REDIRECT');
  if (Buffer.byteLength(content, 'utf8') > 10_000_000) throw new Error('OUTPUT_LIMIT');
  await writeFile(path, content, { flag: 'wx', mode: 0o600 });
}
async function readDocument(path, today) {
  const content = await safeRead(path);
  return parseRehearsal(content, { today });
}
function outputCode(problems) { return problems.map(item => item.code).join(', '); }
export async function runUpdateRehearsalCli(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const root = resolve(io.cwd ?? process.cwd());
  const parsed = parseArguments(args);
  if (parsed.help) { stdout.write(USAGE); return 0; }
  if (!parsed.ok) { stderr.write(`Input issue: ${outputCode(parsed.problems)}\n`); return 2; }
  const options = parsed.options;
  const paths = options.action === 'inspect' ? [options.input] : [options.before, options.after];
  if (paths.some(path => !fileInside(root, path))) {
    stderr.write('Input issue: PATH_OUTSIDE_ROOT\n');
    return 2;
  }
  if (options.output && (!fileInside(root, options.output) || paths.some(path => resolve(root, path) === resolve(root, options.output)))) {
    stderr.write('Input issue: OUTPUT_PATH\n');
    return 2;
  }
  try {
    const readings = await Promise.all(paths.map(path => readDocument(resolve(root, path), options.today)));
    const inputProblems = readings.flatMap((reading, index) => reading.problems.map(problem => ({ ...problem, file: index })));
    if (inputProblems.length) { stderr.write(`Input issue: ${outputCode(inputProblems)}\n`); return 2; }
    let result;
    if (options.action === 'inspect') {
      result = renderReport(readings[0].document, options.format, options.language, { today: options.today });
    } else {
      const comparison = compareRehearsals(readings[0].document, readings[1].document, { today: options.today });
      if (!comparison.ok) { stderr.write(`Input issue: ${outputCode(comparison.problems)}\n`); return 2; }
      result = changeReport(readings[0].document, readings[1].document, options.language, { today: options.today });
    }
    if (!result.ok) { stderr.write(`Input issue: ${outputCode(result.problems)}\n`); return 2; }
    if (options.output) await safeWrite(resolve(root, options.output), result.text);
    else stdout.write(result.text);
    return 0;
  } catch (error) {
    // Do not echo a user-supplied path, source content or private value.
    stderr.write(`Input or output issue: ${error instanceof Error && error.message === 'OUTPUT_PARENT_REDIRECT' ? 'OUTPUT_PARENT_REDIRECT' : 'FILE_OPERATION'}\n`);
    return 2;
  }
}
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) process.exitCode = await runUpdateRehearsalCli(process.argv.slice(2));
