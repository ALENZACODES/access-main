import { describe, expect, it } from 'vitest';
import { PRINCIPLES } from './criteria.js';
import { frTypographyIssues } from './i18n.js';
import { DEFAULT_EXAMPLES, THEME_LABELS, THEME_ORDER, THEME_PRINCIPLE, groupLine, plainHeadline, plainLimit, plainSummaryText, principleName, summarisePlainly, themeOf } from './plain-summary.js';
import { found, reportOf, route, smallSite } from './report-fixtures.js';
import { CHECK_ORDER, CHECK_SC, NBSP } from './types.js';

const LANGS = ['en', 'fr'] as const;

describe('themeOf', () => {
  it('follows the first digit of the criterion', () => {
    expect(themeOf('contrast')).toBe('see');
    expect(themeOf('reflow')).toBe('see');
    expect(themeOf('target-size')).toBe('use');
    expect(themeOf('keyboard')).toBe('use');
  });

  it('gives every check a theme, and "other" only to checks with no criterion', () => {
    const sc = CHECK_SC as Readonly<Record<string, string | null | undefined>>;
    for (const check of CHECK_ORDER) {
      const theme = themeOf(check);
      expect(THEME_ORDER, check).toContain(theme);
      const first = typeof sc[check] === 'string' ? (sc[check] as string).charAt(0) : '';
      expect(theme === 'other', check).toBe(!['1', '2', '3', '4'].includes(first));
    }
  });

  it('puts a check it does not know under "other"', () => {
    expect(themeOf('not-a-check')).toBe('other');
  });

  it('uses each of the four WCAG themes for at least one check', () => {
    const used = new Set(CHECK_ORDER.map((c) => themeOf(c)));
    for (const theme of ['see', 'use', 'understand', 'assistive'] as const) expect(used.has(theme), theme).toBe(true);
  });
});

describe('labels', () => {
  it('has a label for every theme in both languages', () => {
    for (const theme of THEME_ORDER) {
      expect(THEME_LABELS[theme].en).not.toBe('');
      expect(THEME_LABELS[theme].fr).not.toBe(THEME_LABELS[theme].en);
      expect(frTypographyIssues(THEME_LABELS[theme].fr), theme).toEqual([]);
    }
  });

  it('gives the WCAG term for a theme', () => {
    expect(principleName('see', 'en')).toBe(PRINCIPLES[1].en);
    expect(principleName('use', 'fr')).toBe(PRINCIPLES[2].fr);
    expect(principleName('understand', 'en')).toBe(PRINCIPLES[3].en);
    expect(principleName('assistive', 'fr')).toBe(PRINCIPLES[4].fr);
    expect(principleName('other', 'en')).toBe('');
    expect(THEME_PRINCIPLE.other).toBeNull();
  });
});

describe('summarisePlainly', () => {
  it('counts what the report counts', () => {
    const s = summarisePlainly(smallSite());
    expect(s.failed).toBe(2);
    expect(s.unknown).toBe(3);
    expect(s.checked).toBe(44);
  });

  it('groups by theme in a fixed order and leaves empty themes out', () => {
    const s = summarisePlainly(smallSite());
    expect(s.groups.map((g) => g.theme)).toEqual(['see', 'use']);
    expect(s.groups[0]).toMatchObject({ failed: 2, unknown: 2 });
    expect(s.groups[1]).toMatchObject({ failed: 0, unknown: 1 });
  });

  it('shows failures before UNKNOWN entries in the examples', () => {
    const report = reportOf([
      route('/', {
        contrast: { checked: 3, entries: [found('contrast', 'image', 'unknown', 'h1'), found('contrast', 'low', 'fail', 'p'), found('contrast', 'image', 'unknown', 'h2'), found('contrast', 'low', 'fail', 'a')] },
      }),
    ]);
    const g = summarisePlainly(report).groups[0];
    expect(g?.examples.map((e) => e.status)).toEqual(['fail', 'fail', 'unknown']);
    expect(g?.examples).toHaveLength(DEFAULT_EXAMPLES);
  });

  it('takes as many examples as asked, and none for zero or less', () => {
    expect(summarisePlainly(smallSite(), 1).groups[0]?.examples).toHaveLength(1);
    expect(summarisePlainly(smallSite(), 0).groups[0]?.examples).toEqual([]);
    expect(summarisePlainly(smallSite(), -3).groups[0]?.examples).toEqual([]);
    expect(summarisePlainly(smallSite(), 2.9).groups[0]?.examples).toHaveLength(2);
    expect(summarisePlainly(smallSite(), 50).groups[0]?.examples).toHaveLength(4);
  });

  it('has no group for a report with no finding', () => {
    const s = summarisePlainly(reportOf([route('/', { contrast: { checked: 7, entries: [] } })]));
    expect(s).toEqual({ failed: 0, unknown: 0, checked: 7, groups: [] });
    expect(summarisePlainly(reportOf([])).groups).toEqual([]);
  });

  it('the groups hold every finding exactly once', () => {
    const s = summarisePlainly(smallSite());
    expect(s.groups.reduce((n, g) => n + g.failed, 0)).toBe(s.failed);
    expect(s.groups.reduce((n, g) => n + g.unknown, 0)).toBe(s.unknown);
  });
});

describe('plainHeadline', () => {
  it('gives both counts', () => {
    const s = summarisePlainly(smallSite());
    expect(plainHeadline(s, 'en')).toBe('On this page, at this size: 2 things to fix and 3 things UNKNOWN, for a person to look at.');
    expect(plainHeadline(s, 'fr')).toBe(`Sur cette page, à cette taille${NBSP}: 2 points à corriger et 3 points UNKNOWN, qu’une personne doit regarder.`);
  });

  it('uses the singular for one, and in French for zero', () => {
    const one = { failed: 1, unknown: 1, checked: 5, groups: [] };
    expect(plainHeadline(one, 'en')).toContain('1 thing to fix and 1 thing UNKNOWN');
    expect(plainHeadline(one, 'fr')).toContain('1 point à corriger et 1 point UNKNOWN');
    const zero = { failed: 0, unknown: 2, checked: 5, groups: [] };
    expect(plainHeadline(zero, 'en')).toContain('0 things to fix and 2 things UNKNOWN');
    expect(plainHeadline(zero, 'fr')).toContain('0 point à corriger et 2 points UNKNOWN');
  });

  it('says the checks found nothing, and no more than that, when they found nothing', () => {
    const none = { failed: 0, unknown: 0, checked: 40, groups: [] };
    expect(plainHeadline(none, 'en')).toBe('The checks that ran found nothing on this page at this size.');
    expect(plainHeadline(none, 'fr')).toBe('Les contrôles exécutés n’ont rien trouvé sur cette page à cette taille.');
    expect(plainHeadline(none, 'en')).not.toMatch(/\b(works|pass(es|ed)?|conforms?|compliant|accessible|no (problems|barriers))\b/i);
    expect(plainHeadline(none, 'fr')).not.toMatch(/conforme|a réussi|fonctionne|accessible|aucun (problème|obstacle)/i);
  });

  it('follows French typography', () => {
    for (const s of [summarisePlainly(smallSite()), { failed: 0, unknown: 0, checked: 1, groups: [] }]) {
      expect(frTypographyIssues(plainHeadline(s, 'fr'))).toEqual([]);
    }
  });
});

describe('plainLimit', () => {
  it('says the checks cover part of the picture', () => {
    expect(plainLimit('en')).toContain('part of what makes a page usable');
    expect(plainLimit('en')).toContain('does not mean the page suits everyone');
    expect(plainLimit('fr')).toContain('ne veut pas dire que la page convient à tout le monde');
    expect(frTypographyIssues(plainLimit('fr'))).toEqual([]);
  });
});

describe('groupLine', () => {
  it('names the theme and both counts', () => {
    const g = summarisePlainly(smallSite()).groups[0];
    if (!g) throw new Error('no group');
    expect(groupLine(g, 'en')).toBe('Seeing and hearing the content: 2 to fix, 2 UNKNOWN');
    expect(groupLine(g, 'fr')).toBe(`Voir et entendre le contenu${NBSP}: 2 à corriger, 2 UNKNOWN`);
    expect(frTypographyIssues(groupLine(g, 'fr'))).toEqual([]);
  });
});

describe('plainSummaryText', () => {
  it('lists each group, its examples and how many more there are', () => {
    const text = plainSummaryText(summarisePlainly(smallSite()), 'en');
    const lines = text.split('\n');
    expect(lines[0]).toContain('2 things to fix');
    expect(lines).toContain('- Seeing and hearing the content: 2 to fix, 2 UNKNOWN');
    expect(lines.filter((l) => l.startsWith('    FAIL '))).toHaveLength(2);
    expect(lines).toContain('    … and 1 more');
    expect(lines).toContain('- Moving around and pressing things: 0 to fix, 1 UNKNOWN');
    expect(lines.at(-1)).toBe('    UNKNOWN English text for new-tab-unannounced.');
  });

  it('keeps the token UNKNOWN in French and words a failure as something to correct', () => {
    const text = plainSummaryText(summarisePlainly(smallSite()), 'fr');
    expect(text).toContain('    À CORRIGER Texte français pour low.');
    expect(text).toContain('    UNKNOWN Texte français pour image.');
    expect(text).toContain('    … et 1 de plus');
    expect(text).not.toContain('FAIL');
  });

  it('is one sentence for a report with no finding', () => {
    for (const lang of LANGS) {
      const text = plainSummaryText(summarisePlainly(reportOf([])), lang);
      expect(text.split('\n')).toHaveLength(1);
    }
  });

  it('has no "more" line when every finding is shown', () => {
    expect(plainSummaryText(summarisePlainly(smallSite(), 50), 'en')).not.toContain('more');
  });
});
