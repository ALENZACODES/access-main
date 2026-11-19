import { describe, expect, it } from 'vitest';
import { containsForbiddenOrg } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { AGE_BAND_MESSAGES } from './ageBands';
import { ANNOUNCE_MESSAGES } from './announce';
import { scanCopy } from './copyLint';
import { lintFrench } from './i18n';
import { checkParity, createTranslator, fill, isSeparatorKey, placeholders, type Messages } from './localText';
import { MANIFEST_MESSAGES } from './manifest';
import { MARKDOWN_MESSAGES } from './markdownReport';
import { WORKLOAD_MESSAGES } from './workload';
import { EXPORT_EXTRAS_MESSAGES } from './exportExtras';
import { GLANCE_MESSAGES } from './glance';
import { LICENCE_BREAKDOWN_MESSAGES } from './licenceBreakdown';
import { REMEDY_MESSAGES } from './remedies';
import { SELF_CHECK_MESSAGES } from './selfCheck';
import { TOC_MESSAGES } from './toc';
import { SOURCE_DETAIL_MESSAGES } from './sourceDetail';
import { TABLES_CSV_MESSAGES } from './tablesCsv';
import { TIER_MESSAGES } from './tiers';
import { RECORD_FACT_MESSAGES } from './recordFacts';
import { FACTS_CSV_MESSAGES } from './factsCsv';
import { GLOSSARY_MESSAGES } from './glossary';
import { TEXT_SUMMARY_MESSAGES } from './textSummary';
import { QUICK_FILTER_MESSAGES } from './quickFilters';
import { STATUS_BY_TIER_MESSAGES } from './statusByTier';
import { ACTIVE_FILTER_MESSAGES } from './activeFilters';
import { NO_MATCH_MESSAGES } from './noMatchHints';
import * as extras from './extras';

const TABLES: readonly [string, Messages<string>][] = [
  ['workload', WORKLOAD_MESSAGES],
  ['ageBands', AGE_BAND_MESSAGES],
  ['manifest', MANIFEST_MESSAGES],
  ['announce', ANNOUNCE_MESSAGES],
  ['markdownReport', MARKDOWN_MESSAGES],
  ['exportExtras', EXPORT_EXTRAS_MESSAGES],
  ['glance', GLANCE_MESSAGES],
  ['licenceBreakdown', LICENCE_BREAKDOWN_MESSAGES],
  ['remedies', REMEDY_MESSAGES],
  ['selfCheck', SELF_CHECK_MESSAGES],
  ['toc', TOC_MESSAGES],
  ['sourceDetail', SOURCE_DETAIL_MESSAGES],
  ['tablesCsv', TABLES_CSV_MESSAGES],
  ['tiers', TIER_MESSAGES],
  ['recordFacts', RECORD_FACT_MESSAGES],
  ['factsCsv', FACTS_CSV_MESSAGES],
  ['glossary', GLOSSARY_MESSAGES],
  ['textSummary', TEXT_SUMMARY_MESSAGES],
  ['quickFilters', QUICK_FILTER_MESSAGES],
  ['statusByTier', STATUS_BY_TIER_MESSAGES],
  ['activeFilters', ACTIVE_FILTER_MESSAGES],
  ['noMatchHints', NO_MATCH_MESSAGES],
];

describe('fill and placeholders', () => {
  it('replaces named parts and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 1, b: 'x' })).toBe('1 and x');
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(fill('no parts')).toBe('no parts');
    expect(fill('{a}{a}', { a: 'z' })).toBe('zz');
  });
  it('does not treat braces that are not names as parts', () => {
    expect(fill('{ }{1}{}', { 1: 'x' })).toBe('{ }{1}{}');
  });
  it('lists names once, in order of first use', () => {
    expect(placeholders('{b} {a} {b}')).toEqual(['b', 'a']);
    expect(placeholders('none')).toEqual([]);
  });
});

describe('createTranslator', () => {
  const messages: Messages<'hi' | 'n.one' | 'n.other'> = {
    en: { hi: 'Hi {name}', 'n.one': '{n} item', 'n.other': '{n} items' },
    fr: { hi: 'Salut {name}', 'n.one': '{n} élément', 'n.other': '{n} éléments' },
  };
  const tx = createTranslator(messages);
  it('looks up and fills', () => {
    expect(tx('en', 'hi', { name: 'Ana' })).toBe('Hi Ana');
    expect(tx('fr', 'hi', { name: 'Ana' })).toBe('Salut Ana');
  });
  it('picks the plural form by the language rule, where French treats 0 and 1 as singular', () => {
    expect(tx.count('en', 'n', 0)).toBe('0 items');
    expect(tx.count('en', 'n', 1)).toBe('1 item');
    expect(tx.count('fr', 'n', 0)).toBe('0 élément');
    expect(tx.count('fr', 'n', 1)).toBe('1 élément');
    expect(tx.count('fr', 'n', 2)).toBe('2 éléments');
  });
  it('lets an explicit parameter override the count', () => {
    expect(tx.count('en', 'n', 2, { n: 'two' })).toBe('two items');
  });
  it('lists its keys', () => {
    expect(tx.keys().sort()).toEqual(['hi', 'n.one', 'n.other']);
  });
});

describe('isSeparatorKey', () => {
  it('recognises separator keys only', () => {
    expect(isSeparatorKey('wl.sep')).toBe(true);
    expect(isSeparatorKey('an.join')).toBe(true);
    expect(isSeparatorKey('an.sentence')).toBe(true);
    expect(isSeparatorKey('wl.separate')).toBe(false);
    expect(isSeparatorKey('sep')).toBe(false);
  });
  it('lets a separator be only spaces but not an ordinary message', () => {
    expect(checkParity({ en: { 'a.sep': ' ' }, fr: { 'a.sep': ' ' } })).toEqual([]);
    expect(checkParity({ en: { a: ' ' }, fr: { a: ' ' } })).toEqual(['empty text: a']);
  });
});

describe('checkParity', () => {
  it('is empty for matching tables', () => {
    expect(checkParity({ en: { a: 'x {n}' }, fr: { a: 'y {n}' } })).toEqual([]);
  });
  it('finds a missing key, different placeholders and empty text', () => {
    expect(checkParity({ en: { a: 'x', b: 'y' }, fr: { a: 'x' } } as never)).toEqual(['missing fr: b']);
    expect(checkParity({ en: { a: 'x' }, fr: { a: 'x', c: 'z' } } as never)).toEqual(['missing en: c']);
    expect(checkParity({ en: { a: 'x {n}' }, fr: { a: 'x' } })).toEqual(['placeholders differ: a (en {n} / fr {})']);
    expect(checkParity({ en: { a: ' ' }, fr: { a: 'x' } })).toEqual(['empty text: a']);
  });
});

describe.each(TABLES)('%s message table', (_name, table) => {
  it('has the same keys and placeholders in English and French', () => {
    expect(checkParity(table)).toEqual([]);
  });
  it('has a plural pair (.one and .other) wherever a count is used', () => {
    for (const lang of ['en', 'fr'] as const) {
      const keys = Object.keys(table[lang]);
      for (const k of keys.filter((x) => x.endsWith('.one'))) expect(keys, `${lang} ${k}`).toContain(k.replace(/\.one$/, '.other'));
      for (const k of keys.filter((x) => x.endsWith('.other'))) expect(keys, `${lang} ${k}`).toContain(k.replace(/\.other$/, '.one'));
    }
  });
  it('passes the shared wording rules in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, text] of Object.entries(table[lang])) expect(scanCopy(text), `${lang} ${key}`).toEqual([]);
    }
  });
  it('names none of the organisations the App is unbranded from', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, text] of Object.entries(table[lang])) expect(containsForbiddenOrg(text), `${lang} ${key}`).toBe(false);
    }
  });
  it('follows French typography', () => {
    for (const [key, text] of Object.entries(table.fr)) expect(lintFrench(fillAll(text)), key).toEqual([]);
  });
  it('uses the typographic apostrophe in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, text] of Object.entries(table[lang])) expect(text, `${lang} ${key}`).not.toContain("'");
    }
  });
  it('has no leading or trailing space except the deliberate separators', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, text] of Object.entries(table[lang])) {
        if (isSeparatorKey(key)) continue;
        expect(text, `${lang} ${key}`).toBe(text.trim());
      }
    }
  });
  it('does not leave a rule-breaking claim when read with sample values filled in', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, text] of Object.entries(table[lang])) expect(scanCopy(fillAll(text)), `${lang} ${key}`).toEqual([]);
    }
  });
});

/** Fill every placeholder with a short neutral value so the text reads as a sentence. */
function fillAll(text: string): string {
  const params: Record<string, string> = {};
  for (const name of placeholders(text)) params[name] = name === 'filename' ? 'a.txt' : '3';
  return fill(text, params);
}

describe('extras barrel', () => {
  it('exports the public functions of every round-7 module', () => {
    for (const name of [
      'fill',
      'createTranslator',
      'buildWorkload',
      'renderWorkloadHtml',
      'buildAgeDistribution',
      'renderAgeBandsHtml',
      'buildManifest',
      'verifyManifest',
      'describeList',
      'createAnnouncer',
      'buildMarkdownReport',
      'escapeMarkdown',
      'buildActions',
      'renderActionsHtml',
      'glanceSentences',
      'renderGlanceHtml',
      'buildLicenceBreakdown',
      'renderLicenceBreakdownHtml',
      'buildChecksumFile',
      'buildMarkdownFile',
    ]) {
      expect(typeof (extras as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
