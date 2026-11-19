import { describe, expect, it } from 'vitest';
import { ruleIdOf } from './ci.js';
import { frTypographyIssues } from './i18n.js';
import { parseOwners } from './owners.js';
import { WEIGHTS, describePriorities, describeWhy, prioritise, renderPrioritiesMarkdown } from './priority.js';
import { found, nov, reportOf, route } from './report-fixtures.js';
import { DEC, ledgerSince, triageReport } from './triage-testkit.js';

const order = (items: ReturnType<typeof prioritise>): string[] => items.map((i) => ruleIdOf(i.cluster.entry));

describe('prioritise', () => {
  const items = prioritise(triageReport(), { now: nov(19) });

  it('gives one item per distinct finding', () => {
    expect(items).toHaveLength(5);
  });

  it('puts failures before UNKNOWN findings, then the higher level, then the wider spread', () => {
    expect(order(items)).toEqual(['name/missing', 'contrast/low', 'copy/banned-word', 'images/alt-generic', 'typography/justified']);
  });

  it('shows the parts of each score, and they add up', () => {
    for (const item of items) expect(item.parts.status + item.parts.level + item.parts.spread + item.parts.age).toBe(item.score);
    expect(items[0]).toMatchObject({ score: 160, sc: '4.1.2', level: 'A', parts: { status: WEIGHTS.fail, level: WEIGHTS.levelA, spread: 10, age: 0 } });
    expect(items[1]).toMatchObject({ score: 140, sc: '1.4.3', level: 'AA' });
    expect(items[2]).toMatchObject({ score: 130, sc: null, level: null, parts: { level: WEIGHTS.outsideWcag } });
    expect(items[3]).toMatchObject({ score: 50, level: 'A', parts: { status: WEIGHTS.unknown } });
    expect(items[4]).toMatchObject({ score: 25, level: 'AAA', parts: { level: WEIGHTS.levelAAA } });
  });

  it('never ranks an UNKNOWN finding above a failure, whatever its level, spread and age', () => {
    const most = WEIGHTS.unknown + WEIGHTS.levelA + WEIGHTS.spreadMax + WEIGHTS.ageMax;
    const least = WEIGHTS.fail + WEIGHTS.levelAAA;
    expect(most).toBeLessThan(least);
  });

  it('caps the points for spread', () => {
    const e = found('contrast', 'low', 'fail', 'a#x');
    const report = reportOf(Array.from({ length: 12 }, (_v, i) => route(`/p${i}`, { contrast: { checked: 1, entries: [e] } })));
    expect(prioritise(report, { now: nov(19) })[0]?.parts.spread).toBe(WEIGHTS.spreadMax);
  });

  it('has no age without a ledger', () => {
    for (const item of items) expect(item).toMatchObject({ daysOpen: null, parts: { age: 0 } });
  });

  it('takes the age of failures from the ledger, in full weeks', () => {
    const aged = prioritise(triageReport(), { now: nov(19), ledger: ledgerSince(4) });
    expect(aged[0]).toMatchObject({ daysOpen: 15, parts: { age: 2 * WEIGHTS.agePerWeek } });
    expect(aged.find((i) => i.cluster.entry.status === 'unknown')?.daysOpen).toBeNull();
  });

  it('caps the points for age', () => {
    const old = prioritise(triageReport(), { now: DEC(31), ledger: ledgerSince(1) });
    expect(old[0]?.daysOpen).toBe(60);
    expect(old[0]?.parts.age).toBe(24);
    const older = prioritise(triageReport(), { now: new Date(Date.UTC(2027, 5, 1)), ledger: ledgerSince(1) });
    expect(older[0]?.parts.age).toBe(WEIGHTS.ageMax);
  });

  it('lets age move an older failure above a newer one of the same kind', () => {
    const a = found('contrast', 'low', 'fail', 'a#new');
    const b = found('contrast', 'low', 'fail', 'z#old');
    const first = reportOf([route('/', { contrast: { checked: 2, entries: [b] } })], 1);
    const second = reportOf([route('/', { contrast: { checked: 2, entries: [a, b] } })], 19);
    const ledger = ledgerSince(19);
    const withOld = { version: 1 as const, entries: [...ledger.entries, { key: '/|contrast|low|z#old', route: '/', rule: 'contrast/low', id: 'z#old', status: 'fail' as const, firstSeen: first.generatedAt, lastSeen: second.generatedAt }] };
    expect(prioritise(second, { now: nov(19) }).map((i) => i.cluster.entry.id)).toEqual(['a#new', 'z#old']);
    expect(prioritise(second, { now: nov(19), ledger: withOld }).map((i) => i.cluster.entry.id)).toEqual(['z#old', 'a#new']);
  });

  it('names the owner of each finding when an owners file is given', () => {
    const owners = parseOwners('* @web\nrule:contrast/* @design\n');
    if (!owners.ok) throw new Error(owners.error.en);
    const owned = prioritise(triageReport(), { now: nov(19), owners: owners.value });
    expect(owned.map((i) => i.owner)).toEqual(['@web', '@design', '@web', '@web', '@web']);
    expect(items[0]?.owner).toBeNull();
  });

  it('gives the same order every time, and nothing for a report with no finding', () => {
    expect(order(prioritise(triageReport(), { now: nov(19) }))).toEqual(order(items));
    expect(prioritise(reportOf([route('/', { contrast: { checked: 3, entries: [] } })]), { now: nov(19) })).toEqual([]);
  });
});

describe('describeWhy', () => {
  const aged = prioritise(triageReport(), { now: nov(19), ledger: ledgerSince(18) });

  it('says why in English', () => {
    expect(describeWhy(aged[0]!, 'en')).toBe('FAIL, Level A, 3 routes, open 1 day');
    expect(describeWhy(aged[2]!, 'en')).toBe('FAIL, outside WCAG, 1 route, open 1 day');
    expect(describeWhy(aged[3]!, 'en')).toBe('UNKNOWN, Level A, 1 route');
  });

  it('says why in French, with the UNKNOWN token', () => {
    expect(describeWhy(aged[0]!, 'fr')).toBe('À CORRIGER, niveau A, 3 routes, en cours depuis 1 jour');
    expect(describeWhy(aged[3]!, 'fr')).toBe('UNKNOWN, niveau A, 1 route');
  });
});

describe('describePriorities', () => {
  const items = prioritise(triageReport(), { now: nov(19) });

  it('lists the first items with their score and message', () => {
    const text = describePriorities(items, 'en', 2);
    expect(text).toContain('Where to start: 2 of 5 distinct findings');
    expect(text).toContain('  1. [160] name/missing button#menu (FAIL, Level A, 3 routes)\n     The control has no accessible name.');
    expect(text).toContain('  … and 3 more.');
  });

  it('always says what the order does not know', () => {
    expect(describePriorities(items, 'en')).toContain('It does not know how many people a problem stops');
    expect(describePriorities(items, 'fr')).toContain('Il ne sait pas combien de personnes un problème arrête');
  });

  it('writes French with French typography', () => {
    const text = describePriorities(items, 'fr', 2);
    expect(text).toContain('Par où commencer\u00A0: 2 sur 5 anomalies distinctes');
    expect(text).toContain('  … et 3 de plus.');
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });

  it('shows everything when the limit is larger, and at least one item', () => {
    expect(describePriorities(items, 'en', 50)).not.toContain('more.');
    expect(describePriorities(items, 'en', 0)).toContain('Where to start: 1 of 5');
  });

  it('says so when there is nothing to order', () => {
    expect(describePriorities([], 'en')).toBe('No finding to put in order.\n');
    expect(describePriorities([], 'fr')).toBe('Aucune anomalie à ordonner.\n');
  });
});

describe('renderPrioritiesMarkdown', () => {
  const items = prioritise(triageReport(), { now: nov(19) });

  it('tables every item with the parts of its score', () => {
    const md = renderPrioritiesMarkdown(items, 'en');
    expect(md.split('\n').filter((l) => /^\| \d/.test(l))).toHaveLength(5);
    expect(md).toContain('| 1 | 160 (120+30+10+0) | `name/missing` `button#menu` | FAIL, Level A, 3 routes |  | /, /places, /help |');
    expect(md).toContain('| Rank | Score | Finding | Why | Owner | Routes |');
  });

  it('escapes a bar in an element id', () => {
    const report = reportOf([route('/', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', 'a[title="a|b"]')] } })]);
    const md = renderPrioritiesMarkdown(prioritise(report, { now: nov(19) }), 'en');
    expect(md).toContain('`a[title="a\\|b"]`');
    const rows = md.split('\n').filter((l) => l.startsWith('|'));
    expect(new Set(rows.map((l) => l.split(/(?<!\\)\|/).length)).size).toBe(1);
  });

  it('writes French headings', () => {
    expect(renderPrioritiesMarkdown(items, 'fr')).toContain('| Rang | Score | Anomalie | Pourquoi | Responsable | Routes |');
    expect(renderPrioritiesMarkdown([], 'fr')).toContain('Aucune anomalie à ordonner.');
  });
});
