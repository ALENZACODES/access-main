import { parseBudget } from './budget.js';
import { parseBaseline, parseWaivers } from './ci.js';
import { CONFIG_KEYS, parseConfig } from './config.js';
import { parseHistory } from './history.js';
import { parseLedger } from './ledger.js';
import { parseManualLog } from './manual-log.js';
import { parseOwners } from './owners.js';
import { parsePolicy } from './policy.js';
import { parseReport } from './reportio.js';
import { parseReview } from './review.js';
import type { Lang } from './types.js';

/**
 * `narrow-audit check`: reads the files an audit run would read and says, for
 * each one, whether it can be used. It runs no audit. Its use is to find a
 * broken owners file or a mistyped config key before a long browser run, and
 * to find every such problem in one go, not one per run.
 *
 * "Can be used" means the file parses and has the shape the tool expects. It
 * says nothing about whether the content is right: an owners file that names
 * the wrong team is still a file that can be used.
 */

type Text = { readonly en: string; readonly fr: string };

export type FileKind = 'config' | 'report' | 'baseline' | 'waivers' | 'budget' | 'history' | 'ledger' | 'owners' | 'review' | 'policy' | 'manual-log';

export const FILE_KINDS: readonly FileKind[] = ['config', 'report', 'baseline', 'waivers', 'budget', 'history', 'ledger', 'owners', 'review', 'policy', 'manual-log'];

/** Files a run creates when they are not there yet, so a missing one is not a problem. */
export const CREATED_BY_RUN: ReadonlySet<FileKind> = new Set<FileKind>(['history', 'ledger']);

/** The config keys that name a file this command can read, with the kind of that file. */
export const CONFIG_FILE_KEYS: Readonly<Record<string, FileKind>> = {
  baseline: 'baseline',
  waivers: 'waivers',
  budget: 'budget',
  history: 'history',
  ledger: 'ledger',
  owners: 'owners',
  review: 'review',
  manualLog: 'manual-log',
  compare: 'report',
  merge: 'report',
};

export interface FileToCheck {
  readonly kind: FileKind;
  readonly file: string;
}

export type FileState = 'usable' | 'not-usable' | 'missing' | 'missing-created-by-run';

export interface FileResult extends FileToCheck {
  readonly state: FileState;
  /** What is wrong, for `not-usable`. */
  readonly problem?: Text;
}

/** What is wrong with the text of a file of a kind, or null when it can be used. */
export function problemIn(kind: FileKind, text: string, now: Date): Text | null {
  const from = (r: { readonly ok: true } | { readonly ok: false; readonly error: Text }): Text | null => (r.ok ? null : r.error);
  switch (kind) {
    case 'config':
      return from(parseConfig(text));
    case 'report':
      return from(parseReport(text));
    case 'baseline':
      return from(parseBaseline(text));
    case 'budget':
      return from(parseBudget(text));
    case 'history':
      return from(parseHistory(text));
    case 'ledger':
      return from(parseLedger(text));
    case 'owners':
      return from(parseOwners(text));
    case 'review':
      return from(parseReview(text));
    case 'policy':
      return from(parsePolicy(text));
    case 'manual-log':
      return from(parseManualLog(text, now));
    case 'waivers': {
      const first = parseWaivers(text).problems[0];
      return first ? first.message : null;
    }
  }
}

/** The files a config file names, by the keys this command knows. Empty when the config cannot be read. */
export function filesNamedByConfig(configText: string): FileToCheck[] {
  let raw: unknown;
  try {
    raw = JSON.parse(configText.replace(/^\uFEFF/, ''));
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
  const out: FileToCheck[] = [];
  for (const spec of CONFIG_KEYS) {
    const kind = CONFIG_FILE_KEYS[spec.key];
    const value = (raw as Record<string, unknown>)[spec.key];
    if (!kind || value === undefined) continue;
    const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    for (const file of list) if (file.trim() !== '') out.push({ kind, file });
  }
  return out;
}

export interface DoctorDeps {
  readText(path: string): Promise<string>;
  log(line: string): void;
  now(): Date;
}

async function readOptional(deps: DoctorDeps, path: string): Promise<string | null> {
  try {
    return await deps.readText(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(msg)) return null;
    throw err;
  }
}

/** Reads each file once and says whether it can be used. A config file also brings in the files it names. */
export async function checkFiles(files: readonly FileToCheck[], deps: DoctorDeps): Promise<FileResult[]> {
  const queue: FileToCheck[] = [...files];
  const seen = new Set<string>();
  const out: FileResult[] = [];
  while (queue.length > 0) {
    const item = queue.shift() as FileToCheck;
    const key = `${item.kind}\u0000${item.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = await readOptional(deps, item.file);
    if (text === null) {
      out.push({ ...item, state: CREATED_BY_RUN.has(item.kind) ? 'missing-created-by-run' : 'missing' });
      continue;
    }
    const problem = problemIn(item.kind, text, deps.now());
    out.push(problem ? { ...item, state: 'not-usable', problem } : { ...item, state: 'usable' });
    if (item.kind === 'config') queue.push(...filesNamedByConfig(text));
  }
  return out;
}

/** True when every file can be used, or is one the first run creates. */
export function allUsable(results: readonly FileResult[]): boolean {
  return results.every((r) => r.state === 'usable' || r.state === 'missing-created-by-run');
}

const STATE_WORDS: Readonly<Record<FileState, Text>> = {
  usable: { en: 'CAN BE USED', fr: 'UTILISABLE' },
  'not-usable': { en: 'CANNOT BE USED', fr: 'INUTILISABLE' },
  missing: { en: 'NOT FOUND', fr: 'INTROUVABLE' },
  'missing-created-by-run': { en: 'NOT THERE YET', fr: 'PAS ENCORE LÀ' },
};

/** Plain text: one line per file, the ones with a problem first, then what the result does and does not say. */
export function describeFileChecks(results: readonly FileResult[], lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? '\u00A0:' : ':';
  if (results.length === 0) return fr ? 'Aucun fichier à lire.\n' : 'No file to read.\n';
  const order: Readonly<Record<FileState, number>> = { 'not-usable': 0, missing: 1, 'missing-created-by-run': 2, usable: 3 };
  const sorted = [...results].sort((a, b) => order[a.state] - order[b.state]);
  const bad = results.filter((r) => r.state === 'not-usable' || r.state === 'missing').length;
  const lines: string[] = [
    bad === 0
      ? fr
        ? `Les ${results.length} fichiers lus sont utilisables.`
        : `All ${results.length} files read can be used.`
      : fr
        ? `${bad} fichier(s) sur ${results.length} posent un problème.`
        : `${bad} of ${results.length} file(s) have a problem.`,
  ];
  for (const r of sorted) {
    const tail =
      r.state === 'not-usable' && r.problem
        ? `${colon} ${r.problem[lang]}`
        : r.state === 'missing-created-by-run'
          ? `${colon} ${fr ? 'la première exécution le crée.' : 'the first run creates it.'}`
          : '';
    lines.push(`  ${STATE_WORDS[r.state][lang]} ${r.kind} ${r.file}${tail}`);
  }
  lines.push(
    fr
      ? 'Un fichier utilisable se lit et a la forme attendue. Cela ne dit pas que son contenu est juste.'
      : 'A file that can be used parses and has the expected shape. That does not say its content is right.',
  );
  return `${lines.join('\n')}\n`;
}

export const CHECK_HELP_TEXT =
  'Usage: narrow-audit check [--config FILE] [--report FILE] [--baseline FILE] [--waivers FILE] [--budget FILE]\n' +
  '                          [--history FILE] [--ledger FILE] [--owners FILE] [--review FILE] [--policy FILE]\n' +
  '                          [--manual-log FILE] [--lang en|fr]\n' +
  'Reads the files an audit run would read and says whether each can be used. Runs no audit.\n' +
  'A config file also brings in the files it names. Each option may be given more than once.\n' +
  'Exit code 0 when every file can be used, 1 when one cannot or is not found, 2 on a usage error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit check [--config FICHIER] [--report FICHIER] [--baseline FICHIER] [--waivers FICHIER] [--budget FICHIER]\n' +
  '                          [--history FICHIER] [--ledger FICHIER] [--owners FICHIER] [--review FICHIER] [--policy FICHIER]\n' +
  '                          [--manual-log FICHIER] [--lang en|fr]\n' +
  'Lit les fichiers qu’une exécution d’audit lirait et dit si chacun est utilisable. N’exécute aucun audit.\n' +
  'Un fichier de configuration amène aussi les fichiers qu’il nomme. Chaque option peut être donnée plusieurs fois.\n' +
  'Code de sortie 0 quand chaque fichier est utilisable, 1 quand l’un ne l’est pas ou est introuvable, 2 en cas d’erreur d’utilisation.\n';

export type ParsedCheckArgs = { readonly ok: true; readonly files: readonly FileToCheck[]; readonly lang: Lang; readonly help: boolean } | { readonly ok: false; readonly error: Text };

export function parseCheckArgs(argv: readonly string[]): ParsedCheckArgs {
  const fail = (en: string, fr: string): ParsedCheckArgs => ({ ok: false, error: { en, fr } });
  const files: FileToCheck[] = [];
  let lang: Lang = 'en';
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--help') {
      help = true;
      continue;
    }
    const kind = a.startsWith('--') ? (a.slice(2) as FileKind) : null;
    if (a !== '--lang' && (kind === null || !FILE_KINDS.includes(kind))) return fail(`Unknown option ${a}.`, `Option non reconnue ${a}.`);
    const v = argv[++i];
    if (!v || v.startsWith('--')) return fail(`${a} needs a value.`, `${a} demande une valeur.`);
    if (a === '--lang') {
      if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit être en ou fr.');
      lang = v;
    } else if (kind !== null) files.push({ kind, file: v });
  }
  if (!help && files.length === 0) return fail('Give at least one file to read, such as --config narrow-audit.json.', 'Indiquez au moins un fichier à lire, par exemple --config narrow-audit.json.');
  return { ok: true, files, lang, help };
}

export async function runCheck(argv: readonly string[], deps: DoctorDeps): Promise<number> {
  const parsed = parseCheckArgs(argv);
  if (!parsed.ok) {
    deps.log(`${parsed.error.en} / ${parsed.error.fr}`);
    deps.log(CHECK_HELP_TEXT);
    return 2;
  }
  if (parsed.help) {
    deps.log(CHECK_HELP_TEXT);
    return 0;
  }
  try {
    const results = await checkFiles(parsed.files, deps);
    deps.log(describeFileChecks(results, parsed.lang).trimEnd());
    return allUsable(results) ? 0 : 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`Check failed / Échec du contrôle des fichiers${parsed.lang === 'fr' ? '\u00A0' : ''}: ${msg}`);
    return 2;
  }
}
