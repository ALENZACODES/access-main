import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { daysUntilReview } from './filters';
import { t } from './i18n';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildReviewCalendar,
  CALENDAR_MONTHS,
  calendarNotes,
  MAX_MONTH_EXAMPLES,
  monthExamples,
  monthIds,
  monthLabel,
  renderReviewCalendarHtml,
} from './reviewCalendar';
import { reviewDateIso } from './rowDetail';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const one = (sources: ReturnType<typeof src>[], kind: DatasetRecord['kind'] = 'places'): DatasetRecord[] => [{ id: 'p', name: 'Places', kind, sources }];
const build = (records: DatasetRecord[], months?: number) => buildReviewCalendar(auditRegistry(records, NOW, {}), NOW, months);

describe('monthIds', () => {
  it('starts with the current month and rolls over the year', () => {
    expect(monthIds(NOW)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10']);
    expect(monthIds(NOW)).toHaveLength(CALENDAR_MONTHS);
    expect(monthIds(new Date('2026-12-31T23:59:59Z'), 2)).toEqual(['2026-12', '2027-01']);
    expect(monthIds(new Date('2027-01-31T00:00:00Z'), 3)).toEqual(['2027-01', '2027-02', '2027-03']);
  });
  it('gives nothing for a count of zero or less, and whole months for a fraction', () => {
    expect(monthIds(NOW, 0)).toEqual([]);
    expect(monthIds(NOW, -3)).toEqual([]);
    expect(monthIds(NOW, 2.9)).toEqual(['2026-11', '2026-12']);
  });
});

describe('monthLabel', () => {
  it('names the month in each language', () => {
    expect(monthLabel('2026-11', 'en')).toBe('November 2026');
    expect(monthLabel('2026-11', 'fr')).toBe('novembre 2026');
    expect(monthLabel('2027-01', 'fr')).toBe('janvier 2027');
  });
  it('gives back what it cannot read', () => {
    for (const bad of ['', '2026', '2026-13', '2026-00', '2026-1', 'x'.repeat(7)]) expect(monthLabel(bad, 'en'), bad).toBe(bad);
  });
});

describe('buildReviewCalendar', () => {
  // Places are reviewed 180 days after retrieval.
  const records = one([
    src('soon'), // review in 177 days
    src('thisMonth', { retrievedAt: isoDayOffset(NOW, -175) }), // review in 5 days
    src('today', { retrievedAt: isoDayOffset(NOW, -180) }), // review today
    src('past', { retrievedAt: isoDayOffset(NOW, -190) }), // 10 days past, earlier this month
    src('longPast', { retrievedAt: isoDayOffset(NOW, -900) }),
    src('none', { retrievedAt: null }),
    src('bad', { retrievedAt: 'N/A' }),
    src('future', { retrievedAt: isoDayOffset(NOW, 40) }),
  ]);
  const c = build(records);
  it('counts every source exactly once', () => {
    const inMonths = c.months.reduce((n, m) => n + m.sources.length, 0);
    expect(inMonths + c.past + c.later + c.unscheduled).toBe(c.total);
    expect(c.total).toBe(8);
  });
  it('puts a source under the month of its review date', () => {
    const ids = (month: string) => c.months.find((m) => m.id === month)?.sources.map((s) => s.sourceId);
    expect(ids('2026-11')).toEqual(['today', 'thisMonth']);
    expect(ids('2027-05')).toEqual(['soon']);
    for (const m of c.months) for (const s of m.sources) expect(reviewDateIso(s)?.slice(0, 7)).toBe(m.id);
  });
  it('counts a date that has passed as past, even earlier in the current month', () => {
    expect(c.past).toBe(2);
    expect(c.months[0]?.sources.map((s) => s.sourceId)).not.toContain('past');
  });
  it('does not schedule a source whose retrieved date is unknown or not usable', () => {
    expect(c.unscheduled).toBe(3);
  });
  it('counts review dates after the months shown as later', () => {
    const short = build(records, 2);
    expect(short.months.map((m) => m.id)).toEqual(['2026-11', '2026-12']);
    expect(short.later).toBe(1);
    expect(short.months[0]?.sources).toHaveLength(2);
    expect(build(records, 0)).toMatchObject({ months: [], later: 3, past: 2, unscheduled: 3, total: 8 });
  });
  it('orders a month by review date, then name', () => {
    const same = build(one([src('b', { retrievedAt: isoDayOffset(NOW, -178) }), src('a', { retrievedAt: isoDayOffset(NOW, -178) }), src('c', { retrievedAt: isoDayOffset(NOW, -179) })]));
    expect(same.months[0]?.sources.map((s) => s.sourceId)).toEqual(['c', 'a', 'b']);
  });
  it('agrees with the due filter on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const cal = buildReviewCalendar(audit, NOW);
      const scheduled = cal.months.reduce((n, m) => n + m.sources.length, 0);
      expect(scheduled + cal.past + cal.later + cal.unscheduled, `seed ${seed}`).toBe(audit.sources.length);
      expect(cal.past, `seed ${seed}`).toBe(audit.sources.filter((s) => (daysUntilReview(s) ?? 0) < 0).length);
      expect(cal.unscheduled, `seed ${seed}`).toBe(audit.sources.filter((s) => daysUntilReview(s) === null).length);
      for (const m of cal.months) for (const s of m.sources) expect(daysUntilReview(s), `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the words', () => {
  it('shows a few names, then how many more', () => {
    const many = build(one(['a', 'b', 'c', 'd', 'e'].map((id) => src(id, { retrievedAt: isoDayOffset(NOW, -178) }))));
    const month = many.months[0]!;
    expect(month.sources).toHaveLength(5);
    const text = monthExamples(month, 'en');
    expect(text.match(/Places \/ Name/g)).toHaveLength(MAX_MONTH_EXAMPLES);
    expect(text).toMatch(/, and 2 more$/);
    expect(monthExamples({ ...month, sources: month.sources.slice(0, 2) }, 'en')).toBe('Places / Name a; Places / Name b');
    expect(monthExamples({ id: '2026-11', sources: [] }, 'en')).toBe('None');
    expect(monthExamples({ id: '2026-11', sources: [] }, 'fr')).toBe('Aucune');
  });
  it('uses the shared unknown word for a source with no name', () => {
    const c = build(one([src('x', { name: null, source: null, retrievedAt: isoDayOffset(NOW, -178) })]));
    expect(monthExamples(c.months[0]!, 'en')).toBe(`Places / ${t('en', 'unknownName')}`);
    expect(monthExamples(c.months[0]!, 'fr')).toBe(`Places / ${t('fr', 'unknownName')}`);
  });
  it('has singular and plural notes, and none when there is nothing to say', () => {
    const base = { months: [], total: 9 };
    expect(calendarNotes({ ...base, past: 0, later: 0, unscheduled: 0 }, 'en')).toEqual([]);
    expect(calendarNotes({ ...base, past: 1, later: 1, unscheduled: 1 }, 'en')).toEqual([
      '1 source is already past its review date.',
      '1 source has a review date after the months shown.',
      '1 source is not scheduled, because its retrieved date is UNKNOWN.',
    ]);
    expect(calendarNotes({ ...base, past: 2, later: 0, unscheduled: 3 }, 'en')).toEqual(['2 sources are already past their review date.', '3 sources are not scheduled, because their retrieved date is UNKNOWN.']);
    for (const note of calendarNotes({ ...base, past: 2, later: 1, unscheduled: 3 }, 'fr')) expect(lintFrench(note)).toEqual([]);
  });
});

describe('renderReviewCalendarHtml', () => {
  it('says so when there are no sources', () => {
    const html = renderReviewCalendarHtml(build([]), 'en');
    expect(html).not.toContain('<table');
    expect(visibleText(html)).toContain('There are no sources to schedule.');
  });
  it('shows no table when no review date falls in the months shown, but keeps the notes', () => {
    const html = renderReviewCalendarHtml(build(one([src('old', { retrievedAt: isoDayOffset(NOW, -900) }), src('none', { retrievedAt: null })])), 'en');
    expect(html).not.toContain('<table');
    expect(visibleText(html)).toContain('No review date falls in the months shown.');
    expect(visibleText(html)).toContain('1 source is already past its review date.');
    expect(visibleText(html)).toContain('1 source is not scheduled');
  });
  it('has one row per month with a row header, and counts that add up', () => {
    const c = build(RECORDS);
    const html = renderReviewCalendarHtml(c, 'en');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(CALENDAR_MONTHS);
    expect(html.match(/<caption>/g)).toHaveLength(1);
    const counts = [...html.matchAll(/<\/th><td>(\d+)<\/td>/g)].map((m) => Number(m[1]));
    expect(counts.reduce((a, b) => a + b, 0) + c.past + c.later + c.unscheduled).toBe(c.total);
  });
  it('escapes names', () => {
    const html = renderReviewCalendarHtml(build(one([src('x', { name: '<img src=x onerror=1>', retrievedAt: isoDayOffset(NOW, -178) })])), 'en');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const html = renderReviewCalendarHtml(buildReviewCalendar(auditRegistry(randomRegistry(seed, NOW), NOW, {}), NOW), locale);
        expect(structureProblems(html), `seed ${seed}`).toEqual([]);
        expect(scanHtml(html), `seed ${seed}`).toEqual([]);
      }
      const html = renderReviewCalendarHtml(build(RECORDS), locale);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-calendar-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
