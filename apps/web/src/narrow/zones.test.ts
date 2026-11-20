import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { NBSP, NNBSP } from './types.js';
import {
  CELLS,
  COLS,
  ROWS,
  allCells,
  busiestText,
  busiestZones,
  cellName,
  checkZones,
  colOf,
  controlName,
  markedCount,
  ZONE_PRESETS,
  noCells,
  outcomeOf,
  presetCells,
  rowOf,
  toggleCell,
  whyText,
  zoneCounts,
  zoneNote,
  zoneNotes,
  zoneSummary,
  zonesText,
  type ZoneCheck,
} from './zones.js';
import type { ZoneControl, ZoneFacts } from './zones-inpage.js';

/** A window of 300 by 400: columns of 100, rows of 100. */
const W = 300;
const H = 400;
const ctl = (name: string, cx: number, cy: number, pinned = false): ZoneControl => ({ id: `button[${name}]`, name, left: cx - 22, top: cy - 22, width: 44, height: 44, pinned });
const facts = (controls: ZoneControl[], more: Partial<ZoneFacts> = {}): ZoneFacts => ({ controls, viewportWidth: W, viewportHeight: H, scrollY: 0, maxScrollY: 0, offPage: 0, truncated: false, ...more });
const cells = (...on: number[]): boolean[] => noCells().map((_, i) => on.includes(i));
const result = (c: ZoneCheck) => {
  if (c.kind !== 'result') throw new Error(c.kind);
  return c.result;
};

describe('the grid', () => {
  it('has 3 columns and 4 rows, numbered from the top left', () => {
    expect([COLS, ROWS, CELLS]).toEqual([3, 4, 12]);
    expect([rowOf(0), colOf(0), rowOf(11), colOf(11), rowOf(4), colOf(4)]).toEqual([0, 0, 3, 2, 1, 1]);
  });

  it('names each zone by row and column, in both languages', () => {
    expect(cellName(0, 'en')).toBe('Top, left');
    expect(cellName(4, 'en')).toBe('Upper middle, centre');
    expect(cellName(11, 'en')).toBe('Bottom, right');
    expect(cellName(9, 'fr')).toBe('Bas, gauche');
    expect(cellName(5, 'fr')).toBe('Mi-haut, droite');
    const names = Array.from({ length: CELLS }, (_, i) => cellName(i, 'fr'));
    expect(new Set(names).size).toBe(CELLS);
  });

  it('switches one zone at a time, and counts the marked ones', () => {
    const one = toggleCell(noCells(), 10);
    expect(markedCount(one)).toBe(1);
    expect(one[10]).toBe(true);
    expect(markedCount(toggleCell(one, 10))).toBe(0);
    expect(toggleCell(one, 40)).toEqual(one);
    expect(markedCount(allCells())).toBe(CELLS);
  });
});

describe('presetCells', () => {
  const on = (cells: boolean[]): number[] => cells.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

  it('marks the bottom half, the left column or the right column', () => {
    expect(ZONE_PRESETS).toEqual(['bottom', 'left', 'right']);
    expect(on(presetCells('bottom'))).toEqual([6, 7, 8, 9, 10, 11]);
    expect(on(presetCells('left'))).toEqual([0, 3, 6, 9]);
    expect(on(presetCells('right'))).toEqual([2, 5, 8, 11]);
  });

  it('names its zones in the barrier line', () => {
    expect(zoneNote(presetCells('left'), 'en')).toBe('Screen zones I can reach: Top, left; Upper middle, left; Lower middle, left; Bottom, left (4 of 12).');
  });
});

describe('outcomeOf', () => {
  it('puts a control that stays in place in the zone of its centre', () => {
    const o = outcomeOf(ctl('Menu', 250, 50, true), cells(2), W, H, 0, 1000);
    expect(o).toMatchObject({ col: 2, cell: 2, rows: [0], reachable: true, why: null });
    const off = outcomeOf(ctl('Menu', 250, 50, true), cells(11), W, H, 0, 1000);
    expect(off).toMatchObject({ cell: 2, reachable: false, why: 'pinned' });
  });

  it('brings a control that scrolls into any marked row its page can scroll it to, in its own column', () => {
    // Its centre is 50 pixels down the page. With 1000 pixels to scroll it can only go up, so only the top row is open to it.
    expect(outcomeOf(ctl('Top link', 50, 50), cells(9), W, H, 0, 1000)).toMatchObject({ reachable: false, why: 'scroll-range' });
    expect(outcomeOf(ctl('Top link', 50, 50), cells(0, 9), W, H, 0, 1000)).toMatchObject({ reachable: true, rows: [0] });
    // 900 pixels down the page, scrolled by 600 now: it can sit anywhere from -100 to 900 in the window.
    expect(outcomeOf(ctl('Lower', 150, 300), cells(1, 4, 7, 10), W, H, 600, 1000)).toMatchObject({ reachable: true, rows: [0, 1, 2, 3] });
  });

  it('counts a control at the very top of a page that cannot scroll only where it is', () => {
    expect(outcomeOf(ctl('Here', 50, 350), cells(9), W, H, 0, 0)).toMatchObject({ reachable: true, rows: [3] });
    expect(outcomeOf(ctl('Here', 50, 350), cells(0, 3, 6), W, H, 0, 0)).toMatchObject({ reachable: false, why: 'scroll-range' });
  });

  it('never moves a control sideways', () => {
    expect(outcomeOf(ctl('Right', 280, 200), cells(0, 1, 3, 4, 6, 7, 9, 10), W, H, 0, 5000)).toMatchObject({ col: 2, reachable: false, why: 'column' });
  });

  it('says when a control sits past the edge of the window, or stays in place outside it', () => {
    expect(outcomeOf(ctl('Wide', 340, 100), allCells(), W, H, 0, 0)).toMatchObject({ reachable: false, why: 'beside' });
    expect(outcomeOf(ctl('Under', 100, 450, true), allCells(), W, H, 0, 0)).toMatchObject({ reachable: false, why: 'off-screen', cell: null });
  });

  it('counts the centre of a control on a line between two zones in the zone after the line', () => {
    expect(outcomeOf(ctl('Line', 100, 100, true), cells(4), W, H, 0, 0)).toMatchObject({ cell: 4, reachable: true });
  });
});

describe('checkZones', () => {
  it('is UNKNOWN with no window size, and with no zone marked', () => {
    expect(checkZones(facts([], { viewportWidth: null }), allCells()).kind).toBe('no-size');
    expect(checkZones(facts([], { viewportHeight: null }), allCells()).kind).toBe('no-size');
    expect(checkZones(facts([ctl('A', 50, 50)]), noCells()).kind).toBe('no-zone');
  });

  it('keeps every control, and lists apart those out of reach, in page order', () => {
    const r = result(checkZones(facts([ctl('A', 50, 350), ctl('B', 250, 350), ctl('C', 250, 50, true)], { maxScrollY: 0 }), cells(9, 10)));
    expect(r.outcomes.map((o) => o.control.name)).toEqual(['A', 'B', 'C']);
    expect(r.out.map((o) => [o.control.name, o.why])).toEqual([
      ['B', 'column'],
      ['C', 'pinned'],
    ]);
    expect([r.marked, r.width, r.height, r.truncated]).toEqual([2, W, H, false]);
  });

  it('brings every control into reach when every zone is marked, except those beside the window or fixed outside it', () => {
    const r = result(checkZones(facts([ctl('A', 50, 50), ctl('B', 250, 380, true), ctl('Past', 400, 10)], { maxScrollY: 2000 }), allCells()));
    expect(r.out.map((o) => o.control.name)).toEqual(['Past']);
  });
});

describe('zoneSummary', () => {
  it('says how many zones were marked, for which window, and how many controls are out of reach', () => {
    const c = checkZones(facts([ctl('A', 50, 350), ctl('B', 250, 350)]), cells(9, 10));
    expect(zoneSummary(c, 'en')).toEqual([
      'You marked 2 of 12 zones. Counted for this window, 300 by 400 CSS pixels. Another size or zoom moves the controls.',
      'Of 2 controls, 1 can be brought into a zone you marked, by scrolling if needed, and 1 cannot.',
    ]);
  });

  it('says when all can be reached, when there is none, and when the page was read in part', () => {
    expect(zoneSummary(checkZones(facts([ctl('A', 50, 350)]), cells(9)), 'en')[1]).toBe('The one control of this page can be brought into a zone you marked, by scrolling if needed.');
    expect(zoneSummary(checkZones(facts([ctl('A', 50, 350), ctl('B', 60, 300)]), cells(9)), 'en')[1]).toBe('All 2 controls of this page can be brought into a zone you marked, by scrolling if needed.');
    expect(zoneSummary(checkZones(facts([ctl('A', 50, 350), ctl('B', 60, 300)]), cells(9)), 'fr')[1]).toBe('Les 2 commandes de cette page peuvent être amenées dans une zone cochée, en faisant défiler au besoin.');
    expect(zoneSummary(checkZones(facts([]), cells(9)), 'en')[1]).toBe('No visible control was found on this page.');
    expect(zoneSummary(checkZones(facts([], { truncated: true }), cells(9)), 'en')[2]).toBe('The page is long and only part of it was read, so the rest is UNKNOWN.');
  });

  it('says how many controls sit off the page until they take focus, and leaves them out', () => {
    const one = zoneSummary(checkZones(facts([ctl('A', 50, 350)], { offPage: 1 }), cells(9)), 'en');
    expect(one[2]).toBe('1 control sits off the page until it takes focus, like a skip link. It was left out.');
    const two = zoneSummary(checkZones(facts([ctl('A', 50, 350)], { offPage: 2 }), cells(9)), 'en');
    expect(two[2]).toBe('2 controls sit off the page until they take focus, like a skip link. They were left out.');
    for (const n of [1, 2]) {
      const fr = zoneSummary(checkZones(facts([ctl('A', 50, 350)], { offPage: n }), cells(9)), 'fr')[2] ?? '';
      expect(frTypographyIssues(fr), fr).toEqual([]);
    }
    expect(zoneSummary(checkZones(facts([ctl('A', 50, 350)], { offPage: 1 }), cells(9)), 'fr')[2]).toBe('1 commande est placée hors de la page jusqu’à ce qu’elle reçoive le focus, comme un lien d’évitement. Elle est laissée de côté.');
  });

  it('says UNKNOWN when nothing could be counted', () => {
    expect(zoneSummary({ kind: 'no-size' }, 'en')).toEqual(['Window size UNKNOWN, so the zones cannot be placed. Nothing was counted.']);
    expect(zoneSummary({ kind: 'no-zone' }, 'en')).toEqual(['No zone is marked. The result stays UNKNOWN.']);
  });

  it('says it in French, with French typography', () => {
    const lines = [
      ...zoneSummary(checkZones(facts([ctl('A', 50, 350), ctl('B', 250, 350), ctl('C', 250, 340)], { truncated: true }), cells(9)), 'fr'),
      ...zoneSummary(checkZones(facts([ctl('A', 50, 350), ctl('B', 250, 350)]), cells(9)), 'fr'),
      ...zoneSummary(checkZones(facts([ctl('A', 50, 350)]), cells(9, 10)), 'fr'),
      ...zoneSummary(checkZones(facts([]), cells(9)), 'fr'),
      ...zoneSummary({ kind: 'no-size' }, 'fr'),
      ...zoneSummary({ kind: 'no-zone' }, 'fr'),
    ];
    expect(lines).toContain('Sur 3 commandes, 1 peut être amenée dans une zone cochée, en faisant défiler au besoin, et 2 ne le peuvent pas.');
    expect(lines).toContain('Sur 2 commandes, 1 peut être amenée dans une zone cochée, en faisant défiler au besoin, et 1 ne le peut pas.');
    expect(lines).toContain('La seule commande de cette page peut être amenée dans une zone cochée, en faisant défiler au besoin.');
    expect(lines).toContain('Vous avez coché 2 zones sur 12. Le compte vaut pour cette fenêtre de 300 sur 400 pixels CSS. Une autre taille ou un autre zoom déplace les commandes.');
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('whyText and controlName', () => {
  it('gives one sentence for each reason', () => {
    const r = result(checkZones(facts([ctl('Col', 250, 350), ctl('Pin', 50, 50, true), ctl('Range', 50, 50), ctl('Out', 50, 900, true), ctl('Side', 500, 50)], { maxScrollY: 0 }), cells(9)));
    expect(r.out.map((o) => whyText(o, 'en'))).toEqual([
      'In the right column, where no zone is marked.',
      'Stays in place, at Top, left, when the page scrolls.',
      'The page does not scroll far enough to bring it into a marked zone of its column.',
      'Stays in place outside the window.',
      'Sits beside the window, past its edge.',
    ]);
    for (const o of r.out) expect(frTypographyIssues(whyText(o, 'fr'))).toEqual([]);
    expect(r.out.map((o) => whyText(o, 'fr'))[0]).toBe('Dans la colonne de droite, où aucune zone n’est cochée.');
  });

  it('names a control with no name by what it is', () => {
    expect(controlName({ ...ctl('', 1, 1), id: 'a[3]' }, 'en')).toBe('no name (a[3])');
    expect(controlName({ ...ctl('', 1, 1), id: 'a[3]' }, 'fr')).toBe('sans nom (a[3])');
  });
});

describe('zoneNotes', () => {
  it('points to controls that stay in place and to controls in a column with no zone, in the singular and plural', () => {
    const one = zoneNotes(checkZones(facts([ctl('Pin', 50, 50, true), ctl('Col', 250, 350)]), cells(9)), 'en');
    expect(one.map((n) => n.text)).toEqual([
      '1 control out of reach stays in place when the page scrolls, so scrolling does not bring it closer. A version that scrolls with the page, or a copy at the bottom, could bring it within reach.',
      '1 control out of reach is in a column with no marked zone. Scrolling does not move sideways. Another zoom or a one-column layout may bring it closer.',
    ]);
    const two = zoneNotes(checkZones(facts([ctl('P1', 50, 50, true), ctl('P2', 60, 60, true)]), cells(9)), 'en');
    expect(two[0]?.text.startsWith('2 controls out of reach stay in place')).toBe(true);
  });

  it('has nothing to say when all can be reached, or nothing was counted', () => {
    expect(zoneNotes(checkZones(facts([ctl('A', 50, 350)]), cells(9)), 'en')).toEqual([]);
    expect(zoneNotes({ kind: 'no-zone' }, 'en')).toEqual([]);
  });

  it('says it in French, with French typography', () => {
    const all = [
      ...zoneNotes(checkZones(facts([ctl('Pin', 50, 50, true), ctl('Col', 250, 350)]), cells(9)), 'fr'),
      ...zoneNotes(checkZones(facts([ctl('P1', 50, 50, true), ctl('P2', 60, 60, true), ctl('C1', 250, 350), ctl('C2', 250, 300)]), cells(9)), 'fr'),
    ];
    expect(all).toHaveLength(4);
    for (const n of all) expect(frTypographyIssues(n.text), n.text).toEqual([]);
  });
});

describe('zoneNote', () => {
  it('lists the marked zones for the barrier text, and is empty when none is marked', () => {
    expect(zoneNote(cells(9, 10), 'en')).toBe('Screen zones I can reach: Bottom, left; Bottom, centre (2 of 12).');
    expect(zoneNote(cells(9, 10), 'fr')).toBe(`Zones de l’écran que j’atteins${NBSP}: Bas, gauche${NNBSP}; Bas, centre (2 sur 12).`);
    expect(frTypographyIssues(zoneNote(cells(9, 10), 'fr'))).toEqual([]);
    expect(zoneNote(noCells(), 'en')).toBe('');
  });
});

describe('zonesText', () => {
  it('holds the title, the zones, the summary, the notes, the controls and what it does not say', () => {
    const c = checkZones(facts([ctl('Menu', 250, 50, true), ctl('Go', 50, 350)]), cells(9));
    const lines = zonesText(c, cells(9), 'en').split('\n');
    expect(lines[0]).toBe('Screen zones I can reach');
    expect(lines[1]).toBe('Screen zones I can reach: Bottom, left (1 of 12).');
    expect(lines).toContain('Menu: Stays in place, at Top, right, when the page scrolls.');
    expect(lines.at(-2)).toBe('The zones are the ones the person marked, on this screen, today. The centre of each control is what counts.');
    expect(lines.at(-1)).toBe('');
  });

  it('stops listing after the limit, and has no zone line when none is marked', () => {
    const many = Array.from({ length: 5 }, (_, i) => ctl(`L${i}`, 250, 50 + i * 10));
    const text = zonesText(checkZones(facts(many), cells(9)), cells(9), 'en', 2);
    expect(text).toContain('L1: In the right column, where no zone is marked.\n… and 3 more.');
    expect(zonesText({ kind: 'no-zone' }, noCells(), 'en').split('\n')[1]).toBe('No zone is marked. The result stays UNKNOWN.');
  });

  it('says it in French, with French typography on every line', () => {
    const c = checkZones(facts([ctl('Menu', 250, 50, true), ctl('Go', 250, 350)]), cells(9));
    const text = zonesText(c, cells(9), 'fr');
    expect(text).toContain(`Menu${NBSP}: Reste en place, zone Haut, droite, quand la page défile.`);
    for (const l of text.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('zoneCounts and busiestZones', () => {
  it('counts, for each zone, the controls that can be brought into it, whatever was marked', () => {
    // A control that stays in place at the top right, one that scrolls in the left column from the top of a long page, and one past the edge.
    const f = facts([ctl('Menu', 250, 50, true), ctl('Go', 50, 350), ctl('Past', 400, 50)], { maxScrollY: 1000 });
    expect(zoneCounts(f)).toEqual([1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
    expect(busiestZones(zoneCounts(f))).toEqual({ cells: [0, 2, 3, 6, 9], count: 1 });
  });

  it('gives the same counts however far the page was scrolled when it was read', () => {
    const top = facts([ctl('A', 50, 50), ctl('B', 150, 350)], { maxScrollY: 600 });
    const down = facts([ctl('A', 50, -250), ctl('B', 150, 50)], { scrollY: 300, maxScrollY: 600 });
    expect(zoneCounts(down)).toEqual(zoneCounts(top));
  });

  it('is null with no window size, and has no busiest zone with no control', () => {
    expect(zoneCounts(facts([ctl('A', 1, 1)], { viewportHeight: null }))).toBeNull();
    expect(busiestZones(null)).toBeNull();
    expect(busiestZones(zoneCounts(facts([])))).toBeNull();
  });

  it('names the zone that can take the most controls, or says UNKNOWN', () => {
    const f = facts([ctl('A', 50, 350), ctl('B', 60, 300), ctl('C', 250, 350)]);
    expect(busiestText(f, 'en')).toBe('The zone that can take the most controls: Bottom, left, with 2 of 3.');
    expect(busiestText(f, 'fr')).toBe(`La zone qui peut recevoir le plus de commandes${NBSP}: Bas, gauche, avec 2 sur 3.`);
    const tie = facts([ctl('A', 50, 350), ctl('C', 250, 350)]);
    expect(busiestText(tie, 'en')).toBe('The zones that can take the most controls: Bottom, left; Bottom, right, with 1 of 2.');
    expect(busiestText(tie, 'fr')).toBe(`Les zones qui peuvent recevoir le plus de commandes${NBSP}: Bas, gauche${NNBSP}; Bas, droite, avec 1 sur 2.`);
    expect(busiestText(facts([]), 'en')).toBe('Most useful zone UNKNOWN.');
    for (const t of [busiestText(f, 'fr'), busiestText(tie, 'fr'), busiestText(facts([]), 'fr')]) expect(frTypographyIssues(t), t).toEqual([]);
  });

  it('goes into the copied text when what was read is given', () => {
    const f = facts([ctl('A', 50, 350)]);
    expect(zonesText(checkZones(f, cells(9)), cells(9), 'en', 40, f)).toContain('The zone that can take the most controls: Bottom, left, with 1 of 1.');
    expect(zonesText(checkZones(f, cells(9)), cells(9), 'en')).not.toContain('most controls');
  });
});
