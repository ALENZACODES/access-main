import { describe, expect, it } from 'vitest';
import { addDaysIso, auditHtml, auditRegistry, buildReviewQueue, describeProblems, dueText, lintFrench, renderReviewHtml, scanHtml, toIsoDay, visibleText, type DatasetRecord } from './index';
import { NOW, RECORDS } from './testkit';

describe('addDaysIso', () => {
  it('adds whole days across month, year and leap days', () => {
    expect(addDaysIso('2026-11-01', 180)).toBe('2027-04-30');
    expect(addDaysIso('2024-01-01', 180)).toBe('2024-06-29');
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysIso('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-11-15T23:00:00Z', 0)).toBe('2026-11-15');
  });
  it('is null for unreadable input or fractional days', () => {
    expect(addDaysIso('soon', 5)).toBeNull();
    expect(addDaysIso('2026-13-45', 5)).toBeNull();
    expect(addDaysIso('2026-11-01', 1.5)).toBeNull();
    expect(toIsoDay(Date.UTC(2026, 0, 2))).toBe('2026-01-02');
  });
});

describe('buildReviewQueue', () => {
  const queue = buildReviewQueue(auditRegistry(RECORDS, NOW), NOW);
  it('puts past-due first, then upcoming, then Unknown last', () => {
    expect(queue.map((i) => [i.sourceId, i.status])).toEqual([['b', 'overdue'], ['a', 'upcoming'], ['c', 'unknown']]);
  });
  it('counts days from the UTC day, using the dataset’s own setting', () => {
    const [b, a, c] = queue;
    expect(b).toMatchObject({ dueIso: '2024-06-29', daysUntil: -869, staleAfterDays: 180 });
    expect(a).toMatchObject({ dueIso: '2027-04-30', daysUntil: 166 });
    expect(c).toMatchObject({ dueIso: null, daysUntil: null, retrievedIso: null });
  });
  it('follows custom thresholds', () => {
    const q = buildReviewQueue(auditRegistry(RECORDS, NOW, { places: 30 }), NOW);
    expect(q.find((i) => i.sourceId === 'a')).toMatchObject({ dueIso: '2026-12-01', daysUntil: 16, staleAfterDays: 30 });
  });
  it('due today and the time of day do not matter', () => {
    const recs: DatasetRecord[] = [{ id: 'x', name: 'X', kind: 'transit', sources: [{ id: 's', name: 'S', source: 'p', licence: 'CC0-1.0', retrievedAt: '2026-09-16' }] }];
    const q = buildReviewQueue(auditRegistry(recs, NOW), new Date('2026-11-15T23:59:59Z'));
    expect(q[0]).toMatchObject({ dueIso: '2026-11-15', daysUntil: 0, status: 'today' });
  });
  it('a future retrieved date is UNKNOWN, not scheduled', () => {
    const recs: DatasetRecord[] = [{ id: 'x', name: 'X', kind: 'places', sources: [{ id: 's', retrievedAt: '2030-01-01' }] }];
    expect(buildReviewQueue(auditRegistry(recs, NOW), NOW)[0]).toMatchObject({ status: 'unknown', dueIso: null });
  });
  it('is empty for an empty registry', () => {
    expect(buildReviewQueue(auditRegistry([], NOW), NOW)).toEqual([]);
  });
});

describe('dueText', () => {
  it('EN and FR, with the right plural', () => {
    expect(dueText({ status: 'overdue', daysUntil: -1 }, 'en')).toBe('Past due by 1 day');
    expect(dueText({ status: 'overdue', daysUntil: -9 }, 'en')).toBe('Past due by 9 days');
    expect(dueText({ status: 'today', daysUntil: 0 }, 'fr')).toBe('À réviser aujourd’hui');
    expect(dueText({ status: 'upcoming', daysUntil: 1 }, 'fr')).toBe('À réviser dans 1 jour');
    expect(dueText({ status: 'upcoming', daysUntil: 166 }, 'fr')).toBe('À réviser dans 166 jours');
    expect(dueText({ status: 'unknown', daysUntil: null }, 'en')).toBe('Not scheduled: retrieved date is UNKNOWN');
  });
});

describe('renderReviewHtml', () => {
  const queue = buildReviewQueue(auditRegistry(RECORDS, NOW), NOW);
  it('is a captioned table with real dates and an honest intro', () => {
    const html = renderReviewHtml(queue, 'en');
    expect(html).toContain('<caption>Review schedule</caption>');
    expect(html).toContain('<time datetime="2027-04-30">April 30, 2027</time>');
    expect(html).toContain('Past due by 869 days');
    expect(html).toContain('It is a reminder to look at the source again, not a statement about the data.');
    expect(html).toContain('<td>UNKNOWN</td>');
  });
  it('limits rows and says how many are left', () => {
    const html = renderReviewHtml(queue, 'en', 1);
    expect(html.match(/<tr>/g)?.length).toBe(2); // header + 1 row
    expect(html).toContain('2 more not shown.');
  });
  it('says so when there is nothing to schedule', () => {
    expect(renderReviewHtml([], 'fr')).toContain('Aucune source à planifier.');
  });
  it('is accessible, clean wording, and French passes the typography lint', () => {
    for (const l of ['en', 'fr'] as const) {
      const html = renderReviewHtml(queue, l);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(scanHtml(html)).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
  it('escapes names', () => {
    expect(renderReviewHtml(queue, 'en')).toContain('Places &lt;A&gt; / Beta');
  });
});
