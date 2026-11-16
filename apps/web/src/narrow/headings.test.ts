import { describe, expect, it } from 'vitest';
import { auditHeadings, CAPS_WORDS, HEADING_RULES, MAX_HEADING_WORDS, normalise, SENTENCE_WORDS } from './headings.js';
import { EMPTY_PROSE, type HeadingFact, type ProseFacts } from './prose.js';
import { noFrIssues } from './expect-fr.js';

const h = (level: number, text: string, i = 0): HeadingFact => ({ id: `h${level}[${i}]`, level, text });
const facts = (headings: HeadingFact[], title = '', pageLang = 'en'): ProseFacts => ({ ...EMPTY_PROSE, pageLang, headings, title });
const rules = (f: ProseFacts): string[] => auditHeadings(f).entries.map((e) => `${e.id}:${e.rule}`);
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('normalise', () => {
  it('lowers case, trims, collapses spaces and drops closing punctuation', () => {
    expect(normalise('  Opening   Hours: ')).toBe('opening hours');
    expect(normalise('Hours?!')).toBe('hours');
  });
  it('treats a straight and a curly apostrophe as the same', () => {
    expect(normalise("Heures d'ouverture")).toBe(normalise('Heures d’ouverture'));
  });
  it('treats non-breaking spaces as spaces', () => {
    expect(normalise('Opening\u00A0hours')).toBe('opening hours');
  });
});

describe('heading rules', () => {
  it('has all eight rules', () => {
    expect(HEADING_RULES).toHaveLength(8);
  });
  it('finds nothing in good headings', () => {
    const r = auditHeadings(facts([h(1, 'Clinic hours'), h(2, 'Parking', 1), h(2, 'How to get here', 2)], 'Clinic hours'));
    expect(r.entries).toEqual([]);
    expect(r.checked).toBe(4);
  });
  it.each(['Untitled', 'untitled', 'Heading', 'Section', 'Read more', 'Click here.', 'Section 3', 'Heading 2', 'Chapitre 4'])('asks about the placeholder heading "%s"', (t) => {
    expect(rules(facts([h(2, t)]))).toEqual(['h2[0]:heading-generic']);
  });
  it('uses the French placeholder list for a French page', () => {
    expect(rules(facts([h(2, 'Sans titre')], '', 'fr'))).toEqual(['h2[0]:heading-generic']);
    expect(rules(facts([h(2, 'Sans titre')], '', 'en'))).toEqual([]);
    expect(rules(facts([h(2, 'En savoir plus')], '', 'fr-CA'))).toEqual(['h2[0]:heading-generic']);
  });
  it('asks about a heading that is only numbers or symbols', () => {
    expect(rules(facts([h(2, '2026')]))).toEqual(['h2[0]:heading-number']);
    expect(rules(facts([h(2, '$1,234.50')]))).toEqual(['h2[0]:heading-number']);
    expect(rules(facts([h(2, '2026 plan')]))).toEqual([]);
  });
  it('asks about the second use of a heading, not the first', () => {
    const r = auditHeadings(facts([h(2, 'Hours', 0), h(2, 'Parking', 1), h(3, 'hours:', 2)]));
    expect(r.entries.map((e) => [e.id, e.rule])).toEqual([['h3[2]', 'heading-duplicate']]);
    expect(r.entries[0]?.message.en).toContain('first at h2[0]');
  });
  it('asks about a long heading but not one at the limit', () => {
    expect(rules(facts([h(2, words(MAX_HEADING_WORDS))]))).toEqual([]);
    expect(rules(facts([h(2, words(MAX_HEADING_WORDS + 1))]))).toEqual(['h2[0]:heading-long']);
  });
  it('asks about a heading that ends with a full stop and is long enough to be a sentence', () => {
    expect(rules(facts([h(2, words(SENTENCE_WORDS) + '.')]))).toEqual(['h2[0]:heading-sentence']);
    expect(rules(facts([h(2, words(SENTENCE_WORDS - 1) + '.')]))).toEqual([]);
    expect(rules(facts([h(2, words(SENTENCE_WORDS))]))).toEqual([]);
  });
  it('does not call a long heading a sentence as well', () => {
    expect(rules(facts([h(2, words(MAX_HEADING_WORDS + 2) + '.')]))).toEqual(['h2[0]:heading-long']);
  });
  it('asks about an all capital heading of enough words and letters', () => {
    expect(rules(facts([h(2, 'OPENING HOURS AND SERVICES')]))).toEqual(['h2[0]:heading-caps']);
    expect(rules(facts([h(2, 'FAQ')]))).toEqual([]);
    expect(rules(facts([h(2, 'OPENING HOURS')]))).toEqual([]);
    expect(CAPS_WORDS).toBe(3);
  });
  it('accepts accented capitals as capitals', () => {
    expect(rules(facts([h(2, 'HEURES D’OUVERTURE ÉTÉ')], '', 'fr'))).toEqual(['h2[0]:heading-caps']);
  });
  it('skips empty headings, which are a static-html rule', () => {
    const r = auditHeadings(facts([h(2, ''), h(2, '   ', 1)]));
    expect(r).toEqual({ checked: 0, entries: [] });
  });
  it('can give several findings for one heading', () => {
    const e = rules(facts([h(2, 'UNTITLED SECTION HERE.')]));
    expect(e).toEqual(['h2[0]:heading-caps']);
    expect(rules(facts([h(2, 'Section 1', 0), h(2, 'section 1', 1)]))).toEqual(['h2[0]:heading-generic', 'h2[1]:heading-generic', 'h2[1]:heading-duplicate']);
  });
});

describe('page title rules', () => {
  it('has no finding for a title that shares a word with the main heading', () => {
    expect(rules(facts([h(1, 'Clinic hours today')], 'Hours | Clinic'))).toEqual([]);
  });
  it.each(['Untitled', 'Document', 'React App', 'New Tab', 'Welcome'])('asks about the placeholder title "%s"', (t) => {
    expect(rules(facts([h(1, 'Clinic hours')], t))).toEqual(['title:title-generic']);
  });
  it('asks about a French placeholder title', () => {
    expect(rules(facts([h(1, 'Heures')], 'Sans titre', 'fr'))).toEqual(['title:title-generic']);
  });
  it('does not call Home a placeholder', () => {
    expect(rules(facts([h(1, 'Home')], 'Home'))).toEqual([]);
  });
  it('asks when the title and the main heading share no word', () => {
    const r = auditHeadings(facts([h(1, 'Parking')], 'Clinic hours'));
    expect(r.entries.map((e) => e.rule)).toEqual(['title-h1-differs']);
    expect(r.entries[0]?.message.en).toContain('“Clinic hours”');
    expect(r.entries[0]?.message.en).toContain('“Parking”');
  });
  it('ignores short words and filler words when it compares', () => {
    expect(rules(facts([h(1, 'The clinic and your hours')], 'Clinic of Ontario'))).toEqual([]);
    expect(rules(facts([h(1, 'The page for you')], 'The site and the page'))).toEqual([]);
  });
  it('uses the first main heading and skips the comparison when there is none', () => {
    expect(rules(facts([h(2, 'Parking')], 'Clinic hours'))).toEqual([]);
    expect(rules(facts([h(1, 'Parking'), h(1, 'Clinic hours', 1)], 'Clinic hours'))).toEqual(['title:title-h1-differs']);
  });
  it('skips an empty title, which is a static-html rule', () => {
    expect(auditHeadings(facts([h(1, 'Parking')], '  ')).entries).toEqual([]);
  });
  it('counts the title as one item checked', () => {
    expect(auditHeadings(facts([h(1, 'Clinic')], 'Clinic')).checked).toBe(2);
  });
});

describe('messages', () => {
  it('are unknown, headings, and clean French for every rule', () => {
    const en = auditHeadings(
      facts(
        [h(1, 'Untitled', 0), h(2, '2026', 1), h(2, 'Hours', 2), h(2, 'Hours', 3), h(2, words(16), 4), h(2, words(7) + '.', 5), h(2, 'OPENING HOURS AND SERVICES', 6)],
        'Untitled',
      ),
    ).entries;
    const diff = auditHeadings(facts([h(1, 'Parking')], 'Clinic hours')).entries;
    const fr = auditHeadings(
      facts(
        [h(1, 'Sans titre', 0), h(2, '2026', 1), h(2, 'Heures', 2), h(2, 'Heures', 3), h(2, words(16), 4), h(2, words(7) + '.', 5), h(2, 'HEURES D’OUVERTURE ET SERVICES', 6)],
        'Sans titre',
        'fr',
      ),
    ).entries;
    const frDiff = auditHeadings(facts([h(1, 'Stationnement')], 'Heures de la clinique', 'fr')).entries;
    const all = [...en, ...diff, ...fr, ...frDiff];
    expect(new Set(all.map((e) => e.rule))).toEqual(new Set(HEADING_RULES));
    for (const e of all) {
      expect(e.check).toBe('headings');
      expect(e.status).toBe('unknown');
    }
    noFrIssues(all);
  });
});
