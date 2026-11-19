import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseArgs } from './cli.js';
import { EXTRA_FLAGS } from './cli-extras.js';
import { CONFIG_KEYS, NOTE_KEYS, nearestKey, parseConfig, sampleConfig } from './config.js';
import { frTypographyIssues } from './i18n.js';

const argvOf = (value: unknown): readonly string[] => {
  const parsed = parseConfig(JSON.stringify(value));
  if (!parsed.ok) throw new Error(parsed.error.en);
  return parsed.argv;
};

const errorOf = (text: string): { en: string; fr: string } => {
  const parsed = parseConfig(text);
  if (parsed.ok) throw new Error('expected an error');
  return parsed.error;
};

describe('the keys of a config file', () => {
  it('name each key and each flag once', () => {
    expect(new Set(CONFIG_KEYS.map((x) => x.key)).size).toBe(CONFIG_KEYS.length);
    expect(new Set(CONFIG_KEYS.map((x) => x.flag)).size).toBe(CONFIG_KEYS.length);
  });

  it('write keys in camel case and flags with dashes', () => {
    for (const x of CONFIG_KEYS) {
      expect(x.key, x.key).toMatch(/^[a-z][A-Za-z]*$/);
      expect(x.flag, x.flag).toMatch(/^--[a-z]+(-[a-z]+)*$/);
      expect(x.flag.replace(/^--/, '').replace(/-/g, '').replace(/^route$/, 'routes'), x.key).toBe(x.key.toLowerCase());
    }
  });

  it('cover every flag the help lists, except the ones that make no sense in a file', () => {
    const inHelp = new Set(HELP_TEXT.match(/--[a-z]+(?:-[a-z]+)*/g) ?? []);
    const notInFile = new Set(['--help', '--config']);
    const missing = [...inHelp].filter((flag) => !notInFile.has(flag) && !CONFIG_KEYS.some((x) => x.flag === flag));
    expect(missing).toEqual([]);
  });

  it('cover the options that work on the finished report', () => {
    for (const flag of EXTRA_FLAGS) expect(CONFIG_KEYS.map((x) => x.flag), flag).toContain(flag);
  });

  it('name only flags the command line reads', () => {
    for (const x of CONFIG_KEYS) expect(HELP_TEXT, x.flag).toContain(x.flag);
  });
});

describe('parseConfig', () => {
  it('turns each kind of key into arguments', () => {
    expect(argvOf({ out: 'audit' })).toEqual(['--out', 'audit']);
    expect(argvOf({ keyboardMax: 40 })).toEqual(['--keyboard-max', '40']);
    expect(argvOf({ offline: true })).toEqual(['--offline']);
    expect(argvOf({ offline: false })).toEqual([]);
    expect(argvOf({ html: ['a.html', 'b.html'] })).toEqual(['--html', 'a.html', '--html', 'b.html']);
    expect(argvOf({ html: 'a.html' })).toEqual(['--html', 'a.html']);
    expect(argvOf({ format: ['csv', 'detail'] })).toEqual(['--format', 'csv,detail']);
    expect(argvOf({ format: 'csv' })).toEqual(['--format', 'csv']);
    expect(argvOf({ only: [] })).toEqual([]);
  });

  it('writes the arguments in a fixed order, whatever the order of the file', () => {
    const a = argvOf({ out: 'o', html: ['a.html'], lang: 'fr' });
    const b = argvOf({ lang: 'fr', out: 'o', html: ['a.html'] });
    expect(a).toEqual(b);
    expect(a).toEqual(['--lang', 'fr', '--out', 'o', '--html', 'a.html']);
  });

  it('skips the keys kept for notes', () => {
    expect(argvOf({ $schema: './schema.json', $comment: 'weekly run', comment: ['a', 'b'], out: 'o' })).toEqual(['--out', 'o']);
    expect(NOTE_KEYS).toContain('$comment');
  });

  it('accepts an empty object and a byte order mark', () => {
    expect(argvOf({})).toEqual([]);
    expect(parseConfig('\uFEFF{"out":"o"}')).toEqual({ ok: true, argv: ['--out', 'o'] });
  });

  it('gives arguments the command line accepts', () => {
    const argv = argvOf({
      html: ['a.html'],
      out: 'audit',
      lang: 'fr',
      format: ['markdown', 'detail'],
      only: ['static-html'],
      strictUnknown: true,
      ledger: 'ledger.json',
      filter: 'status:fail',
      redact: true,
      nextSteps: true,
      historyMax: 20,
    });
    expect(parseArgs(argv)).toMatchObject({
      ok: true,
      args: { htmlFiles: ['a.html'], outDir: 'audit', lang: 'fr', formats: ['markdown', 'detail'], only: ['static-html'], strictUnknown: true, historyMax: 20, extras: { ledgerFile: 'ledger.json', filterText: 'status:fail', redact: true, nextSteps: true } },
    });
  });

  it.each([
    ['not json', 'not valid JSON', 'n’est pas du JSON valide'],
    ['[]', 'one JSON object', 'un seul objet JSON'],
    ['"text"', 'one JSON object', 'un seul objet JSON'],
    ['null', 'one JSON object', 'un seul objet JSON'],
    ['{"out": 3}', '"out" needs a text value', '"out" demande une valeur texte'],
    ['{"out": ""}', '"out" needs a text value', '"out" demande une valeur texte'],
    ['{"keyboardMax": "40"}', '"keyboardMax" needs a whole number, 0 or more', '"keyboardMax" demande un nombre entier, 0 ou plus'],
    ['{"keyboardMax": 1.5}', '"keyboardMax" needs a whole number', '"keyboardMax" demande un nombre entier'],
    ['{"historyMax": -1}', '"historyMax" needs a whole number', '"historyMax" demande un nombre entier'],
    ['{"offline": "yes"}', '"offline" needs true or false', '"offline" demande true ou false'],
    ['{"html": [1, 2]}', '"html" needs a list of text values', '"html" demande une liste de valeurs texte'],
    ['{"html": ["a.html", ""]}', '"html" needs a list of text values', '"html" demande une liste de valeurs texte'],
    ['{"format": {"a": 1}}', '"format" needs a list of text values', '"format" demande une liste de valeurs texte'],
    ['{"format": ["csv,detail"]}', '"format" cannot hold a comma', '"format" ne peuvent pas contenir de virgule'],
    ['{"config": "other.json"}', 'cannot name another config file', 'ne peut pas en nommer un autre'],
  ])('refuses %s', (text, en, fr) => {
    const error = errorOf(text);
    expect(error.en).toContain(en);
    expect(error.fr).toContain(fr);
    expect(frTypographyIssues(error.fr), error.fr).toEqual([]);
  });

  it('names the key it does not know, suggests a close one and lists the keys', () => {
    const error = errorOf('{"base-url": "https://app.example"}');
    expect(error.en).toContain('The config key "base-url" is not known. Did you mean "baseUrl"? Keys: baseUrl, routes, ');
    expect(error.fr).toContain('La clé de configuration "base-url" n’est pas reconnue. Vouliez-vous écrire "baseUrl"\u202F? Clés possibles\u00A0: baseUrl, ');
    expect(frTypographyIssues(error.fr)).toEqual([]);
  });

  it('suggests nothing for a key that is close to none', () => {
    const error = errorOf('{"zzz": 1}');
    expect(error.en).toContain('The config key "zzz" is not known. Keys: ');
    expect(error.en).not.toContain('Did you mean');
  });

  it('stops at the first problem and gives no arguments', () => {
    expect(parseConfig('{"out": "o", "offline": 1}')).toMatchObject({ ok: false });
  });
});

describe('nearestKey', () => {
  it.each([
    ['base-url', 'baseUrl'],
    ['BASEURL', 'baseUrl'],
    ['--keyboard-max', 'keyboardMax'],
    ['route', 'routes'],
    ['formats', 'format'],
    ['next_steps', 'nextSteps'],
    ['zzz', null],
    ['', null],
    ['---', null],
  ])('%j gives %j', (key, want) => {
    expect(nearestKey(key)).toBe(want);
  });
});

describe('sampleConfig', () => {
  it('is a config file the reader and the command line accept', () => {
    const parsed = parseConfig(sampleConfig());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parseArgs(parsed.argv).ok).toBe(true);
    expect(sampleConfig().endsWith('}\n')).toBe(true);
  });
});
