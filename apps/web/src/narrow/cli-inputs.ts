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

export const INPUT_HELP_EN = '                    [--config FILE.json] [--routes-file FILE ...]\n';
export const INPUT_HELP_FR = '                    [--config FICHIER.json] [--routes-file FICHIER ...]\n';

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

/** Both steps, the config file first so that it may name routes files. */
export async function expandInputs(argv: readonly string[], deps: InputDeps): Promise<Expanded> {
  const withConfig = await expandConfig(argv, deps);
  if (!withConfig.ok) return withConfig;
  return expandRoutesFiles(withConfig.argv, deps);
}
