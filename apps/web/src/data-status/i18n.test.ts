import { describe, expect, it } from 'vitest';
import { EN, FR, catalogParityProblems, lintFrench, lintFrenchCatalog, t } from './index';

describe('catalog', () => {
  it('has FR for every EN key with matching placeholders', () => {
    expect(catalogParityProblems()).toEqual([]);
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
  });

  it('FR catalog passes the typography lint (CI guard)', () => {
    expect(lintFrenchCatalog()).toEqual([]);
  });

  it('never uses wording we do not claim', () => {
    const all = [...Object.values(EN), ...Object.values(FR)].join(' ').toLowerCase();
    for (const banned of ['verified', 'vérifié', 'real-time', 'temps réel', 'aaa', 'partner', 'partenaire']) {
      expect(all).not.toContain(banned);
    }
  });

  it('interpolates placeholders and leaves unknown ones', () => {
    expect(t('en', 'snap.savedOn', { date: '2026-11-01' })).toBe('Saved copy from 2026-11-01');
    expect(t('fr', 'snap.savedOn', { date: '2026-11-01' })).toBe('Copie enregistrée le 2026-11-01');
    expect(t('en', 'snap.savedOn', {})).toBe('Saved copy from {date}');
    expect(t('fr', 'issue.stale', { name: 'A' })).toBe('A\u00A0: possiblement périmé');
  });
});

describe('lintFrench', () => {
  it('accepts correct typography', () => {
    expect(lintFrench('Source\u00A0: l’Ontario')).toEqual([]);
    expect(lintFrench('Vraiment\u202F? Oui\u202F!')).toEqual([]);
    expect(lintFrench('«\u202Fbonjour\u202F»')).toEqual([]);
    expect(lintFrench('Voir https://example.org à 12:30')).toEqual([]);
    expect(lintFrench('A &amp; B')).toEqual([]);
  });

  it('flags ASCII apostrophes', () => {
    expect(lintFrench("l'Ontario").map((i) => i.code)).toEqual(['ascii-apostrophe']);
  });

  it('flags colons without a no-break space (plain space is not enough)', () => {
    expect(lintFrench('Source: x').map((i) => i.code)).toEqual(['colon-needs-nbsp']);
    expect(lintFrench('Source : x').map((i) => i.code)).toEqual(['colon-needs-nbsp']);
  });

  it('flags ; ! ? without U+202F, including after U+00A0', () => {
    expect(lintFrench('Quoi?').map((i) => i.code)).toEqual(['high-punctuation-needs-narrow-nbsp']);
    expect(lintFrench('Oui\u00A0!').map((i) => i.code)).toEqual(['high-punctuation-needs-narrow-nbsp']);
    expect(lintFrench('a; b').length).toBe(1);
  });

  it('flags unspaced guillemets', () => {
    expect(lintFrench('«bonjour»').map((i) => i.code)).toEqual(['guillemet-spacing', 'guillemet-spacing']);
  });
});
