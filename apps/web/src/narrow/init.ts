import { EMPTY_MANUAL_LOG } from './manual-log.js';
import { samplePolicy } from './policy.js';
import { EMPTY_REVIEW } from './review.js';
import type { Lang } from './types.js';

/**
 * `narrow-audit init DIR`: writes the starter files of an audit into a
 * folder, so a project does not begin from an empty editor: a config file, a
 * policy, an owners file, an empty review file and an empty by-hand log, with
 * a short README that says what each is for.
 *
 * A file that is already there is left as it is unless `--force` is given,
 * and the command says which files it wrote and which it kept. The starter
 * files hold no finding and no note: the two logs start empty, because a
 * note nobody wrote must not be in a log.
 */

type Text = { readonly en: string; readonly fr: string };

export interface StarterFile {
  readonly name: string;
  readonly what: Text;
  content(dir: string, lang: Lang): string;
}

const OWNERS: Text = {
  en: '# Who looks at which findings. The last line that matches wins.\n# A line is a pattern and one owner. Patterns: *, route:PATTERN, rule:PATTERN.\n#\n# * @web-team\n# rule:contrast/* @design\n# route:/places/* @places-team\n',
  fr: '# Qui regarde quelles anomalies. La dernière ligne qui correspond l’emporte.\n# Une ligne contient un motif et un responsable. Motifs\u00A0: *, route:MOTIF, rule:MOTIF.\n#\n# * @equipe-web\n# rule:contrast/* @design\n# route:/places/* @equipe-lieux\n',
};

export const STARTER_FILES: readonly StarterFile[] = [
  {
    name: 'narrow-audit.json',
    what: { en: 'The options of a run. Use it with --config.', fr: 'Les options d’une exécution. À utiliser avec --config.' },
    content: (dir, lang) =>
      `${JSON.stringify(
        {
          $comment: lang === 'fr' ? 'Options de narrow-audit. Les chemins sont relatifs à l’endroit où la commande est lancée. Ajoutez "html" ou "baseUrl" et "routes".' : 'Options of narrow-audit. Paths are relative to where the command runs. Add "html", or "baseUrl" and "routes".',
          out: `${dir}/out`,
          lang,
          format: ['detail', 'worksheet', 'coverage', 'index'],
          history: `${dir}/history.json`,
          ledger: `${dir}/ledger.json`,
          owners: `${dir}/owners.txt`,
          review: `${dir}/review.json`,
          manualLog: `${dir}/manual-log.json`,
          nextSteps: true,
        },
        null,
        2,
      )}\n`,
  },
  { name: 'policy.json', what: { en: 'Limits the team agrees on. Used by narrow-audit triage --policy.', fr: 'Limites convenues par l’équipe. Utilisé par narrow-audit triage --policy.' }, content: () => samplePolicy() },
  { name: 'owners.txt', what: { en: 'Who looks at which findings. Every line starts as a comment.', fr: 'Qui regarde quelles anomalies. Chaque ligne est d’abord un commentaire.' }, content: (_dir, lang) => OWNERS[lang] },
  { name: 'review.json', what: { en: 'Notes on UNKNOWN findings a person has looked at. Starts empty.', fr: 'Notes sur les anomalies UNKNOWN qu’une personne a regardées. Vide au départ.' }, content: () => `${JSON.stringify(EMPTY_REVIEW, null, 2)}\n` },
  { name: 'manual-log.json', what: { en: 'What people saw when they looked at a criterion by hand. Starts empty.', fr: 'Ce que des personnes ont vu en regardant un critère à la main. Vide au départ.' }, content: () => `${JSON.stringify(EMPTY_MANUAL_LOG, null, 2)}\n` },
];

/** The README of the folder: what each file is for, and the three commands to start with. */
export function starterReadme(dir: string, lang: Lang): string {
  const fr = lang === 'fr';
  const out: string[] = [fr ? '# Fichiers de l’audit écran étroit' : '# Narrow-screen audit files', ''];
  out.push(fr ? 'Écrits par `narrow-audit init`. Modifiez-les\u00A0: ils sont à vous.' : 'Written by `narrow-audit init`. Edit them: they are yours.', '');
  out.push(fr ? '| Fichier | À quoi il sert |' : '| File | What it is for |', '| --- | --- |');
  for (const f of STARTER_FILES) out.push(`| \`${f.name}\` | ${f.what[lang]} |`);
  out.push(`| \`history.json\`, \`ledger.json\` | ${fr ? 'Créés par la première exécution.' : 'Created by the first run.'} |`, '');
  out.push(fr ? '## Pour commencer' : '## To start', '', '```');
  out.push(`npx tsx apps/web/src/narrow/bin.mjs check --config ${dir}/narrow-audit.json`);
  out.push(`npx tsx apps/web/src/narrow/bin.mjs --config ${dir}/narrow-audit.json --html dist/index.html`);
  out.push(`npx tsx apps/web/src/narrow/bin.mjs triage ${dir}/out/narrow-audit.json --ledger ${dir}/ledger.json --policy ${dir}/policy.json`);
  out.push('```', '');
  out.push(
    fr
      ? 'Les contrôles automatisés ne couvrent qu’une partie des critères WCAG 2.2. Un résultat sans anomalie n’est pas une déclaration de conformité.'
      : 'Automated checks cover only some WCAG 2.2 criteria. A clean result is not a conformance statement.',
  );
  return `${out.join('\n')}\n`;
}

export const INIT_HELP_TEXT =
  'Usage: narrow-audit init DIR [--lang en|fr] [--force]\n' +
  'Writes starter files into DIR: a config file, a policy, an owners file, an empty review file,\n' +
  'an empty by-hand log and a README. A file that is already there is kept unless --force is given.\n' +
  'Exit code 0 when done, 2 on a usage or write error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit init DOSSIER [--lang en|fr] [--force]\n' +
  'Écrit des fichiers de départ dans DOSSIER\u00A0: un fichier de configuration, une politique, un fichier des responsables,\n' +
  'un fichier de revue vide, un journal des contrôles à la main vide et un README. Un fichier déjà présent est gardé sauf avec --force.\n' +
  'Code de sortie 0 une fois terminé, 2 en cas d’erreur d’utilisation ou d’écriture.\n';

export type ParsedInitArgs = { readonly ok: true; readonly dir: string; readonly lang: Lang; readonly force: boolean; readonly help: boolean } | { readonly ok: false; readonly error: Text };

export function parseInitArgs(argv: readonly string[]): ParsedInitArgs {
  const fail = (en: string, fr: string): ParsedInitArgs => ({ ok: false, error: { en, fr } });
  let dir = '';
  let lang: Lang = 'en';
  let force = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--help') help = true;
    else if (a === '--force') force = true;
    else if (a === '--lang') {
      const v = argv[++i];
      if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit être en ou fr.');
      lang = v;
    } else if (a.startsWith('--')) return fail(`Unknown option ${a}.`, `Option non reconnue ${a}.`);
    else if (dir !== '') return fail(`Give one folder. Found a second one: ${a}`, `Indiquez un seul dossier. Un deuxième a été trouvé\u00A0: ${a}`);
    else dir = a.replace(/\/+$/, '');
  }
  if (!help && dir === '') return fail('Give the folder to write into, such as audit.', 'Indiquez le dossier où écrire, par exemple audit.');
  return { ok: true, dir, lang, force, help };
}

export interface InitDeps {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  log(line: string): void;
}

export interface InitResult {
  readonly written: readonly string[];
  readonly kept: readonly string[];
}

async function exists(deps: InitDeps, path: string): Promise<boolean> {
  try {
    await deps.readText(path);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(msg)) return false;
    throw err;
  }
}

/** Writes the starter files. A file that is there is kept unless `force` is set. */
export async function writeStarterFiles(dir: string, lang: Lang, force: boolean, deps: InitDeps): Promise<InitResult> {
  const written: string[] = [];
  const kept: string[] = [];
  const all = [...STARTER_FILES.map((f) => ({ name: f.name, content: f.content(dir, lang) })), { name: 'README.md', content: starterReadme(dir, lang) }];
  for (const f of all) {
    const path = `${dir}/${f.name}`;
    if (!force && (await exists(deps, path))) {
      kept.push(path);
      continue;
    }
    await deps.writeText(path, f.content);
    written.push(path);
  }
  return { written, kept };
}

export async function runInit(argv: readonly string[], deps: InitDeps): Promise<number> {
  const parsed = parseInitArgs(argv);
  if (!parsed.ok) {
    deps.log(`${parsed.error.en} / ${parsed.error.fr}`);
    deps.log(INIT_HELP_TEXT);
    return 2;
  }
  if (parsed.help) {
    deps.log(INIT_HELP_TEXT);
    return 0;
  }
  const fr = parsed.lang === 'fr';
  try {
    const result = await writeStarterFiles(parsed.dir, parsed.lang, parsed.force, deps);
    if (result.written.length > 0) deps.log(`${fr ? 'Écrit\u00A0:' : 'Written:'} ${result.written.join(', ')}`);
    if (result.kept.length > 0) deps.log(`${fr ? 'Déjà présent, gardé tel quel\u00A0:' : 'Already there, kept as it is:'} ${result.kept.join(', ')}`);
    deps.log(fr ? `Ensuite\u00A0: lisez ${parsed.dir}/README.md.` : `Next: read ${parsed.dir}/README.md.`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`Init failed / Échec de l’initialisation${fr ? '\u00A0' : ''}: ${msg}`);
    return 2;
  }
}
