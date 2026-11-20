/**
 * Unknown stays UNKNOWN. Every surface of the lane is produced from a registry full of gaps, in
 * English and in French, and none of them may show a localized word for a missing value: the
 * only spelling is the token UNKNOWN, in capitals, the same in both languages.
 */
import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { mountDataStatusPanel, renderDataStatusPanel, visibleText } from './index';
import { COLUMN_IDS } from './columns';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW } from './testkit';
import { UNKNOWN_WORD } from './unknownWord';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'Publisher', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const GAPS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('full'),
      src('old', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary', tier: 'E' }),
      src('bare', { name: null, source: null, url: null, licence: null, retrievedAt: null, tier: null }),
      src('placeholders', { name: 'N/A', source: 'TBD', licence: 'unknown', retrievedAt: 'inconnu', tier: 'n/a' }),
      src('future', { retrievedAt: isoDayOffset(NOW, 40) }),
      src('badDate', { retrievedAt: '2026-02-31' }),
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('shared', { url: 'https://example.org/full', licence: null })] },
  { id: 'e', name: 'Empty', kind: 'reference', sources: [] },
];

// A localized word for a missing value, in either language, any case but the token's own.
const LOCALIZED = /(?<![\p{L}\p{N}])(Unknown|unknown|Inconnu|Inconnue|Inconnus|Inconnues|inconnu|inconnue|inconnus|inconnues)(?![\p{L}\p{N}])/u;
const offending = (text: string): string[] =>
  text
    .split('\n')
    .filter((line) => LOCALIZED.test(line))
    .map((line) => line.trim().slice(0, 160));

const ALL_FILTERS: Filters[] = [
  NO_FILTERS,
  { ...NO_FILTERS, state: 'unknown' },
  { ...NO_FILTERS, tier: 'unknown' },
  { ...NO_FILTERS, licence: 'unknown' },
  { ...NO_FILTERS, age: 'unknown' },
  { ...NO_FILTERS, gap: 'date' },
  { ...NO_FILTERS, gap: 'tier', onlyIssues: true },
  { ...NO_FILTERS, query: 'nothing matches this at all' },
];

describe('the panel', () => {
  it('shows no localized word for a missing value, whatever is filtered, grouped or added as a column', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const filters of ALL_FILTERS) {
        for (const group of ['none', 'status', 'tier', 'licence', 'age'] as const) {
          const html = renderDataStatusPanel({ records: GAPS, locale, now: NOW, filters, live: { sort: null, limit: 50, group, details: true, columns: [...COLUMN_IDS] } });
          expect(offending(visibleText(html).replace(/\. /g, '.\n')), `${locale} ${JSON.stringify(filters)} ${group}`).toEqual([]);
        }
      }
    }
  });
  it('does show the token where a fact is missing', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderDataStatusPanel({ records: GAPS, locale, now: NOW });
      expect(html).toContain(`<td>${UNKNOWN_WORD}</td>`);
      expect(html).toContain(`<option value="unknown">${UNKNOWN_WORD}</option>`);
      expect(visibleText(html).split(UNKNOWN_WORD).length).toBeGreaterThan(20);
    }
  });
  it('uses the token in attributes read aloud as well', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderDataStatusPanel({ records: GAPS, locale, now: NOW, attributes: [{ key: 'ramp', label: { en: 'Ramp', fr: 'Rampe' } }], attributeRecords: [{ ramp: null }, {}] });
      for (const m of html.matchAll(/(?:aria-label|title|alt)="([^"]*)"/g)) expect(offending(m[1] ?? ''), m[0]).toEqual([]);
    }
  });
  it('says what changed with the token too', () => {
    for (const locale of ['en', 'fr'] as const) {
      const host = new FakeHost();
      mountDataStatusPanel(host, { getRecords: () => GAPS, getLocale: () => locale, now: () => NOW });
      const said: string[] = [];
      const steps: (() => void)[] = [
        () => host.filter('change', 'tier', 'unknown'),
        () => host.filter('change', 'licence', 'unknown'),
        () => host.filter('change', 'age', 'unknown'),
        () => host.filter('change', 'state', 'unknown'),
        () => host.filter('change', 'gap', 'date'),
        () => host.click('reset-filters'),
        () => host.click('quick:noTier'),
        () => host.click('quick:undated'),
        () => host.click('show:tier:unknown'),
        () => host.click('narrow:state:unknown'),
        () => host.filter('change', 'group', 'tier'),
      ];
      for (const step of steps) {
        step();
        said.push(visibleText(host.announce.innerHTML));
      }
      expect(said.filter((s) => s !== '').length).toBeGreaterThan(6);
      expect(offending(said.join('\n')), locale).toEqual([]);
    }
  });
  it('holds on random registries', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const locale of ['en', 'fr'] as const) {
        const records = randomRegistry(seed, NOW).map((d) => ({ ...d, name: `Set ${d.id}`, sources: d.sources.map((s, i) => ({ ...s, name: s.name === undefined || s.name === null ? s.name : `Item ${i}` })) }));
        const html = renderDataStatusPanel({ records, locale, now: NOW, live: { sort: null, limit: 200, details: true, columns: [...COLUMN_IDS] } });
        expect(offending(visibleText(html).replace(/\. /g, '.\n')), `seed ${seed} ${locale}`).toEqual([]);
      }
    }
  });
});

describe('every file the server sends', () => {
  const ctx = { getRecords: () => GAPS, now: () => NOW };
  const ROUTES = [
    '',
    '/sources.csv',
    '/credits.txt',
    '/review.ics',
    '/review-checklist.md',
    '/review-checklist.csv',
    '/record-facts.csv',
    '/planning-tables.csv',
    '/summary.txt',
    '/listed-sources.json',
    '/listed-sources.md',
    '/listed-sources.txt',
  ];
  it('shows no localized word for a missing value', async () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const route of ROUTES) {
        for (const query of ['', '?tier=unknown', '?gap=date&cols=review,due,gaps,licenceType,age&details=1&group=licence']) {
          const res = await handleDataStatus({ method: 'GET', url: `/${locale}/data-status${route}${query}`, headers: {} }, ctx);
          expect(res?.status, `${locale} ${route}${query}`).toBe(200);
          // The filters line of the JSON file is the address as typed, a machine value, so it is left out.
          const text = route === '' ? visibleText(res!.body).replace(/\. /g, '.\n') : res!.body.replace(/^\s*"filters": .*$/m, '');
          expect(offending(text), `${locale} ${route}${query}`).toEqual([]);
        }
      }
    }
  });
  it('writes the token in the files that list facts', async () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const route of ['/sources.csv', '/record-facts.csv', '/listed-sources.json', '/listed-sources.md', '/listed-sources.txt', '/review-checklist.csv']) {
        const res = await handleDataStatus({ method: 'GET', url: `/${locale}/data-status${route}`, headers: {} }, ctx);
        expect(res?.body, `${locale} ${route}`).toContain(UNKNOWN_WORD);
      }
    }
  });
  it('keeps machine values as they were: the filter value in the address stays lower case', async () => {
    const res = await handleDataStatus({ method: 'GET', url: '/en/data-status?tier=unknown', headers: {} }, ctx);
    expect(res?.body).toContain('<option value="unknown" selected>UNKNOWN</option>');
    const upper = await handleDataStatus({ method: 'GET', url: '/en/data-status?tier=UNKNOWN', headers: {} }, ctx);
    expect(upper?.body).not.toContain('<option value="unknown" selected>');
    const audit = auditRegistry(GAPS, NOW, {});
    expect(audit.sources.filter((s) => s.tier === null).length).toBeGreaterThan(0);
  });
});
