import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import {
  buildDatasetCards,
  cardDatesText,
  cardFactsText,
  cardLicenceText,
  cardReviewText,
  cardStatusText,
  cardTierText,
  MAX_DATASET_CARDS,
  renderDatasetCardsHtml,
} from './datasetCards';
import { applyFilters, NO_FILTERS } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildRecordFacts } from './recordFacts';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';
import { TIER_IDS } from './tierValue';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
// Places are reviewed 180 days after retrieval, routes 120.
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('b', { retrievedAt: isoDayOffset(NOW, -170), tier: 'E' }),
      src('c', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('d', { retrievedAt: null, licence: null, tier: null }),
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('e', { retrievedAt: isoDayOffset(NOW, -120) })] },
  { id: 'u', name: 'Undated', kind: 'reference', sources: [src('f', { retrievedAt: '2031-01-01' }), src('g', { retrievedAt: 'N/A' })] },
  { id: 'empty', name: 'Empty', kind: 'reference', sources: [] },
];
const audit = auditRegistry(MIXED, NOW, {});
const card = (id: string) => {
  const c = buildDatasetCards(audit).cards.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

describe('buildDatasetCards', () => {
  it('has one card for each dataset that has sources, in audit order', () => {
    expect(buildDatasetCards(audit).cards.map((c) => c.id)).toEqual(audit.sources.map((s) => s.datasetId).filter((id, i, all) => all.indexOf(id) === i));
    expect(buildDatasetCards(audit).cards.map((c) => c.id)).not.toContain('empty');
  });
  it('counts status, tiers and licence types', () => {
    const p = card('p');
    expect(p.total).toBe(4);
    expect(p.states).toEqual({ fresh: 2, stale: 1, unknown: 1 });
    expect(p.tiers['0']).toBe(2);
    expect(p.tiers.E).toBe(1);
    expect(p.tierUnknown).toBe(1);
    expect(p.licences).toEqual({ open: 2, terms: 0, unrecognised: 1, unknown: 1 });
    expect(p.kind).toBe('places');
    expect(p.name).toBe('Places');
  });
  it('finds the oldest and newest usable retrieved dates', () => {
    expect(card('p').oldestIso).toBe(isoDayOffset(NOW, -400));
    expect(card('p').newestIso).toBe(isoDayOffset(NOW, -3));
    expect(card('r').oldestIso).toBe(card('r').newestIso);
  });
  it('gives no dates when none is usable: a future or placeholder date sets no bound', () => {
    expect(card('u')).toMatchObject({ oldestIso: null, newestIso: null, nextReview: null, pastReview: 0 });
    expect(card('u').states.unknown).toBe(2);
  });
  it('finds the nearest review date that has not passed, and counts the ones that have', () => {
    expect(card('p').nextReview).toEqual({ iso: isoDayOffset(NOW, 10), days: 10 });
    expect(card('p').pastReview).toBe(1);
    expect(card('r').nextReview).toEqual({ iso: isoDayOffset(NOW, 0), days: 0 });
  });
  it('counts the sources that carry all four facts, as the facts section does', () => {
    expect(card('p').complete).toBe(3);
    for (let seed = 1; seed <= 15; seed++) {
      const records = randomRegistry(seed, NOW).map((r) => ({ ...r, sources: r.sources.map((s, i) => ({ ...s, tier: i % 3 === 0 ? null : i % 5 })) }));
      const a = auditRegistry(records, NOW, {});
      const facts = buildRecordFacts(records, a);
      const cards = buildDatasetCards(a, 1000).cards;
      expect(cards.reduce((n, c) => n + c.complete, 0), `seed ${seed}`).toBe(facts.complete);
    }
  });
  it('adds up on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const { cards, hidden } = buildDatasetCards(a, 1000);
      expect(hidden).toBe(0);
      expect(cards.reduce((n, c) => n + c.total, 0), `seed ${seed}`).toBe(a.sources.length);
      for (const c of cards) {
        expect(c.states.fresh + c.states.stale + c.states.unknown).toBe(c.total);
        expect(TIER_IDS.reduce((n, id) => n + c.tiers[id], 0) + c.tierUnknown).toBe(c.total);
        expect(c.licences.open + c.licences.terms + c.licences.unrecognised + c.licences.unknown).toBe(c.total);
        expect(c.pastReview).toBe(c.states.stale);
        expect(c.total).toBe(applyFilters(a.sources, { ...NO_FILTERS, dataset: c.id }).length);
        if (c.oldestIso !== null && c.newestIso !== null) expect(c.oldestIso <= c.newestIso).toBe(true);
        if (c.nextReview !== null) expect(c.nextReview.days).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('respects the limit and reports the rest as hidden', () => {
    expect(buildDatasetCards(audit, 2)).toMatchObject({ hidden: 1 });
    expect(buildDatasetCards(audit, 2).cards).toHaveLength(2);
    for (const l of [0, -1, NaN]) expect(buildDatasetCards(audit, l)).toMatchObject({ cards: [], hidden: 3 });
    expect(MAX_DATASET_CARDS).toBeGreaterThan(0);
  });
  it('forms one card from datasets that share an id', () => {
    const dup: DatasetRecord[] = [{ id: 'x', name: 'First', kind: 'places', sources: [src('a')] }, { id: 'x', name: 'Second', kind: 'places', sources: [src('b')] }];
    const cards = buildDatasetCards(auditRegistry(dup, NOW, {})).cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]?.total).toBe(2);
  });
  it('is empty for an empty registry', () => {
    expect(buildDatasetCards(auditRegistry([], NOW, {}))).toEqual({ cards: [], hidden: 0 });
  });
});

describe('card wording', () => {
  it('lists only the counts that are not zero', () => {
    expect(cardStatusText(card('p'), 'en')).toBe('Within its review period: 2; May be out of date: 1; Update date unknown: 1');
    expect(cardTierText(card('p'), 'en')).toBe('Tier 0: 2; Tier E: 1; UNKNOWN: 1');
    expect(cardLicenceText(card('p'), 'en')).toBe('Open licence: 2; Not on the reference list: 1; Unknown: 1');
    expect(cardTierText(card('r'), 'en')).toBe('Tier 0: 1');
  });
  it('gives the date range, a single date, or says there is none', () => {
    expect(cardDatesText(card('p'), 'en')).toMatch(/^From .* to .*2026$/);
    expect(cardDatesText(card('r'), 'en')).not.toContain('From');
    expect(cardDatesText(card('u'), 'en')).toBe('No source has a usable retrieved date.');
  });
  it('gives the next review date and how many have passed', () => {
    expect(cardReviewText(card('p'), 'en')).toMatch(/^Next on .* \(in 10 days\)\. 1 already passed\.$/);
    expect(cardReviewText(card('r'), 'en')).toMatch(/^Next on .* \(today\)\.$/);
    expect(cardReviewText(card('u'), 'en')).toBe('No review date is coming up.');
  });
  it('says how many records carry all four facts', () => {
    expect(cardFactsText(card('p'), 'en')).toBe('All four on 3 of 4');
    expect(cardFactsText(card('p'), 'fr')).toBe('Les quatre pour 3 sur 4');
  });
  it('is written in French and passes the typography lint', () => {
    for (const id of ['p', 'r', 'u']) {
      for (const text of [cardStatusText(card(id), 'fr'), cardTierText(card(id), 'fr'), cardLicenceText(card(id), 'fr'), cardDatesText(card(id), 'fr'), cardReviewText(card(id), 'fr')]) {
        expect(lintFrench(text), text).toEqual([]);
      }
    }
    expect(cardTierText(card('p'), 'fr')).toBe('Niveau 0 : 2 ; Niveau E : 1 ; UNKNOWN : 1');
  });
});

describe('renderDatasetCardsHtml', () => {
  it('renders a headed card with eight pairs for each dataset', () => {
    const html = renderDatasetCardsHtml(buildDatasetCards(audit), 'en');
    expect(html.match(/<section aria-labelledby="ds-card-\d+" data-card="/g)).toHaveLength(3);
    expect(html).toContain('<h3 id="ds-card-1">Places</h3>');
    expect(html.match(/<dt>/g)).toHaveLength(24);
    expect(html).toContain('<dt>Sources</dt><dd>4</dd>');
  });
  it('says so when there is nothing to show, and mentions hidden datasets with the right plural', () => {
    expect(renderDatasetCardsHtml(buildDatasetCards(auditRegistry([], NOW, {})), 'en')).toContain('There are no datasets with sources.');
    expect(renderDatasetCardsHtml(buildDatasetCards(audit, 2), 'en')).toContain('1 more dataset is not shown.');
    expect(renderDatasetCardsHtml(buildDatasetCards(audit, 1), 'en')).toContain('2 more datasets are not shown.');
    expect(renderDatasetCardsHtml(buildDatasetCards(audit, 0), 'en')).toContain('3 more datasets are not shown.');
  });
  it('escapes dataset names and ids', () => {
    const records: DatasetRecord[] = [{ id: 'a"b', name: '<b>N</b>', kind: 'places', sources: [src('x')] }];
    const html = renderDatasetCardsHtml(buildDatasetCards(auditRegistry(records, NOW, {})), 'en');
    expect(html).not.toContain('<b>N</b>');
    expect(html).toContain('data-card="a&quot;b"');
  });
  it('puts the extra content at the foot of each card only when given', () => {
    expect(renderDatasetCardsHtml(buildDatasetCards(audit), 'en')).not.toContain('[foot');
    const html = renderDatasetCardsHtml(buildDatasetCards(audit), 'en', { foot: (c) => `[foot ${c.id}]` });
    expect(html.match(/\[foot [a-z]+\]/g)).toEqual(['[foot p]', '[foot r]', '[foot u]']);
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const a of [audit, auditRegistry(RECORDS, NOW, {}), auditRegistry([], NOW, {})]) {
        const html = renderDatasetCardsHtml(buildDatasetCards(a), locale);
        expect(html).toContain('aria-labelledby="ds-cards-title"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('dataset cards on the panel', () => {
  it('are there once, after the datasets table, in the contents list, with a control on each card', () => {
    const html = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW });
    expect(html.match(/id="ds-cards-title"/g)).toHaveLength(1);
    expect(html).toContain('href="#ds-cards-title"');
    const cards = /<section aria-labelledby="ds-cards-title">[\s\S]*?<\/section><\/section>/.exec(html)?.[0] ?? '';
    expect(cards.match(/data-action="show:dataset:[a-z]+"/g)).toEqual(['data-action="show:dataset:p"', 'data-action="show:dataset:r"', 'data-action="show:dataset:u"']);
    expect(structureProblems(html)).toEqual([]);
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('the control on a card lists that dataset’s sources', () => {
    const host = new FakeHost();
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    host.click('show:dataset:u');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, dataset: 'u' });
    expect(host.innerHTML).toContain('data-listed-summary="2"');
  });
  it('use links in the static view and pass the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
      expect(page).toContain('id="ds-cards-title"');
      expect(page).toContain('href="/en/data-status?ds=u"');
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
    }
  });
});
