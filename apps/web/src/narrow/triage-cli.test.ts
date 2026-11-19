import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { samplePolicy } from './policy.js';
import { renderJson } from './report.js';
import { nov } from './report-fixtures.js';
import { TRIAGE_HELP_TEXT, parseTriageArgs, runTriage, type TriageDeps } from './triage-cli.js';
import { ledgerSince, triageReport } from './triage-testkit.js';

function world(files: Record<string, string> = {}): { deps: TriageDeps; files: Map<string, string>; logs: string[]; text: () => string } {
  const store = new Map<string, string>([['r.json', renderJson(triageReport())], ...Object.entries(files)]);
  const logs: string[] = [];
  const deps: TriageDeps = {
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
    now: () => nov(19),
  };
  return { deps, files: store, logs, text: () => logs.join('\n') };
}

const LEDGER = JSON.stringify(ledgerSince(1));
const STRICT = JSON.stringify({ version: 1, rules: [{ id: 'no-level-a', when: { status: 'fail', level: ['A'] }, max: 0 }] });
const LOOSE = JSON.stringify({ version: 1, rules: [{ id: 'cap', when: {}, max: 100 }] });

describe('parseTriageArgs', () => {
  it('reads the report file and every option', () => {
    expect(parseTriageArgs(['r.json', '--ledger', 'l.json', '--owners', 'o.txt', '--policy', 'p.json', '--tickets', 'out/tickets', '--tickets-for', 'fail', '--out', 'order.md', '--max', '5', '--lang', 'fr'])).toEqual({
      ok: true,
      args: { reportFile: 'r.json', ledgerFile: 'l.json', ownersFile: 'o.txt', policyFile: 'p.json', ticketsDir: 'out/tickets', ticketsFor: 'fail', outFile: 'order.md', max: 5, lang: 'fr', help: false },
    });
  });

  it('has defaults, and takes the report file anywhere among the options', () => {
    expect(parseTriageArgs(['--lang', 'fr', 'r.json'])).toMatchObject({ ok: true, args: { reportFile: 'r.json', lang: 'fr', ticketsFor: 'all', max: null, ticketsDir: null } });
  });

  it.each([
    [[], 'Give the report to read'],
    [['a.json', 'b.json'], 'Give one report file. Found a second one: b.json'],
    [['r.json', '--nope'], 'Unknown option --nope.'],
    [['r.json', '--ledger'], '--ledger needs a value.'],
    [['r.json', '--ledger', '--owners', 'o.txt'], '--ledger needs a value.'],
    [['r.json', '--tickets-for', 'unknown'], '--tickets-for must be fail or all.'],
    [['r.json', '--max', '0'], '--max needs a whole number, 1 or more.'],
    [['r.json', '--max', 'ten'], '--max needs a whole number'],
    [['r.json', '--lang', 'de'], '--lang must be en or fr.'],
  ])('refuses %j', (argv, en) => {
    const parsed = parseTriageArgs(argv);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).not.toBe(parsed.error.en);
    expect(frTypographyIssues(parsed.error.fr), parsed.error.fr).toEqual([]);
  });

  it('asks for nothing else with --help', () => {
    expect(parseTriageArgs(['--help'])).toMatchObject({ ok: true, args: { help: true } });
  });
});

describe('runTriage', () => {
  it('prints the help in both languages', async () => {
    const w = world();
    expect(await runTriage(['--help'], w.deps)).toBe(0);
    expect(w.logs).toEqual([TRIAGE_HELP_TEXT]);
    expect(TRIAGE_HELP_TEXT).toContain('Usage: narrow-audit triage REPORT.json');
    expect(TRIAGE_HELP_TEXT).toContain('Utilisation\u00A0: narrow-audit triage RAPPORT.json');
  });

  it('prints the usage with code 2 on a usage error', async () => {
    const w = world();
    expect(await runTriage([], w.deps)).toBe(2);
    expect(w.logs[1]).toBe(TRIAGE_HELP_TEXT);
  });

  it('prints the totals of the report and where to start, and writes nothing', async () => {
    const w = world();
    expect(await runTriage(['r.json'], w.deps)).toBe(0);
    expect(w.logs[0]).toBe('Report of 2026-11-19T10:00:00.000Z: 5 to fix, 2 UNKNOWN, 4 routes.');
    expect(w.text()).toContain('Where to start: 5 of 5 distinct findings');
    expect(w.text()).toContain('  1. [160] name/missing button#menu (FAIL, Level A, 3 routes)');
    expect([...w.files.keys()]).toEqual(['r.json']);
  });

  it('gives code 0 without a policy even when the report has failures', async () => {
    const w = world();
    expect(await runTriage(['r.json'], w.deps)).toBe(0);
    expect(w.text()).not.toContain('Policy');
  });

  it('uses the ledger for ages and the owners file for names', async () => {
    const w = world({ 'l.json': LEDGER, 'o.txt': '* @web\n' });
    await runTriage(['r.json', '--ledger', 'l.json', '--owners', 'o.txt', '--max', '1'], w.deps);
    expect(w.text()).toContain('  1. [166] name/missing button#menu @web (FAIL, Level A, 3 routes, open 18 days)');
    expect(w.text()).toContain('  … and 4 more.');
  });

  it('writes the full order as Markdown with --out', async () => {
    const w = world();
    await runTriage(['r.json', '--out', 'audit/order.md', '--max', '1'], w.deps);
    const md = w.files.get('audit/order.md') ?? '';
    expect(md.startsWith('# Where to start\n')).toBe(true);
    expect(md.split('\n').filter((l) => /^\| \d/.test(l))).toHaveLength(5);
  });

  it('gives code 1 when a policy is not kept, and prints why', async () => {
    const w = world({ 'p.json': STRICT });
    expect(await runTriage(['r.json', '--policy', 'p.json'], w.deps)).toBe(1);
    expect(w.text()).toContain('Policy: 1 limit(s) exceeded and 0 not evaluated, out of 1.');
    expect(w.text()).toContain('  OVER no-level-a (failures, level A): 3 against a limit of 0');
  });

  it('gives code 0 when the policy is kept', async () => {
    const w = world({ 'p.json': LOOSE });
    expect(await runTriage(['r.json', '--policy', 'p.json'], w.deps)).toBe(0);
    expect(w.text()).toContain('Policy: all 1 limits are kept.');
  });

  it('gives code 1 for an age rule with no ledger, and code 1 with the ledger when failures are old', async () => {
    const none = world({ 'p.json': samplePolicy() });
    expect(await runTriage(['r.json', '--policy', 'p.json'], none.deps)).toBe(1);
    expect(none.text()).toContain('  NOT EVALUATED no-failure-older-than-30-days');
    const young = world({ 'p.json': JSON.stringify({ version: 1, rules: [{ id: 'old', when: { olderThanDays: 30 }, max: 0 }] }), 'l.json': LEDGER });
    expect(await runTriage(['r.json', '--policy', 'p.json', '--ledger', 'l.json'], young.deps)).toBe(0);
    const week = world({ 'p.json': JSON.stringify({ version: 1, rules: [{ id: 'old', when: { olderThanDays: 7 }, max: 0 }] }), 'l.json': LEDGER });
    expect(await runTriage(['r.json', '--policy', 'p.json', '--ledger', 'l.json'], week.deps)).toBe(1);
  });

  it('writes ticket drafts and an index into the folder given', async () => {
    const w = world();
    expect(await runTriage(['r.json', '--tickets', 'audit/tickets/', '--max', '2'], w.deps)).toBe(0);
    expect([...w.files.keys()].filter((f) => f.startsWith('audit/')).sort()).toEqual(['audit/tickets/001-name-missing-button-menu.md', 'audit/tickets/002-contrast-low-a-nav-help.md', 'audit/tickets/README.md']);
    expect(w.files.get('audit/tickets/README.md')).toContain('3 more distinct findings have no draft.');
    expect(w.files.get('audit/tickets/001-name-missing-button-menu.md')).toContain('## When to close');
    expect(w.text()).toContain('2 ticket draft(s) written to audit/tickets. Nothing was sent to a tracker.');
  });

  it('drafts failures only with --tickets-for fail, and counts what is left among them', async () => {
    const w = world();
    await runTriage(['r.json', '--tickets', 't', '--tickets-for', 'fail'], w.deps);
    expect([...w.files.keys()].filter((f) => /^t\/\d/.test(f))).toHaveLength(3);
    expect(w.files.get('t/README.md')).not.toContain('have no draft');
  });

  it('writes everything in French when asked', async () => {
    const w = world({ 'p.json': STRICT });
    await runTriage(['r.json', '--policy', 'p.json', '--tickets', 't', '--lang', 'fr', '--max', '1'], w.deps);
    expect(w.logs[0]).toBe('Rapport du 2026-11-19T10:00:00.000Z\u00A0: 5 à corriger, 2 UNKNOWN, 4 routes.');
    expect(w.text()).toContain('Par où commencer\u00A0: 1 sur 5 anomalies distinctes');
    expect(w.text()).toContain('1 brouillon(s) de ticket écrit(s) dans t. Rien n’a été envoyé à un outil de suivi.');
    expect(w.text()).toContain('  DÉPASSÉE no-level-a');
    expect(w.files.get('t/README.md')).toContain('# Brouillons de tickets');
    for (const line of w.logs.flatMap((l) => l.split('\n'))) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it.each([
    ['r.json', 'not json', 'r.json: '],
    ['l.json', '{"version":9}', 'l.json: '],
    ['o.txt', 'no owner here\n', 'o.txt: Owners file, line 1'],
    ['p.json', '{"version":1,"rules":[]}', 'p.json: The policy has no rule.'],
  ])('stops with code 2 when %s cannot be used, names the file and writes nothing', async (file, content, en) => {
    const w = world({ 'l.json': LEDGER, 'o.txt': '* @web\n', 'p.json': LOOSE, [file]: content });
    expect(await runTriage(['r.json', '--ledger', 'l.json', '--owners', 'o.txt', '--policy', 'p.json', '--tickets', 't', '--out', 'order.md'], w.deps)).toBe(2);
    expect(w.logs[0]).toContain(en);
    expect(w.logs[0]).toContain(` / ${file}\u00A0: `);
    expect([...w.files.keys()].some((f) => f.startsWith('t/') || f === 'order.md')).toBe(false);
  });

  it('stops with code 2 on a file that does not exist', async () => {
    const w = world();
    expect(await runTriage(['missing.json'], w.deps)).toBe(2);
    expect(w.text()).toContain('Triage failed / Échec du tri: ENOENT: no such file: missing.json');
  });
});
