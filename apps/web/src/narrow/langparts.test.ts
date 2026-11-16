import { afterEach, describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { auditLangParts, guessLang, langBlocksInPage, LANG_RULES, MIN_WORDS, PAGE_MIN_BLOCKS, primary, type TextBlock } from './langparts.js';
import { sampleEntries } from './samples.js';
import { installDom, type Installed, type Spec } from './testkit.js';

const EN_TEXT = 'The opening hours are shown for you and for your visit this week';
const FR_TEXT = 'Les heures d’ouverture sont affichées pour vous et pour votre visite cette semaine';

const block = (over: Partial<TextBlock> = {}): TextBlock => ({ id: 'p[0]', lang: '', own: false, text: EN_TEXT, ...over });

describe('guessLang', () => {
  it('recognises English and French by common words', () => {
    expect(guessLang(EN_TEXT)).toBe('en');
    expect(guessLang(FR_TEXT)).toBe('fr');
  });
  it('does not guess for short text', () => {
    expect(guessLang('Opening hours')).toBeNull();
    expect(guessLang('the and of to is')).toBeNull();
    expect(MIN_WORDS).toBe(6);
  });
  it('does not guess when the words are mixed or from neither language', () => {
    expect(guessLang('Toronto Ottawa Hamilton London Kingston Windsor Sudbury Barrie')).toBeNull();
    expect(guessLang('the hours le matin et the soir of the jour pour you votre vous')).toBeNull();
  });
  it('needs at least three common words', () => {
    expect(guessLang('Maple Syrup Festival opens at noon with the best pancakes')).toBeNull();
  });
  it('ignores case and punctuation', () => {
    expect(guessLang('THE HOURS, ARE FOR YOU: THIS WEEK, AND NEXT.')).toBe('en');
  });
  it('primary reduces a language tag', () => {
    expect(primary('fr-CA')).toBe('fr');
    expect(primary(' EN_us ')).toBe('en');
    expect(primary('')).toBe('');
  });
});

describe('auditLangParts', () => {
  it('passes text in the page language and counts the blocks it judged', () => {
    const r = auditLangParts({ pageLang: 'en', blocks: [block(), block({ id: 'p[1]' }), block({ id: 'p[2]', text: 'Short' })] });
    expect(r).toEqual({ checked: 2, entries: [] });
  });
  it('asks about a French block with no lang, naming the language it guessed', () => {
    const r = auditLangParts({ pageLang: 'en', blocks: [block(), block({ id: 'p[1]', text: FR_TEXT })] });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ check: 'lang-parts', id: 'p[1]', status: 'unknown', rule: 'lang-mismatch' });
    expect(r.entries[0]?.message.en).toContain('looks French but is marked en');
  });
  it('passes the same French block when it sets lang fr', () => {
    expect(auditLangParts({ pageLang: 'en', blocks: [block({ text: FR_TEXT, lang: 'fr-CA', own: true })] }).entries).toEqual([]);
  });
  it('asks when a block is marked with the wrong language', () => {
    expect(auditLangParts({ pageLang: 'fr', blocks: [block({ lang: 'fr', own: true })] }).entries[0]?.rule).toBe('lang-mismatch');
  });
  it('a page with no lang is the language check’s business, but text is still judged against the block', () => {
    expect(auditLangParts({ pageLang: '', blocks: [block({ lang: 'fr' })] }).entries[0]?.rule).toBe('lang-mismatch');
    expect(auditLangParts({ pageLang: '', blocks: [block()] }).entries).toEqual([]);
  });
  it('adds a page-wide question when most judged blocks differ from the page language', () => {
    const french = Array.from({ length: PAGE_MIN_BLOCKS }, (_, i) => block({ id: `p[${i}]`, text: FR_TEXT }));
    const r = auditLangParts({ pageLang: 'en', blocks: french });
    expect(r.entries.map((e) => e.rule)).toEqual(['lang-mismatch', 'lang-mismatch', 'lang-mismatch', 'lang-mismatch', 'page-lang-differs']);
    expect(r.entries.at(-1)).toMatchObject({ id: 'html', status: 'unknown' });
  });
  it('does not add the page-wide question for a few blocks, or when most blocks match', () => {
    const few = auditLangParts({ pageLang: 'en', blocks: Array.from({ length: PAGE_MIN_BLOCKS - 1 }, (_, i) => block({ id: `p[${i}]`, text: FR_TEXT })) });
    expect(few.entries.some((e) => e.rule === 'page-lang-differs')).toBe(false);
    const mostlyEn = auditLangParts({ pageLang: 'en', blocks: [block(), block({ id: 'a' }), block({ id: 'b' }), block({ id: 'c', text: FR_TEXT })] });
    expect(mostlyEn.entries.map((e) => e.rule)).toEqual(['lang-mismatch']);
  });
  it('never fails anything: every finding is unknown', () => {
    const french = Array.from({ length: 6 }, (_, i) => block({ id: `p[${i}]`, text: FR_TEXT }));
    expect(auditLangParts({ pageLang: 'en', blocks: french }).entries.every((e) => e.status === 'unknown')).toBe(true);
  });
  it('writes both languages with correct French typography', () => {
    const e = auditLangParts({ pageLang: 'en', blocks: Array.from({ length: 5 }, (_, i) => block({ id: `p[${i}]`, text: FR_TEXT })) }).entries;
    for (const x of e) {
      expect(frTypographyIssues(x.message.fr), x.message.fr).toEqual([]);
      expect(x.message.fr).not.toBe(x.message.en);
    }
    const en = auditLangParts({ pageLang: 'fr', blocks: Array.from({ length: 5 }, (_, i) => block({ id: `p[${i}]`, text: EN_TEXT })) }).entries;
    expect(en.at(-1)?.message.fr).toContain('anglais');
    expect(en.at(-1)?.message.en).toContain('English');
  });
  it('the sample set has an entry for every rule', () => {
    const seen = new Set(sampleEntries().filter((e) => e.check === 'lang-parts').map((e) => e.rule));
    for (const r of LANG_RULES) expect(seen.has(r), r).toBe(true);
  });
});

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});
const read = (roots: Spec[], lang = 'en', maxBlocks = 50) => {
  dom = installDom(roots, { lang });
  return langBlocksInPage({ maxElements: 500, maxBlocks });
};

describe('langBlocksInPage', () => {
  it('reads the page language and long text blocks with their ids', () => {
    const r = read([{ tag: 'main', children: [{ tag: 'h1', text: 'Title' }, { tag: 'p', id: 'a', text: EN_TEXT }] }]);
    expect(r.pageLang).toBe('en');
    expect(r.blocks).toEqual([{ id: 'p#a[0]', lang: '', own: false, text: EN_TEXT }]);
  });
  it('uses the nearest lang, and says when the block sets it itself', () => {
    const r = read([
      { tag: 'section', attrs: { lang: 'fr' }, children: [{ tag: 'p', text: FR_TEXT }, { tag: 'p', attrs: { lang: 'en-CA' }, text: EN_TEXT }] },
    ]);
    expect(r.blocks.map((b) => [b.lang, b.own])).toEqual([['fr', false], ['en-CA', true]]);
  });
  it('skips code, scripts, hidden text and text marked translate no', () => {
    const r = read([
      { tag: 'code', text: FR_TEXT },
      { tag: 'div', style: { display: 'none' }, children: [{ tag: 'p', text: FR_TEXT }] },
      { tag: 'p', attrs: { translate: 'no' }, text: FR_TEXT },
      { tag: 'div', attrs: { translate: 'NO' }, children: [{ tag: 'p', text: FR_TEXT }] },
      { tag: 'p', text: EN_TEXT },
    ]);
    expect(r.blocks.map((b) => b.text)).toEqual([EN_TEXT]);
  });
  it('skips short text', () => {
    expect(read([{ tag: 'p', text: 'Five short words only here' }]).blocks).toEqual([]);
  });
  it('stops at the block limit and cuts long text', () => {
    const roots: Spec[] = Array.from({ length: 5 }, () => ({ tag: 'p', text: EN_TEXT + ' ' + 'x '.repeat(200) }));
    const r = read(roots, 'en', 3);
    expect(r.blocks).toHaveLength(3);
    expect(r.blocks[0]?.text.length).toBe(240);
  });
  it('numbers elements of the same tag even when they are not blocks', () => {
    const r = read([{ tag: 'p', text: 'Short' }, { tag: 'p', text: EN_TEXT }]);
    expect(r.blocks[0]?.id).toBe('p[1]');
  });
  it('with no lang on the page the language is empty', () => {
    expect(read([{ tag: 'p', text: EN_TEXT }], '').pageLang).toBe('');
  });
});
