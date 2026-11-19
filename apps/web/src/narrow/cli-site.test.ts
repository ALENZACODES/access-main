import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseArgs, runCli, type CliDeps } from './cli.js';
import { parseConfig } from './config.js';
import { lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { parseReport } from './reportio.js';
import { sampleManualLog } from './manual-log.js';
import { pageHtml, tidySite } from './site-testkit.js';

function world(files: Record<string, string>): { deps: CliDeps; files: Map<string, string>; logs: string[]; text: () => string } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  const deps: CliDeps = {
    async launch() {
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
    now: () => new Date('2026-11-19T10:00:00Z'),
  };
  return { deps, files: store, logs, text: () => logs.join('\n') };
}

/** The tidy site as built files under `dist`. */
function distFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of tidySite()) out[p.route === '/' ? 'dist/index.html' : `dist${p.route}/index.html`] = p.html;
  return out;
}
const htmlArgs = (files: Record<string, string>): string[] => Object.keys(files).flatMap((f) => ['--html', f]);

const BROKEN: Record<string, string> = {
  'dist/index.html': pageHtml({ title: 'Home', main: '<a href="/about#team">Team</a><a href="/gone">Gone</a><a href="/about">About</a>', footer: '<a href="/sitemap">Site map</a>' }),
  'dist/about/index.html': pageHtml({ title: 'About', main: '<a href="/">Home</a>' }),
};

describe('parseArgs with the site and markup options', () => {
  it('reads them', () => {
    expect(parseArgs(['--html', 'dist/a.html', '--html', 'dist/b.html', '--site-root', 'dist', '--site-complete', '--markup-checks'])).toMatchObject({
      ok: true,
      args: { siteRoot: 'dist', siteComplete: true, markupChecks: true },
    });
  });

  it('leaves them off by default', () => {
    expect(parseArgs(['--html', 'a.html'])).toMatchObject({ ok: true, args: { siteRoot: null, siteComplete: false, markupChecks: false } });
  });

  it.each([
    [['--html', 'a.html', '--site-root'], '--site-root needs a folder.'],
    [['--html', 'a.html', '--site-root', 'dist'], '--site-root compares pages, so it needs at least two --html files.'],
    [['--html', 'a.html', '--html', 'b.html', '--site-complete'], '--site-complete needs --site-root.'],
    [['--data', 'd.json', '--markup-checks'], '--markup-checks needs at least one --html file.'],
  ])('refuses %j', (argv, en) => {
    const parsed = parseArgs(argv);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toBe(en);
    expect(frTypographyIssues(parsed.error.fr), parsed.error.fr).toEqual([]);
  });

  it('lists them in the help in both languages, and in the config keys', () => {
    for (const flag of ['--site-root', '--site-complete', '--markup-checks', '--coverage']) expect(HELP_TEXT.split(flag).length - 1, flag).toBe(2);
    expect(parseConfig('{"html": ["dist/a.html", "dist/b.html"], "siteRoot": "dist", "siteComplete": true, "markupChecks": true, "coverage": true}')).toEqual({
      ok: true,
      argv: ['--html', 'dist/a.html', '--html', 'dist/b.html', '--coverage', '--markup-checks', '--site-root', 'dist', '--site-complete'],
    });
  });
});

describe('--site-root', () => {
  it('adds a part that compares the files as pages of one site', async () => {
    const files = distFiles();
    const w = world(files);
    await runCli([...htmlArgs(files), '--site-root', 'dist', '--site-complete', '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const site = stored.value.routes.find((r) => r.route === 'site:files');
    expect(site?.checks.map((c) => c.check)).toEqual(['consistency', 'site-links', 'lang-pairs']);
    expect(site?.entries.filter((e) => e.status === 'fail')).toEqual([]);
    expect(stored.value.routes).toHaveLength(Object.keys(files).length + 1);
  });

  it('is not added without the option', async () => {
    const files = distFiles();
    const w = world(files);
    await runCli([...htmlArgs(files), '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.some((r) => r.route.startsWith('site'))).toBe(false);
  });

  it('fails a link to an id the other file does not have, and exits 1', async () => {
    const w = world(BROKEN);
    expect(await runCli([...htmlArgs(BROKEN), '--site-root', 'dist', '--only', 'site-links'], w.deps)).toBe(1);
    expect(w.text()).toContain('site:files: 1 to fix');
    expect(w.text()).toContain('This link goes to #team on /about, and that page has no element with this id.');
    expect(w.text()).not.toContain('the site has no such page');
  });

  it('fails a link to a page outside the files only with --site-complete', async () => {
    const w = world(BROKEN);
    await runCli([...htmlArgs(BROKEN), '--site-root', 'dist', '--site-complete', '--only', 'site-links'], w.deps);
    expect(w.text()).toContain('A page links to /gone (/), and the site has no such page.');
    expect(w.text()).toContain('site:files: 3 to fix');
  });

  it('names files outside the root and goes on with the others', async () => {
    const files = { ...BROKEN, 'tmp/extra.html': pageHtml({ title: 'Extra' }) };
    const w = world(files);
    await runCli([...htmlArgs(files), '--site-root', 'dist'], w.deps);
    expect(w.logs[0]).toBe('1 file(s) outside dist, or a second file for one route, are not compared: tmp/extra.html');
    expect(w.text()).toContain('site:files:');
  });

  it('says so when fewer than two files are under the root', async () => {
    const files = { 'dist/index.html': pageHtml({ title: 'Home' }), 'tmp/a.html': pageHtml({ title: 'A' }) };
    const w = world(files);
    await runCli([...htmlArgs(files), '--site-root', 'dist', '--lang', 'fr'], w.deps);
    expect(w.text()).toContain('Moins de deux pages sous dist\u00A0: les pages ne sont pas comparées entre elles.');
    expect(w.text()).not.toContain('site:files');
    for (const line of w.logs.slice(0, 2)) expect(frTypographyIssues(line), line).toEqual([]);
  });
});

describe('--markup-checks', () => {
  const page = pageHtml({ title: 'Home', main: '<div role="buton" tabindex="0">Save</div>' });

  it('runs every markup check on the --html files', async () => {
    const w = world({ 'a.html': page });
    expect(await runCli(['--html', 'a.html', '--markup-checks', '--out', 'o'], w.deps)).toBe(1);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    const checks = stored.ok ? (stored.value.routes[0]?.checks.map((c) => c.check) ?? []) : [];
    expect(checks.length).toBeGreaterThan(20);
    for (const c of ['static-html', 'copy', 'external', 'aria', 'focusables', 'locale-markup']) expect(checks, c).toContain(c);
    expect(w.text()).toContain('ARIA roles and states (WCAG 4.1.2) [unknown-role] div@L1');
  });

  it('leaves them out by default, so existing baselines do not move', async () => {
    const w = world({ 'a.html': page });
    await runCli(['--html', 'a.html', '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes[0]?.checks.map((c) => c.check)).toEqual(['static-html', 'copy', 'external']);
  });
});

describe('--coverage and the coverage and worksheet formats', () => {
  it('prints what the report says criterion by criterion', async () => {
    const w = world({ 'a.html': pageHtml({ title: 'Home', main: '<div role="buton" tabindex="0">Save</div>' }) });
    await runCli(['--html', 'a.html', '--markup-checks', '--coverage'], w.deps);
    expect(w.text()).toContain('This report and the 55 WCAG 2.2 Level A and AA criteria:');
    expect(w.text()).toContain('  4.1.2 Name, Role, Value: ');
  });

  it('prints nothing about coverage unless asked', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html'], w.deps);
    expect(w.text()).not.toContain('WCAG 2.2 Level A and AA criteria');
  });

  it('reads coverage from the full report, whatever the filter hides', async () => {
    const w = world({ 'a.html': pageHtml({ title: 'Home', main: '<div role="buton" tabindex="0">Save</div>' }) });
    await runCli(['--html', 'a.html', '--markup-checks', '--coverage', '--filter', 'rule:copy/*'], w.deps);
    expect(w.text()).toContain('  4.1.2 Name, Role, Value: ');
  });

  it('writes the coverage table and the worksheet into --out', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o', '--format', 'coverage,worksheet', '--lang', 'fr'], w.deps);
    const md = w.files.get('o/narrow-audit.coverage.fr.md') ?? '';
    expect(md.startsWith('# Couverture des critères WCAG 2.2 (A et AA)')).toBe(true);
    expect(md).toContain('| Critère | Niveau | Contrôles liés | Dans ce rapport |');
    const html = w.files.get('o/narrow-audit.worksheet.fr.html') ?? '';
    expect(html).toContain('<h1>Fiche de contrôle à la main, WCAG 2.2 niveaux A et AA</h1>');
    expect(lintHtml(html).entries).toEqual([]);
  });

  it('writes neither unless asked', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o'], w.deps);
    expect([...w.files.keys()].some((f) => f.includes('coverage') || f.includes('worksheet'))).toBe(false);
  });

  it('adds the coverage section to the detailed report', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o', '--format', 'detail'], w.deps);
    const html = w.files.get('o/narrow-audit.detail.en.html') ?? '';
    expect(html).toContain('<h2 id="coverage-h">What the checks looked at, criterion by criterion</h2>');
    expect(html).toContain('<caption id="cov-cap">The 55 Level A and AA criteria of WCAG 2.2 and this report</caption>');
  });
});

describe('--manual-log', () => {
  it('prints what people saw by hand, and adds it to the worksheet', async () => {
    const w = world({ 'a.html': pageHtml(), 'manual.json': sampleManualLog() });
    await runCli(['--html', 'a.html', '--manual-log', 'manual.json', '--out', 'o', '--format', 'worksheet'], w.deps);
    expect(w.text()).toContain('By-hand looks: 3 of 55 criteria have a recent note, 0 an old note, 52 no note.');
    expect(w.text()).toContain('  1.2.2 Captions (Prerecorded): Looked on 2026-11-12 by @name (7 days ago): a problem was seen. The intro video has no captions.');
    const html = w.files.get('o/narrow-audit.worksheet.en.html') ?? '';
    expect(html).toContain('<dt>By hand, from the log</dt><dd>Looked on 2026-11-12 by @name (7 days ago): no problem was found. Light and dark mode, home and place pages.</dd>');
  });

  it('prints what to look at next, and adds a by-hand column to the coverage table', async () => {
    const w = world({ 'a.html': pageHtml(), 'manual.json': sampleManualLog() });
    await runCli(['--html', 'a.html', '--manual-log', 'manual.json', '--out', 'o', '--format', 'coverage'], w.deps);
    expect(w.text()).toContain('To look at by hand next: 5 of 52 criteria with no recent note');
    const md = w.files.get('o/narrow-audit.coverage.en.md') ?? '';
    expect(md).toContain('| Criterion | Level | Related checks | In this report | By hand |');
    expect(md).toContain('Looked on 2026-11-12 by @name (7 days ago): a problem was seen. The intro video has no captions. |');
  });

  it('leaves the by-hand column out of the coverage table without a log', async () => {
    const w = world({ 'a.html': pageHtml() });
    await runCli(['--html', 'a.html', '--out', 'o', '--format', 'coverage'], w.deps);
    expect(w.files.get('o/narrow-audit.coverage.en.md') ?? '').not.toContain('By hand |');
    expect(w.text()).not.toContain('To look at by hand next');
  });

  it('does not change the exit code: a problem seen by hand is for the team to act on, and no problem found clears nothing', async () => {
    const clean = pageHtml({ title: 'Home' });
    const without = world({ 'a.html': clean });
    const withLog = world({ 'a.html': clean, 'manual.json': sampleManualLog() });
    const a = await runCli(['--html', 'a.html'], without.deps);
    const b = await runCli(['--html', 'a.html', '--manual-log', 'manual.json'], withLog.deps);
    expect(b).toBe(a);
  });

  it('stops with code 2 on a log it cannot use, and names the file', async () => {
    const w = world({ 'a.html': pageHtml(), 'manual.json': '{"version":1,"notes":[{"sc":"2.4.7","result":"pass","on":"2026-11-12","by":"@sam"}]}' });
    expect(await runCli(['--html', 'a.html', '--manual-log', 'manual.json'], w.deps)).toBe(2);
    expect(w.logs[w.logs.length - 1]).toContain('manual.json: By-hand log, note 1: "result" must be one of: problem, no-problem-found, not-sure.');
    expect(w.logs[w.logs.length - 1]).toContain(' / manual.json\u00A0: Journal des contrôles à la main, note 1\u00A0: ');
  });

  it('refuses a note dated after the day of the run', async () => {
    const w = world({ 'a.html': pageHtml(), 'manual.json': '{"version":1,"notes":[{"sc":"2.4.7","result":"not-sure","on":"2026-11-20","by":"@sam"}]}' });
    expect(await runCli(['--html', 'a.html', '--manual-log', 'manual.json'], w.deps)).toBe(2);
    expect(w.text()).toContain('"on" is 2026-11-20, which is after today.');
  });

  it('is a key of the config file', () => {
    expect(parseConfig('{"manualLog": "audit/manual.json"}')).toEqual({ ok: true, argv: ['--manual-log', 'audit/manual.json'] });
    expect(parseArgs(['--html', 'a.html', '--manual-log', 'm.json'])).toMatchObject({ ok: true, args: { extras: { manualLogFile: 'm.json' } } });
  });
});

describe('--html-list', () => {
  it('reads the files to audit from a list, skipping blank lines, comments and repeats', async () => {
    const w = world({ 'dist/a.html': pageHtml({ title: 'A' }), 'dist/b.html': pageHtml({ title: 'B' }), 'pages.txt': '# built pages\ndist/a.html\n\n  dist/b.html  \ndist/a.html\n' });
    await runCli(['--html-list', 'pages.txt', '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.map((r) => r.route)).toEqual(['html:dist/a.html', 'html:dist/b.html']);
  });

  it('works with --site-root, which needs two pages', async () => {
    const files = distFiles();
    const w = world({ ...files, 'pages.txt': Object.keys(files).join('\r\n') });
    await runCli(['--html-list', 'pages.txt', '--site-root', 'dist', '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.some((r) => r.route === 'site:files')).toBe(true);
  });

  it('adds to the files given with --html, each once', async () => {
    const w = world({ 'a.html': pageHtml(), 'b.html': pageHtml(), 'pages.txt': 'a.html\nb.html\n' });
    await runCli(['--html', 'b.html', '--html-list', 'pages.txt', '--out', 'o'], w.deps);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.map((r) => r.route)).toEqual(['html:b.html', 'html:a.html']);
  });

  it.each([
    [['--html-list'], {}, '--html-list needs a file.'],
    [['--html-list', 'empty.txt'], { 'empty.txt': '# nothing\n\n' }, 'empty.txt: The list names no file.'],
    [['--html-list', 'odd.txt'], { 'odd.txt': 'a.html\n--offline\n' }, 'odd.txt: A line of the list looks like an option, not a file: --offline'],
  ])('refuses %j with code 2', async (argv, files, en) => {
    const w = world(files);
    expect(await runCli(argv, w.deps)).toBe(2);
    expect(w.logs[0]).toContain(en);
    expect(frTypographyIssues((w.logs[0] ?? '').split(' / ')[1] ?? '')).toEqual([]);
  });

  it('stops with code 2 when the list does not exist', async () => {
    const w = world({});
    expect(await runCli(['--html-list', 'missing.txt'], w.deps)).toBe(2);
    expect(w.text()).toContain('Could not read an input file');
  });

  it('is in the help in both languages and in the config keys', () => {
    expect(HELP_TEXT.split('--html-list').length - 1).toBe(2);
    expect(parseConfig('{"htmlList": ["pages.txt"]}')).toEqual({ ok: true, argv: ['--html-list', 'pages.txt'] });
  });
});
