import { describe, expect, it } from 'vitest';
import { formatDisplayDate, localeFromPath, otherLocale, resolveLocale, switchLocalePath } from './index';

describe('resolveLocale', () => {
  it.each([
    ['fr', 'fr'],
    ['fr-CA', 'fr'],
    ['FR_ca', 'fr'],
    ['fr-CA,fr;q=0.9,en;q=0.8', 'fr'],
    ['en-US', 'en'],
    ['EN', 'en'],
    ['en,fr;q=0.5', 'en'],
  ])('%s -> %s', (input, expected) => expect(resolveLocale(input)).toBe(expected));

  it('falls back for unsupported, empty or missing input', () => {
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale('de', 'fr')).toBe('fr');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(null, 'fr')).toBe('fr');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('french')).toBe('en');
    expect(resolveLocale('fra')).toBe('en');
  });
});

describe('path helpers', () => {
  it('reads a locale prefix only at a path boundary', () => {
    expect(localeFromPath('/fr')).toBe('fr');
    expect(localeFromPath('/fr/data-status')).toBe('fr');
    expect(localeFromPath('/en/x')).toBe('en');
    expect(localeFromPath('/french')).toBeNull();
    expect(localeFromPath('/data-status')).toBeNull();
    expect(localeFromPath('/')).toBeNull();
  });

  it('swaps or adds the prefix', () => {
    expect(switchLocalePath('/fr/data-status', 'en')).toBe('/en/data-status');
    expect(switchLocalePath('/en', 'fr')).toBe('/fr');
    expect(switchLocalePath('/data-status', 'fr')).toBe('/fr/data-status');
    expect(switchLocalePath('/', 'en')).toBe('/en');
    expect(switchLocalePath('/french/x', 'en')).toBe('/en/french/x');
  });

  it('otherLocale flips', () => {
    expect(otherLocale('fr')).toBe('en');
    expect(otherLocale('en')).toBe('fr');
  });
});

describe('formatDisplayDate', () => {
  it('writes long dates per locale', () => {
    expect(formatDisplayDate('2026-11-01', 'en')).toBe('November 1, 2026');
    expect(formatDisplayDate('2026-11-01', 'fr')).toMatch(/^1(er)? novembre 2026$/);
  });

  it('uses the date part of a date-time without shifting the day', () => {
    expect(formatDisplayDate('2026-11-01T23:30:00-05:00', 'en')).toBe('November 1, 2026');
    expect(formatDisplayDate('2026-11-01T00:00:00Z', 'en')).toBe('November 1, 2026');
  });

  it('shows Unknown for anything that is not a valid ISO date', () => {
    for (const v of [null, undefined, '', 'soon', '2026-13-45', '11/01/2026']) {
      expect(formatDisplayDate(v, 'en')).toBe('UNKNOWN');
      expect(formatDisplayDate(v, 'fr')).toBe('UNKNOWN');
    }
  });
});
