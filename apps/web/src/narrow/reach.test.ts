import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { ReachFacts, ReachLandmark, ReachStop } from './reach-inpage.js';
import {
  LANDMARK_LABELS,
  LONG_TO_MAIN,
  MAX_INTERVAL,
  MIN_INTERVAL,
  SKIP_WITHIN,
  buildReach,
  findSkip,
  findStops,
  pressesViaSkip,
  reachNotes,
  reachSummary,
  reachText,
  readInterval,
  scanSeconds,
  secondsText,
  stopName,
} from './reach.js';
import { NBSP } from './types.js';

const stop = (name: string, landmark: ReachLandmark = 'none', jump?: { to: number; main?: boolean; lands?: boolean }): ReachStop => ({
  id: `a[${name}]`,
  tag: 'a',
  name,
  landmark,
  jumpTo: jump ? jump.to : null,
  jumpsToMain: jump?.main ?? false,
  jumpLands: jump?.lands ?? false,
});
const facts = (stops: ReachStop[], more: Partial<ReachFacts> = {}): ReachFacts => ({ stops, invisible: 0, positive: 0, truncated: false, ...more });

/** A page with a skip link, eight links in the navigation and three controls in main. */
function sitePage(withSkip = true): ReachFacts {
  const nav = Array.from({ length: 8 }, (_, i) => stop(`Menu ${i + 1}`, 'navigation'));
  const main = [stop('Search', 'main'), stop('Results', 'main'), stop('Help', 'main')];
  const foot = [stop('Contact', 'contentinfo')];
  const head = withSkip ? [stop('Skip to content', 'banner', { to: 9, main: true })] : [];
  return facts([...head, ...nav, ...main, ...foot]);
}

describe('findSkip', () => {
  it('finds a same-page link among the first stops that moves focus forward', () => {
    expect(findSkip(sitePage().stops)).toEqual({ at: 0, to: 9, toMain: true, lands: false });
  });

  it('ignores a link to the next stop, which saves nothing, and a link after the first few stops', () => {
    expect(findSkip([stop('Top', 'none', { to: 1 }), stop('Next')])).toBeNull();
    const late = [...Array.from({ length: SKIP_WITHIN }, (_, i) => stop(`L${i}`)), stop('Skip', 'none', { to: 8 }), ...Array.from({ length: 6 }, (_, i) => stop(`M${i}`))];
    expect(findSkip(late)).toBeNull();
  });

  it('is null on a page with no stops', () => {
    expect(findSkip([])).toBeNull();
  });
});

describe('pressesViaSkip', () => {
  it('counts the Tabs to the link, one Enter, and the Tabs after the place it points to', () => {
    const skip = { at: 0, to: 9, toMain: true, lands: false };
    expect(pressesViaSkip(skip, 9)).toBe(3);
    expect(pressesViaSkip(skip, 11)).toBe(5);
    expect(pressesViaSkip(skip, 8)).toBeNull();
  });

  it('needs no Tab after the Enter when the place can take focus itself', () => {
    expect(pressesViaSkip({ at: 1, to: 5, toMain: true, lands: true }, 5)).toBe(3);
    expect(pressesViaSkip({ at: 1, to: 5, toMain: true, lands: true }, 7)).toBe(5);
  });
});

describe('buildReach', () => {
  it('gives each stop its Tab presses, and the presses through the skip link when they are fewer', () => {
    const m = buildReach(sitePage());
    expect(m.stops.map((s) => s.direct)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(m.stops[9]).toMatchObject({ direct: 10, viaSkip: 3, best: 3 });
    expect(m.stops[12]).toMatchObject({ direct: 13, viaSkip: 6, best: 6 });
    expect(m.stops[3]).toMatchObject({ direct: 4, viaSkip: null, best: 4 });
  });

  it('keeps the direct count when the skip link would not save a press', () => {
    const page = facts([stop('Skip', 'banner', { to: 2, main: true }), stop('One', 'navigation'), stop('Two', 'main')]);
    const m = buildReach(page);
    expect(m.skip).not.toBeNull();
    expect(m.stops[2]).toMatchObject({ direct: 3, viaSkip: null, best: 3 });
  });

  it('lists each landmark once, in the order it is met, with its first stop and how many stops it holds', () => {
    const m = buildReach(sitePage());
    expect(m.landmarks.map((l) => [l.landmark, l.first.index, l.stops])).toEqual([
      ['banner', 0, 1],
      ['navigation', 1, 8],
      ['main', 9, 3],
      ['contentinfo', 12, 1],
    ]);
    expect(m.firstInMain?.index).toBe(9);
  });

  it('has no first stop in main when no stop is inside main', () => {
    expect(buildReach(facts([stop('A'), stop('B')])).firstInMain).toBeNull();
  });

  it('carries the counts of invisible and positive stops, and whether the page was cut', () => {
    const m = buildReach(facts([stop('A')], { invisible: 2, positive: 1, truncated: true }));
    expect([m.invisible, m.positive, m.truncated]).toEqual([2, 1, true]);
  });
});

describe('readInterval', () => {
  it('reads a point or a comma, and spaces around', () => {
    expect(readInterval(' 1.5 ', 'en')).toEqual({ ok: true, seconds: 1.5 });
    expect(readInterval('1,5', 'fr')).toEqual({ ok: true, seconds: 1.5 });
    expect(readInterval(String(MAX_INTERVAL), 'en')).toEqual({ ok: true, seconds: MAX_INTERVAL });
    expect(readInterval(String(MIN_INTERVAL), 'en')).toEqual({ ok: true, seconds: MIN_INTERVAL });
  });

  it('keeps an empty field as not given, so time stays UNKNOWN', () => {
    expect(readInterval('   ', 'en')).toEqual({ ok: true, seconds: null });
  });

  it('refuses text, signs, zero and values out of range, and says what to write', () => {
    for (const bad of ['abc', '-1', '0', '0.1', '11', '1.5s', '1..5', '1e2']) {
      const got = readInterval(bad, 'en');
      expect(got.ok, bad).toBe(false);
      if (!got.ok) expect(got.error).toBe('Write a number of seconds from 0.2 to 10, such as 1.5.');
    }
    const fr = readInterval('x', 'fr');
    expect(fr.ok).toBe(false);
    if (!fr.ok) {
      expect(fr.error).toBe('Écrivez un nombre de secondes entre 0,2 et 10, par exemple 1,5.');
      expect(frTypographyIssues(fr.error)).toEqual([]);
    }
  });
});

describe('scanSeconds and secondsText', () => {
  it('multiplies presses by the interval, to a tenth of a second', () => {
    expect(scanSeconds(13, 1.5)).toBe(19.5);
    expect(scanSeconds(3, 0.7)).toBe(2.1);
    expect(scanSeconds(13, null)).toBeNull();
  });

  it('says UNKNOWN with no time, seconds below a minute and minutes above', () => {
    expect(secondsText(null, 'en')).toBe('UNKNOWN');
    expect(secondsText(null, 'fr')).toBe('UNKNOWN');
    expect(secondsText(4, 'en')).toBe('4 s');
    expect(secondsText(19.5, 'en')).toBe('19.5 s');
    expect(secondsText(19.5, 'fr')).toBe(`19,5${NBSP}s`);
    expect(secondsText(95, 'en')).toBe('1 min 35 s');
    expect(secondsText(95, 'fr')).toBe(`1${NBSP}min 35${NBSP}s`);
  });
});

describe('reachSummary', () => {
  it('counts the stops, and the presses to main with and without the skip link', () => {
    expect(reachSummary(buildReach(sitePage()), null, 'en')).toEqual([
      'This page has 13 keyboard stops. Going from the first to the last takes 13 presses.',
      'The first control of the main content takes 10 presses from the top, or 3 presses with the skip link.',
    ]);
  });

  it('adds the scan time once an interval is given', () => {
    expect(reachSummary(buildReach(sitePage()), 1.5, 'en')[0]).toBe(
      'This page has 13 keyboard stops. Going from the first to the last takes 13 presses, or 19.5 s with a scan that steps every 1.5 s.',
    );
  });

  it('says UNKNOWN when no stop is in main, and speaks of one stop and one press in the singular', () => {
    expect(reachSummary(buildReach(facts([stop('Only')])), null, 'en')).toEqual([
      'This page has 1 keyboard stop. Going from the first to the last takes 1 press.',
      'Main content UNKNOWN. No stop is inside a main landmark.',
    ]);
  });

  it('says so when no control can be reached at all', () => {
    expect(reachSummary(buildReach(facts([])), 1, 'en')).toEqual(['No control of this page can be reached with the Tab key.']);
  });

  it('says it in French, with French typography', () => {
    const fr = reachSummary(buildReach(sitePage()), 1.5, 'fr');
    expect(fr).toEqual([
      `Cette page compte 13 arrêts au clavier. Passer de la première à la dernière demande 13 appuis, soit 19,5${NBSP}s avec un balayage d’un pas toutes les 1,5${NBSP}s.`,
      'La première commande du contenu principal demande 10 appuis depuis le haut, ou 3 appuis avec le lien d’évitement.',
    ]);
    for (const line of fr) expect(frTypographyIssues(line), line).toEqual([]);
    expect(reachSummary(buildReach(facts([stop('Seul')])), null, 'fr')).toEqual([
      'Cette page compte 1 arrêt au clavier. Passer de la première à la dernière demande 1 appui.',
      'Contenu principal UNKNOWN. Aucun arrêt ne se trouve dans un repère principal (main).',
    ]);
  });
});

describe('reachNotes', () => {
  it('has nothing to point to on a short page with a skip link to main', () => {
    expect(reachNotes(buildReach(sitePage()), 'en')).toEqual([]);
  });

  it('points to a long way to main, and to a missing skip link', () => {
    const notes = reachNotes(buildReach(sitePage(false)), 'en');
    expect(notes.map((n) => n.kind)).toEqual(['no-skip']);
    const nav = Array.from({ length: LONG_TO_MAIN + 2 }, (_, i) => stop(`Menu ${i}`, 'navigation'));
    const long = reachNotes(buildReach(facts([...nav, stop('Go', 'main')])), 'en');
    expect(long.map((n) => n.kind)).toEqual(['long-to-main', 'no-skip']);
    expect(long[0]?.text).toBe(`It takes ${LONG_TO_MAIN + 3} presses to reach the main content. Each press counts for a person who uses a switch. A skip link as the first stop shortens this path.`);
  });

  it('points to a skip link that leads elsewhere than main', () => {
    const page = facts([stop('Skip', 'banner', { to: 3, main: false }), stop('A'), stop('B'), stop('C', 'main')]);
    expect(reachNotes(buildReach(page), 'en').map((n) => n.kind)).toEqual(['skip-not-main']);
  });

  it('leaves the presses through a skip link UNKNOWN when the page has a positive tabindex, and says so', () => {
    const page = sitePage();
    const m = buildReach({ ...page, positive: 1 });
    expect(m.skip).not.toBeNull();
    expect(m.stops.every((s) => s.viaSkip === null && s.best === s.direct)).toBe(true);
    expect(reachNotes(m, 'en').map((n) => n.kind)).toEqual(['positive', 'skip-unknown']);
    expect(reachNotes(m, 'en')[1]?.text).toBe('With a positive tabindex on the page, the presses through the skip link are UNKNOWN. Only the presses from the top are counted.');
    expect(reachSummary(m, null, 'en')[1]).toBe('The first control of the main content takes 10 presses from the top.');
  });

  it('points to positive tabindex, controls with no size and a page read in part, in the singular and plural', () => {
    const one = reachNotes(buildReach(facts([stop('A', 'main')], { positive: 1, invisible: 1, truncated: true })), 'en');
    expect(one.map((n) => n.text)).toEqual([
      '1 control has a positive tabindex and comes before everything else, wherever it sits on the page.',
      '1 control can take focus with no size. Focus then seems to vanish, and each one still takes a press.',
      'The page is long and only part of it was read, so the counts are UNKNOWN beyond it.',
    ]);
    const two = reachNotes(buildReach(facts([stop('A', 'main')], { positive: 2, invisible: 3 })), 'en');
    expect(two.map((n) => n.text)).toEqual([
      '2 controls have a positive tabindex and come before everything else, wherever they sit on the page.',
      '3 controls can take focus with no size. Focus then seems to vanish, and each one still takes a press.',
    ]);
  });

  it('says every note in French, with French typography', () => {
    const nav = Array.from({ length: LONG_TO_MAIN + 2 }, (_, i) => stop(`Menu ${i}`, 'navigation'));
    const all = [
      ...reachNotes(buildReach(facts([...nav, stop('Go', 'main')], { positive: 1, invisible: 2, truncated: true })), 'fr'),
      ...reachNotes(buildReach(facts([stop('Skip', 'banner', { to: 3 }), stop('A'), stop('B'), stop('C', 'main')], { positive: 2, invisible: 1 })), 'fr'),
    ];
    expect(all.map((n) => n.kind)).toEqual(['long-to-main', 'no-skip', 'positive', 'invisible', 'truncated', 'skip-not-main', 'positive', 'skip-unknown', 'invisible']);
    for (const n of all) {
      expect(frTypographyIssues(n.text), n.text).toEqual([]);
      expect(n.text).not.toMatch(/'/);
    }
  });
});

describe('findStops and stopName', () => {
  it('finds stops by part of their name in any case, and keeps them all for empty text', () => {
    const m = buildReach(sitePage());
    expect(findStops(m, 'menu').map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(findStops(m, '  HELP ').map((s) => s.stop.name)).toEqual(['Help']);
    expect(findStops(m, '')).toHaveLength(13);
    expect(findStops(m, 'nothing like this')).toEqual([]);
  });

  it('names a stop with no name by what it is', () => {
    const m = buildReach(facts([{ ...stop(''), id: 'button[3]' }]));
    const s = m.stops[0];
    expect(s && stopName(s, 'en')).toBe('no name (button[3])');
    expect(s && stopName(s, 'fr')).toBe('sans nom (button[3])');
  });
});

describe('reachText', () => {
  it('holds the title, the summary, the notes, each stop and what the counts do not say', () => {
    const lines = reachText(buildReach(sitePage(false)), 2, 'en').split('\n');
    expect(lines.slice(0, 4)).toEqual([
      'Reaching controls by keyboard or switch',
      'This page has 12 keyboard stops. Going from the first to the last takes 12 presses, or 24 s with a scan that steps every 2 s.',
      'The first control of the main content takes 9 presses from the top.',
      '- No skip link was found among the first 3 stops.',
    ]);
    expect(lines).toContain('9. Search (Main content): 9 presses, 18 s');
    expect(lines.at(-2)).toBe('These counts start at the top of the page and go forward, one step at a time. They do not say whether the page is easy to use.');
    expect(lines.at(-1)).toBe('');
  });

  it('leaves the time out with no interval, and stops listing after the limit', () => {
    const text = reachText(buildReach(sitePage()), null, 'en', 2);
    expect(text).toContain('1. Skip to content (Top of the page): 1 press\n2. Menu 1 (Navigation): 2 presses\n… and 11 more.');
    expect(text).not.toMatch(/ s\n/);
  });

  it('says it in French, with French typography on every line', () => {
    const text = reachText(buildReach(sitePage()), 1, 'fr');
    expect(text).toContain(`11. Results (Contenu principal)${NBSP}: 4 appuis, 4${NBSP}s`);
    for (const line of text.split('\n')) expect(frTypographyIssues(line), line).toEqual([]);
  });
});

describe('LANDMARK_LABELS', () => {
  it('has a label in both languages for every landmark', () => {
    for (const [k, v] of Object.entries(LANDMARK_LABELS)) {
      expect(v.en, k).not.toBe('');
      expect(v.fr, k).not.toBe('');
      expect(frTypographyIssues(v.fr)).toEqual([]);
    }
  });
});
