/**
 * A JSON file that holds the options of the command line, so a project can
 * keep them in one place and under review:
 *
 *   { "html": ["dist/index.html"], "out": "audit", "lang": "fr", "format": ["markdown", "detail"] }
 *
 * The file is turned into the same arguments a person would type. Nothing
 * else reads it, so an option means the same in the file and on the command
 * line. Arguments typed after `--config` come later and win for options that
 * take one value; options that take a list are added together.
 *
 * Paths in the file are used as written, relative to where the command runs.
 */

type Text = { readonly en: string; readonly fr: string };

/** How a key of the file becomes arguments. */
export type ConfigKind =
  /** `"out": "audit"` gives `--out audit`. */
  | 'text'
  /** `"keyboardMax": 40` gives `--keyboard-max 40`. */
  | 'number'
  /** `"offline": true` gives `--offline`. False gives nothing. */
  | 'switch'
  /** `"html": ["a", "b"]` gives `--html a --html b`. */
  | 'each'
  /** `"format": ["csv", "detail"]` gives `--format csv,detail`. */
  | 'joined';

export interface ConfigKey {
  readonly key: string;
  readonly flag: string;
  readonly kind: ConfigKind;
}

const k = (key: string, flag: string, kind: ConfigKind): ConfigKey => ({ key, flag, kind });

export const CONFIG_KEYS: readonly ConfigKey[] = [
  k('baseUrl', '--base-url', 'text'),
  k('routes', '--route', 'each'),
  k('routesFile', '--routes-file', 'each'),
  k('lang', '--lang', 'text'),
  k('out', '--out', 'text'),
  k('profiles', '--profiles', 'joined'),
  k('offline', '--offline', 'switch'),
  k('keyboardMax', '--keyboard-max', 'number'),
  k('en', '--en', 'text'),
  k('fr', '--fr', 'text'),
  k('html', '--html', 'each'),
  k('data', '--data', 'text'),
  k('allowLicence', '--allow-licence', 'each'),
  k('requireFact', '--require-fact', 'each'),
  k('strictUnknown', '--strict-unknown', 'switch'),
  k('format', '--format', 'joined'),
  k('baseline', '--baseline', 'text'),
  k('writeBaseline', '--write-baseline', 'text'),
  k('waivers', '--waivers', 'text'),
  k('manifest', '--manifest', 'each'),
  k('sw', '--sw', 'each'),
  k('scan', '--scan', 'each'),
  k('allowHost', '--allow-host', 'each'),
  k('budget', '--budget', 'text'),
  k('writeBudget', '--write-budget', 'text'),
  k('history', '--history', 'text'),
  k('historyMax', '--history-max', 'number'),
  k('maxWeightKb', '--max-weight-kb', 'number'),
  k('only', '--only', 'joined'),
  k('skip', '--skip', 'joined'),
  k('compare', '--compare', 'text'),
  k('merge', '--merge', 'each'),
  k('ledger', '--ledger', 'text'),
  k('owners', '--owners', 'text'),
  k('review', '--review', 'text'),
  k('filter', '--filter', 'text'),
  k('redact', '--redact', 'switch'),
  k('shared', '--shared', 'switch'),
  k('nextSteps', '--next-steps', 'switch'),
  k('annotations', '--annotations', 'switch'),
  k('coverage', '--coverage', 'switch'),
  k('manualLog', '--manual-log', 'text'),
  k('htmlList', '--html-list', 'each'),
  k('markupChecks', '--markup-checks', 'switch'),
  k('siteRoot', '--site-root', 'text'),
  k('siteComplete', '--site-complete', 'switch'),
];

/** Keys the file may hold for the reader's own notes. They give no argument. */
export const NOTE_KEYS: readonly string[] = ['$schema', '$comment', 'comment'];

const BY_KEY: ReadonlyMap<string, ConfigKey> = new Map(CONFIG_KEYS.map((x) => [x.key, x]));

export type ParsedConfig = { readonly ok: true; readonly argv: readonly string[] } | { readonly ok: false; readonly error: Text };

const KIND_WORDS: Readonly<Record<ConfigKind, Text>> = {
  text: { en: 'a text value', fr: 'une valeur texte' },
  number: { en: 'a whole number, 0 or more', fr: 'un nombre entier, 0 ou plus' },
  switch: { en: 'true or false', fr: 'true ou false' },
  each: { en: 'a list of text values, or one text value', fr: 'une liste de valeurs texte, ou une seule valeur texte' },
  joined: { en: 'a list of text values, or one text value', fr: 'une liste de valeurs texte, ou une seule valeur texte' },
};

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function listOf(value: unknown): string[] | null {
  if (isText(value)) return [value];
  if (Array.isArray(value) && value.every(isText)) return value as string[];
  return null;
}

/** The closest known key, for a message that helps with a typing slip. Null when nothing is close. */
export function nearestKey(key: string): string | null {
  const flat = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = flat(key);
  if (want === '') return null;
  for (const x of CONFIG_KEYS) if (flat(x.key) === want || flat(x.flag) === want) return x.key;
  for (const x of CONFIG_KEYS) if (flat(x.key).startsWith(want) || want.startsWith(flat(x.key))) return x.key;
  return null;
}

/** Reads the text of a config file into arguments, in the order of `CONFIG_KEYS`, whatever the order of the file. */
export function parseConfig(text: string): ParsedConfig {
  const bad = (en: string, fr: string): ParsedConfig => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return bad('The config file is not valid JSON.', 'Le fichier de configuration n’est pas du JSON valide.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return bad('The config file must hold one JSON object.', 'Le fichier de configuration doit contenir un seul objet JSON.');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (BY_KEY.has(key) || NOTE_KEYS.includes(key)) continue;
    if (key === 'config') {
      return bad('A config file cannot name another config file.', 'Un fichier de configuration ne peut pas en nommer un autre.');
    }
    const near = nearestKey(key);
    return bad(
      `The config key "${key}" is not known.${near ? ` Did you mean "${near}"?` : ''} Keys: ${CONFIG_KEYS.map((x) => x.key).join(', ')}.`,
      `La clé de configuration "${key}" n’est pas reconnue.${near ? ` Vouliez-vous écrire "${near}"\u202F?` : ''} Clés possibles\u00A0: ${CONFIG_KEYS.map((x) => x.key).join(', ')}.`,
    );
  }
  const argv: string[] = [];
  for (const spec of CONFIG_KEYS) {
    if (!(spec.key in obj)) continue;
    const value = obj[spec.key];
    const wrong = (): ParsedConfig =>
      bad(`The config key "${spec.key}" needs ${KIND_WORDS[spec.kind].en}.`, `La clé de configuration "${spec.key}" demande ${KIND_WORDS[spec.kind].fr}.`);
    switch (spec.kind) {
      case 'text':
        if (!isText(value)) return wrong();
        argv.push(spec.flag, value);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return wrong();
        argv.push(spec.flag, String(value));
        break;
      case 'switch':
        if (typeof value !== 'boolean') return wrong();
        if (value) argv.push(spec.flag);
        break;
      case 'each': {
        const list = listOf(value);
        if (!list) return wrong();
        for (const item of list) argv.push(spec.flag, item);
        break;
      }
      case 'joined': {
        const list = listOf(value);
        if (!list) return wrong();
        if (list.some((item) => item.includes(','))) {
          return bad(`The values of the config key "${spec.key}" cannot hold a comma. Give them as a list.`, `Les valeurs de la clé de configuration "${spec.key}" ne peuvent pas contenir de virgule. Donnez-les sous forme de liste.`);
        }
        if (list.length > 0) argv.push(spec.flag, list.join(','));
        break;
      }
    }
  }
  return { ok: true, argv };
}

/** A starting config file with every key a first run needs and nothing else. */
export function sampleConfig(): string {
  return `${JSON.stringify({ $comment: 'Options of narrow-audit. Paths are relative to where the command runs.', html: ['dist/index.html'], out: 'audit', lang: 'en', format: ['markdown', 'detail'], nextSteps: true }, null, 2)}\n`;
}
