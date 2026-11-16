import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STALE_DAYS,
  EMPTY_VIEW,
  MAX_THRESHOLD_DAYS,
  NO_FILTERS,
  parseThresholds,
  parseViewState,
  renderThresholdsHtml,
  scanHtml,
  serializeViewState,
  thresholdRows,
} from './index';
import { structureProblems } from './testkit';

describe('parseThresholds', () => {
  it('reads valid per-type values', () => {
    expect(parseThresholds('?stale_places=90&stale_transit=30')).toEqual({ places: 90, transit: 30 });
    expect(parseThresholds('stale_routes=7')).toEqual({ routes: 7 });
  });

  it('ignores out-of-range, non-numeric, unknown-type and default values', () => {
    expect(parseThresholds('?stale_places=0&stale_transit=-5&stale_routes=abc&stale_reference=1.5')).toEqual({});
    expect(parseThresholds(`?stale_boundaries=${MAX_THRESHOLD_DAYS + 1}`)).toEqual({});
    expect(parseThresholds('?stale_medical=30&stale_=5')).toEqual({});
    expect(parseThresholds(`?stale_places=${DEFAULT_STALE_DAYS.places}`)).toEqual({});
    expect(parseThresholds('?stale_places=%20%2090')).toEqual({});
  });

  it('accepts the bounds', () => {
    expect(parseThresholds('?stale_places=1')).toEqual({ places: 1 });
    expect(parseThresholds(`?stale_places=${MAX_THRESHOLD_DAYS}`)).toEqual({ places: MAX_THRESHOLD_DAYS });
  });
});

describe('view state', () => {
  it('round-trips filters and thresholds, filters first', () => {
    const v = { filters: { ...NO_FILTERS, state: 'stale', query: 'abc' } as const, thresholds: { places: 90, transit: 30 } };
    const s = serializeViewState(v);
    expect(s).toBe('?state=stale&q=abc&stale_places=90&stale_transit=30');
    expect(parseViewState(s)).toEqual(v);
  });

  it('is empty for the defaults and drops invalid or default thresholds', () => {
    expect(serializeViewState(EMPTY_VIEW)).toBe('');
    expect(serializeViewState({ filters: NO_FILTERS, thresholds: { places: DEFAULT_STALE_DAYS.places, routes: 0, transit: 99999 } })).toBe('');
  });

  it('truncates fractional thresholds', () => {
    expect(serializeViewState({ filters: NO_FILTERS, thresholds: { places: 90.7 } })).toBe('?stale_places=90');
  });
});

describe('thresholdRows / renderThresholdsHtml', () => {
  it('lists every type with its days and whether it is custom', () => {
    const rows = thresholdRows({ places: 90 }, 'en');
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.kind === 'places')).toMatchObject({ days: 90, custom: true, label: 'Places' });
    expect(rows.find((r) => r.kind === 'transit')).toMatchObject({ days: DEFAULT_STALE_DAYS.transit, custom: false });
  });

  it('renders an accessible, escaped section in EN and FR', () => {
    const en = renderThresholdsHtml({ places: 90 }, 'en');
    expect(en).toContain('Staleness settings');
    expect(en).toContain('<td>Custom value</td>');
    expect(en).toContain('<td>Default</td>');
    const fr = renderThresholdsHtml({}, 'fr');
    expect(fr).toContain('Seuils de péremption');
    expect(fr).toContain('Transport en commun');
    for (const html of [en, fr]) {
      expect(structureProblems(html)).toEqual([]);
      expect(scanHtml(html)).toEqual([]);
    }
  });
});
