import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { addDaysIso, buildReviewQueue } from './reviewDue';
import { lintFrench } from './i18n';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';
import {
  buildWorkload,
  clampWeeks,
  DEFAULT_WEEKS,
  MAX_WEEKS,
  renderWorkloadHtml,
  scheduledCount,
  weekRangeText,
  workloadSentences,
} from './workload';

const TODAY = '2026-11-15';

/** One 'places' source (180-day setting) whose review date falls `dueIn` days from today. */
function dueIn(id: string, days: number): DatasetRecord {
  return {
    id: `d-${id}`,
    name: `Dataset ${id}`,
    kind: 'places',
    sources: [{ id, name: `Source ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, days - 180) }],
  };
}

describe('clampWeeks', () => {
  it('keeps whole weeks inside the allowed range', () => {
    expect(clampWeeks(12)).toBe(12);
    expect(clampWeeks(2.9)).toBe(2);
    expect(clampWeeks(0)).toBe(1);
    expect(clampWeeks(-5)).toBe(1);
    expect(clampWeeks(500)).toBe(MAX_WEEKS);
  });
  it('falls back to the default for numbers that are not finite', () => {
    expect(clampWeeks(Number.NaN)).toBe(DEFAULT_WEEKS);
    expect(clampWeeks(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WEEKS);
  });
});

describe('buildWorkload on the shared records', () => {
  const audit = auditRegistry(RECORDS, NOW);
  it('splits past due, later and not scheduled, with every week empty', () => {
    const w = buildWorkload(audit, NOW);
    expect(w.todayIso).toBe(TODAY);
    expect(w.weeks).toHaveLength(12);
    expect(w.pastDue.map((i) => i.sourceId)).toEqual(['b']);
    expect(w.beyond.map((i) => i.sourceId)).toEqual(['a']);
    expect(w.unscheduled.map((i) => i.sourceId)).toEqual(['c']);
    expect(w.busiest).toBeNull();
    expect(scheduledCount(w)).toBe(0);
  });
  it('places the source in the week that holds its review date when the horizon is long enough', () => {
    const w = buildWorkload(audit, NOW, 26);
    const week = w.weeks[23];
    expect(week?.items.map((i) => i.sourceId)).toEqual(['a']);
    expect(week !== undefined && week.startIso <= '2027-04-30' && '2027-04-30' <= week.endIso).toBe(true);
    expect(w.beyond).toEqual([]);
    expect(w.busiest?.index).toBe(23);
  });
  it('clamps an out-of-range horizon instead of failing', () => {
    expect(buildWorkload(audit, NOW, 0).weeks).toHaveLength(1);
    expect(buildWorkload(audit, NOW, 9999).weeks).toHaveLength(MAX_WEEKS);
  });
});

describe('week boundaries', () => {
  const at = (days: number) => buildWorkload(auditRegistry([dueIn('x', days)], NOW), NOW);
  it('counts a source due today in week 0', () => {
    const w = at(0);
    expect(w.weeks[0]?.items.map((i) => i.status)).toEqual(['today']);
  });
  it('keeps day 6 in week 0 and starts week 1 on day 7', () => {
    expect(at(6).weeks[0]?.items).toHaveLength(1);
    expect(at(7).weeks[0]?.items).toHaveLength(0);
    expect(at(7).weeks[1]?.items).toHaveLength(1);
  });
  it('puts the last day of the horizon in the last week and the next day beyond it', () => {
    expect(at(83).weeks[11]?.items).toHaveLength(1);
    expect(at(83).beyond).toHaveLength(0);
    expect(at(84).weeks.flatMap((x) => x.items)).toHaveLength(0);
    expect(at(84).beyond).toHaveLength(1);
  });
  it('treats yesterday as past due, not this week', () => {
    const w = at(-1);
    expect(w.pastDue).toHaveLength(1);
    expect(scheduledCount(w)).toBe(0);
  });
  it('makes weeks that touch end to start with no gap', () => {
    const w = buildWorkload(auditRegistry([], NOW), NOW, 6);
    w.weeks.forEach((wk, i) => {
      expect(wk.startIso).toBe(addDaysIso(TODAY, i * 7));
      expect(addDaysIso(wk.endIso, 1)).toBe(w.weeks[i + 1]?.startIso ?? addDaysIso(TODAY, 42));
    });
  });
  it('uses the UTC day, not the clock time', () => {
    const late = new Date('2026-11-15T23:59:59Z');
    const early = new Date('2026-11-16T00:00:00Z');
    expect(buildWorkload(auditRegistry([], late), late).todayIso).toBe(TODAY);
    expect(buildWorkload(auditRegistry([], early), early).todayIso).toBe('2026-11-16');
  });
});

describe('busiest week', () => {
  it('is the week with the most sources, and the earlier week on a tie', () => {
    const records = [dueIn('a', 1), dueIn('b', 8), dueIn('c', 9), dueIn('d', 15), dueIn('e', 16)];
    const w = buildWorkload(auditRegistry(records, NOW), NOW);
    expect(w.busiest?.index).toBe(1);
    expect(w.busiest?.items).toHaveLength(2);
    const tied = buildWorkload(auditRegistry([dueIn('a', 1), dueIn('b', 8)], NOW), NOW);
    expect(tied.busiest?.index).toBe(0);
  });
});

describe('workloadSentences', () => {
  const records = [dueIn('a', -3), dueIn('b', -9), dueIn('c', 2), dueIn('d', 9), dueIn('e', 10), dueIn('f', 150), { id: 'u', name: 'U', kind: 'places' as const, sources: [{ id: 'u1' }] }];
  const w = buildWorkload(auditRegistry(records, NOW), NOW);
  it('reads in a fixed order in English', () => {
    expect(workloadSentences(w, 'en')).toEqual([
      '2 sources are past their review date.',
      '1 source reaches its review date in the next 7 days.',
      '3 sources reach their review date within 12 weeks.',
      'The busiest week starts November 22, 2026, with 2 sources.',
      '1 source is due after that.',
      '1 source is not scheduled because its retrieved date is UNKNOWN.',
    ]);
  });
  it('reads in French with the singular and plural forms', () => {
    const fr = workloadSentences(w, 'fr');
    expect(fr[0]).toBe('2 sources ont dépassé leur date de révision.');
    expect(fr[1]).toBe('1 source atteint sa date de révision dans les 7 prochains jours.');
    expect(fr[3]).toBe('La semaine la plus chargée commence le 22 novembre 2026, avec 2 sources.');
    expect(fr[4]).toBe('1 source est à réviser plus tard.');
  });
  it('has no French typography problems', () => {
    for (const s of workloadSentences(w, 'fr')) expect(lintFrench(s)).toEqual([]);
  });
  it('says nothing for empty groups', () => {
    expect(workloadSentences(buildWorkload(auditRegistry([], NOW), NOW), 'en')).toEqual([]);
  });
  it('names the week range with long dates in both languages', () => {
    const wk = { startIso: '2026-11-15', endIso: '2026-11-21' };
    expect(weekRangeText(wk, 'en')).toBe('November 15, 2026 to November 21, 2026');
    expect(weekRangeText(wk, 'fr')).toBe('15 novembre 2026 au 21 novembre 2026');
  });
});

describe('renderWorkloadHtml', () => {
  const records = [dueIn('a', 2), dueIn('b', 9)];
  const html = renderWorkloadHtml(buildWorkload(auditRegistry(records, NOW), NOW), 'en');
  it('has a captioned table with scoped headers and one row per week that has work', () => {
    expect(html).toContain('<caption>Sources to review, by week</caption>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(2);
  });
  it('passes the markup audit', () => {
    expect(structureProblems(html)).toEqual([]);
  });
  it('is labelled by its own heading', () => {
    expect(html).toContain('aria-labelledby="ds-workload-title"');
    expect(html).toContain('<h2 id="ds-workload-title">Review workload</h2>');
  });
  it('shows a plain message and no table when there is nothing to plan', () => {
    const empty = renderWorkloadHtml(buildWorkload(auditRegistry([], NOW), NOW), 'fr');
    expect(empty).toContain('Aucune source n’a de date de révision à planifier.');
    expect(empty).not.toContain('<table');
  });
  it('escapes names from the records', () => {
    const evil: DatasetRecord = { id: 'e', name: '<img src=x onerror=1>', kind: 'places', sources: [{ id: 's', name: '"><script>1</script>', retrievedAt: isoDayOffset(NOW, -170) }] };
    const out = renderWorkloadHtml(buildWorkload(auditRegistry([evil], NOW), NOW), 'en');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });
  it('falls back to ids when names are blank', () => {
    const blank: DatasetRecord = { id: 'ds-9', name: '  ', kind: 'places', sources: [{ id: 'src-9', name: '', retrievedAt: isoDayOffset(NOW, -170) }] };
    expect(renderWorkloadHtml(buildWorkload(auditRegistry([blank], NOW), NOW), 'en')).toContain('ds-9 / src-9');
  });
});

describe('workload invariants over random registries', () => {
  it('puts every queued source in exactly one group, in the right week', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW);
      const queue = buildReviewQueue(audit, NOW);
      const weeks = 1 + (seed % 20);
      const w = buildWorkload(audit, NOW, weeks);
      const placed = w.pastDue.length + scheduledCount(w) + w.beyond.length + w.unscheduled.length;
      expect(placed, `seed ${seed}`).toBe(queue.length);
      w.weeks.forEach((wk) => {
        for (const item of wk.items) {
          expect(item.daysUntil).not.toBeNull();
          expect(Math.floor((item.daysUntil ?? -1) / 7), `seed ${seed}`).toBe(wk.index);
        }
      });
      for (const item of w.beyond) expect(item.daysUntil ?? 0, `seed ${seed}`).toBeGreaterThanOrEqual(weeks * 7);
      for (const item of w.pastDue) expect(item.daysUntil ?? 0, `seed ${seed}`).toBeLessThan(0);
      for (const item of w.unscheduled) expect(item.dueIso, `seed ${seed}`).toBeNull();
    }
  });
  it('renders valid, escaped markup for every random registry in both languages', () => {
    for (let seed = 200; seed < 260; seed++) {
      const w = buildWorkload(auditRegistry(randomRegistry(seed, NOW), NOW), NOW, 8);
      for (const locale of ['en', 'fr'] as const) {
        const html = renderWorkloadHtml(w, locale);
        expect(structureProblems(html), `seed ${seed} ${locale}`).toEqual([]);
        expect(html).not.toMatch(/<b>|<script/);
      }
    }
  });
});
