import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseLanguage, localisedPairs, inspectTranslationPairs,
  inspectUserCopy, htmlLanguage, htmlTextContent,
  inspectHtmlLocale, translationCoverage, inspectKeyedCatalogue,
  flattenMessages, placeholders, isCatalogueName,
} from './locale-audit.mjs';

const codes = (issues) => issues.map((issue) => issue.code);

test('baseLanguage accepts English and French locales', () => {
  assert.equal(baseLanguage('en-CA'), 'en');
  assert.equal(baseLanguage('fr-CA'), 'fr');
  assert.equal(baseLanguage('es'), null);
});

test('localisedPairs finds nested locale values', () => {
  const pairs = localisedPairs({ ui: { callout: { en: 'Open', fr: 'Ouvrir' } } });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].pointer, '/ui/callout');
});

test('paired strings with nonempty values pass', () => {
  assert.deepEqual(inspectTranslationPairs(
    { ui: { en: 'Map', fr: 'Carte' } }, 'labels.json'), []);
});

test('missing French translation fails', () => {
  const issues = inspectTranslationPairs({ heading: { en: 'Place' } }, 'labels.json');
  assert.ok(codes(issues).includes('TRANSLATION_MISSING'));
});

test('missing English translation fails', () => {
  const issues = inspectTranslationPairs({ heading: { fr: 'Lieu' } }, 'labels.json');
  assert.ok(codes(issues).includes('TRANSLATION_MISSING'));
});

test('empty French translation fails', () => {
  const issues = inspectTranslationPairs({ heading: { en: 'Place', fr: '' } }, 'labels.json');
  assert.ok(codes(issues).includes('TRANSLATION_EMPTY'));
});

test('wrong translation value type fails', () => {
  const issues = inspectTranslationPairs({ heading: { en: 'Place', fr: 20 } }, 'labels.json');
  assert.ok(codes(issues).includes('TRANSLATION_TYPE'));
});

test('unsupported copy overclaim fails in English', () => {
  assert.ok(codes(inspectUserCopy('Guaranteed access', 'en', 'labels.json'))
    .includes('COPY_OVERCLAIM'));
});

test('unsupported copy overclaim fails in French', () => {
  assert.ok(codes(inspectUserCopy('Lieu vérifié', 'fr', 'labels.json'))
    .includes('COPY_OVERCLAIM'));
});

test('neutral language passes', () => {
  assert.deepEqual(inspectUserCopy('Status unknown', 'en', 'labels.json'), []);
  assert.deepEqual(inspectUserCopy('Statut inconnu', 'fr', 'labels.json'), []);
});

test('French straight apostrophe fails', () => {
  assert.ok(codes(inspectUserCopy("l'entrée", 'fr', 'labels.json'))
    .includes('FR_APOSTROPHE'));
});

test('French typographic apostrophe passes', () => {
  assert.deepEqual(inspectUserCopy('l’entrée', 'fr', 'labels.json'), []);
});

test('French colon without NBSP fails', () => {
  assert.ok(codes(inspectUserCopy('Lieu : inconnu', 'fr', 'labels.json'))
    .includes('FR_COLON_SPACE'));
});

test('French colon with NBSP passes', () => {
  assert.deepEqual(inspectUserCopy('Lieu\u00a0: inconnu', 'fr', 'labels.json'), []);
});

test('French question mark without narrow NBSP fails', () => {
  assert.ok(codes(inspectUserCopy('Où ?', 'fr', 'labels.json'))
    .includes('FR_NARROW_SPACE'));
});

test('French question mark with narrow NBSP passes', () => {
  assert.deepEqual(inspectUserCopy('Où\u202f?', 'fr', 'labels.json'), []);
});

test('French guillemets without narrow space fail', () => {
  assert.ok(codes(inspectUserCopy('«Entrée»', 'fr', 'labels.json'))
    .includes('FR_GUILLEMET_OPEN'));
  assert.ok(codes(inspectUserCopy('«Entrée»', 'fr', 'labels.json'))
    .includes('FR_GUILLEMET_CLOSE'));
});

test('French guillemets with narrow spaces pass', () => {
  assert.deepEqual(inspectUserCopy('«\u202fEntrée\u202f»', 'fr', 'labels.json'), []);
});

test('HTML language is read from the document root', () => {
  assert.equal(htmlLanguage('<html lang="fr-CA"><head></head></html>'), 'fr');
});

test('HTML text drops script and style content', () => {
  assert.equal(htmlTextContent(
    '<script>ignore</script><style>ignore</style><p>Hello</p>'), 'Hello');
});

test('HTML copy check catches unsupported claims', () => {
  assert.ok(codes(inspectHtmlLocale(
    '<html lang="en"><body><p>Guaranteed</p></body></html>', 'index.html'))
    .includes('COPY_OVERCLAIM'));
});

test('HTML copy check does not flag a valid French question', () => {
  assert.deepEqual(inspectHtmlLocale(
    '<html lang="fr"><body><p>Où\u202f?</p></body></html>', 'fr/index.html'), []);
});

test('unsupported element lang is rejected', () => {
  assert.ok(codes(inspectHtmlLocale(
    '<html lang="en"><span lang="xx">Text</span></html>', 'index.html'))
    .includes('UNSUPPORTED_LANG'));
});

test('duplicate locale alternate links are rejected', () => {
  const html = '<html lang="en"><link rel="alternate" hreflang="fr" href="/fr">' +
    '<link rel="alternate" hreflang="fr-CA" href="/fr-ca"></html>';
  assert.ok(codes(inspectHtmlLocale(html, 'index.html')).includes('LOCALE_DUPLICATE'));
});

test('translation coverage counts missing and complete pairs', () => {
  assert.deepEqual(translationCoverage({
    first: { en: 'One', fr: 'Un' }, second: { en: 'Two' },
  }), { total: 2, complete: 1, missing: 1 });
});

test('keyed catalogue accepts matching EN/FR keys', () => {
  assert.deepEqual(inspectKeyedCatalogue({
    en: { home: { heading: 'Welcome {name}' } },
    fr: { home: { heading: 'Bienvenue {name}' } },
  }, 'messages.json'), []);
});

test('keyed catalogue rejects missing language', () => {
  assert.ok(codes(inspectKeyedCatalogue({ en: { a: 'A' } }, 'messages.json'))
    .includes('CATALOGUE_LANG'));
});

test('keyed catalogue rejects missing message key', () => {
  assert.ok(codes(inspectKeyedCatalogue({
    en: { a: 'A', b: 'B' }, fr: { a: 'Un' },
  }, 'messages.json')).includes('CATALOGUE_KEY'));
});

test('keyed catalogue rejects differing placeholders', () => {
  assert.ok(codes(inspectKeyedCatalogue({
    en: { a: '{name} arrived' }, fr: { a: '{person} arrive' },
  }, 'messages.json')).includes('CATALOGUE_PLACEHOLDER'));
});

test('keyed catalogue rejects empty messages', () => {
  assert.ok(codes(inspectKeyedCatalogue({
    en: { a: 'A' }, fr: { a: '  ' },
  }, 'messages.json')).includes('CATALOGUE_EMPTY'));
});

test('flattenMessages handles nested message keys', () => {
  assert.deepEqual([...flattenMessages({ page: { heading: 'Title' } })],
    [['page.heading', 'Title']]);
});

test('placeholders deduplicate and sort names', () => {
  assert.deepEqual(placeholders('{b} {a} {b}'), ['a', 'b']);
});

test('only specifically named catalogues receive keyed-language checks', () => {
  assert.equal(isCatalogueName('locales/messages.json'), true);
  assert.equal(isCatalogueName('data/places.json'), false);
});
