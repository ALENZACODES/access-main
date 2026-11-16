import { describe, expect, it } from 'vitest';
import { ICS_PRODID, auditRegistry, buildIcs, buildReviewQueue, eventUid, foldLine, icsEscape, icsEventCount, lintFrench, scanCopy, type DatasetRecord } from './index';
import { NOW, RECORDS } from './testkit';

const queue = buildReviewQueue(auditRegistry(RECORDS, NOW), NOW);

describe('icsEscape', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(icsEscape('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });
  it('folds at 75 octets with a leading space on continuation lines', () => {
    const folded = foldLine('X:' + 'a'.repeat(200));
    const lines = folded.split('\r\n');
    expect(lines[0]).toHaveLength(75);
    for (const l of lines.slice(1)) {
      expect(l.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    }
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe('X:' + 'a'.repeat(200));
  });
  it('never splits a multi-byte character', () => {
    const text = 'X:' + 'é'.repeat(100) + '😀'.repeat(20);
    const folded = foldLine(text);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(text);
  });
});

describe('eventUid', () => {
  it('is ASCII, stable and different for different sources', () => {
    const a = eventUid({ datasetId: 'p', sourceId: 'a' });
    expect(a).toMatch(/^[A-Za-z0-9-]+-[0-9a-f]{8}@data-status$/);
    expect(eventUid({ datasetId: 'p', sourceId: 'a' })).toBe(a);
    expect(eventUid({ datasetId: 'p', sourceId: 'b' })).not.toBe(a);
    expect(eventUid({ datasetId: 'é/ü', sourceId: '☃' })).toMatch(/^[A-Za-z0-9@.-]+$/);
  });
  it('ids that differ only by punctuation do not collide', () => {
    expect(eventUid({ datasetId: 'a-b', sourceId: 'c' })).not.toBe(eventUid({ datasetId: 'a_b', sourceId: 'c' }));
  });
});

describe('buildIcs', () => {
  const ics = buildIcs(queue, NOW, 'en');
  const lines = ics.split('\r\n');

  it('is a CRLF calendar with the required properties', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${ICS_PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR');
  });

  it('has one all-day event per source with a date, and none for Unknown', () => {
    expect(icsEventCount(queue)).toBe(2);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART;VALUE=DATE:20240629');
    expect(ics).toContain('DTEND;VALUE=DATE:20240630');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270430');
    expect(ics).toContain('DTEND;VALUE=DATE:20270501');
    expect(ics).not.toContain('Routes');
  });

  it('stamps with the given time in UTC and keeps text escaped', () => {
    expect(ics).toContain('DTSTAMP:20261115T120000Z');
    expect(ics).toContain('SUMMARY:Review data source: Places <A> / Beta');
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Retrieved January 1\\, 2024. Marked possibly out of date after 180 days.');
  });

  it('no content line is longer than 75 octets', () => {
    const long: DatasetRecord[] = [{ id: 'x', name: 'N'.repeat(150), kind: 'places', sources: [{ id: 's', name: 'S'.repeat(90), source: 'p', licence: 'CC0-1.0', retrievedAt: '2026-01-01' }] }];
    const out = buildIcs(buildReviewQueue(auditRegistry(long, NOW), NOW), NOW, 'en');
    for (const l of out.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('French text is localized and passes the typography lint', () => {
    const fr = buildIcs(queue, NOW, 'fr');
    expect(fr).toContain('X-WR-CALNAME:Dates de révision des sources de données');
    expect(fr).toContain('Récupérée le 1 janvier 2024.');
    const unfolded = fr.replace(/\r\n /g, '');
    for (const l of unfolded.split('\r\n')) {
      const m = /^(SUMMARY|DESCRIPTION|X-WR-CALNAME):(.*)$/.exec(l);
      if (m) expect(lintFrench((m[2] ?? '').replace(/\\([,;n\\])/g, '$1'))).toEqual([]);
    }
  });

  it('wording stays within the copy rules', () => {
    for (const l of ['en', 'fr'] as const) expect(scanCopy(buildIcs(queue, NOW, l))).toEqual([]);
  });

  it('with nothing to schedule it is a valid empty calendar', () => {
    const empty = buildIcs([], NOW, 'en');
    expect(empty).not.toContain('VEVENT');
    expect(empty.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
