import { describe, expect, it } from 'vitest';
import { englishInFrenchCatalog, englishInFrenchHtml, englishMessagesWithoutMarkers, englishWordsIn, ENGLISH_MARKERS, identicalToEnglish, missingTranslations, SAME_IN_BOTH, unfilledPlaceholders } from './untranslated';
import { EN, FR, type MessageKey } from './i18n';
import { handleDataStatus } from './http';
import { renderDataStatusPage } from './page';
import { auditRegistry } from './datasetRegistry';
import { renderCompletenessHtml, buildCompleteness } from './completeness';
import { renderBasisHtml } from './statusBasis';
import { explainSource } from './statusBasis';
import { randomRecords } from './fuzzKit';
import { RECORDS, NOW } from './testkit';

describe('catalogue', () => {
  it('has the same keys in English and French', () => expect(missingTranslations()).toEqual([]));

  it('has no French message that is just the English message', () => {
    expect(identicalToEnglish()).toEqual([]);
  });

  it('the allow-list only names real keys', () => {
    for (const k of SAME_IN_BOTH) expect(k in EN, k).toBe(true);
  });

  it('every allow-listed message really is the same in both languages (no stale entries)', () => {
    for (const k of SAME_IN_BOTH) expect(FR[k as MessageKey].trim(), k).toBe(EN[k as MessageKey].trim());
  });

  it('finds no English marker words in any French message', () => {
    expect(englishInFrenchCatalog()).toEqual([]);
  });

  it('the marker list can see English: nearly every long English message contains a marker', () => {
    expect(englishMessagesWithoutMarkers(8)).toEqual([]);
  });

  it('the marker list has no duplicate-sensitive French words', () => {
    // None of the markers may be a word the French catalogue uses on purpose.
    const frWords = new Set(Object.values(FR).flatMap((v) => v.replace(/\{\w+\}/g, ' ').toLowerCase().split(/[^a-zà-öø-ÿ]+/)));
    for (const m of ENGLISH_MARKERS) expect(frWords.has(m), `marker "${m}" appears in French copy`).toBe(false);
  });

  it('has no unfilled placeholders other than the documented ones in either language', () => {
    for (const k of Object.keys(EN) as MessageKey[]) {
      expect(unfilledPlaceholders(FR[k]), k).toEqual(unfilledPlaceholders(EN[k]));
    }
  });
});

describe('detectors', () => {
  it('englishWordsIn finds whole English words only, sorted and de-duplicated', () => {
    expect(englishWordsIn('The sources and the licence are unknown')).toEqual(['and', 'are', 'the', 'unknown']);
    expect(englishWordsIn('Theatre and others')).toEqual(['and']);
  });

  it('is case-insensitive and ignores punctuation', () => {
    expect(englishWordsIn('THE, "Unknown"!')).toEqual(['the', 'unknown']);
  });

  it('skips words the caller says are data', () => {
    expect(englishWordsIn('Source: the Update Feed', ['update', 'feed'])).toEqual(['the']);
  });

  it('does not flag French', () => {
    expect(englishWordsIn('Les sources sont possiblement périmées et la licence à examiner.')).toEqual([]);
  });

  it('flags a French sentence with one English word left in', () => {
    expect(englishWordsIn('La date de mise à jour est unknown.')).toEqual(['unknown']);
  });

  it('unfilledPlaceholders lists each marker once', () => {
    expect(unfilledPlaceholders('{name}: {date} {name} done')).toEqual(['{date}', '{name}']);
    expect(unfilledPlaceholders('nothing here')).toEqual([]);
  });

  it('englishInFrenchHtml ignores tags, styles and the data it is told about', () => {
    const html = '<style>.the{color:red}</style><p class="and">Lieux <b>Update Feed</b> inconnu</p>';
    expect(englishInFrenchHtml(html, ['Update Feed'])).toEqual([]);
    expect(englishInFrenchHtml(html)).toEqual(['update']);
  });
});

describe('rendered output', () => {
  const dataText = RECORDS.flatMap((r) => [r.name, ...r.sources.flatMap((s) => [s.name, s.source, s.licence])]).filter((x): x is string => typeof x === 'string' && x.length >= 4);

  it('the French page contains no English wording and no unfilled placeholder', () => {
    const html = renderDataStatusPage({ records: RECORDS, locale: 'fr', now: NOW });
    expect(englishInFrenchHtml(html, dataText)).toEqual([]);
    expect(unfilledPlaceholders(html.replace(/<style>[\s\S]*?<\/style>/, ''))).toEqual([]);
  });

  it('the English page has no unfilled placeholder either', () => {
    const html = renderDataStatusPage({ records: RECORDS, locale: 'en', now: NOW });
    expect(unfilledPlaceholders(html.replace(/<style>[\s\S]*?<\/style>/, ''))).toEqual([]);
  });

  it('the new sections are fully French', () => {
    const audit = auditRegistry(RECORDS, NOW);
    const html = renderBasisHtml(audit, 'fr') + renderCompletenessHtml(buildCompleteness(audit), 'fr');
    expect(englishInFrenchHtml(html, dataText)).toEqual([]);
  });

  it('every basis sentence is fully French, for stale, unknown and future dates', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const s of auditRegistry(randomRecords(seed, NOW), NOW).sources) {
        const text = explainSource(s, 'fr').text;
        expect(englishWordsIn(text), text).toEqual([]);
        expect(unfilledPlaceholders(text)).toEqual([]);
      }
    }
  });

  it('every route in French mentions no English words in its human-readable text', async () => {
    const ctx = { getRecords: () => Promise.resolve(RECORDS), now: () => NOW };
    for (const path of ['', '/credits.txt']) {
      const res = await handleDataStatus({ method: 'GET', url: `/fr/data-status${path}`, headers: {} }, ctx);
      const body = path === '' ? res!.body : res!.body.replace(/^.*$/m, '');
      expect(englishInFrenchHtml(body, dataText), path).toEqual([]);
    }
  });
});
