import { describe, expect, it } from 'vitest';
import { HELP_TEXT, runCli, type CliDeps } from './cli.js';
import { parseConfig, sampleConfig } from './config.js';
import { CHECK_HELP_TEXT, CONFIG_FILE_KEYS, CREATED_BY_RUN, FILE_KINDS, allUsable, checkFiles, describeFileChecks, filesNamedByConfig, parseCheckArgs, problemIn, runCheck, type FileKind } from './doctor.js';
import { EMPTY_HISTORY } from './history.js';
import { lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { INIT_HELP_TEXT, STARTER_FILES, parseInitArgs, runInit, starterReadme, writeStarterFiles } from './init.js';
import { EMPTY_LEDGER } from './ledger.js';
import { sampleManualLog } from './manual-log.js';
import { samplePolicy } from './policy.js';
import { renderJson } from './report.js';
import { smallSite } from './report-fixtures.js';
import { pageHtml } from './site-testkit.js';
import { TRIAGE_HELP_TEXT } from './triage-cli.js';

const NOW = new Date('2026-11-19T10:00:00Z');

function world(files: Record<string, string> = {}): { deps: CliDeps; files: Map<string, string>; logs: string[]; text: () => string; launched: () => number } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  let launches = 0;
  const deps: CliDeps = {
    async launch() {
      launches++;
      throw new Error('browser launched');
    },
    async readText(path) {
      const text = store.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file: ${path}`);
      return text;
    },
    async writeText(path, text) {
      store.set(path, text);
    },
    log(line) {
      logs.push(line);
    },
    now: () => NOW,
  };
  return { deps, files: store, logs, text: () => logs.join('\n'), launched: () => launches };
}

/** One good file of every kind. */
const GOOD: Readonly<Record<FileKind, string>> = {
  config: sampleConfig(),
  report: renderJson(smallSite()),
  baseline: JSON.stringify({ version: 1, generatedAt: NOW.toISOString(), keys: [] }),
  waivers: '{"waivers": []}',
  budget: JSON.stringify({ version: 1, checks: {} }),
  history: JSON.stringify(EMPTY_HISTORY),
  ledger: JSON.stringify(EMPTY_LEDGER),
  owners: '* @web\n',
  review: '{"version":1,"notes":[]}',
  policy: samplePolicy(),
  'manual-log': sampleManualLog(),
};

describe('problemIn', () => {
  it.each(FILE_KINDS.map((k) => [k]))('accepts a good %s file', (kind) => {
    expect(problemIn(kind, GOOD[kind], NOW)).toBeNull();
  });

  it.each(FILE_KINDS.filter((k) => k !== 'owners').map((k) => [k]))('says what is wrong with a %s file that is not JSON, in both languages', (kind) => {
    const problem = problemIn(kind, 'not json {', NOW);
    expect(problem).not.toBeNull();
    expect(problem?.en).not.toBe('');
    expect(problem?.fr).not.toBe(problem?.en);
    expect(frTypographyIssues(problem?.fr ?? ''), problem?.fr).toEqual([]);
  });

  it('says what is wrong with an owners file', () => {
    expect(problemIn('owners', 'no owner here\n', NOW)?.en).toContain('Owners file, line 1');
  });

  it('refuses a by-hand note dated after today', () => {
    const log = '{"version":1,"notes":[{"sc":"2.4.7","result":"not-sure","on":"2026-11-20","by":"@sam"}]}';
    expect(problemIn('manual-log', log, NOW)?.en).toContain('after today');
    expect(problemIn('manual-log', log, new Date('2026-11-21T00:00:00Z'))).toBeNull();
  });
});

describe('filesNamedByConfig', () => {
  it('finds the files a config names, with their kind', () => {
    const config = JSON.stringify({ html: ['a.html'], ledger: 'audit/ledger.json', owners: 'audit/owners.txt', manualLog: 'audit/manual.json', merge: ['old-1.json', 'old-2.json'], compare: 'last.json', out: 'audit/out' });
    expect(filesNamedByConfig(config)).toEqual([
      { kind: 'report', file: 'last.json' },
      { kind: 'report', file: 'old-1.json' },
      { kind: 'report', file: 'old-2.json' },
      { kind: 'ledger', file: 'audit/ledger.json' },
      { kind: 'owners', file: 'audit/owners.txt' },
      { kind: 'manual-log', file: 'audit/manual.json' },
    ]);
  });

  it('gives nothing for a config it cannot read, or one that names no file', () => {
    expect(filesNamedByConfig('nope')).toEqual([]);
    expect(filesNamedByConfig('[]')).toEqual([]);
    expect(filesNamedByConfig('{"html": ["a.html"], "owners": 3, "ledger": " "}')).toEqual([]);
  });

  it('only knows keys the config file has', () => {
    expect(parseConfig(JSON.stringify(Object.fromEntries(Object.keys(CONFIG_FILE_KEYS).map((k) => [k, k === 'merge' ? ['x'] : 'x'])))).ok).toBe(true);
  });
});

describe('checkFiles', () => {
  it('says each file can be used', async () => {
    const w = world({ 'o.txt': GOOD.owners, 'p.json': GOOD.policy });
    const results = await checkFiles([{ kind: 'owners', file: 'o.txt' }, { kind: 'policy', file: 'p.json' }], w.deps);
    expect(results.map((r) => r.state)).toEqual(['usable', 'usable']);
    expect(allUsable(results)).toBe(true);
  });

  it('brings in the files a config names, and reads each file once', async () => {
    const config = JSON.stringify({ html: ['a.html'], owners: 'o.txt', ledger: 'l.json', review: 'r.json' });
    const w = world({ 'c.json': config, 'o.txt': 'broken line here\n', 'r.json': GOOD.review });
    const results = await checkFiles([{ kind: 'config', file: 'c.json' }, { kind: 'owners', file: 'o.txt' }], w.deps);
    expect(results.map((r) => [r.kind, r.file, r.state])).toEqual([
      ['config', 'c.json', 'usable'],
      ['owners', 'o.txt', 'not-usable'],
      ['ledger', 'l.json', 'missing-created-by-run'],
      ['review', 'r.json', 'usable'],
    ]);
    expect(allUsable(results)).toBe(false);
  });

  it('does not count a history or a ledger that is not there yet as a problem, and counts every other missing file', async () => {
    const w = world();
    const results = await checkFiles(FILE_KINDS.map((kind) => ({ kind, file: `${kind}.x` })), w.deps);
    for (const r of results) expect(r.state, r.kind).toBe(CREATED_BY_RUN.has(r.kind) ? 'missing-created-by-run' : 'missing');
    expect(allUsable(results.filter((r) => CREATED_BY_RUN.has(r.kind)))).toBe(true);
  });

  it('still reads the files a config names when the config has a key it does not know', async () => {
    const w = world({ 'c.json': '{"owner": "o.txt", "owners": "o.txt"}', 'o.txt': GOOD.owners });
    const results = await checkFiles([{ kind: 'config', file: 'c.json' }], w.deps);
    expect(results.map((r) => [r.kind, r.state])).toEqual([['config', 'not-usable'], ['owners', 'usable']]);
  });
});

describe('describeFileChecks', () => {
  it('puts the files with a problem first and says what is wrong', async () => {
    const w = world({ 'o.txt': 'broken line here\n', 'p.json': GOOD.policy });
    const results = await checkFiles([{ kind: 'policy', file: 'p.json' }, { kind: 'owners', file: 'o.txt' }, { kind: 'review', file: 'r.json' }, { kind: 'ledger', file: 'l.json' }], w.deps);
    const lines = describeFileChecks(results, 'en').split('\n');
    expect(lines[0]).toBe('2 of 4 file(s) have a problem.');
    expect(lines[1]).toContain('  CANNOT BE USED owners o.txt: Owners file, line 1');
    expect(lines[2]).toBe('  NOT FOUND review r.json');
    expect(lines[3]).toBe('  NOT THERE YET ledger l.json: the first run creates it.');
    expect(lines[4]).toBe('  CAN BE USED policy p.json');
    expect(lines[5]).toBe('A file that can be used parses and has the expected shape. That does not say its content is right.');
  });

  it('writes French with French typography', async () => {
    const w = world({ 'o.txt': 'broken line here\n' });
    const out = describeFileChecks(await checkFiles([{ kind: 'owners', file: 'o.txt' }, { kind: 'history', file: 'h.json' }], w.deps), 'fr');
    expect(out).toContain('1 fichier(s) sur 2 posent un problème.');
    expect(out).toContain('  INUTILISABLE owners o.txt\u00A0: Fichier des responsables, ligne 1');
    expect(out).toContain('  PAS ENCORE LÀ history h.json\u00A0: la première exécution le crée.');
    for (const line of out.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('says so when all can be used, and when there is nothing to read', async () => {
    const w = world({ 'p.json': GOOD.policy });
    expect(describeFileChecks(await checkFiles([{ kind: 'policy', file: 'p.json' }], w.deps), 'en').split('\n')[0]).toBe('All 1 files read can be used.');
    expect(describeFileChecks([], 'fr')).toBe('Aucun fichier à lire.\n');
  });
});

describe('narrow-audit check', () => {
  it('reads every option, each as many times as given', () => {
    const parsed = parseCheckArgs(['--owners', 'a.txt', '--owners', 'b.txt', '--manual-log', 'm.json', '--lang', 'fr']);
    expect(parsed).toEqual({ ok: true, files: [{ kind: 'owners', file: 'a.txt' }, { kind: 'owners', file: 'b.txt' }, { kind: 'manual-log', file: 'm.json' }], lang: 'fr', help: false });
  });

  it.each([
    [[], 'Give at least one file to read'],
    [['--nope', 'x'], 'Unknown option --nope.'],
    [['owners.txt'], 'Unknown option owners.txt.'],
    [['--owners'], '--owners needs a value.'],
    [['--owners', 'o.txt', '--lang', 'de'], '--lang must be en or fr.'],
  ])('refuses %j with code 2 and prints the usage', async (argv, en) => {
    const w = world();
    expect(await runCheck(argv, w.deps)).toBe(2);
    expect(w.logs[0]).toContain(en);
    expect(w.logs[1]).toBe(CHECK_HELP_TEXT);
  });

  it('exits 0 when every file can be used and 1 when one cannot', async () => {
    const good = world({ 'o.txt': GOOD.owners });
    expect(await runCli(['check', '--owners', 'o.txt'], good.deps)).toBe(0);
    const bad = world({ 'o.txt': 'broken line here\n' });
    expect(await runCli(['check', '--owners', 'o.txt'], bad.deps)).toBe(1);
    expect(bad.text()).toContain('CANNOT BE USED owners o.txt');
    expect(await runCli(['check', '--owners', 'missing.txt'], world().deps)).toBe(1);
  });

  it('never starts a browser and writes nothing', async () => {
    const w = world({ 'c.json': '{"baseUrl": "https://app.example", "routes": ["/"], "owners": "o.txt"}', 'o.txt': GOOD.owners });
    expect(await runCli(['check', '--config', 'c.json'], w.deps)).toBe(0);
    expect(w.launched()).toBe(0);
    expect([...w.files.keys()].sort()).toEqual(['c.json', 'o.txt']);
  });

  it('prints its help in both languages', async () => {
    const w = world();
    expect(await runCli(['check', '--help'], w.deps)).toBe(0);
    expect(w.logs).toEqual([CHECK_HELP_TEXT]);
    expect(CHECK_HELP_TEXT).toContain('Utilisation\u00A0: narrow-audit check');
    for (const kind of FILE_KINDS) expect(CHECK_HELP_TEXT.split(`--${kind} `).length - 1, kind).toBe(2);
  });
});

describe('narrow-audit init', () => {
  it('reads the folder and the options', () => {
    expect(parseInitArgs(['audit/', '--lang', 'fr', '--force'])).toEqual({ ok: true, dir: 'audit', lang: 'fr', force: true, help: false });
    expect(parseInitArgs(['audit'])).toMatchObject({ ok: true, lang: 'en', force: false });
  });

  it.each([
    [[], 'Give the folder to write into'],
    [['a', 'b'], 'Give one folder. Found a second one: b'],
    [['a', '--nope'], 'Unknown option --nope.'],
    [['a', '--lang', 'de'], '--lang must be en or fr.'],
  ])('refuses %j with code 2', async (argv, en) => {
    const w = world();
    expect(await runInit(argv, w.deps)).toBe(2);
    expect(w.logs[0]).toContain(en);
    expect(w.logs[1]).toBe(INIT_HELP_TEXT);
    expect(w.files.size).toBe(0);
  });

  it('writes the starter files and a README, and says which', async () => {
    const w = world();
    expect(await runCli(['init', 'audit'], w.deps)).toBe(0);
    expect([...w.files.keys()].sort()).toEqual(['audit/README.md', 'audit/manual-log.json', 'audit/narrow-audit.json', 'audit/owners.txt', 'audit/policy.json', 'audit/review.json']);
    expect(w.logs[0]).toBe('Written: audit/narrow-audit.json, audit/policy.json, audit/owners.txt, audit/review.json, audit/manual-log.json, audit/README.md');
    expect(w.logs[1]).toBe('Next: read audit/README.md.');
  });

  it('writes files the check command and the audit can use as they are', async () => {
    const w = world();
    await runCli(['init', 'audit'], w.deps);
    expect(await runCli(['check', '--config', 'audit/narrow-audit.json', '--policy', 'audit/policy.json'], w.deps)).toBe(0);
    expect(w.text()).toContain('All 7 files read can be used.');
    w.files.set('a.html', pageHtml());
    const code = await runCli(['--config', 'audit/narrow-audit.json', '--html', 'a.html'], w.deps);
    expect(code === 0 || code === 1).toBe(true);
    for (const f of ['audit/out/narrow-audit.json', 'audit/out/narrow-audit.detail.en.html', 'audit/out/narrow-audit.worksheet.en.html', 'audit/out/narrow-audit.coverage.en.md', 'audit/out/index.en.html', 'audit/history.json', 'audit/ledger.json']) {
      expect(w.files.has(f), f).toBe(true);
    }
  });

  it('starts the two logs empty: a note nobody wrote is not in a log', async () => {
    const w = world();
    await runCli(['init', 'audit'], w.deps);
    expect(JSON.parse(w.files.get('audit/manual-log.json') ?? '')).toEqual({ version: 1, notes: [] });
    expect(JSON.parse(w.files.get('audit/review.json') ?? '')).toEqual({ version: 1, notes: [] });
  });

  it('keeps a file that is already there, and says so', async () => {
    const w = world({ 'audit/owners.txt': '* @mine\n' });
    expect(await runCli(['init', 'audit'], w.deps)).toBe(0);
    expect(w.files.get('audit/owners.txt')).toBe('* @mine\n');
    expect(w.logs[1]).toBe('Already there, kept as it is: audit/owners.txt');
  });

  it('replaces files only with --force', async () => {
    const w = world({ 'audit/owners.txt': '* @mine\n' });
    const result = await writeStarterFiles('audit', 'en', true, w.deps);
    expect(result.kept).toEqual([]);
    expect(w.files.get('audit/owners.txt')).not.toBe('* @mine\n');
  });

  it('writes French files with French typography when asked', async () => {
    const w = world();
    await runCli(['init', 'audit', '--lang', 'fr'], w.deps);
    expect(w.logs[0]?.startsWith('Écrit\u00A0: ')).toBe(true);
    expect(w.logs[1]).toBe('Ensuite\u00A0: lisez audit/README.md.');
    const readme = w.files.get('audit/README.md') ?? '';
    expect(readme).toContain('# Fichiers de l’audit écran étroit');
    for (const line of readme.split('\n').filter((l) => !l.startsWith('npx ') && !l.startsWith('|'))) expect(frTypographyIssues(line), line).toEqual([]);
    expect(JSON.parse(w.files.get('audit/narrow-audit.json') ?? '{}').lang).toBe('fr');
    for (const line of (w.files.get('audit/owners.txt') ?? '').split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('names every starter file in the README, and never promises conformance', () => {
    const readme = starterReadme('audit', 'en');
    for (const f of STARTER_FILES) expect(readme, f.name).toContain(`\`${f.name}\``);
    expect(readme).toContain('A clean result is not a conformance statement.');
    for (const f of STARTER_FILES) expect(frTypographyIssues(f.what.fr), f.what.fr).toEqual([]);
  });
});

describe('the subcommands and the new formats on the main command', () => {
  it('runs triage through the main command', async () => {
    const w = world({ 'r.json': renderJson(smallSite()) });
    expect(await runCli(['triage', 'r.json'], w.deps)).toBe(0);
    expect(w.text()).toContain('Where to start: ');
    expect(w.launched()).toBe(0);
    const help = world();
    await runCli(['triage', '--help'], help.deps);
    expect(help.logs).toEqual([TRIAGE_HELP_TEXT]);
  });

  it('lists the four subcommands in the help, in both languages', () => {
    for (const name of ['plan', 'triage', 'check', 'init']) expect(HELP_TEXT.split(`narrow-audit ${name} --help`).length - 1, name).toBe(2);
  });

  it('writes the runs-over-time page from the history', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o', '--history', 'h.json', '--format', 'trend'], w.deps);
    const html = w.files.get('o/narrow-audit.trend.en.html') ?? '';
    expect(html).toContain('<h1>Narrow-screen audit, runs over time</h1>');
    expect(html).toContain('One run is not a trend.');
    expect(lintHtml(html).entries).toEqual([]);
  });

  it('refuses the trend format without a history', async () => {
    const w = world({ 'a.html': pageHtml() });
    expect(await runCli(['--html', 'a.html', '--out', 'o', '--format', 'trend'], w.deps)).toBe(2);
    expect(w.logs[0]).toContain('--format trend draws the history, so it needs --history.');
  });

  it('writes an index of every file the run put into --out, whichever option wrote it', async () => {
    const w = world({ 'a.html': pageHtml(), 'old.json': renderJson(smallSite()), 'review.json': '{"version":1,"notes":[]}' });
    await runCli(['--html', 'a.html', '--out', 'o', '--history', 'h.json', '--compare', 'old.json', '--review', 'review.json', '--format', 'index,detail,trend,csv'], w.deps);
    const html = w.files.get('o/index.en.html') ?? '';
    const written = [...w.files.keys()].filter((f) => f.startsWith('o/') && f !== 'o/index.en.html').map((f) => f.slice(2)).sort();
    const linked = (html.match(/<a href="[^"]+"/g) ?? []).map((a) => a.slice(9, -1)).sort();
    expect(linked).toEqual(written);
    expect(written).toEqual(['narrow-audit.compare.en.md', 'narrow-audit.csv', 'narrow-audit.detail.en.html', 'narrow-audit.en.html', 'narrow-audit.json', 'narrow-audit.review.en.txt', 'narrow-audit.trend.en.html']);
    expect(html).not.toContain('h.json');
    expect(lintHtml(html).entries).toEqual([]);
  });

  it('writes no index unless asked', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o'], w.deps);
    expect([...w.files.keys()].some((f) => f.includes('index.'))).toBe(false);
  });
});
