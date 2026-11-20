import { describe, expect, it } from 'vitest';
import { ageInDays, checkProvenance, freshness, parseIsoDate } from './dataStatus';
import { parseRetrieved, readRetrieved } from './dateRules';
import { cleanValue, isUnknownToken, UNKNOWN_TOKEN_LIST } from './unknownTokens';
import { buildSourceList } from './sourceList';
import { formatDisplayDate } from './locale';

const NOW = new Date('2026-11-16T12:00:00Z');
const good = { source: 'City open data', licence: 'Open Government Licence – Ontario' };

describe('impossible and ambiguous dates are not real dates', () => {
  it.each(['2026-02-31', '2026-04-31', '2025-02-29', '2026-13-01', '2026-00-10', '1899-01-01', '2026-11-16T25:00:00Z'])(
    'rejects %s',
    (v) => {
      expect(parseIsoDate(v)).toBeNull();
      expect(freshness(v, NOW)).toBe('unknown');
      expect(checkProvenance({ ...good, retrievedAt: v }, NOW)).toContain('invalid-date');
    },
  );
  it('accepts a leap day only in a leap year', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
    expect(parseIsoDate('2027-02-29')).toBeNull();
  });
  it('rejects a date-time with no offset (its meaning would depend on the machine)', () => {
    expect(parseIsoDate('2026-05-01T10:00:00')).toBeNull();
    expect(parseIsoDate('2026-05-01T10:00:00Z')).not.toBeNull();
    expect(parseIsoDate('2026-05-01T10:00:00-05:00')).not.toBeNull();
  });
  it('keeps the calendar day as written, without shifting it', () => {
    expect(parseRetrieved('2026-11-01T23:30:00-05:00')?.day).toBe('2026-11-01');
  });
});

describe('placeholder text is Unknown, never a value', () => {
  it.each(['N/A', 'n/a', 'TBD', 'unknown', 'Unknown', 'inconnu', 'Non disponible', 'Sans objet', '-', '—', '?'])('treats %j as unknown', (v) => {
    expect(isUnknownToken(v)).toBe(true);
    expect(cleanValue(v)).toBeNull();
    const issues = checkProvenance({ source: v, licence: v, retrievedAt: v }, NOW);
    expect(issues).toEqual(expect.arrayContaining(['missing-source', 'missing-licence', 'missing-date']));
    expect(freshness(v, NOW)).toBe('unknown');
  });
  it('does not treat real text that merely contains a token as unknown', () => {
    expect(cleanValue('Unknown Heights Transit')).toBe('Unknown Heights Transit');
    expect(cleanValue('  City of Toronto ')).toBe('City of Toronto');
  });
  it('shows a placeholder source/licence as Unknown in the source list', () => {
    const [row] = buildSourceList([{ id: 'a', name: 'N/A', licence: 'TBD', retrievedAt: 'n/a', url: null }], 'en', NOW);
    expect(row?.name).not.toBe('N/A');
    expect(row?.licence).toBe('UNKNOWN');
    expect(row?.retrieved).toBe('UNKNOWN');
    expect(row?.licenceOpen).toBeNull();
  });
  it('lists no duplicates', () => {
    expect(new Set(UNKNOWN_TOKEN_LIST).size).toBe(UNKNOWN_TOKEN_LIST.length);
  });
});

describe('a future date is Unknown AND explained', () => {
  it('reports future-date whenever the status is Unknown because of it', () => {
    for (const v of ['2026-11-17', '2026-11-16T13:00:00Z', '2027-01-01']) {
      expect(freshness(v, NOW)).toBe('unknown');
      expect(checkProvenance({ ...good, retrievedAt: v }, NOW)).toEqual(['future-date']);
      expect(readRetrieved(v, NOW).kind).toBe('future');
    }
  });
  it('today is fresh with age 0, even late in a zone ahead of UTC', () => {
    expect(ageInDays('2026-11-16', NOW)).toBe(0);
    expect(ageInDays('2026-11-16T02:00:00+14:00', NOW)).toBe(0);
  });
});

describe('the stale limit is explicit and the same everywhere', () => {
  it('is fresh at exactly the limit and stale one day later', () => {
    expect(freshness('2026-05-21', NOW, 180)).toBe('fresh'); // 179 days
    expect(freshness('2026-05-20', NOW, 180)).toBe('fresh'); // 180 days: at the limit
    expect(freshness('2026-05-19', NOW, 180)).toBe('stale'); // 181 days
  });
  it('counts calendar days, not elapsed hours', () => {
    expect(ageInDays('2026-05-20', NOW)).toBe(180);
    // 2026-05-19T23:00Z is only 180.5 days before NOW, but its calendar date is 181 days back.
    expect(ageInDays('2026-05-19T23:00:00Z', NOW)).toBe(181);
  });
  it('formats an invalid date as Unknown in both languages', () => {
    expect(formatDisplayDate('2026-02-31', 'en')).toBe('UNKNOWN');
    expect(formatDisplayDate('2026-02-31', 'fr')).toBe('UNKNOWN');
  });
});
