import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { MAX_EXAMPLES, describePolicy, describeWhen, evaluatePolicy, levelOfEntry, parsePolicy, policyMet, samplePolicy, type Policy, type PolicyRule } from './policy.js';
import { nov } from './report-fixtures.js';
import { ledgerSince, triageReport } from './triage-testkit.js';

const policyOf = (...rules: PolicyRule[]): Policy => ({ version: 1, rules });
const rule = (id: string, when: PolicyRule['when'], max = 0): PolicyRule => ({ id, when, max });
const run = (policy: Policy, withLedger = false, now = nov(19)) => evaluatePolicy(triageReport(), policy, { now, ...(withLedger ? { ledger: ledgerSince(1) } : {}) });
const text = (value: unknown): string => JSON.stringify(value);

describe('parsePolicy', () => {
  it('reads the sample policy', () => {
    const parsed = parsePolicy(samplePolicy());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.rules.map((r) => r.id)).toEqual(['no-level-a-failures', 'no-failure-older-than-30-days', 'unknown-backlog']);
  });

  it('keeps only what it knows, trims notes and drops repeated levels', () => {
    const parsed = parsePolicy(text({ version: 1, rules: [{ id: 'a', when: { level: ['A', 'A', 'none'], rule: 'contrast/*', route: '/p/*' }, max: 2, note: '  why  ' }] }));
    expect(parsed).toEqual({ ok: true, value: { version: 1, rules: [{ id: 'a', max: 2, note: 'why', when: { level: ['A', 'none'], rule: 'contrast/*', route: '/p/*' } }] } });
  });

  it('accepts an empty when, which counts every finding', () => {
    expect(parsePolicy(text({ version: 1, rules: [{ id: 'all', when: {}, max: 10 }] })).ok).toBe(true);
  });

  it.each([
    ['nope', 'not valid JSON', 'n’est pas du JSON valide'],
    [text([]), 'needs "version": 1 and a "rules" list', 'demande "version": 1 et une liste "rules"'],
    [text({ version: 2, rules: [] }), 'needs "version": 1', 'demande "version": 1'],
    [text({ version: 1, rules: [] }), 'The policy has no rule.', 'La politique ne contient aucune règle.'],
    [text({ version: 1, rules: ['x'] }), 'Policy rule 1: it must be an object.', 'Règle de politique 1\u00A0: elle doit être un objet.'],
    [text({ version: 1, rules: [{ id: 'a', when: {}, max: 0, limit: 3 }] }), 'the key "limit" is not known', 'la clé "limit" n’est pas reconnue'],
    [text({ version: 1, rules: [{ id: 'Bad Id', when: {}, max: 0 }] }), '"id" must be lower-case letters, digits and dashes', '"id" doit être fait de minuscules'],
    [text({ version: 1, rules: [{ id: 'a', when: {}, max: 0 }, { id: 'a', when: {}, max: 1 }] }), 'Policy rule 2: the id "a" is used twice.', 'l’identifiant "a" est utilisé deux fois'],
    [text({ version: 1, rules: [{ id: 'a', when: {}, max: -1 }] }), '"max" must be a whole number, 0 or more', '"max" doit être un nombre entier'],
    [text({ version: 1, rules: [{ id: 'a', when: {}, max: 1.5 }] }), '"max" must be a whole number', '"max" doit être un nombre entier'],
    [text({ version: 1, rules: [{ id: 'a', when: {}, max: 0, note: 3 }] }), '"note" must be text', '"note" doit être du texte'],
    [text({ version: 1, rules: [{ id: 'a', max: 0 }] }), '"when" must be an object', '"when" doit être un objet'],
    [text({ version: 1, rules: [{ id: 'a', when: { severity: 'high' }, max: 0 }] }), 'the "when" key "severity" is not known', 'la clé "severity" de "when" n’est pas reconnue'],
    [text({ version: 1, rules: [{ id: 'a', when: { status: 'pass' }, max: 0 }] }), '"status" must be "fail" or "unknown"', '"status" doit valoir "fail" ou "unknown"'],
    [text({ version: 1, rules: [{ id: 'a', when: { level: 'A' }, max: 0 }] }), '"level" must be a list from: A, AA, AAA, none', '"level" doit être une liste parmi\u00A0: A, AA, AAA, none'],
    [text({ version: 1, rules: [{ id: 'a', when: { level: [] }, max: 0 }] }), '"level" must be a list from', '"level" doit être une liste parmi'],
    [text({ version: 1, rules: [{ id: 'a', when: { level: ['B'] }, max: 0 }] }), '"level" must be a list from', '"level" doit être une liste parmi'],
    [text({ version: 1, rules: [{ id: 'a', when: { rule: '' }, max: 0 }] }), '"rule" must be a pattern', '"rule" doit être un motif'],
    [text({ version: 1, rules: [{ id: 'a', when: { route: 3 }, max: 0 }] }), '"route" must be a pattern', '"route" doit être un motif'],
    [text({ version: 1, rules: [{ id: 'a', when: { olderThanDays: '30' }, max: 0 }] }), '"olderThanDays" must be a whole number', '"olderThanDays" doit être un nombre entier'],
    [text({ version: 1, rules: [{ id: 'a', when: { olderThanDays: 30, status: 'unknown' }, max: 0 }] }), '"olderThanDays" counts failures', '"olderThanDays" compte des anomalies à corriger'],
  ])('refuses %s', (input, en, fr) => {
    const parsed = parsePolicy(input);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).toContain(fr);
    expect(frTypographyIssues(parsed.error.fr), parsed.error.fr).toEqual([]);
  });
});

describe('levelOfEntry', () => {
  it.each([
    ['name', 'A'],
    ['contrast', 'AA'],
    ['typography', 'AAA'],
    ['copy', 'none'],
    ['not-a-check', 'none'],
  ])('%s is %s', (check, want) => {
    expect(levelOfEntry({ check: check as never })).toBe(want);
  });
});

describe('evaluatePolicy', () => {
  it('counts every finding for an empty when', () => {
    expect(run(policyOf(rule('all', {}, 7)))[0]).toMatchObject({ state: 'met', count: 7 });
    expect(run(policyOf(rule('all', {}, 6)))[0]).toMatchObject({ state: 'over', count: 7 });
  });

  it('counts by status', () => {
    expect(run(policyOf(rule('f', { status: 'fail' })))[0]?.count).toBe(5);
    expect(run(policyOf(rule('u', { status: 'unknown' })))[0]?.count).toBe(2);
  });

  it('counts by level, with none for checks outside WCAG', () => {
    expect(run(policyOf(rule('a', { level: ['A'] })))[0]?.count).toBe(4);
    expect(run(policyOf(rule('a-fail', { status: 'fail', level: ['A'] })))[0]?.count).toBe(3);
    expect(run(policyOf(rule('aa', { level: ['AA'] })))[0]?.count).toBe(1);
    expect(run(policyOf(rule('a-or-aa', { level: ['A', 'AA'] })))[0]?.count).toBe(5);
    expect(run(policyOf(rule('none', { level: ['none'] })))[0]?.count).toBe(1);
    expect(run(policyOf(rule('aaa', { level: ['AAA'] })))[0]?.count).toBe(1);
  });

  it('counts by rule and route patterns', () => {
    expect(run(policyOf(rule('r', { rule: 'name/*' })))[0]?.count).toBe(3);
    expect(run(policyOf(rule('r', { rule: 'contrast/low' })))[0]?.count).toBe(1);
    expect(run(policyOf(rule('p', { route: '/' })))[0]?.count).toBe(3);
    expect(run(policyOf(rule('p', { route: '/h*' })))[0]?.count).toBe(2);
    expect(run(policyOf(rule('both', { route: '/places', rule: 'name/*' })))[0]?.count).toBe(1);
  });

  it('is met at the limit and over one above it', () => {
    expect(run(policyOf(rule('f', { status: 'fail' }, 5)))[0]?.state).toBe('met');
    expect(run(policyOf(rule('f', { status: 'fail' }, 4)))[0]?.state).toBe('over');
  });

  it('keeps the first findings as examples', () => {
    const r = run(policyOf(rule('f', { status: 'fail' })))[0];
    expect(r?.examples).toHaveLength(MAX_EXAMPLES);
    expect(r?.examples.map((m) => m.route)).toEqual(['/', '/', '/places']);
    expect(r?.examples.every((m) => m.entry.status === 'fail')).toBe(true);
  });

  it('does not evaluate an age rule without the ledger, and does not call it kept', () => {
    const results = run(policyOf(rule('old', { olderThanDays: 7 })));
    expect(results[0]).toMatchObject({ state: 'not-evaluated', count: 0, examples: [] });
    expect(policyMet(results)).toBe(false);
  });

  it('counts failures open for more than the days given, by the ledger', () => {
    expect(run(policyOf(rule('old', { olderThanDays: 7 })), true)[0]).toMatchObject({ state: 'over', count: 5 });
    expect(run(policyOf(rule('old', { olderThanDays: 18 })), true)[0]).toMatchObject({ state: 'met', count: 0 });
    expect(run(policyOf(rule('old', { olderThanDays: 17 })), true)[0]?.count).toBe(5);
  });

  it('never counts an UNKNOWN finding as old', () => {
    expect(run(policyOf(rule('old', { olderThanDays: 0 })), true)[0]?.count).toBe(5);
  });

  it('does not count a failure the ledger has not seen', () => {
    const empty = evaluatePolicy(triageReport(), policyOf(rule('old', { olderThanDays: 0 })), { now: nov(19), ledger: { version: 1, entries: [] } });
    expect(empty[0]).toMatchObject({ state: 'met', count: 0 });
  });

  it('gives one result per rule, in the order of the policy', () => {
    const results = run(policyOf(rule('one', {}, 100), rule('two', { status: 'fail' }), rule('three', { status: 'unknown' }, 2)));
    expect(results.map((r) => [r.rule.id, r.state])).toEqual([
      ['one', 'met'],
      ['two', 'over'],
      ['three', 'met'],
    ]);
    expect(policyMet(results)).toBe(false);
    expect(policyMet(results.filter((r) => r.rule.id !== 'two'))).toBe(true);
  });
});

describe('describeWhen', () => {
  it.each([
    [{}, 'every finding', 'toutes les anomalies'],
    [{ status: 'fail' as const }, 'failures', 'à corriger'],
    [{ status: 'unknown' as const }, 'UNKNOWN', 'UNKNOWN'],
    [{ level: ['A', 'none'] as const }, 'level A or outside WCAG', 'niveau A ou hors WCAG'],
    [{ status: 'fail' as const, rule: 'contrast/*', route: '/p/*', olderThanDays: 30 }, 'failures, rule contrast/*, route /p/*, open for more than 30 days', 'à corriger, règle contrast/*, route /p/*, en cours depuis plus de 30 jours'],
  ])('%j', (when, en, fr) => {
    expect(describeWhen(when, 'en')).toBe(en);
    expect(describeWhen(when, 'fr')).toBe(fr);
  });
});

describe('describePolicy', () => {
  const mixed = policyOf({ id: 'no-a', when: { status: 'fail', level: ['A'] }, max: 0, note: 'Agreed in November.' }, rule('old', { olderThanDays: 7 }), rule('backlog', { status: 'unknown' }, 40));

  it('puts the rules over their limit first, with examples and the note', () => {
    const out = describePolicy(run(mixed), 'en');
    const lines = out.split('\n');
    expect(lines[0]).toBe('Policy: 1 limit(s) exceeded and 1 not evaluated, out of 3.');
    expect(lines[1]).toBe('  OVER no-a (failures, level A): 3 against a limit of 0');
    expect(lines[2]).toBe('    Agreed in November.');
    expect(lines[3]).toBe('    name/missing button#menu (/)');
    expect(out).toContain('  NOT EVALUATED old (open for more than 7 days): this rule needs the ledger of findings (--ledger).');
    expect(out).toContain('  KEPT backlog (UNKNOWN): 2 against a limit of 40');
  });

  it('says how many more findings match than it shows', () => {
    expect(describePolicy(run(policyOf(rule('f', { status: 'fail' }))), 'en')).toContain('    … and 2 more.');
  });

  it('says when every limit is kept, and what that does not mean', () => {
    const out = describePolicy(run(policyOf(rule('backlog', { status: 'unknown' }, 40))), 'en');
    expect(out.split('\n')[0]).toBe('Policy: all 1 limits are kept.');
    expect(out).toContain('It says nothing about conformance.');
    expect(out).not.toMatch(/\bpass(es|ed)?\b|compliant/i);
  });

  it('writes French with French typography', () => {
    const out = describePolicy(run(mixed), 'fr');
    expect(out).toContain('Politique\u00A0: 1 limite(s) dépassée(s) et 1 non évaluée(s), sur 3.');
    expect(out).toContain('  DÉPASSÉE no-a (à corriger, niveau A)\u00A0: 3 pour une limite de 0');
    expect(out).toContain('  NON ÉVALUÉE old');
    expect(out).toContain('  TENUE backlog (UNKNOWN)\u00A0: 2 pour une limite de 40');
    expect(out).toContain('Cela ne dit rien de la conformité.');
    for (const line of out.split('\n').filter((l) => !l.includes('Agreed in'))) expect(frTypographyIssues(line), line).toEqual([]);
  });
});
