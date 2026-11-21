import { describe, expect, it } from 'vitest';
import { PART_TITLES, SUMMARY_PARTS, doneCount, notDoneText, requestText, summaryDate, summaryItems, summaryStatus, accessSummaryText, type SummaryLines } from './access-summary.js';
import { frTypographyIssues } from './i18n.js';
import { NBSP } from './types.js';

const NONE: SummaryLines = { tap: '', zones: '', press: '' };
const ALL: SummaryLines = {
  tap: 'Smallest button size I tap well: 56 px.',
  zones: 'Screen zones I can reach: Bottom, left; Bottom, centre (2 of 12).',
  press: 'My presses (touch): held from 120 ms to 640 ms; at least 300 ms between presses.',
};
const WHEN = new Date(2026, 10, 20, 11, 30);

describe('summaryItems', () => {
  it('keeps the order of the parts, with their titles, and null for a part not done', () => {
    const items = summaryItems({ ...NONE, zones: ALL.zones }, 'en');
    expect(items).toEqual([
      { part: 'tap', title: 'Button size for my taps', line: null },
      { part: 'zones', title: 'Screen zones I can reach', line: ALL.zones },
      { part: 'press', title: 'How I press', line: null },
    ]);
    expect(doneCount(items)).toBe(1);
  });

  it('takes a line of only spaces as not done, and gives the French titles', () => {
    expect(summaryItems({ ...NONE, tap: '   ' }, 'en')[0]?.line).toBeNull();
    expect(summaryItems(NONE, 'fr').map((i) => i.title)).toEqual(['Taille des boutons pour mes touchers', 'Zones de l’écran que j’atteins', 'Ma façon d’appuyer']);
    expect(SUMMARY_PARTS).toEqual(['tap', 'zones', 'press']);
    for (const p of SUMMARY_PARTS) expect(frTypographyIssues(PART_TITLES[p].fr)).toEqual([]);
  });
});

describe('summaryStatus and notDoneText', () => {
  it('says how many parts are done, and UNKNOWN for the rest', () => {
    expect(summaryStatus(summaryItems(NONE, 'en'), 'en')).toBe('No part is done yet. Take one of the tests above, then come back here.');
    expect(summaryStatus(summaryItems({ ...NONE, tap: ALL.tap }, 'en'), 'en')).toBe('1 of 3 parts done. The others stay UNKNOWN.');
    expect(summaryStatus(summaryItems(ALL, 'en'), 'en')).toBe('All 3 parts are done.');
    expect(notDoneText('en')).toBe('UNKNOWN, not done yet.');
  });

  it('says it in French, with French typography', () => {
    const lines = [
      summaryStatus(summaryItems(NONE, 'fr'), 'fr'),
      summaryStatus(summaryItems({ ...NONE, tap: ALL.tap }, 'fr'), 'fr'),
      summaryStatus(summaryItems({ ...ALL, press: '' }, 'fr'), 'fr'),
      summaryStatus(summaryItems(ALL, 'fr'), 'fr'),
      notDoneText('fr'),
    ];
    expect(lines).toEqual([
      'Aucune partie n’est encore faite. Faites un des tests plus haut, puis revenez ici.',
      '1 partie faite sur 3. Les autres restent UNKNOWN.',
      '2 parties faites sur 3. Les autres restent UNKNOWN.',
      'Les 3 parties sont faites.',
      'UNKNOWN, pas encore fait.',
    ]);
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('summaryDate', () => {
  it('writes the day, the month in words and the year', () => {
    expect(summaryDate(WHEN, 'en')).toBe('20 November 2026');
    expect(summaryDate(WHEN, 'fr')).toBe('20 novembre 2026');
    expect(summaryDate(new Date(2027, 0, 3), 'fr')).toBe('3 janvier 2027');
  });
});

describe('accessSummaryText', () => {
  it('lists each part, with UNKNOWN for those not done, the date, and what the text is not', () => {
    expect(accessSummaryText(summaryItems({ ...ALL, press: '' }, 'en'), 'en', WHEN)).toBe(
      [
        'My access summary',
        'Measured on 20 November 2026, on this screen.',
        ALL.tap,
        ALL.zones,
        'How I press: UNKNOWN, not done yet.',
        'These come from tests taken on this screen, in this way of pressing, on that day. They say nothing about my health.',
        '',
      ].join('\n'),
    );
  });

  it('leaves the date out when there is none', () => {
    expect(accessSummaryText(summaryItems(NONE, 'en'), 'en').split('\n')[1]).toBe('Button size for my taps: UNKNOWN, not done yet.');
  });

  it('says it in French, with French typography on every line', () => {
    const text = accessSummaryText(summaryItems(NONE, 'fr'), 'fr', WHEN);
    expect(text.split('\n').slice(0, 3)).toEqual(['Mon résumé d’accès', 'Mesuré le 20 novembre 2026, sur cet écran.', `Taille des boutons pour mes touchers${NBSP}: UNKNOWN, pas encore fait.`]);
    for (const l of text.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('requestText', () => {
  it('is empty when nothing was measured', () => {
    expect(requestText(summaryItems(NONE, 'en'), 'en')).toBe('');
  });

  it('asks only for what was measured, in a list that reads well', () => {
    expect(requestText(summaryItems({ ...NONE, tap: ALL.tap }, 'en'), 'en')).toBe(
      'Hello, your site would be easier for me to use with buttons large enough for my taps. Could you allow for this? My measures are attached. Thank you.',
    );
    expect(requestText(summaryItems({ ...NONE, tap: ALL.tap, press: ALL.press }, 'en'), 'en')).toContain('with buttons large enough for my taps and controls that allow for the way I press.');
    expect(requestText(summaryItems(ALL, 'en'), 'en')).toContain(
      'with buttons large enough for my taps, controls within the screen zones I can reach and controls that allow for the way I press.',
    );
  });

  it('says nothing about the person and makes no demand', () => {
    const text = requestText(summaryItems(ALL, 'en'), 'en').toLowerCase();
    for (const word of ['disab', 'injur', 'health', 'condition', 'must', 'required', 'law', 'legal']) expect(text, word).not.toContain(word);
    const fr = requestText(summaryItems(ALL, 'fr'), 'fr').toLowerCase();
    for (const word of ['handicap', 'blessure', 'santé', 'doit', 'obligatoire', 'loi']) expect(fr, word).not.toContain(word);
  });

  it('says it in French, with French typography', () => {
    const fr = requestText(summaryItems(ALL, 'fr'), 'fr');
    expect(fr).toBe(
      `Bonjour, votre site me serait plus facile à utiliser avec des boutons assez grands pour mes touchers, les commandes à portée des zones que j’atteins et des commandes qui tiennent compte de ma façon d’appuyer. Pourriez-vous en tenir compte\u202F? Mes mesures sont jointes. Merci.`,
    );
    expect(frTypographyIssues(fr)).toEqual([]);
  });
});
