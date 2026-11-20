import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { COVERED_SHARE, LONG_PAGE, MAIN_FAR, LONG_STRETCH, buildScroll, placeKind, placeName, screensText, screensTo, scrollNotes, scrollSummary, scrollText, type ScrollCheck } from './scroll-effort.js';
import type { ScrollFacts, ScrollHeading } from './scroll-inpage.js';
import { NBSP } from './types.js';

/** A window of 400 by 1000, so one screen is 1000 pixels with no bars. */
const head = (text: string, top: number, level = 2): ScrollHeading => ({ level, text, top, inMain: true });
const facts = (more: Partial<ScrollFacts> = {}): ScrollFacts => ({
  viewportWidth: 400,
  viewportHeight: 1000,
  pageHeight: 3000,
  headings: [head('Title', 20, 1), head('Hours', 900), head('Getting there', 2500)],
  submits: [],
  lastControl: { name: 'Contact', top: 2900 },
  toTop: 0,
  coveredTop: 0,
  coveredBottom: 0,
  ...more,
});
const model = (c: ScrollCheck) => {
  if (c.kind !== 'model') throw new Error(c.kind);
  return c.model;
};

describe('screensTo', () => {
  it('is 0 on the first screen, and counts up to the next tenth of a screen after it', () => {
    expect(screensTo(0, 1000, 0, 0)).toBe(0);
    expect(screensTo(999, 1000, 0, 0)).toBe(0);
    expect(screensTo(1000, 1000, 0, 0)).toBe(0.1);
    expect(screensTo(1500, 1000, 0, 0)).toBe(0.6);
    expect(screensTo(2999, 1000, 0, 0)).toBe(2);
    expect(screensTo(3000, 1000, 0, 0)).toBe(2.1);
  });

  it('counts in the part of the window that fixed bars leave free', () => {
    // A bar of 200 at the top and 300 at the bottom leave 500 free, and the free part ends at 700.
    expect(screensTo(650, 1000, 200, 300)).toBe(0);
    expect(screensTo(1700, 1000, 200, 300)).toBe(2.1);
  });
});

describe('buildScroll', () => {
  it('is UNKNOWN with no window size, and when bars cover the whole window', () => {
    expect(buildScroll(facts({ viewportHeight: null })).kind).toBe('no-size');
    expect(buildScroll(facts({ viewportWidth: null })).kind).toBe('no-size');
    expect(buildScroll(facts({ coveredTop: 600, coveredBottom: 400 })).kind).toBe('covered');
  });

  it('gives the page in screens, the places in page order, and the longest stretch with no heading', () => {
    const m = model(buildScroll(facts({ submits: [{ name: 'Send', top: 2600 }] })));
    expect([m.width, m.height, m.usable, m.pageScreens, m.coveredShare, m.headings, m.toTop]).toEqual([400, 1000, 1000, 3, 0, 3, 0]);
    expect(m.places.map((p) => [p.kind, p.name, p.screens])).toEqual([
      ['heading', 'Title', 0],
      ['heading', 'Hours', 0],
      ['heading', 'Getting there', 1.6],
      ['submit', 'Send', 1.7],
      ['last', 'Contact', 2],
    ]);
    expect(m.stretch).toEqual({ screens: 1.6, endsAt: 'Getting there' });
  });

  it('counts the stretch after the last heading, up to the end of the page', () => {
    expect(model(buildScroll(facts({ pageHeight: 9000 }))).stretch).toEqual({ screens: 6.5, endsAt: null });
  });

  it('counts the whole page as one stretch when it has no heading', () => {
    const m = model(buildScroll(facts({ headings: [], pageHeight: 4500 })));
    expect(m.stretch).toEqual({ screens: 4.5, endsAt: null });
    expect(m.headings).toBe(0);
  });

  it('works out the share of the window the bars cover, and uses the rest for screens', () => {
    const m = model(buildScroll(facts({ coveredTop: 150, coveredBottom: 100 })));
    expect([m.usable, m.coveredShare, m.pageScreens]).toEqual([750, 0.25, 4]);
  });
});

describe('screensText', () => {
  it('says the first screen, or how many screens down, in both languages', () => {
    expect(screensText(0, 'en')).toBe('on the first screen');
    expect(screensText(1, 'en')).toBe('1 screen down');
    expect(screensText(2.5, 'en')).toBe('2.5 screens down');
    expect(screensText(0, 'fr')).toBe('sur le premier écran');
    expect(screensText(1.5, 'fr')).toBe(`1,5${NBSP}écran plus bas`);
    expect(screensText(2.5, 'fr')).toBe(`2,5${NBSP}écrans plus bas`);
  });
});

describe('scrollSummary', () => {
  it('gives the size of the page, its headings and the longest stretch, and how far the last control is', () => {
    expect(scrollSummary(buildScroll(facts()), 'en')).toEqual([
      'The page is 3 screens tall, in this window of 400 by 1000 CSS pixels.',
      'It has 3 headings. The longest stretch with no heading is 1.6 screens.',
      'The first heading of the main content is on the first screen.',
      'The last control is 2 screens down.',
    ]);
  });

  it('says how much the bars leave free, and when there is no heading or no control', () => {
    const lines = scrollSummary(buildScroll(facts({ headings: [], lastControl: null, coveredTop: 100 })), 'en');
    expect(lines).toEqual(['The page is 3.3 screens tall, in this window of 400 by 1000 CSS pixels, of which 900 are left free between fixed bars.', 'The page has no heading to jump from one part to the next.']);
  });

  it('says UNKNOWN when nothing could be counted', () => {
    expect(scrollSummary({ kind: 'no-size' }, 'en')).toEqual(['Window size UNKNOWN, so nothing was counted.']);
    expect(scrollSummary({ kind: 'covered' }, 'en')).toEqual(['Fixed bars cover the whole window, so the page cannot be read by scrolling. The effort is UNKNOWN.']);
  });

  it('says it in French, with French typography', () => {
    const lines = [
      ...scrollSummary(buildScroll(facts()), 'fr'),
      ...scrollSummary(buildScroll(facts({ headings: [head('Seul', 0)], coveredTop: 100, pageHeight: 900, lastControl: { name: 'A', top: 10 } })), 'fr'),
      ...scrollSummary(buildScroll(facts({ headings: [] })), 'fr'),
      ...scrollSummary({ kind: 'no-size' }, 'fr'),
      ...scrollSummary({ kind: 'covered' }, 'fr'),
    ];
    expect(lines[0]).toBe(`La page fait 3${NBSP}écrans de haut, dans cette fenêtre de 400 sur 1000 pixels CSS.`);
    expect(lines).toContain('La dernière commande est sur le premier écran.');
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('scrollNotes', () => {
  it('has nothing to point to on a short page with headings close together', () => {
    expect(scrollNotes(buildScroll(facts()), 'en')).toEqual([]);
    expect(scrollNotes({ kind: 'no-size' }, 'en')).toEqual([]);
  });

  it('points to a long page, a long stretch with no heading and no way back to the top', () => {
    const notes = scrollNotes(buildScroll(facts({ pageHeight: (LONG_PAGE + 1) * 1000 })), 'en');
    expect(notes.map((n) => n.kind)).toEqual(['long-page', 'long-stretch', 'no-to-top']);
    expect(notes[1]?.text).toBe('A stretch of 6.5 screens has no heading, up to the end of the page. Headings let a person jump from part to part without scrolling through all of it.');
    const named = scrollNotes(buildScroll(facts({ headings: [head('Start', 0), head('End', 5000)], pageHeight: 5200, toTop: 1 })), 'en');
    expect(named.map((n) => n.text)).toEqual(['A stretch of 5 screens has no heading, up to “End”. Headings let a person jump from part to part without scrolling through all of it.']);
  });

  it('points to a page with no heading, bars that cover a quarter of the window or more, and send buttons far down', () => {
    const notes = scrollNotes(buildScroll(facts({ headings: [], coveredTop: 150, coveredBottom: 100, submits: [{ name: 'Send', top: 4000 }], toTop: 1 })), 'en');
    expect(notes.map((n) => n.kind)).toEqual(['no-headings', 'covered', 'submit-far']);
    expect(notes[1]?.text).toBe('Fixed bars cover 25% of the window. Each screen shows less of the page, so it takes more scrolling, above all at a large zoom.');
    expect(notes[2]?.text).toBe('A send button is more than 3 screens from the top. A shorter form, or one in steps, shortens the way.');
    const two = scrollNotes(buildScroll(facts({ submits: [{ name: 'A', top: 5000 }, { name: 'B', top: 6000 }], pageHeight: 6500 })), 'en');
    expect(two.find((n) => n.kind === 'submit-far')?.text.startsWith('2 send buttons are')).toBe(true);
  });

  it('does not point to bars below the share, nor to a missing back-to-top link on a short page', () => {
    const share = COVERED_SHARE * 1000 - 10;
    expect(scrollNotes(buildScroll(facts({ coveredTop: share })), 'en').map((n) => n.kind)).not.toContain('covered');
    expect(scrollNotes(buildScroll(facts({ pageHeight: 3000 })), 'en').map((n) => n.kind)).not.toContain('no-to-top');
    expect(LONG_STRETCH).toBe(3);
  });

  it('says every note in French, with French typography', () => {
    const notes = [
      ...scrollNotes(buildScroll(facts({ pageHeight: 12000, coveredTop: 300, submits: [{ name: 'Envoyer', top: 9000 }] })), 'fr'),
      ...scrollNotes(buildScroll(facts({ headings: [head('Début', 0), head('Fin', 5000)], pageHeight: 5200, submits: [{ name: 'A', top: 5000 }, { name: 'B', top: 5100 }] })), 'fr'),
      ...scrollNotes(buildScroll(facts({ headings: [] })), 'fr'),
    ];
    expect(new Set(notes.map((n) => n.kind))).toEqual(new Set(['long-page', 'long-stretch', 'covered', 'no-to-top', 'submit-far', 'no-headings']));
    expect(notes.find((n) => n.text.includes('Fin'))?.text).toBe(
      'Un passage de 5\u00A0écrans n’a aucun titre, jusqu’à «\u202FFin\u202F». Les titres permettent de sauter d’une partie à l’autre sans tout faire défiler.',
    );
    for (const n of notes) {
      expect(frTypographyIssues(n.text), n.text).toEqual([]);
      expect(n.text).not.toMatch(/\p{L}'\p{L}/u);
    }
  });
});

describe('the start of the main content', () => {
  it('is the first heading inside main, or null when no heading is in main', () => {
    const head2 = (text: string, top: number, inMain: boolean): ScrollHeading => ({ level: 2, text, top, inMain });
    expect(model(buildScroll(facts({ headings: [head2('Menu', 10, false), head2('Hours', 2500, true)] }))).mainStart).toBe(1.6);
    expect(model(buildScroll(facts({ headings: [head2('Menu', 10, false)] }))).mainStart).toBeNull();
  });

  it('is pointed out when it starts more than a screen down, in both languages', () => {
    const far = buildScroll(facts({ headings: [{ level: 2, text: 'Menu', top: 10, inMain: false }, { level: 1, text: 'Places', top: 2500, inMain: true }] }));
    const en = scrollNotes(far, 'en').find((n) => n.kind === 'main-far');
    expect(en?.text).toBe('The main content starts 1.6 screens down. What comes before it is scrolled past on every visit, unless there is a skip link or a shorter top part.');
    const fr = scrollNotes(far, 'fr').find((n) => n.kind === 'main-far');
    expect(fr?.text).toBe('Le contenu principal commence 1,6\u00A0écran plus bas. Ce qui le précède se fait défiler à chaque visite, sauf avec un lien d’évitement ou une partie du haut plus courte.');
    expect(frTypographyIssues(fr?.text ?? '')).toEqual([]);
    expect(scrollSummary(far, 'fr')).toContain('Le premier titre du contenu principal est 1,6\u00A0écran plus bas.');
    const near = buildScroll(facts({ headings: [{ level: 1, text: 'Places', top: 1500, inMain: true }] }));
    expect(scrollNotes(near, 'en').map((n) => n.kind)).not.toContain('main-far');
    expect(MAIN_FAR).toBe(1);
  });
});

describe('placeKind and placeName', () => {
  it('names each kind of place, and a place with no name', () => {
    const m = model(buildScroll(facts({ submits: [{ name: '', top: 10 }] })));
    expect(m.places.map((p) => placeKind(p, 'en'))).toEqual(['Send button', 'Heading, level 1', 'Heading, level 2', 'Heading, level 2', 'Last control']);
    expect(m.places.map((p) => placeKind(p, 'fr'))[0]).toBe('Bouton d’envoi');
    const unnamed = m.places[0];
    expect(unnamed && placeName(unnamed, 'en')).toBe('no name');
    expect(unnamed && placeName(unnamed, 'fr')).toBe('sans nom');
  });
});

describe('scrollText', () => {
  it('holds the title, the summary, the notes, each place and what a screen is', () => {
    const lines = scrollText(buildScroll(facts({ pageHeight: 9500 })), 'en').split('\n');
    expect(lines[0]).toBe('Scroll effort');
    expect(lines).toContain('Heading, level 2: Getting there, 1.6 screens down');
    expect(lines).toContain('Last control: Contact, 2 screens down');
    expect(lines.at(-2)).toBe('A screen is the part of the window that fixed bars leave free. How far one scroll goes differs from device to device.');
  });

  it('stops listing after the limit, and has no places when nothing was counted', () => {
    expect(scrollText(buildScroll(facts()), 'en', 2)).toContain('… and 2 more.');
    expect(scrollText({ kind: 'no-size' }, 'en').split('\n')).toHaveLength(4);
  });

  it('says it in French, with French typography on every line', () => {
    const text = scrollText(buildScroll(facts({ pageHeight: 9500 })), 'fr');
    expect(text).toContain(`Titre de niveau 2${NBSP}: Getting there, 1,6${NBSP}écran plus bas`);
    for (const l of text.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
