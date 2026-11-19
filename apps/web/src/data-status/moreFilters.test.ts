import { describe, expect, it } from 'vitest';
import { filterParts } from './announce';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import {
  applyFilters,
  FILTER_LICENCE_KINDS,
  hasActiveFilters,
  isDatasetFilter,
  isLicenceKind,
  MAX_DATASET_ID_LENGTH,
  NO_FILTERS,
  OPTIONAL_FILTER_KEYS,
  parseFilters,
  serializeFilters,
  withOptionalFilter,
  type Filters,
} from './filters';
import { auditHtml, datasetOptions, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, scanHtml, visibleText } from './index';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      { id: 'open', name: 'Open one', licence: 'OGL-Ontario', tier: 0 },
      { id: 'prop', name: 'Closed one', licence: 'Proprietary', tier: 0 },
      { id: 'none', name: 'No licence' },
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'r1', name: 'Route one', licence: 'OGL-Ontario', tier: 'E' }] },
];
const audit = auditRegistry(MIXED, NOW, {});
const ids = (f: Filters) => applyFilters(audit.sources, f).map((s) => s.sourceId).sort();
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('licence-type filter', () => {
  it('knows the four licence types', () => {
    expect(FILTER_LICENCE_KINDS).toEqual(['open', 'terms', 'unrecognised', 'unknown']);
    for (const k of FILTER_LICENCE_KINDS) expect(isLicenceKind(k)).toBe(true);
    for (const v of ['any', '', 'Open', null, 1]) expect(isLicenceKind(v)).toBe(false);
  });
  it('keeps only sources whose licence is of the chosen type', () => {
    expect(ids({ ...NO_FILTERS, licence: 'open' })).toEqual(['open', 'r1']);
    expect(ids({ ...NO_FILTERS, licence: 'unrecognised' })).toEqual(['prop']);
    expect(ids({ ...NO_FILTERS, licence: 'unknown' })).toEqual(['none']);
    expect(ids({ ...NO_FILTERS, licence: 'terms' })).toEqual([]);
  });
  it('every source falls under exactly one licence type, on random registries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const total = FILTER_LICENCE_KINDS.reduce((n, licence) => n + applyFilters(a.sources, { ...NO_FILTERS, licence }).length, 0);
      expect(total, `seed ${seed}`).toBe(a.sources.length);
    }
  });
  it('reads and writes the query string as lic, ignoring anything else', () => {
    expect(parseFilters('?lic=open').licence).toBe('open');
    for (const q of ['?lic=any', '?lic=', '?lic=OPEN', '?licence=open']) expect('licence' in parseFilters(q), q).toBe(false);
    expect(serializeFilters({ ...NO_FILTERS, licence: 'terms' })).toBe('?lic=terms');
  });
});

describe('dataset filter', () => {
  it('accepts a dataset id and rejects blanks, the word for all, and overlong text', () => {
    expect(isDatasetFilter('p')).toBe(true);
    expect(isDatasetFilter('x'.repeat(MAX_DATASET_ID_LENGTH))).toBe(true);
    for (const v of ['', '   ', 'any', 'x'.repeat(MAX_DATASET_ID_LENGTH + 1), null, 3]) expect(isDatasetFilter(v)).toBe(false);
  });
  it('keeps only the sources of the chosen dataset', () => {
    expect(ids({ ...NO_FILTERS, dataset: 'r' })).toEqual(['r1']);
    expect(ids({ ...NO_FILTERS, dataset: 'p' })).toEqual(['none', 'open', 'prop']);
    expect(ids({ ...NO_FILTERS, dataset: 'missing' })).toEqual([]);
  });
  it('reads and writes the query string as ds', () => {
    expect(parseFilters('?ds=r').dataset).toBe('r');
    expect('dataset' in parseFilters('?ds=any')).toBe(false);
    expect('dataset' in parseFilters('?ds=')).toBe(false);
    expect(serializeFilters({ ...NO_FILTERS, dataset: 'a b&c' })).toBe('?ds=a+b%26c');
    expect(parseFilters(serializeFilters({ ...NO_FILTERS, dataset: 'a b&c' })).dataset).toBe('a b&c');
  });
  it('offers one option per dataset id, in audit order', () => {
    expect(datasetOptions(audit)).toEqual([{ id: 'p', name: 'Places' }, { id: 'r', name: 'Routes' }]);
    const dup = auditRegistry([...MIXED, { id: 'p', name: 'Places again', kind: 'places', sources: [] }], NOW, {});
    expect(datasetOptions(dup).map((d) => d.id)).toEqual(['p', 'r']);
  });
});

describe('the three optional filters together', () => {
  it('combine with each other and with the older filters', () => {
    expect(ids({ ...NO_FILTERS, licence: 'open', dataset: 'p' })).toEqual(['open']);
    expect(ids({ ...NO_FILTERS, licence: 'open', tier: 'E' })).toEqual(['r1']);
    expect(ids({ ...NO_FILTERS, licence: 'open', tier: 'E', dataset: 'p' })).toEqual([]);
    expect(ids({ ...NO_FILTERS, dataset: 'p', query: 'closed' })).toEqual(['prop']);
  });
  it('each counts as an active filter', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, licence: 'open' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, dataset: 'p' })).toBe(true);
  });
  it('round-trips every combination through the query string', () => {
    const full: Filters = { state: 'fresh', kind: 'routes', query: 'abc', onlyIssues: true, tier: '2', licence: 'terms', dataset: 'r' };
    expect(parseFilters(serializeFilters(full))).toEqual(full);
    for (const key of OPTIONAL_FILTER_KEYS) {
      const f = withOptionalFilter(full, key, undefined);
      expect(key in f).toBe(false);
      expect(parseFilters(serializeFilters(f))).toEqual(f);
    }
  });
  it('sets and removes one optional filter without touching the input or the others', () => {
    const start: Filters = { ...NO_FILTERS, tier: 'E', dataset: 'p' };
    const next = withOptionalFilter(start, 'licence', 'open');
    expect(next).toEqual({ ...NO_FILTERS, tier: 'E', dataset: 'p', licence: 'open' });
    expect(start).toEqual({ ...NO_FILTERS, tier: 'E', dataset: 'p' });
    expect(withOptionalFilter(next, 'tier', undefined)).toEqual({ ...NO_FILTERS, dataset: 'p', licence: 'open' });
    expect(withOptionalFilter(NO_FILTERS, 'dataset', undefined)).toEqual(NO_FILTERS);
  });
  it('leaves filters with none of them equal to the plain defaults', () => {
    expect(parseFilters('')).toEqual(NO_FILTERS);
    expect(Object.keys(parseFilters('?state=stale')).sort()).toEqual(['kind', 'onlyIssues', 'query', 'state']);
  });
});

describe('filter controls', () => {
  it('has a labelled licence-type select in both languages', () => {
    const en = renderFilterControls('en', { ...NO_FILTERS, licence: 'unrecognised' });
    expect(en).toContain('<label for="ds-f-licence">Licence type</label>');
    expect(en).toContain('<option value="unrecognised" selected>Not on the reference list</option>');
    expect(renderFilterControls('fr', NO_FILTERS)).toContain('<label for="ds-f-licence">Type de licence</label>');
  });
  it('offers the dataset select only when there is more than one dataset', () => {
    expect(renderFilterControls('en', NO_FILTERS)).not.toContain('ds-f-dataset');
    expect(renderFilterControls('en', NO_FILTERS, undefined, [{ id: 'p', name: 'Places' }])).not.toContain('ds-f-dataset');
    const two = renderFilterControls('en', { ...NO_FILTERS, dataset: 'r' }, undefined, datasetOptions(audit));
    expect(two).toContain('<label for="ds-f-dataset">Dataset</label>');
    expect(two).toContain('<option value="r" selected>Routes</option>');
    expect(two).toContain('<option value="p">Places</option>');
  });
  it('escapes dataset names and ids', () => {
    const html = renderFilterControls('en', NO_FILTERS, undefined, [{ id: 'a"b', name: '<b>A</b>' }, { id: 'c', name: 'C' }]);
    expect(html).not.toContain('<b>A</b>');
    expect(html).toContain('value="a&quot;b"');
  });
  it('are on the panel and in the static form, and pass the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const live = renderDataStatusPanel({ records: MIXED, locale, now: NOW, filters: { ...NO_FILTERS, licence: 'open', dataset: 'p' } });
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, staticView: sv, filters: { ...NO_FILTERS, licence: 'open', dataset: 'p' } });
      for (const html of [live, page]) {
        expect(html).toContain('<select id="ds-f-licence" name="lic"');
        expect(html).toContain('<select id="ds-f-dataset" name="ds"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(structureProblems(html)).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('licence and dataset filters on the live panel', () => {
  const mount = () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    return { host, seen };
  };
  const rows = (host: FakeHost) => (host.region.innerHTML.match(/<tr><th scope="row">/g) ?? []).length;

  it('filters by licence type, tells the page, and says what changed', () => {
    const { host, seen } = mount();
    host.filter('change', 'licence', 'open');
    expect(rows(host)).toBe(2);
    expect(seen.at(-1)).toContain('lic=open');
    expect(host.announce.innerHTML).toContain('licence type open licence');
    host.filter('change', 'licence', 'any');
    expect(rows(host)).toBe(4);
    expect(seen.at(-1)).not.toContain('lic=');
  });
  it('filters by dataset and combines with the licence type', () => {
    const { host, seen } = mount();
    host.filter('change', 'dataset', 'p');
    expect(rows(host)).toBe(3);
    host.filter('change', 'licence', 'open');
    expect(rows(host)).toBe(1);
    expect(seen.at(-1)).toContain('lic=open');
    expect(seen.at(-1)).toContain('ds=p');
    host.filter('change', 'dataset', 'any');
    expect(rows(host)).toBe(2);
  });
  it('ignores a licence type that does not exist', () => {
    const { host } = mount();
    host.filter('change', 'licence', 'bogus');
    expect(rows(host)).toBe(4);
  });
  it('the sample registry also has the controls', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html).toContain('id="ds-f-licence"');
    expect(html).toContain('id="ds-f-dataset"');
  });
});

describe('spoken description', () => {
  it('names the licence type and the dataset in both languages', () => {
    expect(filterParts({ ...NO_FILTERS, licence: 'terms' }, 'en')).toEqual(['licence type accepted provider terms']);
    expect(filterParts({ ...NO_FILTERS, dataset: 'p' }, 'en')).toEqual(['dataset p']);
    expect(filterParts({ ...NO_FILTERS, licence: 'open', dataset: 'p' }, 'fr')).toEqual(['type de licence licence ouverte', 'jeu de données p']);
  });
});
