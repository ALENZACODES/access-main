import { describe, expect, it } from 'vitest';
import { PART_TITLES, SUMMARY_PARTS, doneCount, notDoneText, requestText, summaryDate, summaryItems, summaryStatus, accessSummaryText, type SummaryLines, type SummaryPart } from './access-summary.js';
import { frTypographyIssues } from './i18n.js';
import { NBSP } from './types.js';

const NONE: SummaryLines = { tap: '', zones: '', press: '' };
/** The first three parts, as the first panels give them. */
const FIRST: Required<Pick<SummaryLines, 'tap' | 'zones' | 'press'>> = {
  tap: 'Smallest button size I tap well: 56 px.',
  zones: 'Screen zones I can reach: Bottom, left; Bottom, centre (2 of 12).',
  press: 'My presses (touch): held from 120 ms to 640 ms; at least 300 ms between presses.',
};
const ALL: Required<SummaryLines> = {
  tools: 'What I use: a mouth stick and my voice.',
  ...FIRST,
  typing: 'My typing pace: about 120 characters a minute, 4 s a short field.',
  drag: 'Dragging: I cannot drag. I need another way to do it, with a single tap or click.',
  scan: 'Switch scanning: one by one, step by step, one press a step.',
  aim: 'Things that move: I take about 10 s to aim, and controls need to stay in place for that long.',
  hover: 'Hover: I cannot hover. Content shown only on hover is out of my reach.',
};
const only = (...parts: SummaryPart[]): SummaryLines => Object.fromEntries(parts.map((p) => [p, ALL[p]]));
const WHEN = new Date(2026, 10, 20, 11, 30);

describe('summaryItems', () => {
  it('keeps the order of the parts, with their titles, and null for a part not done', () => {
    const items = summaryItems({ ...NONE, zones: ALL.zones }, 'en');
    expect(items.slice(0, 4)).toEqual([
      { part: 'tools', title: 'What I use', line: null },
      { part: 'tap', title: 'Button size for my taps', line: null },
      { part: 'zones', title: 'Screen zones I can reach', line: ALL.zones },
      { part: 'press', title: 'How I press', line: null },
    ]);
    expect(items.map((i) => i.part)).toEqual(['tools', 'tap', 'zones', 'press', 'typing', 'drag', 'scan', 'aim', 'hover']);
    expect(doneCount(items)).toBe(1);
  });

  it('takes a part left out, or a line of only spaces, as not done', () => {
    expect(summaryItems({}, 'en').every((i) => i.line === null)).toBe(true);
    expect(summaryItems({ ...NONE, tap: '   ' }, 'en')[1]?.line).toBeNull();
  });

  it('gives every title in both languages, with French typography', () => {
    expect(SUMMARY_PARTS).toEqual(['tools', 'tap', 'zones', 'press', 'typing', 'drag', 'scan', 'aim', 'hover']);
    expect(summaryItems(NONE, 'fr').map((i) => i.title)).toEqual([
      'Ce que j’utilise',
      'Taille des boutons pour mes touchers',
      'Zones de l’écran que j’atteins',
      'Ma façon d’appuyer',
      'Mon rythme de saisie',
      'Glisser',
      'Mon balayage par contacteur',
      'Mon temps pour viser',
      'Survol',
    ]);
    for (const p of SUMMARY_PARTS) {
      expect(PART_TITLES[p].en, p).not.toBe('');
      expect(frTypographyIssues(PART_TITLES[p].fr)).toEqual([]);
    }
  });
});

describe('summaryStatus and notDoneText', () => {
  it('says how many parts are done, and UNKNOWN for the rest', () => {
    expect(summaryStatus(summaryItems(NONE, 'en'), 'en')).toBe('No part is done yet. Take one of the tests above, then come back here.');
    expect(summaryStatus(summaryItems(only('tap'), 'en'), 'en')).toBe('1 of 9 parts done. The others stay UNKNOWN.');
    expect(summaryStatus(summaryItems(ALL, 'en'), 'en')).toBe('All 9 parts are done.');
    expect(notDoneText('en')).toBe('UNKNOWN, not done yet.');
  });

  it('says it in French, with French typography', () => {
    const lines = [
      summaryStatus(summaryItems(NONE, 'fr'), 'fr'),
      summaryStatus(summaryItems(only('tap'), 'fr'), 'fr'),
      summaryStatus(summaryItems(only('tap', 'hover'), 'fr'), 'fr'),
      summaryStatus(summaryItems(ALL, 'fr'), 'fr'),
      notDoneText('fr'),
    ];
    expect(lines).toEqual([
      'Aucune partie n’est encore faite. Faites un des tests plus haut, puis revenez ici.',
      '1 partie faite sur 9. Les autres restent UNKNOWN.',
      '2 parties faites sur 9. Les autres restent UNKNOWN.',
      'Les 9 parties sont faites.',
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
    expect(accessSummaryText(summaryItems({ ...FIRST, press: '', hover: ALL.hover }, 'en'), 'en', WHEN)).toBe(
      [
        'My access summary',
        'Measured on 20 November 2026, on this screen.',
        'What I use: UNKNOWN, not done yet.',
        ALL.tap,
        ALL.zones,
        'How I press: UNKNOWN, not done yet.',
        'My typing pace: UNKNOWN, not done yet.',
        'Dragging: UNKNOWN, not done yet.',
        'How I scan with switches: UNKNOWN, not done yet.',
        'My time to aim: UNKNOWN, not done yet.',
        ALL.hover,
        'These come from tests taken on this screen, in this way of pressing, on that day. They say nothing about my health.',
        '',
      ].join('\n'),
    );
  });

  it('leaves the date out when there is none', () => {
    expect(accessSummaryText(summaryItems(NONE, 'en'), 'en').split('\n')[1]).toBe('What I use: UNKNOWN, not done yet.');
  });

  it('says it in French, with French typography on every line', () => {
    const text = accessSummaryText(summaryItems(NONE, 'fr'), 'fr', WHEN);
    expect(text.split('\n').slice(0, 3)).toEqual(['Mon résumé d’accès', 'Mesuré le 20 novembre 2026, sur cet écran.', `Ce que j’utilise${NBSP}: UNKNOWN, pas encore fait.`]);
    for (const l of text.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('requestText', () => {
  it('is empty when nothing was measured', () => {
    expect(requestText(summaryItems(NONE, 'en'), 'en')).toBe('');
  });

  it('asks only for what was measured, in a list that reads well', () => {
    expect(requestText(summaryItems(only('tap'), 'en'), 'en')).toBe(
      'Hello, your site would be easier for me to use with buttons large enough for my taps. Could you allow for this? My measures are attached. Thank you.',
    );
    expect(requestText(summaryItems(only('tap', 'press'), 'en'), 'en')).toContain('with buttons large enough for my taps and controls that allow for the way I press.');
    expect(requestText(summaryItems(FIRST, 'en'), 'en')).toContain(
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
    const fr = requestText(summaryItems(FIRST, 'fr'), 'fr');
    expect(fr).toBe(
      `Bonjour, votre site me serait plus facile à utiliser avec des boutons assez grands pour mes touchers, les commandes à portée des zones que j’atteins et des commandes qui tiennent compte de ma façon d’appuyer. Pourriez-vous en tenir compte\u202F? Mes mesures sont jointes. Merci.`,
    );
    expect(frTypographyIssues(fr)).toEqual([]);
  });
});

describe('requestText for the parts added later', () => {
  it('asks for what each one needs, in the order of the parts', () => {
    expect(requestText(summaryItems(only('typing', 'drag', 'scan', 'aim', 'hover'), 'en'), 'en')).toBe(
      'Hello, your site would be easier for me to use with enough time to type, or a way to extend a time limit, a way to do with a single tap what is done by dragging, the main action early in the order of the keyboard, controls that stay in place while I aim and the same content on focus and on tap as on hover. Could you allow for this? My measures are attached. Thank you.',
    );
  });

  it('leaves out a part that needs nothing from the site, and gives nothing when no part needs anything', () => {
    const items = summaryItems(only('tap', 'drag', 'hover'), 'en');
    expect(requestText(items, 'en', { drag: false, hover: false })).toBe(
      'Hello, your site would be easier for me to use with buttons large enough for my taps. Could you allow for this? My measures are attached. Thank you.',
    );
    expect(requestText(summaryItems(only('drag'), 'en'), 'en', { drag: false })).toBe('');
    expect(requestText(items, 'en', { drag: true })).toContain('by dragging and the same content on focus');
  });

  it('says it in French, with French typography, and still nothing about the person', () => {
    const fr = requestText(summaryItems(ALL, 'fr'), 'fr');
    expect(frTypographyIssues(fr)).toEqual([]);
    expect(fr).toContain('une façon de faire par un appui simple ce qui se fait en glissant');
    expect(fr).toContain('le même contenu au focus et au toucher qu’au survol');
    const en = requestText(summaryItems(ALL, 'en'), 'en').toLowerCase();
    for (const word of ['disab', 'injur', 'health', 'condition', 'must', 'required', 'law', 'legal']) expect(en, word).not.toContain(word);
    for (const word of ['handicap', 'blessure', 'santé', 'doit', 'obligatoire', 'loi']) expect(fr.toLowerCase(), word).not.toContain(word);
  });
});

describe('the part for what the person uses', () => {
  it('comes first, and asks for controls that work with it', () => {
    expect(summaryItems({ tools: ALL.tools }, 'en')[0]).toEqual({ part: 'tools', title: 'What I use', line: 'What I use: a mouth stick and my voice.' });
    expect(requestText(summaryItems({ tools: ALL.tools }, 'en'), 'en')).toBe(
      'Hello, your site would be easier for me to use with controls that work with what I use. Could you allow for this? My measures are attached. Thank you.',
    );
    expect(requestText(summaryItems({ tools: ALL.tools }, 'fr'), 'fr')).toContain('des commandes qui fonctionnent avec ce que j’utilise');
  });
});
