import { describe, expect, it } from 'vitest';
import {
  MIN_TARGET_PX,
  checkProvenance,
  dataBadge,
  formatRate,
  freshness,
  licenceKind,
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
    // Taux is masculine: the visible text and the spoken label agree.
    expect(formatRate(null, 'fr').text).toBe('Inconnu');
    expect(formatRate(null, 'fr').ariaLabel).toBe('Taux\u00A0: inconnu');
    expect(formatRate(null, 'en').ariaLabel).toBe('Rate: unknown');
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
    expect(checkProvenance({ ...good, licence: 'Proprietary' }, NOW)).toEqual(['licence-unrecognised']);
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
    expect(b.label).toBe('Retrieved 683 days ago. May be out of date.');
    expect(b.ageDays).toBe(683);
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
      'Date de récupération inconnue',
    );
  });

  it('never calls data up to 180 days old "recent"; it states the age', () => {
    const b = dataBadge({ ...good, retrievedAt: '2026-05-19' }, 'en', NOW);
    expect(b.state).toBe('fresh');
    expect(b.label).toBe('Retrieved 180 days ago');
    expect(b.label).not.toMatch(/recent/i);
    expect(dataBadge({ ...good, retrievedAt: '2026-05-19' }, 'fr', NOW).label).toBe('Récupéré il y a 180\u00a0jours');
    expect(dataBadge({ ...good, retrievedAt: '2026-11-15' }, 'en', NOW).label).toBe('Retrieved today');
    expect(dataBadge({ ...good, retrievedAt: '2026-11-14' }, 'fr', NOW).label).toBe('Récupéré il y a 1\u00a0jour');
  });
});

describe('licenceKind', () => {
  it('treats the Metrolinx agreement and the LTC terms as accepted terms, not a problem', () => {
    for (const licence of [
      'Metrolinx Access and Use Agreement (accepted 2026-11-15)',
      'OGL-Ontario-Metrolinx-1.0',
      'LTC Open Data Terms of Use',
    ]) {
      expect(licenceKind(licence)).toBe('terms');
      expect(checkProvenance({ ...good, licence }, NOW)).toEqual([]);
      expect(dataBadge({ ...good, licence }, 'en', NOW).licence).toBe('terms');
    }
  });

  it('recognises open licences by id or by name', () => {
    for (const licence of ['CC-BY-4.0', 'CC BY 4.0', 'ODbL-1.0', 'Open Government Licence – Toronto', 'OGL-Canada-2.0']) {
      expect(licenceKind(licence)).toBe('open');
    }
  });

  it('keeps a missing or UNKNOWN licence unknown, and never calls an unlisted one closed', () => {
    expect(licenceKind(undefined)).toBe('unknown');
    expect(licenceKind('UNKNOWN')).toBe('unknown');
    expect(licenceKind('Proprietary')).toBe('unrecognised');
  });
});
