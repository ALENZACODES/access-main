import { describe, expect, it } from 'vitest';
import {
  applyWaivers,
  describeDiff,
  describeWaived,
  diffAgainstBaseline,
  flatten,
  globMatch,
  isExpired,
  keyOf,
  makeBaseline,
  parseBaseline,
  parseWaivers,
  renderJunit,
  renderSarif,
  toSarif,
  validDate,
  waiverMatches,
  xmlEscape,
  type Waiver,
} from './ci.js';
import { frTypographyIssues } from './i18n.js';
import { buildRouteAudit, makeReport, totals } from './report.js';
import { t, type Entry } from './types.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const e = (check: Entry['check'], id: string, status: Entry['status'] = 'fail', rule?: string): Entry => ({
  check,
  id,
  status,
  message: t(`${check} problem <${id}> & more`, `${check} problème ${id}`),
  ...(rule ? { rule } : {}),
});

function report() {
  return makeReport(
    [
      buildRouteAudit('/map', 320, {
        contrast: { checked: 4, entries: [e('contrast', 'p[1]'), e('contrast', 'p[2]', 'unknown')] },
        'target-size': { checked: 3, entries: [e('target-size', 'button[0]')] },
      }),
      buildRouteAudit('html:dist/index.html', null, {
        'static-html': { checked: 9, entries: [e('static-html', 'img@L12', 'fail', 'img-alt'), e('static-html', 'a@L30', 'unknown', 'link-text')] },
      }),
      buildRouteAudit('data:places.json', null, { provenance: { checked: 2, entries: [e('provenance', 'rec[0]', 'fail', 'source-url')] } }),
    ],
    NOW,
  );
}

describe('keys', () => {
  it('joins route, check, rule and id', () => {
    expect(keyOf('/a', e('contrast', 'p[1]'))).toBe('/a|contrast||p[1]');
    expect(keyOf('/a', e('static-html', 'x@L2', 'fail', 'img-alt'))).toBe('/a|static-html|img-alt|x@L2');
  });
  it('flatten lists every entry with its route', () => {
    expect(flatten(report())).toHaveLength(6);
    expect(new Set(flatten(report()).map((i) => i.key)).size).toBe(6);
  });
});

describe('SARIF', () => {
  const log = toSarif(report());
  const run = log.runs[0];
  it('has the SARIF 2.1.0 envelope', () => {
    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-2.1.0');
    expect(log.runs).toHaveLength(1);
    expect(run?.tool.driver.name).toBe('narrow-audit');
  });
  it('lists each rule once and points results at it', () => {
    const rules = run?.tool.driver.rules ?? [];
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of run?.results ?? []) expect(rules[r.ruleIndex]?.id).toBe(r.ruleId);
  });
  it('maps fail to error and unknown to note, never to a pass', () => {
    const levels = (run?.results ?? []).map((r) => r.level).sort();
    expect(levels).toEqual(['error', 'error', 'error', 'error', 'note', 'note']);
    for (const r of run?.results ?? []) expect(r.level === 'error').toBe(r.properties.status === 'fail');
  });
  it('gives HTML files a physical location with the line', () => {
    const r = run?.results.find((x) => x.ruleId === 'static-html/img-alt');
    expect(JSON.stringify(r?.locations)).toContain('"uri":"dist/index.html"');
    expect(JSON.stringify(r?.locations)).toContain('"startLine":12');
  });
  it('gives page routes a logical location only', () => {
    const r = run?.results.find((x) => x.ruleId === 'contrast/general');
    expect(JSON.stringify(r?.locations)).not.toContain('physicalLocation');
    expect(JSON.stringify(r?.locations)).toContain('/map p[1]');
  });
  it('carries the WCAG criterion, the French text and a fingerprint', () => {
    const rule = run?.tool.driver.rules.find((x) => x.id === 'contrast/general');
    expect(rule?.properties.wcag).toBe('1.4.3');
    const r = run?.results.find((x) => x.ruleId === 'contrast/general' && x.properties.status === 'fail');
    expect(r?.properties.fr.length).toBeGreaterThan(0);
    expect(r?.partialFingerprints['narrowKey/v1']).toBe('/map|contrast||p[1]');
  });
  it('renders valid JSON', () => {
    expect(JSON.parse(renderSarif(report())).runs[0].results).toHaveLength(6);
    expect(renderSarif(makeReport([], NOW))).toContain('"results": []');
  });
});

describe('JUnit', () => {
  const xml = renderJunit(report());
  it('has a suite per route and counts failures and skips', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuites name="narrow-audit" tests="4" failures="4" skipped="0"');
    expect((xml.match(/<testsuite /g) ?? []).length).toBe(3);
  });
  it('escapes markup in messages', () => {
    expect(xml).toContain('&lt;p[1]&gt; &amp; more');
    expect(xml).not.toContain('<p[1]>');
  });
  it('shows an unknown-only check as skipped, not passed', () => {
    const r = makeReport([buildRouteAudit('/x', 320, { contrast: { checked: 1, entries: [e('contrast', 'a', 'unknown')] } })], NOW);
    const out = renderJunit(r);
    expect(out).toContain('<skipped message="UNKNOWN:');
    expect(out).toContain('skipped="1"');
    expect(out).not.toContain('<failure');
  });
  it('a passing check has a bare testcase', () => {
    const r = makeReport([buildRouteAudit('/x', 320, { contrast: { checked: 3, entries: [] } })], NOW);
    expect(renderJunit(r)).toContain('</testcase>');
    expect(renderJunit(r)).not.toContain('<failure');
    expect(renderJunit(r)).not.toContain('<skipped');
  });
  it('writes French when asked', () => {
    expect(renderJunit(report(), 'fr')).toContain('Contraste du texte');
  });
  it('xmlEscape drops control characters and escapes quotes', () => {
    expect(xmlEscape('a\u0001b"c\'d<e>&')).toBe('ab&quot;c&apos;d&lt;e&gt;&amp;');
  });
});

describe('baseline', () => {
  it('records failures only, sorted and unique', () => {
    const b = makeBaseline(report());
    expect(b.version).toBe(1);
    expect(b.keys).toEqual(['/map|contrast||p[1]', '/map|target-size||button[0]', 'data:places.json|provenance|source-url|rec[0]', 'html:dist/index.html|static-html|img-alt|img@L12']);
  });
  it('a run equal to its baseline has nothing new', () => {
    const d = diffAgainstBaseline(report(), makeBaseline(report()));
    expect(d.added).toEqual([]);
    expect(d.fixed).toEqual([]);
    expect(d.known).toBe(4);
  });
  it('finds a new failure, and does not count an unknown as one', () => {
    const base = makeBaseline(report());
    const worse = makeReport(
      [buildRouteAudit('/map', 320, { contrast: { checked: 4, entries: [e('contrast', 'p[1]'), e('contrast', 'p[9]'), e('contrast', 'p[8]', 'unknown')] } })],
      NOW,
    );
    const d = diffAgainstBaseline(worse, base);
    expect(d.added.map((i) => i.entry.id)).toEqual(['p[9]']);
    expect(d.fixed).toHaveLength(3);
    expect(d.known).toBe(1);
  });
  it('parseBaseline rejects bad JSON and wrong shapes, in both languages', () => {
    for (const text of ['{', '[]', 'null', '{"version":2,"generatedAt":"x","keys":[]}', '{"version":1,"generatedAt":"x","keys":[1]}', '{"version":1,"keys":[]}']) {
      const p = parseBaseline(text);
      expect(p.ok, text).toBe(false);
      if (!p.ok) expect(frTypographyIssues(p.error.fr), p.error.fr).toEqual([]);
    }
    const ok = parseBaseline(JSON.stringify(makeBaseline(report())));
    expect(ok.ok).toBe(true);
  });
  it('describes the result with French spacing', () => {
    const d = diffAgainstBaseline(report(), makeBaseline(report()));
    expect(describeDiff(d, 'en')).toBe('Compared with the baseline: 0 new failures, 0 fixed, 4 already known.');
    expect(frTypographyIssues(describeDiff(d, 'fr'))).toEqual([]);
    expect(describeDiff(d, 'fr')).toContain('référence\u00A0:');
  });
});

describe('dates and patterns', () => {
  it('validDate checks the calendar', () => {
    expect(validDate('2026-02-28')).toBe(true);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2026-2-3')).toBe(false);
    expect(validDate('tomorrow')).toBe(false);
  });
  it('a waiver lasts to the end of its last day', () => {
    expect(isExpired({ expires: '2026-11-15' }, new Date('2026-11-15T23:59:59Z'))).toBe(false);
    expect(isExpired({ expires: '2026-11-15' }, new Date('2026-11-16T00:00:00Z'))).toBe(true);
    expect(isExpired({ expires: 'nope' }, NOW)).toBe(true);
  });
  it('globMatch treats only * as special', () => {
    expect(globMatch('/map*', '/map/detail')).toBe(true);
    expect(globMatch('p[1]', 'p[1]')).toBe(true);
    expect(globMatch('p[1]', 'p1')).toBe(false);
    expect(globMatch('a.b', 'axb')).toBe(false);
    expect(globMatch('*', '')).toBe(true);
  });
});

const W = (over: Partial<Waiver> = {}): Waiver => ({ check: 'contrast', reason: 'Brand colour under review', expires: '2026-12-31', ...over });
const json = (waivers: unknown[]): string => JSON.stringify({ waivers });

describe('parseWaivers', () => {
  it('reads a good file', () => {
    const p = parseWaivers(json([{ check: 'contrast', rule: 'x', route: '/map*', id: 'p[1]', reason: 'Brand colour under review', expires: '2026-12-31', owner: 'jk' }]));
    expect(p.problems).toEqual([]);
    expect(p.waivers[0]).toEqual({ check: 'contrast', rule: 'x', route: '/map*', id: 'p[1]', reason: 'Brand colour under review', expires: '2026-12-31', owner: 'jk' });
  });
  it.each([
    ['not json', '{', 'invalid-json'],
    ['no list', '{}', 'shape'],
    ['unknown check', json([{ check: 'nope', reason: 'long enough reason', expires: '2026-12-31' }]), 'check'],
    ['waiving a waiver', json([{ check: 'waiver', reason: 'long enough reason', expires: '2026-12-31' }]), 'check'],
    ['short reason', json([{ check: 'contrast', reason: 'ok', expires: '2026-12-31' }]), 'reason'],
    ['missing reason', json([{ check: 'contrast', expires: '2026-12-31' }]), 'reason'],
    ['bad date', json([{ check: 'contrast', reason: 'long enough reason', expires: '31/12/2026' }]), 'expires'],
    ['no expiry', json([{ check: 'contrast', reason: 'long enough reason' }]), 'expires'],
    ['not an object', json([5]), 'check'],
  ])('%s is a failure with a French message', (_n, text, rule) => {
    const p = parseWaivers(text);
    expect(p.waivers).toEqual([]);
    expect(p.problems[0]?.rule).toBe(rule);
    expect(p.problems[0]?.status).toBe('fail');
    expect(frTypographyIssues(p.problems[0]?.message.fr ?? ''), p.problems[0]?.message.fr).toEqual([]);
  });
  it('keeps the good waivers when another is bad', () => {
    const p = parseWaivers(json([{ check: 'contrast', reason: 'long enough reason', expires: '2026-12-31' }, { check: 'nope' }]));
    expect(p.waivers).toHaveLength(1);
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]?.id).toBe('waiver[1]');
  });
});

describe('waiverMatches', () => {
  it('needs the check, and narrows by rule, route and id', () => {
    const en = e('static-html', 'img@L12', 'fail', 'img-alt');
    expect(waiverMatches(W({ check: 'static-html' }), '/a', en)).toBe(true);
    expect(waiverMatches(W({ check: 'static-html', rule: 'img-alt' }), '/a', en)).toBe(true);
    expect(waiverMatches(W({ check: 'static-html', rule: 'name' }), '/a', en)).toBe(false);
    expect(waiverMatches(W({ check: 'static-html', route: '/b*' }), '/a', en)).toBe(false);
    expect(waiverMatches(W({ check: 'static-html', id: 'img@*' }), '/a', en)).toBe(true);
    expect(waiverMatches(W(), '/a', en)).toBe(false);
  });
  it('a rule-less waiver does not match an entry that has a rule only by accident', () => {
    expect(waiverMatches(W({ rule: '' }), '/a', e('contrast', 'x'))).toBe(true);
    expect(waiverMatches(W({ rule: '' }), '/a', e('contrast', 'x', 'fail', 'r'))).toBe(false);
  });
});

describe('applyWaivers', () => {
  it('removes a waived failure and lists it with its reason', () => {
    const r = applyWaivers(report(), [W({ id: 'p[1]' })], NOW);
    expect(totals(r.report.routes).failed).toBe(3);
    expect(r.waived).toHaveLength(1);
    expect(r.waived[0]).toMatchObject({ route: '/map', reason: 'Brand colour under review', expires: '2026-12-31' });
    expect(r.report.routes.find((x) => x.route === '/map')?.checks.find((c) => c.check === 'contrast')).toMatchObject({ checked: 4, failed: 0, unknown: 1 });
  });
  it('never waives an unknown', () => {
    const r = applyWaivers(report(), [W({ check: 'static-html', rule: 'link-text' })], NOW);
    expect(r.waived).toEqual([]);
    expect(totals(r.report.routes).unknown).toBeGreaterThanOrEqual(2);
    expect(r.report.routes.some((x) => x.entries.some((en) => en.rule === 'link-text'))).toBe(true);
  });
  it('an expired waiver does not apply and is itself a failure', () => {
    const r = applyWaivers(report(), [W({ id: 'p[1]', expires: '2026-11-14' })], NOW);
    expect(r.waived).toEqual([]);
    const w = r.report.routes.find((x) => x.route === 'waivers');
    expect(w?.entries[0]).toMatchObject({ check: 'waiver', rule: 'expired', status: 'fail' });
    expect(totals(r.report.routes).failed).toBe(5);
  });
  it('a waiver that matches nothing is an unknown, so stale ones get noticed', () => {
    const r = applyWaivers(report(), [W({ id: 'nothing-like-this' })], NOW);
    const w = r.report.routes.find((x) => x.route === 'waivers');
    expect(w?.entries[0]).toMatchObject({ rule: 'unused', status: 'unknown' });
    expect(totals(r.report.routes).failed).toBe(4);
  });
  it('passes parse problems through as failures', () => {
    const p = parseWaivers(json([{ check: 'nope' }]));
    const r = applyWaivers(report(), p.waivers, NOW, p.problems);
    expect(r.report.routes.at(-1)?.entries[0]?.rule).toBe('check');
  });
  it('one waiver can cover several failures', () => {
    const r = applyWaivers(report(), [W({ check: 'static-html' }), W({ check: 'target-size' })], NOW);
    expect(r.waived.map((w) => w.entry.check).sort()).toEqual(['static-html', 'target-size']);
  });
  it('keeps the report time and leaves the input alone', () => {
    const before = JSON.stringify(report());
    const input = report();
    const r = applyWaivers(input, [W({ id: 'p[1]' })], NOW);
    expect(r.report.generatedAt).toBe(input.generatedAt);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('describeWaived lists the reason and expiry in both languages', () => {
    const r = applyWaivers(report(), [W({ id: 'p[1]' })], NOW);
    expect(describeWaived(r.waived, 'en')).toContain('1 failures waived:');
    expect(describeWaived(r.waived, 'en')).toContain('(until 2026-12-31)');
    expect(describeWaived(r.waived, 'fr')).toContain('1 anomalies sous dérogation\u00A0:');
    expect(describeWaived([], 'en')).toBe('');
  });
});
