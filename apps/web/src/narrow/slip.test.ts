import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { DEFAULT_TAP, RISKY_WORDS, buildSlips, distanceToBox, pairText, riskyWord, slipAdvice, slipName, slipSummary, slipText, smallText } from './slip.js';
import type { SlipControl, SlipFacts } from './slip-inpage.js';
import { NBSP, NNBSP } from './types.js';

const ctl = (name: string, left: number, top: number, width = 44, height = 44): SlipControl => ({ id: `button[${name}]`, name, left, top, width, height });
const facts = (controls: SlipControl[], truncated = false): SlipFacts => ({ controls, truncated });

/** Save and Delete side by side with 4 pixels between, and Help far away. */
const PAGE = facts([ctl('Save', 0, 0), ctl('Delete', 48, 0), ctl('Help', 300, 300)]);

describe('riskyWord', () => {
  it('finds a risky word as a whole word, in any case, in English or French', () => {
    expect(riskyWord('Delete')).toBe('delete');
    expect(riskyWord('DELETE this place')).toBe('delete');
    expect(riskyWord('Sign out')).toBe('sign out');
    expect(riskyWord('Supprimer le lieu')).toBe('supprimer');
    expect(riskyWord('Se déconnecter')).toBe('se déconnecter');
    expect(riskyWord('Envoyer')).toBe('envoyer');
  });

  it('does not find a risky word inside another word, nor in an everyday name', () => {
    expect(riskyWord('Deleted items')).toBeNull();
    expect(riskyWord('Sender')).toBeNull();
    expect(riskyWord('Save')).toBeNull();
    expect(riskyWord('')).toBeNull();
    expect(RISKY_WORDS).toContain('annuler');
  });
});

describe('distanceToBox', () => {
  it('is 0 inside a box, and the shortest way to its edge outside', () => {
    const box = ctl('B', 10, 10, 20, 20);
    expect(distanceToBox(15, 15, box)).toBe(0);
    expect(distanceToBox(0, 15, box)).toBe(10);
    expect(distanceToBox(40, 20, box)).toBe(10);
    expect(distanceToBox(0, 0, box)).toBeCloseTo(Math.hypot(10, 10));
  });
});

describe('buildSlips', () => {
  it('finds a risky control reaching into the circle of a tap aimed at its neighbour, with the App minimum by default', () => {
    const m = buildSlips(PAGE, null);
    expect([m.tap, m.fromTest, m.controls, m.risky]).toEqual([DEFAULT_TAP, false, 3, 1]);
    // Aimed at the centre of Save (22, 22), Delete starts 26 pixels to the right: further than 22, so no slip at 44.
    expect(m.pairs).toEqual([]);
  });

  it('uses the person’s tap size, which can bring a neighbour into reach', () => {
    const m = buildSlips(PAGE, 72);
    expect([m.tap, m.fromTest]).toEqual([72, true]);
    expect(m.pairs.map((p) => [p.aimed.name, p.onto.name, p.word, p.distance])).toEqual([['Save', 'Delete', 'delete', 26]]);
  });

  it('never counts a control against itself, and lists the closest pairs first', () => {
    const m = buildSlips(facts([ctl('Cancel', 0, 0), ctl('Send', 46, 0), ctl('Edit', 0, 50)]), 100);
    // Edit is not risky, so nothing slips onto it; a tap aimed at Edit reaches both risky controls above it.
    expect(m.pairs.map((p) => `${p.aimed.name}>${p.onto.name}:${p.distance}`)).toEqual(['Cancel>Send:24', 'Send>Cancel:24', 'Edit>Cancel:28', 'Edit>Send:37']);
  });

  it('lists risky controls smaller than the tap size each way', () => {
    const m = buildSlips(facts([ctl('Delete', 0, 0, 24, 24), ctl('Remove', 200, 0, 44, 30), ctl('Cancel', 400, 0, 60, 60), ctl('Tiny', 600, 0, 10, 10)]), null);
    expect(m.smallRisky.map((c) => c.name)).toEqual(['Delete', 'Remove']);
  });

  it('takes a size of 0 or less as no test', () => {
    expect(buildSlips(PAGE, 0)).toMatchObject({ tap: DEFAULT_TAP, fromTest: false });
  });
});

describe('slipSummary', () => {
  it('says which tap size was used and why, how many controls are risky, and how many places may slip', () => {
    expect(slipSummary(buildSlips(PAGE, 72), 'en')).toEqual([
      'Tap size used: 72 px, from your tap test.',
      'Of 3 controls, 1 does something hard to take back.',
      'In 1 place, a tap aimed at one control may land on a risky one.',
    ]);
    expect(slipSummary(buildSlips(PAGE, null), 'en')).toEqual([
      'Tap size used: 44 px, the App’s minimum, since the tap test was not taken. Yours stays UNKNOWN.',
      'Of 3 controls, 1 does something hard to take back.',
      'No risky control is close enough to another for a tap aimed at it to land on the risky one.',
    ]);
  });

  it('says so with no control, and when the page was read in part', () => {
    expect(slipSummary(buildSlips(facts([]), null), 'en')[1]).toBe('No visible control was found on this page.');
    expect(slipSummary(buildSlips(facts([ctl('A', 0, 0)], true), null), 'en').at(-1)).toBe('The page is long and only part of it was read, so the rest is UNKNOWN.');
  });

  it('says it in French, with French typography', () => {
    const lines = [
      ...slipSummary(buildSlips(PAGE, 72), 'fr'),
      ...slipSummary(buildSlips(facts([ctl('Annuler', 0, 0), ctl('Envoyer', 46, 0), ctl('Modifier', 0, 50)]), 100), 'fr'),
      ...slipSummary(buildSlips(PAGE, null), 'fr'),
      ...slipSummary(buildSlips(facts([], true), null), 'fr'),
    ];
    expect(lines[0]).toBe(`Taille de toucher utilisée${NBSP}: 72${NBSP}px, celle de votre test de toucher.`);
    expect(lines).toContain(`À 1${NBSP}endroit, un toucher visant une commande peut tomber sur une commande à risque.`);
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('pairText, smallText, slipName and slipAdvice', () => {
  it('says each pair and each small risky control in one sentence', () => {
    const m = buildSlips(PAGE, 72);
    const p = m.pairs[0];
    if (!p) throw new Error('no pair');
    expect(pairText(p, 'en')).toBe('A tap aimed at “Save” may land on “Delete”, 26 px from its centre.');
    expect(pairText(p, 'fr')).toBe(`Un toucher visant «${NNBSP}Save${NNBSP}» peut tomber sur «${NNBSP}Delete${NNBSP}», à 26${NBSP}px de son centre.`);
    const small = ctl('Delete', 0, 0, 24, 20);
    expect(smallText(small, 44, 'en')).toBe('“Delete” is 24 × 20 px, less than the tap size of 44 px.');
    expect(frTypographyIssues(smallText(small, 44, 'fr'))).toEqual([]);
    expect(slipName({ ...small, name: '' }, 'en')).toBe('no name (button[Delete])');
  });

  it('gives advice only when something was found', () => {
    expect(slipAdvice(buildSlips(PAGE, null), 'en')).toEqual([]);
    expect(slipAdvice(buildSlips(PAGE, 72), 'en')).toEqual(['What may help the team: more space around risky controls, placing them away from everyday controls, and a confirmation or a way to undo afterwards.']);
    const fr = slipAdvice(buildSlips(PAGE, 72), 'fr')[0] ?? '';
    expect(frTypographyIssues(fr)).toEqual([]);
    expect(fr).toContain(`l’équipe${NBSP}:`);
  });
});

describe('slipText', () => {
  it('holds the title, the summary, the pairs, the small controls, the advice and what it does not say', () => {
    const lines = slipText(buildSlips(facts([ctl('Save', 0, 0), ctl('Delete', 48, 0, 30, 30)]), 72), 'en').split('\n');
    expect(lines[0]).toBe('Slips onto risky controls');
    expect(lines).toContain('- A tap aimed at “Save” may land on “Delete”, 26 px from its centre.');
    expect(lines).toContain('- “Delete” is 30 × 30 px, less than the tap size of 72 px.');
    expect(lines.at(-2)).toBe('These counts are about where the controls sit at this window size. They do not say how often anyone slips.');
  });

  it('stops listing pairs after the limit, and says it in French with French typography', () => {
    const many = facts([ctl('Delete', 0, 0), ...Array.from({ length: 4 }, (_, i) => ctl(`A${i}`, 0, 0))]);
    expect(slipText(buildSlips(many, null), 'en', 2)).toContain('… and 2 more.');
    for (const l of slipText(buildSlips(PAGE, 72), 'fr').split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
