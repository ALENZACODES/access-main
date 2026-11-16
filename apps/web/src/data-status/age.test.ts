import { describe, expect, it } from 'vitest';
import { ageDays, ageLabel, lintFrench } from './index';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('ageDays', () => {
  it('counts whole UTC days', () => {
    expect(ageDays('2026-11-15', NOW)).toBe(0);
    expect(ageDays('2026-11-14', NOW)).toBe(1);
    expect(ageDays('2026-11-01', NOW)).toBe(14);
    expect(ageDays('2026-11-14T23:59:00Z', NOW)).toBe(1);
  });

  it('is null for future, missing or unreadable dates (never a guess)', () => {
    for (const v of ['2026-11-16', '2030-01-01', null, undefined, '', 'soon', '2026-13-45']) expect(ageDays(v, NOW)).toBeNull();
  });

  it('ignores the time of day of "now"', () => {
    expect(ageDays('2026-11-15', new Date('2026-11-15T00:00:01Z'))).toBe(0);
    expect(ageDays('2026-11-15', new Date('2026-11-15T23:59:59Z'))).toBe(0);
  });
});

describe('ageLabel', () => {
  it('EN: today, yesterday, days, months, years', () => {
    expect(ageLabel('2026-11-15', NOW, 'en')).toBe('today');
    expect(ageLabel('2026-11-14', NOW, 'en')).toBe('yesterday');
    expect(ageLabel('2026-11-01', NOW, 'en')).toBe('14 days ago');
    expect(ageLabel('2026-10-01', NOW, 'en')).toBe('45 days ago');
    expect(ageLabel('2026-07-28', NOW, 'en')).toBe('3 months ago');
    expect(ageLabel('2024-11-14', NOW, 'en')).toBe('2 years ago');
  });

  it('FR: same ranges, French wording', () => {
    expect(ageLabel('2026-11-14', NOW, 'fr')).toBe('hier');
    expect(ageLabel('2026-11-01', NOW, 'fr')).toBe('il y a 14 jours');
    expect(ageLabel('2026-07-28', NOW, 'fr')).toBe('il y a 3 mois');
    expect(ageLabel('2024-11-14', NOW, 'fr')).toBe('il y a 2 ans');
  });

  it('FR output always passes the typography lint (apostrophes included)', () => {
    for (const iso of ['2026-11-15', '2026-11-14', '2026-11-01', '2026-07-28', '2024-11-14']) {
      expect(lintFrench(ageLabel(iso, NOW, 'fr'))).toEqual([]);
    }
    expect(ageLabel('2026-11-15', NOW, 'fr')).toBe('aujourd’hui');
  });

  it('shows Unknown instead of "in N days" for future dates, and for bad input', () => {
    expect(ageLabel('2026-12-01', NOW, 'en')).toBe('Unknown');
    expect(ageLabel(null, NOW, 'fr')).toBe('Inconnu');
    expect(ageLabel('junk', NOW, 'en')).toBe('Unknown');
  });
});
