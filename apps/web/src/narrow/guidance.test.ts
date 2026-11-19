import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { finding, routeOf, at, siteReport } from './findings-testkit.js';
import { describeGuidance, FALLBACK_GUIDANCE, GUIDANCE, guidanceFor, guidanceForReport, hasGuidance, renderNextSteps } from './guidance.js';
import { frTypographyIssues } from './i18n.js';
import { makeReport } from './report.js';
import { CHECK_ORDER } from './types.js';

/** The checks that existed when this catalogue was written. A check added later uses the fallback until it gets an entry. */
const CATALOGUED = [
  'reflow', 'target-size', 'target-spacing', 'contrast', 'name', 'label-in-name', 'language', 'focus-obscured', 'text-spacing', 'i18n', 'offline',
  'keyboard', 'focus-visible', 'motion', 'static-html', 'copy', 'provenance', 'link-cue', 'non-text-contrast', 'dragging', 'consistency', 'waiver',
  'external', 'manifest', 'service-worker', 'parity', 'budget', 'weight', 'forms', 'auth', 'status', 'media', 'fixed-space', 'clipping', 'lang-parts',
  'timing', 'purpose', 'tables', 'frames', 'bypass', 'links', 'images', 'plain', 'locale', 'sensory', 'text-zoom', 'headings', 'handlers', 'typography',
  'order', 'generated', 'lookalike', 'regions', 'aria', 'references', 'hrefs', 'css', 'obsolete', 'states', 'lists', 'sectioning', 'constraints', 'symbols',
  'document', 'table-markup', 'labels', 'identifiers', 'name-words',
] as const;

const all = Object.entries(GUIDANCE);

describe('the catalogue', () => {
  it('has an entry for each of the 68 checks it was written for, and no other key', () => {
    expect(Object.keys(GUIDANCE).sort()).toEqual([...CATALOGUED].sort());
    expect(CATALOGUED).toHaveLength(68);
  });
  it('only names checks that exist', () => {
    for (const id of CATALOGUED) expect(CHECK_ORDER as readonly string[], id).toContain(id);
  });
  it('gives both texts in both languages, as full sentences', () => {
    for (const [id, x] of all) {
      for (const text of [x.who.en, x.who.fr, x.byHand.en, x.byHand.fr]) {
        expect(text.length, id).toBeGreaterThan(20);
        expect(text.endsWith('.'), `${id}: ${text}`).toBe(true);
        expect(text, id).toBe(text.trim());
        expect(text, id).not.toMatch(/\s{2,}/);
      }
      expect(x.who.fr, id).not.toBe(x.who.en);
      expect(x.byHand.fr, id).not.toBe(x.byHand.en);
    }
  });
  it('says who is affected by naming people or the team', () => {
    for (const [id, x] of all) {
      expect(x.who.en, id).toMatch(/^(People|Everyone|The team)\b/);
      expect(x.who.fr, id).toMatch(/^(Les personnes|Toutes les personnes|L’équipe)/);
    }
  });
  it('follows French typography', () => {
    for (const [id, x] of all) {
      expect(frTypographyIssues(x.who.fr), `${id}: ${x.who.fr}`).toEqual([]);
      expect(frTypographyIssues(x.byHand.fr), `${id}: ${x.byHand.fr}`).toEqual([]);
    }
    expect(frTypographyIssues(FALLBACK_GUIDANCE.who.fr)).toEqual([]);
    expect(frTypographyIssues(FALLBACK_GUIDANCE.byHand.fr)).toEqual([]);
  });
  it('uses none of the wording the App keeps out of user copy, and gives no medical direction', () => {
    for (const [id, x] of [...all, ['fallback', FALLBACK_GUIDANCE] as const]) {
      for (const text of [x.who.en, x.who.fr, x.byHand.en, x.byHand.fr]) {
        expect(scanCopy(text).map((h) => h.rule.id), `${id}: ${text}`).toEqual([]);
        expect(text, id).not.toMatch(/verif|vérif/iu);
        expect(text, id).not.toMatch(/\b(doctor|médecin|diagnos|treatment|traitement|symptom|symptôme)\b/iu);
      }
    }
  });
  it('promises nothing', () => {
    for (const [id, x] of all) {
      for (const text of [x.byHand.en, x.byHand.fr]) expect(text, id).not.toMatch(/\b(ensures?|guarantees?|will pass|conform|garanti|assure que|conforme)\b/iu);
    }
  });
  it('gives each check its own hand check', () => {
    const en = all.map(([, x]) => x.byHand.en);
    expect(new Set(en).size).toBe(en.length);
    const fr = all.map(([, x]) => x.byHand.fr);
    expect(new Set(fr).size).toBe(fr.length);
  });
});

describe('guidanceFor', () => {
  it('returns the entry of a check', () => {
    expect(guidanceFor('reflow').byHand.en).toContain('320 pixels');
    expect(hasGuidance('reflow')).toBe(true);
  });
  it('falls back for a check it does not know, and for names that are not checks', () => {
    for (const id of ['from-the-future', '', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(hasGuidance(id), id).toBe(false);
      expect(guidanceFor(id), id).toBe(FALLBACK_GUIDANCE);
    }
  });
});

describe('describeGuidance', () => {
  it('gives two labelled lines in either language', () => {
    expect(describeGuidance('contrast', 'en')).toBe(
      'Who this affects: People with low vision, and anyone reading outdoors or on a dim screen.\nTo look at it by hand: Measure the text and its background with a contrast tool, and read the page on a phone in daylight.',
    );
    const fr = describeGuidance('contrast', 'fr');
    expect(fr.split('\n')).toHaveLength(2);
    expect(fr.startsWith('Qui est concerné\u00A0: Les personnes malvoyantes')).toBe(true);
    expect(fr).toContain('\nPour le contrôler à la main\u00A0: Mesurez');
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });
});

describe('guidanceForReport', () => {
  it('lists only the checks that found something, failures first, with their label', () => {
    const items = guidanceForReport(siteReport(), 'en');
    expect(items.map((i) => [i.check, i.label, i.failed, i.unknown])).toEqual([
      ['contrast', 'Text contrast', 4, 0],
      ['images', expect.any(String), 0, 2],
    ]);
    expect(guidanceForReport(siteReport(), 'fr')[0]?.label).toBe('Contraste du texte');
  });
  it('puts a check with one failure before a check with many unknowns', () => {
    const report = makeReport(
      [routeOf('/', { images: { checked: 9, entries: Array.from({ length: 5 }, (_, i) => finding('images', 'alt-generic', 'unknown', `img[${i}]`)) }, reflow: { checked: 3, entries: [finding('reflow', 'overflow', 'fail', 'div')] } })],
      at(19),
    );
    expect(guidanceForReport(report, 'en').map((i) => i.check)).toEqual(['reflow', 'images']);
  });
  it('is empty for a report with no finding', () => {
    expect(guidanceForReport(makeReport([routeOf('/', { contrast: { checked: 3, entries: [] } })], at(19)), 'en')).toEqual([]);
  });
});

describe('renderNextSteps', () => {
  const en = renderNextSteps(siteReport(), 'en');
  const fr = renderNextSteps(siteReport(), 'fr');
  it('opens with a heading, then one block per check', () => {
    expect(en.startsWith('What to do next:\n\nText contrast (contrast): 4 to fix, 0 to check\n  Who this affects: People with low vision')).toBe(true);
    expect(en).toContain('\n  To look at it by hand: Measure the text and its background');
    expect(fr.startsWith('Et maintenant\u00A0:\n\nContraste du texte (contrast)\u00A0: 4 à corriger, 0 à contrôler\n  Qui est concerné\u00A0: Les personnes malvoyantes')).toBe(true);
  });
  it('ends by saying that the hand checks do not make a page conform', () => {
    expect(en.trimEnd().endsWith('Doing these hand checks does not make a page conform. They show where to look.')).toBe(true);
    expect(fr.trimEnd().endsWith('Faire ces contrôles à la main ne rend pas une page conforme. Ils montrent où regarder.')).toBe(true);
  });
  it('is empty when there is nothing to do', () => {
    expect(renderNextSteps(makeReport([], at(19)), 'en')).toBe('');
  });
  it('follows French typography line by line and ends with one line break', () => {
    for (const line of fr.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
    expect(en.endsWith('\n')).toBe(true);
    expect(en.endsWith('\n\n')).toBe(false);
  });
});
