import { describe, expect, it } from 'vitest';
import {
  MIN_TARGET_PX,
  checkProvenance,
  dataBadge,
  formatRate,
  freshness,
  provenanceLine,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const good = { source: 'Open Data Ontario', licence: 'OGL-Ontario', retrievedAt: '2026-10-01' };

describe('formatRate', () => {
  it.each([null, undefined, NaN, Infinity, -1, 101, '12', {}])('treats %s as unknown, never 0', (v) => {
    const r = formatRate(v, 'en');
    expect(r.known).toBe(false);
    expect(r.text).toBe('Unknown');
    expect(r.text).not.toMatch(/0/);
  });

  it('keeps a real zero as known 0.0%', () => {
    expect(formatRate(0, 'en')).toMatchObject({ known: true, text: '0.0%' });
  });

  it('formats FR with decimal comma, NBSP before % and before colon', () => {
    const r = formatRate(12.5, 'fr');
    expect(r.text).toBe('12,5\u00A0%');
    expect(r.ariaLabel).toBe('Taux\u00A0: 12,5\u00A0%');
    expect(formatRate(null, 'fr').text).toBe('Inconnue');
  });
});

describe('freshness', () => {
  it('fresh, stale, and boundary', () => {
    expect(freshness('2026-10-01', NOW)).toBe('fresh');
    expect(freshness('2025-01-01', NOW)).toBe('stale');
    expect(freshness('2026-05-19', NOW, 180)).toBe('fresh'); // exactly 180 days
    expect(freshness('2026-05-18', NOW, 180)).toBe('stale');
  });

  it('never reports fresh for missing, malformed or future dates', () => {
    for (const v of [null, undefined, '', 'yesterday', '2026-13-45', '2027-01-01']) {
      expect(freshness(v, NOW)).toBe('unknown');
    }
  });
});

describe('provenance', () => {
  it('flags missing and non-open items', () => {
    expect(checkProvenance(good, NOW)).toEqual([]);
    expect(checkProvenance({}, NOW)).toEqual(['missing-source', 'missing-licence', 'missing-date']);
    expect(checkProvenance({ ...good, licence: 'Proprietary' }, NOW)).toEqual(['licence-not-open']);
    expect(checkProvenance({ ...good, retrievedAt: 'soon' }, NOW)).toEqual(['invalid-date']);
    expect(checkProvenance({ ...good, retrievedAt: '2027-01-01' }, NOW)).toEqual(['future-date']);
  });

  it('EN line is consistent and shows Unknown for gaps', () => {
    expect(provenanceLine(good, 'en')).toBe(
      'Source: Open Data Ontario · Licence: OGL-Ontario · Retrieved: 2026-10-01',
    );
    expect(provenanceLine({ source: '  ' }, 'en')).toBe(
      'Source: Unknown · Licence: Unknown · Retrieved: Unknown',
    );
  });

  it('FR line uses NBSP before colons and typographic apostrophes only', () => {
    const line = provenanceLine({ source: 'Données ouvertes de l’Ontario' }, 'fr');
    expect(line).toContain('Source\u00A0: Données ouvertes de l’Ontario');
    expect(line).toContain('Licence\u00A0: Inconnue');
    expect(line).toContain('Date de récupération\u00A0: Inconnue');
    expect(line).not.toMatch(/[^\u00A0]:/);
  });
});

describe('dataBadge', () => {
  it('stale badge carries label, provenance and 44px target', () => {
    const b = dataBadge({ ...good, retrievedAt: '2025-01-01' }, 'en', NOW);
    expect(b.state).toBe('stale');
    expect(b.label).toBe('May be out of date');
    expect(b.ariaLabel).toContain('Retrieved: 2025-01-01');
    expect(b.minTargetPx).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it('FR strings contain no ASCII apostrophe', () => {
    for (const p of [good, {}, { ...good, retrievedAt: '2020-01-01' }]) {
      const b = dataBadge(p, 'fr', NOW);
      expect(`${b.label}${b.provenanceLine}${b.ariaLabel}`).not.toContain("'");
    }
  });

  it('missing date is unknown, not fresh', () => {
    expect(dataBadge({ source: 'x', licence: 'CC0-1.0' }, 'fr', NOW).label).toBe(
      'Date de mise à jour inconnue',
    );
  });
});
