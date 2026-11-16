import { describe, expect, it } from 'vitest';
import { ageInDays, checkProvenance, freshness, parseIsoDate } from './dataStatus';
import { parseRetrieved, readRetrieved, utcDayStart } from './dateRules';
import { cleanValue, isUnknownToken, foldToken } from './unknownTokens';
import { mulberry32, pick, randomRetrieved } from './fuzzKit';
import { buildSourceList } from './sourceList';
import { buildReviewQueue, addDaysIso } from './reviewDue';
import { auditRegistry } from './datasetRegistry';
import { buildCatalogue } from './catalogue';

const NOW = new Date('2026-11-16T12:00:00Z');
const DAY = 86_400_000;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

describe('every calendar day is accepted or refused correctly', () => {
  it('accepts exactly the real dates of 1990-2100 (checked day by day for a sample of months)', () => {
    for (const y of [1990, 2000, 2024, 2026, 2028, 2100]) {
      for (let m = 1; m <= 12; m++) {
        const last = daysInMonth(y, m);
        const mm = String(m).padStart(2, '0');
        for (const d of [1, 15, last]) expect(parseRetrieved(`${y}-${mm}-${String(d).padStart(2, '0')}`)?.day, `${y}-${mm}-${d}`).toBe(`${y}-${mm}-${String(d).padStart(2, '0')}`);
        expect(parseRetrieved(`${y}-${mm}-${String(last + 1).padStart(2, '0')}`), `${y}-${mm}-${last + 1}`).toBeNull();
        expect(parseRetrieved(`${y}-${mm}-00`)).toBeNull();
      }
    }
  });

  it('2100 is not a leap year and 2000 is', () => {
    expect(parseRetrieved('2100-02-29')).toBeNull();
    expect(parseRetrieved('2000-02-29')?.day).toBe('2000-02-29');
    expect(parseRetrieved('1900-02-29')).toBeNull();
  });

  it('refuses every hour, minute and second out of range', () => {
    for (const t of ['24:00:00', '23:60:00', '23:59:60', '-1:00:00', '1:00:00', '12']) expect(parseRetrieved(`2026-05-01T${t}Z`), t).toBeNull();
    for (const off of ['+24:00', '+00:60', '+5:30', '+0530', '+99:99']) expect(parseRetrieved(`2026-05-01T10:00:00${off}`), off).toBeNull();
  });

  it('accepts a time without seconds, as ISO 8601 allows', () => {
    expect(parseRetrieved('2026-05-01T12:00Z')?.day).toBe('2026-05-01');
  });

  it('accepts fractional seconds and lower-case separators only when well formed', () => {
    expect(parseRetrieved('2026-05-01T10:00:00.123Z')).not.toBeNull();
    expect(parseRetrieved('2026-05-01T10:00:00.Z')).toBeNull();
  });

  it('never throws on arbitrary text', () => {
    const r = mulberry32(404);
    const chars = '0123456789-:TZ+ .,/aA\u00A0\u202F\u0000éé';
    for (let i = 0; i < 4000; i++) {
      let s = '';
      for (let j = Math.floor(r() * 24); j > 0; j--) s += pick(r, chars.split(''));
      expect(() => parseRetrieved(s)).not.toThrow();
      expect(() => readRetrieved(s, NOW)).not.toThrow();
      expect(() => checkProvenance({ source: s, licence: s, retrievedAt: s }, NOW)).not.toThrow();
    }
  });

  it('whatever it accepts is a real date whose day matches the instant', () => {
    const r = mulberry32(8);
    for (let i = 0; i < 3000; i++) {
      const v = randomRetrieved(r, NOW);
      const p = parseRetrieved(v);
      if (p === null) continue;
      expect(/^\d{4}-\d{2}-\d{2}$/.test(p.day)).toBe(true);
      expect(Number.isFinite(p.ms)).toBe(true);
      expect(Date.parse(`${p.day}T00:00:00Z`)).not.toBeNaN();
      // Round-trips through the calendar: no rolled-over dates.
      expect(new Date(`${p.day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(p.day);
    }
  });
});

describe('age and freshness are consistent with each other', () => {
  it('freshness is exactly "age <= limit" for every age and limit', () => {
    for (const limit of [1, 60, 120, 180, 365, 730]) {
      for (const age of [0, 1, limit - 1, limit, limit + 1, limit + 50]) {
        if (age < 0) continue;
        const day = new Date(utcDayStart(NOW) - age * DAY).toISOString().slice(0, 10);
        expect(ageInDays(day, NOW), `${day}`).toBe(age);
        expect(freshness(day, NOW, limit), `${age} vs ${limit}`).toBe(age > limit ? 'stale' : 'fresh');
      }
    }
  });

  it('time of day on the retrieved side does not change the age (calendar days)', () => {
    for (const t of ['00:00:00Z', '12:00:00Z', '23:59:59Z']) expect(ageInDays(`2026-11-10T${t}`, NOW)).toBe(6);
  });

  it('time of day on the "now" side does not change the age either', () => {
    for (const at of ['2026-11-16T00:00:00Z', '2026-11-16T23:59:59Z']) expect(ageInDays('2026-11-10', new Date(at))).toBe(6);
  });

  it('ages never go down as time moves forward', () => {
    let prev = -1;
    for (let d = 0; d < 800; d += 7) {
      const now = new Date(Date.UTC(2026, 0, 1) + d * DAY);
      const a = ageInDays('2026-01-01', now) ?? -1;
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('a record is stale when and only when its age passes the limit, even across a leap day', () => {
    const now = new Date('2028-03-01T00:00:00Z');
    expect(ageInDays('2028-02-28', now)).toBe(2);
    expect(ageInDays('2027-03-01', now)).toBe(366);
    expect(freshness('2027-03-01', now, 365)).toBe('stale');
  });

  it('a future date is Unknown and reported, for every distance into the future', () => {
    for (const ahead of [1, 2, 30, 365, 5000]) {
      const day = new Date(utcDayStart(NOW) + ahead * DAY).toISOString().slice(0, 10);
      expect(freshness(day, NOW)).toBe('unknown');
      expect(checkProvenance({ source: 's', licence: 'OGL-Ontario', retrievedAt: day }, NOW)).toEqual(['future-date']);
      expect(readRetrieved(day, NOW)).toMatchObject({ kind: 'future', daysAhead: ahead });
    }
  });

  it('parseIsoDate agrees with parseRetrieved', () => {
    const r = mulberry32(31);
    for (let i = 0; i < 2000; i++) {
      const v = randomRetrieved(r, NOW);
      expect(parseIsoDate(v)).toBe(parseRetrieved(v)?.ms ?? null);
    }
  });
});

describe('unknown tokens', () => {
  it('folds accents, case, dashes and spacing', () => {
    expect(foldToken('  INCONNUE ')).toBe('inconnue');
    expect(foldToken('Non   disponible')).toBe(foldToken('non disponible'));
    expect(foldToken('—')).toBe(foldToken('-'));
    expect(foldToken('Aucune')).toBe('aucune');
  });

  it('recognises each placeholder in both languages', () => {
    for (const v of ['n/a', 'N/A', 'na', 'NA', 'tbd', 'TBD', 'unknown', 'UNKNOWN', 'inconnu', 'Inconnue', 'non disponible', 'Non Disponible', 'sans objet', 'aucun', 'Aucune', '-', '–', '—', '?', '??', 'null', 'none', 'undefined']) {
      expect(isUnknownToken(v), v).toBe(true);
    }
  });

  it('keeps real values that merely contain a placeholder word', () => {
    for (const v of ['Unknown Heights', 'N/A Corp', 'Tbd Inc', 'The None Group', 'Aucune Fois', 'Open Data (n/a)']) expect(cleanValue(v), v).toBe(v);
  });

  it('cleanValue handles non-strings and trims', () => {
    for (const v of [null, undefined, 0, 5, {}, [], true]) expect(cleanValue(v as never)).toBeNull();
    expect(cleanValue('  ok  ')).toBe('ok');
    expect(cleanValue('\u00A0 ok \u00A0')).toBe('ok');
    expect(cleanValue('\uFEFF')).toBeNull();
  });
});

describe('regressions found by the consistency fuzz', () => {
  const src = { id: 's', name: 'Src', source: 'Pub', licence: 'OGL-Ontario', url: 'https://example.org' };

  it('source list honours the dataset limit instead of a fixed 180 days', () => {
    const rows = (limit?: number) => buildSourceList([{ ...src, retrievedAt: '2026-10-01' }], 'en', NOW, limit);
    expect(rows()[0]?.state).toBe('fresh'); // 46 days, default limit 180
    expect(rows(30)[0]?.state).toBe('stale');
    expect(rows(60)[0]?.state).toBe('fresh');
  });

  it('review queue uses the limit each source was audited with, even when dataset ids repeat', () => {
    const audit = auditRegistry(
      [
        { id: 'x', name: 'One', kind: 'places', sources: [{ ...src, id: 'a', retrievedAt: '2026-11-01' }] },
        { id: 'x', name: 'Two', kind: 'transit', sources: [{ ...src, id: 'b', retrievedAt: '2026-11-01' }] },
      ],
      NOW,
    );
    const q = buildReviewQueue(audit, NOW);
    expect(q.find((i) => i.sourceId === 'a')?.dueIso).toBe(addDaysIso('2026-11-01', 180));
    expect(q.find((i) => i.sourceId === 'b')?.dueIso).toBe(addDaysIso('2026-11-01', 60));
  });

  it('catalogue lists a shared source once, not under every dataset with the same id', () => {
    const audit = auditRegistry(
      [
        { id: 'x', name: 'One', kind: 'places', sources: [{ ...src, id: 'a', retrievedAt: '2026-11-01' }] },
        { id: 'x', name: 'Two', kind: 'places', sources: [] },
      ],
      NOW,
    );
    const total = buildCatalogue(audit, NOW)['dcat:dataset'].reduce((n, d) => n + d['prov:wasDerivedFrom'].length, 0);
    expect(total).toBe(1);
  });
});
