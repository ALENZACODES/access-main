import { describe, expect, it } from 'vitest';
import { auditCopy, COPY_RULES } from './copylint.js';
import { HELP_TEXT } from './cli.js';
import { describeBudget } from './budget.js';
import { describeSkipped } from './select.js';
import { describeDiff, describeWaived, renderJunit } from './ci.js';
import { describeTrend, appendRun, EMPTY_HISTORY, trend } from './history.js';
import { HTML_RULES, htmlTextItems, lintHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { renderPanel } from './panel.js';
import { auditProvenance } from './provenance.js';
import { buildRouteAudit, makeReport, renderBody, renderHtml, SCOPE_NOTE } from './report.js';
import { sampleEntries } from './samples.js';
import { CHECK_LABELS, CHECK_ORDER, type CheckResult, type Entry } from './types.js';

/**
 * Gates. Each one throws when a check finds a failure or an unknown, so a
 * violation fails the test run. The negative tests prove a gate can fail.
 */
function gate(name: string, res: CheckResult): void {
  if (res.entries.length > 0) {
    const lines = res.entries.map((e) => `  ${e.status} ${e.rule ?? e.check} ${e.id}: ${e.message.en}`);
    throw new Error(`${name}: ${res.entries.length} finding(s)\n${lines.join('\n')}`);
  }
}

const NOW = new Date('2026-11-15T12:00:00Z');
const sampleReport = makeReport(
  [
    buildRouteAudit('/map', 320, {
      contrast: { checked: 2, entries: [{ check: 'contrast', id: 'p[1]', status: 'fail', rule: 'x', message: { en: 'Low.', fr: 'Faible.' } }] },
    }),
    buildRouteAudit('strings', null, {}),
  ],
  NOW,
);
const emptyReport = makeReport([buildRouteAudit('/', 320, {})], NOW);

const strip = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('markup gates on the pages this folder produces', () => {
  for (const lang of ['en', 'fr'] as const) {
    it(`report page (${lang}) has no markup findings`, () => {
      gate('report', lintHtml(renderHtml(sampleReport, lang)));
      gate('empty report', lintHtml(renderHtml(emptyReport, lang)));
    });
    it(`report body and panel (${lang}) have no markup findings`, () => {
      gate('body', lintHtml(renderBody(sampleReport, lang), { fragment: true }));
      gate('panel idle', lintHtml(renderPanel(lang, { kind: 'idle' }), { fragment: true }));
      gate('panel done', lintHtml(renderPanel(lang, { kind: 'done', report: sampleReport }), { fragment: true }));
      gate('panel error', lintHtml(renderPanel(lang, { kind: 'error', message: '<b>x</b>' }), { fragment: true }));
    });
  }
  it('a page with violations fails the gate', () => {
    const bad = '<html><body><img src="a.png"><button></button></body></html>';
    expect(() => gate('bad', lintHtml(bad))).toThrow(/finding/);
    expect(() => gate('bad', lintHtml(bad))).toThrow(/img-alt/);
  });
});

describe('wording gates on everything a person can read', () => {
  const messages = (es: readonly Entry[]): Array<{ id: string; text: string }> =>
    es.flatMap((e, i) => [
      { id: `${i}:en`, text: e.message.en },
      { id: `${i}:fr`, text: e.message.fr },
    ]);

  it('every message of every check passes the wording rules', () => {
    gate('messages', auditCopy(messages(sampleEntries())));
  });
  it('labels, scope note, help text and rule descriptions pass the wording rules', () => {
    const items = [
      ...Object.entries(CHECK_LABELS).flatMap(([k, v]) => [{ id: `${k}:en`, text: v.en }, { id: `${k}:fr`, text: v.fr }]),
      { id: 'scope:en', text: SCOPE_NOTE.en },
      { id: 'scope:fr', text: SCOPE_NOTE.fr },
      { id: 'help', text: HELP_TEXT },
      ...COPY_RULES.flatMap((r) => [{ id: `${r.id}:en`, text: r.en }, { id: `${r.id}:fr`, text: r.fr }]),
    ];
    gate('labels', auditCopy(items));
  });
  it('rendered pages and the panel pass the wording rules', () => {
    for (const lang of ['en', 'fr'] as const) {
      gate('html', auditCopy(htmlTextItems(renderHtml(sampleReport, lang))));
      gate('panel', auditCopy([{ id: `panel:${lang}`, text: strip(renderPanel(lang, { kind: 'idle' })) }]));
    }
  });
  it('no message, label or help text uses the words verify, verified or their French forms', () => {
    const everything = [
      ...sampleEntries().flatMap((e) => [e.message.en, e.message.fr]),
      ...Object.values(CHECK_LABELS).flatMap((l) => [l.en, l.fr]),
      HELP_TEXT,
      describeDiff({ added: [], fixed: [], known: 0 }, 'en'),
      describeDiff({ added: [], fixed: [], known: 0 }, 'fr'),
      ...['en', 'fr'].map((l) => describeWaived([{ route: '/', entry: sampleEntries()[0] as Entry, reason: 'x', expires: '2027-01-01' }], l as 'en' | 'fr')),
      strip(renderPanel('en', { kind: 'done', report: sampleReport })),
      strip(renderPanel('fr', { kind: 'done', report: sampleReport })),
      renderJunit(sampleReport, 'fr'),
      describeSkipped(['forms', 'media'], 'en'),
      describeSkipped(['forms', 'media'], 'fr'),
      describeBudget(sampleReport, { version: 1, checks: { contrast: { fail: 1, unknown: 0 } } }, 'en'),
      describeBudget(sampleReport, { version: 1, checks: { contrast: { fail: 1, unknown: 0 } } }, 'fr'),
      ...(['en', 'fr'] as const).map((l) => describeTrend(trend(appendRun(appendRun(EMPTY_HISTORY, sampleReport), makeReport([], new Date('2026-12-01T00:00:00Z')))), l)),
    ];
    for (const text of everything) expect(text, text).not.toMatch(/verif|vérifi|real-time|temps réel|partnership|partenariat|guarantee|garanti/i);
  });
  it('a text with a banned claim fails the gate', () => {
    expect(() => gate('copy', auditCopy([{ id: 'x', text: 'Verified, real-time access' }]))).toThrow(/claim-checked/);
  });
});

describe('French typography gate', () => {
  it('every French message and label follows the typography rules', () => {
    const french = [
      ...sampleEntries().map((e) => e.message.fr),
      ...Object.values(CHECK_LABELS).map((l) => l.fr),
      SCOPE_NOTE.fr,
      ...COPY_RULES.map((r) => r.fr),
    ];
    expect(french.length).toBeGreaterThan(80);
    for (const s of french) expect(frTypographyIssues(s), s).toEqual([]);
  });
  it('panel and report text in French follow the rules', () => {
    for (const html of [renderPanel('fr', { kind: 'idle' }), renderBody(sampleReport, 'fr')]) {
      const text = strip(html);
      expect(frTypographyIssues(text.replace(/\bl'/g, 'l’')), text).not.toContain('guillemets');
    }
  });
});

describe('coverage of the sample set', () => {
  it('has an entry for every check that produces messages', () => {
    const checks = new Set(sampleEntries().map((e) => e.check));
    for (const c of CHECK_ORDER) expect(checks.has(c), c).toBe(true);
  });
  it('has an entry for every markup rule', () => {
    const rules = new Set(sampleEntries().filter((e) => e.check === 'static-html').map((e) => e.rule));
    for (const r of HTML_RULES) expect(rules.has(r), r).toBe(true);
  });
  it('has both languages for every entry', () => {
    for (const e of sampleEntries()) {
      expect(e.message.en.trim(), `${e.check} ${e.id}`).not.toBe('');
      expect(e.message.fr.trim(), `${e.check} ${e.id}`).not.toBe('');
    }
  });
});

describe('data gate', () => {
  const source = { name: 'City open data', url: 'https://example.org/d', licence: 'CC-BY-4.0', retrieved: '2026-11-01' };
  it('passes data with a source, an open licence and explicit unknowns', () => {
    gate('data', auditProvenance([{ id: 'a', source, facts: { ramp: 'unknown', door: 'yes' } }], { now: NOW }));
  });
  it('fails data that guesses, hides unknowns or has no source', () => {
    expect(() => gate('data', auditProvenance([{ id: 'a', facts: { ramp: null } }], { now: NOW }))).toThrow(/source-missing/);
    expect(() => gate('data', auditProvenance([{ id: 'a', source, facts: { ramp: 'n/a' } }], { now: NOW }))).toThrow(/fact-unknown-spelling/);
  });
});
