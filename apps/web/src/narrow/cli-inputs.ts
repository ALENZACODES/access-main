import { parseConfig } from './config.js';
import { describeRoutesFile, parseRoutesFile } from './routes-file.js';

/**
 * Two options of the command line that stand for other arguments:
 * `--config FILE` and `--routes-file FILE`. They are replaced here, before
 * the arguments are parsed, by what they stand for. The parser itself never
 * sees them, so it stays the one place that says what an option means.
 */

type Text = { readonly en: string; readonly fr: string };

export interface InputDeps {
  readText(path: string): Promise<string>;
  log(line: string): void;
}

export type Expanded = { readonly ok: true; readonly argv: readonly string[] } | { readonly ok: false; readonly error: Text };

export const INPUT_HELP_EN = '                    [--config FILE.json] [--routes-file FILE ...] [--html-list FILE ...]\n';
export const INPUT_HELP_FR = '                    [--config FICHIER.json] [--routes-file FICHIER ...] [--html-list FICHIER ...]\n';

function valueAfter(argv: readonly string[], flag: string): string | null {
  let found: string | null = null;
  for (let i = 0; i < argv.length - 1; i++) if (argv[i] === flag) found = argv[i + 1] ?? null;
  return found;
}

/** Puts the arguments of the config file where `--config FILE` stood. One config file per run. */
export async function expandConfig(argv: readonly string[], deps: InputDeps): Promise<Expanded> {
  const at = argv.indexOf('--config');
  if (at === -1) return { ok: true, argv };
  if (argv.indexOf('--config', at + 1) !== -1) {
    return { ok: false, error: { en: 'Give --config once.', fr: 'Indiquez --config une seule fois.' } };
  }
  const file = argv[at + 1];
  if (!file || file.startsWith('--')) return { ok: false, error: { en: '--config needs a file.', fr: '--config demande un fichier.' } };
  const parsed = parseConfig(await deps.readText(file));
  if (!parsed.ok) return { ok: false, error: { en: `${file}: ${parsed.error.en}`, fr: `${file}\u00A0: ${parsed.error.fr}` } };
  return { ok: true, argv: [...argv.slice(0, at), ...parsed.argv, ...argv.slice(at + 2)] };
}

/** Replaces each `--routes-file FILE` by one `--route` per route of the file. The language of the notes follows `--lang`. */
export async function expandRoutesFiles(argv: readonly string[], deps: InputDeps): Promise<Expanded> {
  if (!argv.includes('--routes-file')) return { ok: true, argv };
  const baseUrl = valueAfter(argv, '--base-url') ?? '';
  const lang = valueAfter(argv, '--lang') === 'fr' ? 'fr' : 'en';
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a !== '--routes-file') {
      out.push(a);
      continue;
    }
    const file = argv[++i];
    if (!file || file.startsWith('--')) return { ok: false, error: { en: '--routes-file needs a file.', fr: '--routes-file demande un fichier.' } };
    const parsed = parseRoutesFile(await deps.readText(file), baseUrl);
    if (!parsed.ok) return { ok: false, error: { en: `${file}: ${parsed.error.en}`, fr: `${file}\u00A0: ${parsed.error.fr}` } };
    const note = describeRoutesFile(file, parsed, lang);
    if (note !== '') deps.log(note);
    for (const route of parsed.routes) {
      if (seen.has(route)) continue;
      seen.add(route);
      out.push('--route', route);
    }
  }
  return { ok: true, argv: out };
}

/** Files named in a list file, one per line. Blank lines and lines that start with `#` are skipped. */
export function parseHtmlList(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const file = line.trim();
    if (file !== '' && !file.startsWith('#')) seen.add(file);
  }
  return [...seen];
}

/**
 * Replaces each `--html-list FILE` by one `--html` per file the list names. A
 * site has too many built pages to name on a command line, and a build can
 * write the list. Paths are used as written, relative to where the command
 * runs.
 */
export async function expandHtmlLists(argv: readonly string[], deps: InputDeps): Promise<Expanded> {
  if (!argv.includes('--html-list')) return { ok: true, argv };
  const out: string[] = [];
  // A file already given with --html is not added a second time.
  const seen = new Set<string>(argv.filter((_a, i) => argv[i - 1] === '--html'));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a !== '--html-list') {
      out.push(a);
      continue;
    }
    const file = argv[++i];
    if (!file || file.startsWith('--')) return { ok: false, error: { en: '--html-list needs a file.', fr: '--html-list demande un fichier.' } };
    const files = parseHtmlList(await deps.readText(file));
    if (files.length === 0) return { ok: false, error: { en: `${file}: The list names no file.`, fr: `${file}\u00A0: La liste ne nomme aucun fichier.` } };
    const flagLike = files.find((f) => f.startsWith('--'));
    if (flagLike !== undefined) return { ok: false, error: { en: `${file}: A line of the list looks like an option, not a file: ${flagLike.slice(0, 60)}`, fr: `${file}\u00A0: Une ligne de la liste ressemble à une option et non à un fichier\u00A0: ${flagLike.slice(0, 60)}` } };
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push('--html', f);
    }
  }
  return { ok: true, argv: out };
}

/** All three steps, the config file first so that it may name routes files and lists of pages. */
export async function expandInputs(argv: readonly string[], deps: InputDeps): Promise<Expanded> {
  const withConfig = await expandConfig(argv, deps);
  if (!withConfig.ok) return withConfig;
  const withRoutes = await expandRoutesFiles(withConfig.argv, deps);
  if (!withRoutes.ok) return withRoutes;
  return expandHtmlLists(withRoutes.argv, deps);
}
