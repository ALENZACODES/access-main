import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildForecast, daysUntilPast, FORECAST_HORIZONS, forecastNotes, forecastRows, forecastWhen, forecastWhich, MAX_FORECAST_EXAMPLES, renderForecastHtml } from './forecast';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

const src = (id: string, days: number | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0, ...over });
// Places are past review when older than 180 days.
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('past', 200), src('edge', 180), src('soon', 160), src('mid', 100), src('late', 10), src('fresh', 0), src('none', null), src('future', -3)] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const byId = (id: string) => audit.sources.find((s) => s.sourceId === id)!;
const d = buildForecast(audit, NOW);
const step = (days: number) => d.steps.find((s) => s.days === days)!;

describe('daysUntilPast', () => {
  it('is the first day a source is older than its review period', () => {
    expect(daysUntilPast(byId('edge'))).toBe(1);
    expect(daysUntilPast(byId('soon'))).toBe(21);
    expect(daysUntilPast(byId('fresh'))).toBe(181);
  });
  it('is zero or less for a source already past, and null with no usable date', () => {
    expect(daysUntilPast(byId('past'))).toBe(-19);
    expect(daysUntilPast(byId('none'))).toBeNull();
    expect(daysUntilPast(byId('future'))).toBeNull();
  });
  it('agrees with the status of today on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const s of auditRegistry(randomRegistry(seed, NOW), NOW, {}).sources) {
        const at = daysUntilPast(s);
        if (s.state === 'unknown') expect(at).toBeNull();
        else expect((at ?? 1) <= 0, `seed ${seed} ${s.sourceId}`).toBe(s.state === 'stale');
      }
    }
  });
});

describe('buildForecast', () => {
  it('has a step for today and each day ahead, with its date', () => {
    expect(d.steps.map((s) => s.days)).toEqual([...FORECAST_HORIZONS]);
    expect(step(0).iso).toBe(isoDayOffset(NOW, 0));
    expect(step(30).iso).toBe(isoDayOffset(NOW, 30));
    expect(step(365).iso).toBe(isoDayOffset(NOW, 365));
  });
  it('counts today as the panel does', () => {
    expect(step(0).past).toBe(audit.sources.filter((s) => s.state === 'stale').length);
    expect(step(0).past).toBe(1);
    expect(step(0).crossing).toEqual([]);
  });
  it('counts more on later days, and names the sources that cross over at each step, soonest first', () => {
    expect(d.steps.map((s) => s.past)).toEqual([1, 3, 3, 4, 5, 6]);
    expect(step(30).crossing.map((s) => s.sourceId)).toEqual(['edge', 'soon']);
    expect(step(60).crossing).toEqual([]);
    expect(step(90).crossing.map((s) => s.sourceId)).toEqual(['mid']);
    expect(step(180).crossing.map((s) => s.sourceId)).toEqual(['late']);
    expect(step(365).crossing.map((s) => s.sourceId)).toEqual(['fresh']);
  });
  it('keeps sources with no usable date out of every row', () => {
    expect(d).toMatchObject({ dated: 6, undated: 2, stillWithin: 0 });
    for (const s of d.steps) expect(s.crossing.map((x) => x.sourceId)).not.toContain('none');
  });
  it('accepts other days ahead: sorted, whole, not negative, once each', () => {
    const custom = buildForecast(audit, NOW, [90, 0, 90, -5, 7.5, 1]);
    expect(custom.steps.map((s) => s.days)).toEqual([0, 1, 90]);
    expect(custom.steps.map((s) => s.past)).toEqual([1, 2, 4]);
    expect(custom.stillWithin).toBe(2);
    expect(buildForecast(audit, NOW, []).steps).toEqual([]);
  });
  it('is empty of dates for an empty registry', () => {
    expect(buildForecast(auditRegistry([], NOW, {}), NOW)).toMatchObject({ dated: 0, undated: 0, stillWithin: 0 });
  });
  it('holds its promises on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const f = buildForecast(a, NOW);
      expect(f.dated + f.undated).toBe(a.sources.length);
      const counts = f.steps.map((s) => s.past);
      expect(counts, `seed ${seed}`).toEqual([...counts].sort((x, y) => x - y));
      f.steps.forEach((s, i) => {
        if (i > 0) expect(s.crossing.length).toBe(s.past - f.steps[i - 1]!.past);
      });
      expect(f.stillWithin).toBe(f.dated - (f.steps.at(-1)?.past ?? 0));
      const all = f.steps.flatMap((s) => s.crossing);
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe('the words', () => {
  it('names each day with its date', () => {
    expect(forecastWhen(step(0), 'en')).toBe('Today (November 15, 2026)');
    expect(forecastWhen(step(30), 'en')).toBe('In 30 days (December 15, 2026)');
    expect(forecastWhen(step(30), 'fr')).toBe('Dans 30 jours (15 décembre 2026)');
  });
  it('names a few of the sources that cross over, then how many more', () => {
    expect(forecastWhich(step(0), 'en')).toBe('Does not apply');
    expect(forecastWhich(step(60), 'en')).toBe('None');
    expect(forecastWhich(step(30), 'en')).toBe('Places / Name edge; Places / Name soon');
    const many = buildForecast(auditRegistry([{ id: 'm', name: 'Many', kind: 'places', sources: Array.from({ length: 6 }, (_, i) => src(`s${i}`, 170 + i)) }], NOW, {}), NOW);
    const text = forecastWhich(many.steps[1]!, 'en');
    expect(text.match(/Many \/ Name/g)).toHaveLength(MAX_FORECAST_EXAMPLES);
    expect(text).toMatch(/, and 3 more$/);
  });
  it('notes what is left over and what is in no row', () => {
    expect(forecastNotes(d, 'en')).toEqual(['Every source with a usable date would be past its review date by the last day shown.', '2 sources have no usable retrieved date and are in no row.']);
    expect(forecastNotes(buildForecast(audit, NOW, [0, 1]), 'en')[0]).toBe('4 sources would still be within their review period on the last day shown.');
    expect(forecastNotes(buildForecast(audit, NOW, [0, 180]), 'en')[0]).toBe('1 source would still be within its review period on the last day shown.');
    for (const n of [...forecastNotes(d, 'fr'), ...forecastNotes(buildForecast(audit, NOW, [0, 1]), 'fr')]) expect(lintFrench(n), n).toEqual([]);
  });
  it('gives the table as rows of text', () => {
    const rows = forecastRows(d, 'en');
    expect(rows[0]).toEqual(['Day', 'Past review date', 'More than the row above', 'Which ones']);
    expect(rows[1]).toEqual(['Today (November 15, 2026)', '1', 'Does not apply', 'Does not apply']);
    expect(rows[2]?.slice(1, 3)).toEqual(['3', '2']);
    expect(rows).toHaveLength(1 + FORECAST_HORIZONS.length);
  });
  it('does not claim to know what a publisher will do', () => {
    for (const locale of ['en', 'fr'] as const) {
      const text = visibleText(renderForecastHtml(d, locale));
      expect(text).not.toMatch(/\b(will be out of date|will expire|expirera|sera périmée)\b/i);
    }
    expect(visibleText(renderForecastHtml(d, 'en'))).toContain('It does not say what any publisher will do.');
  });
});

describe('renderForecastHtml', () => {
  it('says so when there is no source, or no source with a usable date', () => {
    const none = renderForecastHtml(buildForecast(auditRegistry([], NOW, {}), NOW), 'en');
    expect(none).not.toContain('<table');
    expect(visibleText(none)).toContain('There are no sources, so there is no later day to work out.');
    const undated = renderForecastHtml(buildForecast(auditRegistry([{ id: 'u', name: 'U', kind: 'places', sources: [src('a', null)] }], NOW, {}), NOW), 'en');
    expect(undated).not.toContain('<table');
    expect(visibleText(undated)).toContain('No source has a usable retrieved date');
    expect(visibleText(undated)).toContain('1 source has no usable retrieved date and is in no row.');
  });
  it('has a row per day with a row header', () => {
    const html = renderForecastHtml(d, 'en');
    expect(html).toContain('data-forecast="6"');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(FORECAST_HORIZONS.length);
    expect(html.match(/<caption>/g)).toHaveLength(1);
  });
  it('escapes names', () => {
    const html = renderForecastHtml(buildForecast(auditRegistry([{ id: 'x', name: '<b>X</b>', kind: 'places', sources: [src('a', 170, { name: '<script>1</script>' })] }], NOW, {}), NOW), 'en');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>X</b>');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderForecastHtml(d, locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-forecast-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
  it('follows a review period chosen on the panel', () => {
    const short = buildForecast(auditRegistry(RECORDS, NOW, { places: 30 }), NOW);
    expect(short.steps[0]?.past).toBe(4);
    expect(renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, thresholds: { places: 30 } })).toContain(renderForecastHtml(short, 'en'));
  });
});
