import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { FAR_SUBMIT, ZIGZAG_MAX, ZIG_DX, buildTravel, travelControlName, distanceText, formLines, formName, formNotes, moveLength, pathOf, travelSummary, travelText } from './travel.js';
import type { TravelControl, TravelFacts } from './travel-inpage.js';
import { NBSP, NNBSP } from './types.js';

/** A control whose centre is at (x, y): 40 by 40 around it. */
const at = (name: string, x: number, y: number, form = 0, submit = false): TravelControl => ({
  id: `input[${name}]`,
  name,
  kind: submit ? 'button' : 'field',
  form,
  submit,
  left: x - 20,
  top: y - 20,
  width: 40,
  height: 40,
});
const facts = (controls: TravelControl[], forms = ['Contact'], width: number | null = 320, truncated = false): TravelFacts => ({ controls, forms, viewportWidth: width, truncated });

/** A form in one column, 60 pixels apart, with the send button last. */
const COLUMN = [at('Name', 100, 100), at('Email', 100, 160), at('Town', 100, 220), at('Send', 100, 280, 0, true)];
/** The same fields in two columns: the pointer goes right, back left, right, back left. */
const TWO = [at('First', 60, 100), at('Last', 260, 100), at('Email', 60, 160), at('Phone', 260, 160), at('Town', 60, 220), at('Code', 260, 220), at('Send', 60, 280, 0, true)];

describe('moveLength and pathOf', () => {
  it('measures from centre to centre', () => {
    expect(moveLength(at('A', 0, 0), at('B', 30, 40))).toBe(50);
  });

  it('adds the moves of a path, finds the longest, and counts no change of direction down one column', () => {
    const p = pathOf(COLUMN);
    expect(p.total).toBe(180);
    expect(p.zigzags).toBe(0);
    expect(p.longest).toMatchObject({ px: 60 });
    expect(pathOf([at('Only', 0, 0)])).toEqual({ total: 0, zigzags: 0, longest: null });
  });

  it('counts each change of direction left and right, ignoring small side moves', () => {
    expect(pathOf(TWO).zigzags).toBe(5);
    const wobble = [at('A', 100, 0), at('B', 100 + ZIG_DX - 1, 60), at('C', 100, 120)];
    expect(pathOf(wobble).zigzags).toBe(0);
  });
});

describe('buildTravel', () => {
  it('counts each form apart, with its path, its way to the send button and the controls outside forms', () => {
    const m = buildTravel(facts([...COLUMN, at('Help', 300, 500, -1), at('Search', 50, 50, 1), at('Go', 150, 50, 1, true)], ['Contact', 'Search']));
    expect(m.forms.map((f) => [f.index, f.name, f.controls.length, f.total, f.toSubmit, f.zigzags])).toEqual([
      [0, 'Contact', 4, 180, 180, 0],
      [1, 'Search', 2, 100, 100, 0],
    ]);
    expect(m.outside).toBe(1);
    expect(m.width).toBe(320);
  });

  it('stops the way to the send button at the first one, and leaves it null when there is none', () => {
    const m = buildTravel(facts([at('A', 0, 0), at('Send', 0, 100, 0, true), at('Later', 0, 300)]));
    expect(m.forms[0]?.toSubmit).toBe(100);
    expect(buildTravel(facts([at('A', 0, 0), at('B', 0, 50)])).forms[0]?.toSubmit).toBeNull();
  });

  it('leaves out a form with no visible control', () => {
    expect(buildTravel(facts([at('A', 0, 0, 1)], ['Empty', 'Kept'])).forms.map((f) => f.name)).toEqual(['Kept']);
  });
});

describe('distanceText, formName and travelControlName', () => {
  it('gives pixels and window widths, or UNKNOWN with no width', () => {
    expect(distanceText(480, 320, 'en')).toBe('480 px, or 1.5 window widths');
    expect(distanceText(320, 320, 'en')).toBe('320 px, or 1 window width');
    expect(distanceText(480, null, 'en')).toBe('480 px (window width UNKNOWN)');
    expect(distanceText(480, 320, 'fr')).toBe(`480${NBSP}px, soit 1,5${NBSP}largeur de fenêtre`);
    expect(distanceText(960, 320, 'fr')).toBe(`960${NBSP}px, soit 3${NBSP}largeurs de fenêtre`);
    expect(distanceText(480, 0, 'fr')).toBe(`480${NBSP}px (largeur de fenêtre UNKNOWN)`);
  });

  it('names a form by its name or its order, and a control with no name by its id', () => {
    const [named] = buildTravel(facts(COLUMN)).forms;
    const [plain] = buildTravel(facts(COLUMN, [''])).forms;
    if (!named || !plain) throw new Error('no form');
    expect(formName(named, 'en')).toBe('“Contact”');
    expect(formName(named, 'fr')).toBe(`«${NNBSP}Contact${NNBSP}»`);
    expect(formName(plain, 'en')).toBe('Form 1');
    expect(formName(plain, 'fr')).toBe('Formulaire 1');
    expect(travelControlName({ ...at('', 0, 0), id: 'input[3]' }, 'en')).toBe('no name (input[3])');
  });
});

describe('travelSummary and formLines', () => {
  it('counts the forms, and says when there is none, no width, or a page read in part', () => {
    expect(travelSummary(buildTravel(facts(COLUMN)), 'en')).toEqual(['1 form was counted, from each control to the next in page order.']);
    expect(travelSummary(buildTravel(facts([], [])), 'en')).toEqual(['This page has no form with visible controls, so no path was counted.']);
    expect(travelSummary(buildTravel(facts(COLUMN, ['Contact'], null, true)), 'en').slice(1)).toEqual([
      'Window width UNKNOWN, so the distances are in pixels only.',
      'The page is long and only part of it was read, so the rest is UNKNOWN.',
    ]);
  });

  it('gives the count, the path, the way to the send button and the longest move of a form', () => {
    const [f] = buildTravel(facts(TWO)).forms;
    if (!f) throw new Error('no form');
    expect(formLines(f, 320, 'en')).toEqual([
      '7 controls. Path from the first to the last: 1226 px, or 3.8 window widths.',
      'To the send button: 1226 px, or 3.8 window widths.',
      'The longest move goes from “Last” to “Email”: 209 px, or 0.7 window widths.',
    ]);
    const [none] = buildTravel(facts([at('A', 0, 0)])).forms;
    if (!none) throw new Error('no form');
    expect(formLines(none, 320, 'en')).toEqual(['1 control. Path from the first to the last: 0 px, or 0 window widths.', 'Send button UNKNOWN, none was found in this form.']);
  });

  it('says it in French, with French typography', () => {
    const m = buildTravel(facts(TWO));
    const lines = [...travelSummary(m, 'fr'), ...formLines(m.forms[0] ?? (() => { throw new Error('no form'); })(), 320, 'fr'), ...travelSummary(buildTravel(facts([], [])), 'fr'), ...travelSummary(buildTravel(facts(COLUMN, ['C', 'D'], null, true)), 'fr')];
    expect(lines[0]).toBe(`1${NBSP}formulaire a été compté, d’une commande à la suivante dans l’ordre de la page.`);
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('formNotes', () => {
  it('has nothing to point to for a short form in one column', () => {
    const [f] = buildTravel(facts(COLUMN)).forms;
    if (!f) throw new Error('no form');
    expect(formNotes(f, 320, 'en')).toEqual([]);
  });

  it('points to fields side by side, a move wider than the window, and a send button far along the path', () => {
    const [f] = buildTravel(facts([...TWO.slice(0, -1), at('Send', 60, 1400, 0, true)])).forms;
    if (!f) throw new Error('no form');
    const notes = formNotes(f, 320, 'en');
    expect(notes.map((n) => n.kind)).toEqual(['zigzag', 'long-move', 'far-submit']);
    expect(notes[0]?.text).toBe('The pointer changes direction 5 times, left then right then left. Fields set side by side cost these trips back and forth. One column shortens the path.');
    expect(ZIGZAG_MAX).toBe(2);
    expect(FAR_SUBMIT).toBe(3);
  });

  it('points to nothing that needs the window width when it is UNKNOWN', () => {
    const [f] = buildTravel(facts([at('A', 0, 0), at('Send', 0, 3000, 0, true)], ['F'], null)).forms;
    if (!f) throw new Error('no form');
    expect(formNotes(f, null, 'en')).toEqual([]);
  });

  it('says every note in French, with French typography', () => {
    const [f] = buildTravel(facts([...TWO.slice(0, -1), at('Envoyer', 60, 1400, 0, true)])).forms;
    if (!f) throw new Error('no form');
    for (const n of formNotes(f, 320, 'fr')) {
      expect(frTypographyIssues(n.text), n.text).toEqual([]);
      expect(n.text).not.toMatch(/\p{L}'\p{L}/u);
    }
  });
});

describe('travelText', () => {
  it('holds the title, the summary, each form with its notes, and what it measures', () => {
    const lines = travelText(buildTravel(facts(TWO)), 'en').split('\n');
    expect(lines[0]).toBe('Pointer travel');
    expect(lines).toContain('“Contact”');
    expect(lines).toContain('- The pointer changes direction 5 times, left then right then left. Fields set side by side cost these trips back and forth. One column shortens the path.');
    expect(lines.at(-2)).toBe('These distances go from the centre of one control to the centre of the next, at this window size. They measure the layout, not anyone’s effort.');
  });

  it('says it in French, with French typography on every line', () => {
    for (const l of travelText(buildTravel(facts(TWO)), 'fr').split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
