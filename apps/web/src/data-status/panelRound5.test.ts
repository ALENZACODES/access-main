import { describe, expect, it } from 'vitest';
import { auditRegistry, auditHtml, describeProblems, lintFrench, renderDataStatusPanel, renderFilterControls, renderSourcesRegion, NO_FILTERS, scanHtml, visibleText } from './index';
import type { HistoryEntry } from './index';
import { NOW, RECORDS } from './testkit';

const hist: HistoryEntry[] = [
  { date: '2026-11-01', totals: { sources: 3, stale: 0, unknownDate: 1, notOpen: 1, missingDetails: 3 } },
  { date: '2026-11-14', totals: { sources: 3, stale: 1, unknownDate: 1, notOpen: 1, missingDetails: 3 } },
];
const sv = { action: '/en/data-status', csvHref: '/en/data-status/sources.csv', creditsHref: '/en/data-status/credits.txt', summaryHref: '/en/data-status/summary.json' };

describe('panel: round 5 sections', () => {
  it('shows history and thresholds when given', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, history: hist, thresholds: { places: 2000 } });
    expect(html).toContain('Sources possibly out of date: 1 (up from 0)');
    expect(html).toContain('<td>Custom value</td>');
  });

  it('static mode renders links and a GET form, with no buttons that need scripts', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW, staticView: { ...sv, action: '/fr/data-status' } });
    expect(html).toContain('<form method="get" action="/fr/data-status">');
    expect(html).not.toContain('data-action="recalculate"');
    expect(lintFrench(visibleText(html))).toEqual([]);
    expect(scanHtml(html)).toEqual([]);
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });

  it('dynamic mode keeps buttons and has no form', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html).toContain('data-action="recalculate"');
    expect(html).not.toContain('<form');
  });

  it('applies custom thresholds to the audit', () => {
    const relaxed = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, thresholds: { places: 2000 } });
    expect(relaxed).toContain('<dt>Sources possibly out of date</dt><dd>0</dd>');
  });
});

describe('filters and region: round 5', () => {
  it('controls carry name attributes and hidden threshold inputs inside a form', () => {
    const html = renderFilterControls('en', NO_FILTERS, { action: '/en/data-status', thresholds: { transit: 30 } });
    expect(html).toContain('name="state"');
    expect(html).toContain('name="q"');
    expect(html).toContain('<input type="hidden" name="stale_transit" value="30">');
  });

  it('region shows how old each date is, in words, next to the real date', () => {
    const html = renderSourcesRegion(renderAudit(), 'fr', NO_FILTERS, NOW);
    expect(html).toContain('(il y a 14 jours)');
    expect(html).toContain('<time datetime="2026-11-01">');
  });
});

function renderAudit() {
  return auditRegistry(RECORDS, NOW);
}
