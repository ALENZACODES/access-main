import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS } from './filters';
import { lintFrench, mountDataStatusPanel, renderResultsHtml, scanHtml } from './index';
import { buildListedSummary, listedSummaryText, renderListedSummaryHtml } from './listedSummary';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS } from './testkit';

const audit = auditRegistry(RECORDS, NOW, {});
const CLEAN: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 's', source: 'P', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: 0 }] }];

describe('buildListedSummary', () => {
  it('counts what needs attention among the listed sources', () => {
    expect(buildListedSummary(audit.sources)).toEqual({ listed: 3, stale: 1, undated: 1, noTier: 1, licenceToReview: 2 });
  });
  it('counts only the sources it is given', () => {
    const listed = applyFilters(audit.sources, { ...NO_FILTERS, tier: '0' });
    expect(buildListedSummary(listed)).toEqual({ listed: 1, stale: 0, undated: 0, noTier: 0, licenceToReview: 0 });
  });
  it('is all zeros for an empty list', () => {
    expect(buildListedSummary([])).toEqual({ listed: 0, stale: 0, undated: 0, noTier: 0, licenceToReview: 0 });
  });
  it('never counts more than is listed, and agrees with the filters, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const s = buildListedSummary(a.sources);
      expect(s.listed).toBe(a.sources.length);
      expect(s.stale).toBe(applyFilters(a.sources, { ...NO_FILTERS, state: 'stale' }).length);
      expect(s.undated).toBe(applyFilters(a.sources, { ...NO_FILTERS, state: 'unknown' }).length);
      expect(s.noTier).toBe(applyFilters(a.sources, { ...NO_FILTERS, tier: 'unknown' }).length);
      expect(s.licenceToReview).toBe(applyFilters(a.sources, { ...NO_FILTERS, licence: 'unknown' }).length + applyFilters(a.sources, { ...NO_FILTERS, licence: 'unrecognised' }).length);
      expect(s.stale + s.undated).toBeLessThanOrEqual(s.listed);
    }
  });
});

describe('listedSummaryText', () => {
  it('names only the counts that are not zero', () => {
    expect(listedSummaryText({ listed: 4, stale: 1, undated: 0, noTier: 2, licenceToReview: 0 }, 'en')).toBe('In this list: 1 possibly out of date, 2 with no tier.');
  });
  it('says so when nothing in the list needs attention', () => {
    expect(listedSummaryText(buildListedSummary(auditRegistry(CLEAN, NOW, {}).sources), 'en')).toMatch(/^In this list, every source has a usable date/);
  });
  it('says nothing for an empty list', () => {
    expect(listedSummaryText(buildListedSummary([]), 'en')).toBeNull();
    expect(renderListedSummaryHtml(buildListedSummary([]), 'en')).toBe('');
  });
  it('uses the French plural and spacing', () => {
    const one = listedSummaryText({ listed: 2, stale: 1, undated: 0, noTier: 0, licenceToReview: 0 }, 'fr') ?? '';
    const two = listedSummaryText({ listed: 2, stale: 2, undated: 0, noTier: 0, licenceToReview: 1 }, 'fr') ?? '';
    expect(one).toBe('Dans cette liste : 1 possiblement périmée.');
    expect(two).toBe('Dans cette liste : 2 possiblement périmées, 1 dont la licence est à examiner.');
    expect(lintFrench(one)).toEqual([]);
    expect(lintFrench(two)).toEqual([]);
  });
});

describe('on the panel', () => {
  it('sits above the table and matches the filtered list', () => {
    const html = renderResultsHtml(audit, 'en', { ...NO_FILTERS, tier: 'E' }, NOW);
    expect(html).toContain('<p data-listed-summary="1">In this list: 1 possibly out of date, 1 with a licence to review.</p>');
    expect(html.indexOf('data-listed-summary')).toBeLessThan(html.indexOf('<table'));
    expect(scanHtml(html)).toEqual([]);
  });
  it('is absent when the filters match nothing', () => {
    expect(renderResultsHtml(audit, 'en', { ...NO_FILTERS, tier: '4' }, NOW)).not.toContain('data-listed-summary');
  });
  it('updates as filters change', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    host.filter('change', 'tier', '0');
    expect(host.region.innerHTML).toContain('data-listed-summary="1"');
    expect(host.region.innerHTML).toContain('In this list, every source has a usable date');
    host.filter('change', 'tier', 'unknown');
    expect(host.region.innerHTML).toContain('1 with no tier');
  });
});
