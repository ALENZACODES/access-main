import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS } from './filters';
import { auditHtml, buildReviewQueue, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, renderSourcesRegion, scanHtml, visibleText } from './index';
import { LIVE_STEP } from './liveList';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { buildRowDetail, describeDetails, findingCodesFor, renderDetailsToggle, renderRowDetailHtml, reviewDateIso, reviewText } from './rowDetail';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

// Places are reviewed 180 days after retrieval.
const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('ok'),
      src('today', { retrievedAt: isoDayOffset(NOW, -180) }),
      src('soon', { retrievedAt: isoDayOffset(NOW, -179) }),
      src('past', { retrievedAt: isoDayOffset(NOW, -181) }),
      src('old', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary', tier: 'E' }),
      src('bare', { source: null, licence: null, retrievedAt: null, tier: null }),
    ],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const byId = (id: string) => {
  const s = audit.sources.find((x) => x.sourceId === id);
  if (!s) throw new Error(id);
  return s;
};
const pair = (id: string, pairId: string, locale: 'en' | 'fr' = 'en') => buildRowDetail(byId(id), audit.findings, locale).pairs.find((p) => p.id === pairId)?.value;

describe('review date for one source', () => {
  it('is the retrieved date plus the review period', () => {
    expect(reviewDateIso(byId('ok'))).toBe(isoDayOffset(NOW, 177));
    expect(reviewDateIso(byId('today'))).toBe(isoDayOffset(NOW, 0));
    expect(reviewDateIso(byId('bare'))).toBeNull();
  });
  it('agrees with the review schedule on random registries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const due = new Map(buildReviewQueue(a, NOW).map((q) => [`${q.datasetId}|${q.sourceId}|${q.retrievedIso}`, q.dueIso]));
      for (const s of a.sources) {
        const key = `${s.datasetId}|${s.sourceId}|${s.state === 'unknown' ? null : s.retrievedIso}`;
        if (due.has(key)) expect(reviewDateIso(s), `seed ${seed} ${key}`).toBe(due.get(key));
      }
    }
  });
  it('is put in words with how far away it is', () => {
    expect(reviewText(byId('today'), 'en')).toMatch(/ \(today\)$/);
    expect(reviewText(byId('soon'), 'en')).toMatch(/ \(in 1 day\)$/);
    expect(reviewText(byId('ok'), 'en')).toMatch(/ \(in 177 days\)$/);
    expect(reviewText(byId('past'), 'en')).toMatch(/ \(1 day ago\)$/);
    expect(reviewText(byId('old'), 'en')).toMatch(/ \(220 days ago\)$/);
    expect(reviewText(byId('bare'), 'en')).toBe('Not scheduled, because the retrieved date is UNKNOWN.');
    expect(reviewText(byId('past'), 'fr')).toMatch(/ \(il y a 1 jour\)$/);
    expect(reviewText(byId('ok'), 'fr')).toMatch(/ \(dans 177 jours\)$/);
  });
});

describe('findings for one source', () => {
  it('lists its codes once each, most urgent first', () => {
    expect(findingCodesFor(byId('ok'), audit.findings)).toEqual([]);
    expect(findingCodesFor(byId('old'), audit.findings)).toEqual(['licence-unrecognised', 'stale']);
    expect(findingCodesFor(byId('bare'), audit.findings)).toEqual(['missing-source', 'missing-licence', 'missing-date']);
  });
  it('does not pick up another source with the same id in a different dataset', () => {
    const records: DatasetRecord[] = [
      { id: 'a', name: 'A', kind: 'places', sources: [src('x')] },
      { id: 'b', name: 'B', kind: 'places', sources: [src('x', { licence: null })] },
    ];
    const a = auditRegistry(records, NOW, {});
    const clean = a.sources.find((s) => s.datasetId === 'a');
    expect(clean && findingCodesFor(clean, a.findings)).toEqual([]);
  });
});

describe('buildRowDetail', () => {
  it('has the seven pairs in a fixed order', () => {
    expect(buildRowDetail(byId('ok'), audit.findings, 'en').pairs.map((p) => p.id)).toEqual(['kind', 'licenceType', 'tier', 'basis', 'review', 'gaps', 'todo']);
  });
  it('describes a complete source with nothing to do', () => {
    expect(pair('ok', 'kind')).toBe('Places');
    expect(pair('ok', 'licenceType')).toBe('Open licence');
    expect(pair('ok', 'tier')).toMatch(/^0\. Open data/);
    expect(pair('ok', 'gaps')).toBe('None');
    expect(pair('ok', 'todo')).toBe('None');
  });
  it('names unknown facts and what there is to do', () => {
    expect(pair('bare', 'gaps')).toBe('Source, Licence, Retrieved date, Tier');
    expect(pair('bare', 'todo')).toBe('Source name missing, Licence missing, Retrieved date missing');
    expect(pair('bare', 'tier')).toBe('The record does not state a tier.');
    expect(pair('bare', 'licenceType')).toBe('Unknown');
    expect(pair('old', 'todo')).toBe('Licence not on the reference list, Possibly out of date');
    expect(pair('old', 'licenceType')).toBe('Not on the reference list');
  });
  it('explains the status with the same words as the rest of the panel', () => {
    expect(pair('old', 'basis')).toContain('400');
    expect(pair('bare', 'basis')?.length).toBeGreaterThan(10);
  });
  it('is written in French and passes the typography lint', () => {
    for (const id of ['ok', 'old', 'bare', 'today']) {
      const d = buildRowDetail(byId(id), audit.findings, 'fr');
      expect(d.pairs[0]?.term).toBe('Type de données');
      for (const p of d.pairs) expect(lintFrench(`${p.term} ${p.value}`), `${id} ${p.id}`).toEqual([]);
    }
    expect(pair('ok', 'gaps', 'fr')).toBe('Aucun');
  });
  it('renders a definition list and escapes what comes from the data', () => {
    const records: DatasetRecord[] = [{ id: 'p', name: 'P', kind: 'places', sources: [src('x', { retrievedAt: '<b>bad</b>' })] }];
    const a = auditRegistry(records, NOW, {});
    const html = renderRowDetailHtml(buildRowDetail(a.sources[0]!, a.findings, 'en'));
    expect(html.startsWith('<dl data-row-detail="7">')).toBe(true);
    expect(html.match(/<dt>/g)).toHaveLength(7);
    expect(html).not.toContain('<b>');
  });
});

describe('the details toggle and the list', () => {
  it('is a labelled checkbox with a large target, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const on of [true, false]) {
        const html = renderDetailsToggle(on, locale);
        expect(html.includes(' checked')).toBe(on);
        expect(html).toContain('data-filter="details"');
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        expect(scanHtml(html)).toEqual([]);
      }
    }
    expect(renderDetailsToggle(false, 'en')).toContain('Show details under each source');
    expect(describeDetails(true, 'en')).toBe('Details are shown under each source.');
    expect(describeDetails(false, 'fr')).toBe('Les détails sont masqués.');
  });
  it('is in the live controls only', () => {
    expect(renderFilterControls('en', NO_FILTERS, undefined, [], null, { group: 'none', details: true })).toContain('id="ds-f-details"');
    expect(renderFilterControls('en', NO_FILTERS)).not.toContain('id="ds-f-details"');
  });
  it('puts the details in each row header only when turned on', () => {
    const off = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP });
    expect(off).not.toContain('data-row-detail');
    const on = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP, details: true });
    expect(on.match(/data-row-detail="7"/g)).toHaveLength(6);
    expect(on).toMatch(/<th scope="row">Places \/ Name ok<dl data-row-detail/);
    expect((on.match(/<tr><th scope="row">/g) ?? []).length).toBe(6);
  });
  it('never shows details in the static view', () => {
    const page = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW, live: { sort: null, limit: LIVE_STEP, details: true }, staticView: { action: '/x', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(page).not.toContain('data-row-detail');
  });
  it('passes the audits with details on, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const records of [MIXED, RECORDS]) {
        const html = renderDataStatusPanel({ records, locale, now: NOW, live: { sort: null, limit: LIVE_STEP, details: true } });
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(structureProblems(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
  it('turns on and off from the checkbox, says so, and leaves the filters and focus alone', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.filter('change', 'tier', 'E');
    host.filter('change', 'details', '', true);
    expect(host.region.innerHTML.match(/data-row-detail/g)).toHaveLength(1);
    expect(host.announce.innerHTML).toBe('Details are shown under each source.');
    expect(panel.getFilters().tier).toBe('E');
    expect(seen.at(-1)).toBe('?tier=E');
    host.filter('change', 'details', '', false);
    expect(host.region.innerHTML).not.toContain('data-row-detail');
    expect(host.announce.innerHTML).toBe('Details are hidden.');
    expect(host.focused).toEqual([]);
  });
  it('stays on through filter changes and a full redraw', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    host.filter('change', 'details', '', true);
    host.filter('change', 'tier', '0');
    expect(host.region.innerHTML).toContain('data-row-detail');
    host.click('recalculate');
    expect(host.innerHTML).toContain('data-row-detail');
    expect(host.innerHTML).toMatch(/id="ds-f-details"[^>]* checked/);
  });
});
