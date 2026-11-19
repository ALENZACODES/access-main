import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseArgs, runCli, type CliDeps } from './cli.js';
import { EXTRA_FLAGS, NO_EXTRAS, parseExtraFlag, shownReport, storedReport } from './cli-extras.js';
import { frTypographyIssues } from './i18n.js';
import { parseLedger } from './ledger.js';
import { buildRouteAudit, makeReport } from './report.js';
import { parseReport } from './reportio.js';
import { t } from './types.js';

const BAD = '<html><body><img src="a.png"><p>Opening hours</p><a href="/x" id="account-link"></a></body></html>';
const NOW = new Date('2026-11-19T10:00:00Z');

function world(files: Record<string, string>, now: Date = NOW): { deps: CliDeps; files: Map<string, string>; logs: string[]; text: () => string } {
  const store = new Map(Object.entries(files));
  const logs: string[] = [];
  const deps: CliDeps = {
    async launch() {
      throw new Error('browser launched');
    },
    async readText(path) {
      const text = store.get(path);
      if (text === undefined) throw new Error(`no such file: ${path}`);
      return text;
    },
    async writeText(path, text) {
      store.set(path, text);
    },
    log(line) {
      logs.push(line);
    },
    now: () => now,
  };
  return { deps, files: store, logs, text: () => logs.join('\n') };
}

const sample = makeReport(
  [
    buildRouteAudit('/help?token=abc', 320, {
      contrast: {
        checked: 4,
        entries: [
          { check: 'contrast', id: 'p#intro', status: 'fail', message: t('Contrast is 2.1 for “Opening hours”.', 'Le contraste est de 2,1 pour «\u202FOpening hours\u202F».'), rule: 'text' },
          { check: 'contrast', id: 'h1[0]', status: 'unknown', message: t('The backdrop is an image.', 'L’arrière-plan est une image.'), rule: 'image' },
        ],
      },
    }),
  ],
  NOW,
);

describe('parseExtraFlag', () => {
  it('says so when the option is not one of these', () => {
    expect(parseExtraFlag('--html', 'a.html', NO_EXTRAS)).toEqual({ kind: 'other' });
  });

  it.each(['--redact', '--annotations', '--next-steps', '--shared'])('%s is a switch and takes no value', (flag) => {
    const parsed = parseExtraFlag(flag, 'next-argument', NO_EXTRAS);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') expect(parsed.usedValue).toBe(false);
  });

  it.each(['--merge', '--ledger', '--owners', '--review', '--filter'])('%s needs a value, in both languages', (flag) => {
    const parsed = parseExtraFlag(flag, undefined, NO_EXTRAS);
    expect(parsed.kind).toBe('error');
    if (parsed.kind !== 'error') return;
    expect(parsed.error.en).toContain(`${flag} needs`);
    expect(parsed.error.fr).toContain(`${flag} demande`);
  });

  it('keeps each merge file once, in order', () => {
    let extras = NO_EXTRAS;
    for (const file of ['a.json', 'b.json', 'a.json']) {
      const parsed = parseExtraFlag('--merge', file, extras);
      if (parsed.kind === 'ok') extras = parsed.extras;
    }
    expect(extras.mergeFiles).toEqual(['a.json', 'b.json']);
  });

  it('refuses a filter it cannot read', () => {
    const parsed = parseExtraFlag('--filter', 'colour:red', NO_EXTRAS);
    expect(parsed.kind).toBe('error');
    if (parsed.kind === 'error') expect(frTypographyIssues(parsed.error.fr)).toEqual([]);
  });

  it('does not change the options given to it', () => {
    parseExtraFlag('--redact', undefined, NO_EXTRAS);
    expect(NO_EXTRAS.redact).toBe(false);
  });
});

describe('parseArgs with these options', () => {
  it('reads them next to the others', () => {
    const parsed = parseArgs(['--html', 'a.html', '--ledger', 'l.json', '--owners', 'o.txt', '--review', 'r.json', '--filter', 'status:fail', '--redact', '--shared', '--next-steps', '--annotations', '--merge', 'm.json']);
    expect(parsed).toMatchObject({
      ok: true,
      args: {
        htmlFiles: ['a.html'],
        extras: { ledgerFile: 'l.json', ownersFile: 'o.txt', reviewFile: 'r.json', filterText: 'status:fail', redact: true, shared: true, nextSteps: true, annotations: true, mergeFiles: ['m.json'] },
      },
    });
  });

  it('leaves them all off by default', () => {
    expect(parseArgs(['--html', 'a.html'])).toMatchObject({ ok: true, args: { extras: NO_EXTRAS } });
  });

  it('does not take the option after a switch as its value', () => {
    expect(parseArgs(['--redact', '--html', 'a.html'])).toMatchObject({ ok: true, args: { htmlFiles: ['a.html'], extras: { redact: true } } });
  });

  it('accepts a run that only joins earlier reports', () => {
    expect(parseArgs(['--merge', 'a.json']).ok).toBe(true);
    expect(parseArgs(['--shared']).ok).toBe(false);
  });

  it('still refuses an option nobody knows, without the banned French word', () => {
    const parsed = parseArgs(['--html', 'a.html', '--nope']);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toEqual({ en: 'Unknown option --nope.', fr: 'Option non reconnue --nope.' });
  });

  it('lists every option in the help, in both languages', () => {
    for (const flag of EXTRA_FLAGS) expect(HELP_TEXT.split(flag).length - 1, flag).toBeGreaterThanOrEqual(2);
    expect(HELP_TEXT).toContain('narrow-audit plan --help');
  });
});

describe('shownReport and storedReport', () => {
  it('give the report itself with no option', () => {
    expect(shownReport(sample, NO_EXTRAS)).toBe(sample);
    expect(storedReport(sample, NO_EXTRAS)).toBe(sample);
  });

  it('filter what is shown and never what is stored', () => {
    const extras = { ...NO_EXTRAS, filterText: 'status:fail' };
    expect(shownReport(sample, extras).routes[0]?.entries.map((e) => e.status)).toEqual(['fail']);
    expect(storedReport(sample, extras)).toBe(sample);
  });

  it('redact both', () => {
    const extras = { ...NO_EXTRAS, redact: true };
    for (const report of [shownReport(sample, extras), storedReport(sample, extras)]) {
      expect(report.routes[0]?.route).not.toContain('token=abc');
      expect(report.routes[0]?.route.startsWith('/help')).toBe(true);
      expect(JSON.stringify(report)).not.toContain('Opening hours');
      expect(report.routes[0]?.entries).toHaveLength(2);
    }
  });
});

describe('runCli with these options', () => {
  it('keeps a ledger across runs and says how old the open failures are', async () => {
    const first = world({ 'a.html': BAD });
    expect(await runCli(['--html', 'a.html', '--ledger', 'ledger.json'], first.deps)).toBe(1);
    expect(first.text()).toContain('0 to 6 days');

    const later = world({ 'a.html': BAD, 'ledger.json': first.files.get('ledger.json') ?? '' }, new Date('2026-12-19T10:00:00Z'));
    expect(await runCli(['--html', 'a.html', '--ledger', 'ledger.json'], later.deps)).toBe(1);
    const ledger = parseLedger(later.files.get('ledger.json') ?? '');
    expect(ledger.ok).toBe(true);
    if (!ledger.ok) return;
    expect(ledger.value.entries.length).toBeGreaterThan(0);
    for (const e of ledger.value.entries) {
      expect(e.firstSeen).toBe('2026-11-19T10:00:00.000Z');
      expect(e.lastSeen).toBe('2026-12-19T10:00:00.000Z');
    }
    expect(later.text()).toContain('30 day');
  });

  it('stops with code 2 on a ledger it cannot read', async () => {
    const w = world({ 'a.html': BAD, 'ledger.json': '{"version":99}' });
    expect(await runCli(['--html', 'a.html', '--ledger', 'ledger.json'], w.deps)).toBe(2);
    expect(w.files.get('ledger.json')).toBe('{"version":99}');
  });

  it('groups findings by owner and names owner lines that match nothing', async () => {
    const w = world({ 'a.html': BAD, 'owners.txt': '* @web\nrule:static-html/* @markup\nroute:/nowhere @nobody\n' });
    expect(await runCli(['--html', 'a.html', '--owners', 'owners.txt'], w.deps)).toBe(1);
    expect(w.text()).toContain('@markup: 8 to fix');
    expect(w.text()).toContain('1 line(s) of the owners file match no finding of this report: line(s) 3.');
  });

  it('stops with code 2 on an owners file with a bad line', async () => {
    const w = world({ 'a.html': BAD, 'owners.txt': 'no owner here\n' });
    expect(await runCli(['--html', 'a.html', '--owners', 'owners.txt'], w.deps)).toBe(2);
    expect(w.text()).toContain('Owners file, line 1');
  });

  it('reads review notes and writes a worksheet into --out', async () => {
    const w = world({ 'a.html': BAD, 'review.json': '{"version":1,"notes":[]}' });
    expect(await runCli(['--html', 'a.html', '--review', 'review.json', '--out', 'o', '--lang', 'fr'], w.deps)).toBe(1);
    expect(w.text()).toContain('Revue à la main\u00A0: 0 point UNKNOWN a une note récente, 0 en attente.');
    expect(w.files.has('o/narrow-audit.review.fr.txt')).toBe(true);
  });

  it('writes no worksheet without --out', async () => {
    const w = world({ 'a.html': BAD, 'review.json': '{"version":1,"notes":[]}' });
    await runCli(['--html', 'a.html', '--review', 'review.json'], w.deps);
    expect([...w.files.keys()].sort()).toEqual(['a.html', 'review.json']);
  });

  it('prints repeated findings, next steps and annotations when asked', async () => {
    const w = world({ 'a.html': BAD, 'b.html': BAD });
    expect(await runCli(['--html', 'a.html', '--html', 'b.html', '--shared', '--next-steps', '--annotations'], w.deps)).toBe(1);
    expect(w.text()).toContain('static-html/doctype html: 2 routes (html:a.html, html:b.html)');
    expect(w.text()).toContain('What to do next:');
    expect(w.text()).toContain('::error file=a.html,title=static-html/doctype html::The document has no doctype.');
    expect(w.text()).toContain('::notice title=narrow-audit::');
  });

  it('prints none of them by default', async () => {
    const w = world({ 'a.html': BAD });
    await runCli(['--html', 'a.html'], w.deps);
    expect(w.text()).not.toMatch(/What to do next|::error|Redacted|Filter /);
  });

  it('filters the views for people, keeps the stored report whole and keeps the exit code', async () => {
    const w = world({ 'a.html': BAD });
    expect(await runCli(['--html', 'a.html', '--filter', 'rule:static-html/doctype', '--out', 'o', '--format', 'csv'], w.deps)).toBe(1);
    expect(w.text()).toContain('html:a.html: 1 to fix');
    expect(w.text()).toContain('Filter rule:static-html/doctype: 7 findings are not shown here. They are still in the full report and still count.');
    expect((w.files.get('o/narrow-audit.csv') ?? '').trim().split('\n')).toHaveLength(2);
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes[0]?.entries.length).toBe(8);
  });

  it('still fails a run whose failures are all filtered out of view', async () => {
    const w = world({ 'a.html': BAD });
    expect(await runCli(['--html', 'a.html', '--filter', 'status:unknown'], w.deps)).toBe(1);
  });

  it('redacts what is printed and written, and leaves the ledger whole', async () => {
    const w = world({ 'a.html': BAD });
    expect(await runCli(['--html', 'a.html', '--redact', '--out', 'o', '--ledger', 'ledger.json'], w.deps)).toBe(1);
    expect(w.text()).toContain('Redacted for sharing:');
    expect(w.files.get('o/narrow-audit.json') ?? '').not.toContain('account-link');
    expect(w.files.get('o/narrow-audit.en.html') ?? '').not.toContain('account-link');
    const stored = parseReport(w.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes[0]?.entries.length).toBe(8);
  });

  it('joins an earlier report with this run', async () => {
    const first = world({ 'a.html': BAD });
    await runCli(['--html', 'a.html', '--out', 'o'], first.deps);
    const second = world({ 'b.html': BAD, 'old.json': first.files.get('o/narrow-audit.json') ?? '' });
    expect(await runCli(['--html', 'b.html', '--merge', 'old.json', '--out', 'o'], second.deps)).toBe(1);
    const stored = parseReport(second.files.get('o/narrow-audit.json') ?? '');
    expect(stored.ok && stored.value.routes.map((r) => r.route)).toEqual(['html:a.html', 'html:b.html']);
  });

  it('joins reports with nothing else to audit', async () => {
    const first = world({ 'a.html': BAD });
    await runCli(['--html', 'a.html', '--out', 'o'], first.deps);
    const w = world({ 'old.json': first.files.get('o/narrow-audit.json') ?? '' });
    expect(await runCli(['--merge', 'old.json'], w.deps)).toBe(1);
    expect(w.text()).toContain('html:a.html: 8 to fix');
  });

  it('logs when a newer result replaces an older one for the same page', async () => {
    const first = world({ 'a.html': BAD }, new Date('2026-11-18T10:00:00Z'));
    await runCli(['--html', 'a.html', '--out', 'o'], first.deps);
    const w = world({ 'a.html': BAD, 'old.json': first.files.get('o/narrow-audit.json') ?? '' });
    await runCli(['--html', 'a.html', '--merge', 'old.json'], w.deps);
    expect(w.text()).toContain('ran on html:a.html in more than one report');
  });

  it('stops with code 2 on a merge file that is not a report, and names the file', async () => {
    const w = world({ 'a.html': BAD, 'old.json': '{"hello":1}' });
    expect(await runCli(['--html', 'a.html', '--merge', 'old.json'], w.deps)).toBe(2);
    expect(w.logs[0]).toContain('old.json: ');
  });
});
