import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditLocaleMarkup, LOCALE_MARKUP_RULES } from './localemarkup.js';
import { SAMPLE_LOCALE_MARKUP_HTML } from './samples.js';

const page = (o: { htmlAttrs?: string; head?: string; body?: string } = {}): string =>
  `<!doctype html><html${o.htmlAttrs ?? ' lang="en"'}><head><meta charset="utf-8">${o.head ?? ''}<title>Help</title></head><body>${o.body ?? '<main><h1>Help</h1></main>'}</body></html>`;
const found = (html: string): string[] => auditLocaleMarkup(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('bdo', () => {
  it('fails a bdo with no direction and shows its text', () => {
    const e = auditLocaleMarkup('<p>Code <bdo>abc</bdo></p>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['bdo-no-dir', 'fail', 'bdo@L1']]);
    expect(e[0]?.message.en).toContain('(“abc”)');
    expect(found('<bdo dir="">abc</bdo>')).toEqual(['bdo-no-dir:fail']);
  });
  it('passes a bdo with a direction, and leaves bdi alone', () => {
    expect(found('<bdo dir="rtl">abc</bdo><bdi>abc</bdi>')).toEqual([]);
  });
});

describe('empty lang', () => {
  it('asks about an empty lang on a part of the page', () => {
    const e = auditLocaleMarkup('<p lang="">XK-42</p>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['lang-empty', 'unknown', 'p@L1']]);
    expect(found('<span lang="  ">x</span>')).toEqual(['lang-empty:unknown']);
  });
  it('leaves the html element to static-html, and real codes alone', () => {
    expect(found(page({ htmlAttrs: ' lang=""' }))).toEqual([]);
    expect(found('<p lang="fr">Bonjour</p><p lang="fr-CA">Allô</p>')).toEqual([]);
  });
});

describe('content-language', () => {
  it('asks when the meta names another language than the html element, and shows both', () => {
    const e = auditLocaleMarkup(page({ head: '<meta http-equiv="Content-Language" content="fr">' })).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['content-language-mismatch', 'unknown', 'meta@L1']]);
    expect(e[0]?.message.en).toContain('says “fr” and the html element says “en”');
    expect(e[0]?.message.fr).toContain('indique «\u202Ffr\u202F» et l’élément html indique «\u202Fen\u202F»');
  });
  it('compares the language only, and accepts a list that holds the page language', () => {
    expect(found(page({ htmlAttrs: ' lang="fr-CA"', head: '<meta http-equiv="content-language" content="fr">' }))).toEqual([]);
    expect(found(page({ head: '<meta http-equiv="content-language" content="fr, en-CA">' }))).toEqual([]);
    expect(found(page({ head: '<meta http-equiv="content-language" content="EN_ca">' }))).toEqual([]);
  });
  it('does not ask when the page has no lang, or the meta is empty', () => {
    expect(found(page({ htmlAttrs: '', head: '<meta http-equiv="content-language" content="fr">' }))).toEqual([]);
    expect(found(page({ head: '<meta http-equiv="content-language" content="">' }))).toEqual([]);
  });
});

describe('translate', () => {
  it('asks when translation is off for the whole page, on html, body or main', () => {
    for (const html of [page({ htmlAttrs: ' lang="en" translate="no"' }), '<body translate="no"><p>x</p></body>', '<main translate="NO"><p>x</p></main>']) {
      expect(found(html), html).toEqual(['translate-off-page:unknown']);
    }
    expect(auditLocaleMarkup('<body translate="no"><p>x</p></body>').entries[0]?.message.en).toContain('(translate="no" on body)');
  });
  it('asks about a notranslate meta', () => {
    const e = auditLocaleMarkup(page({ head: '<meta name="google" content="notranslate">' })).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['translate-off-page', 'unknown', 'meta@L1']]);
    expect(e[0]?.message.en).toContain('(a notranslate meta)');
    expect(e[0]?.message.fr).toContain('(un meta notranslate)');
  });
  it('does not ask about translation switched off on a name, an address or a code', () => {
    expect(found('<p>Go to <span translate="no">Rue Sainte-Catherine</span></p><code translate="no">XK-42</code><p translate="yes">x</p><p translate="">y</p><p translate>z</p>')).toEqual([]);
  });
  it('fails a value that is not yes or no', () => {
    const e = auditLocaleMarkup('<p translate="never">Brand</p>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['translate-invalid:fail']);
    expect(e[0]?.message.en).toContain('“never”');
    expect(found('<body translate="false"><p>x</p></body>')).toEqual(['translate-invalid:fail']);
    expect(found('<p translate="off">x</p>')).toEqual(['translate-invalid:fail']);
  });
});

describe('the result', () => {
  it('finds nothing on an ordinary page', () => {
    expect(auditLocaleMarkup(page({ htmlAttrs: ' lang="fr-CA"', body: '<main><h1>Aide</h1><p lang="en">Help</p></main>' }))).toEqual({ checked: 0, entries: [] });
  });
  it('counts what it read', () => {
    expect(auditLocaleMarkup(page({ head: '<meta http-equiv="content-language" content="en">', body: '<p><bdo dir="rtl">x</bdo> <span translate="no">Y</span></p>' })).checked).toBe(3);
  });
  it('keeps the order of the file', () => {
    const e = auditLocaleMarkup('<p lang="">a</p>\n<bdo>b</bdo>\n<p translate="x">c</p>').entries;
    expect(e.map((x) => x.id)).toEqual(['p@L1', 'bdo@L2', 'p@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditLocaleMarkup(SAMPLE_LOCALE_MARKUP_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...LOCALE_MARKUP_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'bdo-no-dir' || x.rule === 'translate-invalid' ? 'fail' : 'unknown');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<bdo', '<p lang=', '<meta http-equiv="content-language"', '<html translate']) expect(() => auditLocaleMarkup(html)).not.toThrow();
  });
});
