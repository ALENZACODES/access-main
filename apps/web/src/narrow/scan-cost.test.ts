import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { ScanControl, ScanFacts } from './scan-inpage.js';
import {
  DEFAULT_SCAN,
  FAR_STEPS,
  LONG_ROW,
  SCAN_INTERVALS,
  SCAN_LISTED,
  buildScan,
  costText,
  costliest,
  durationText,
  rowsOf,
  scanAdvice,
  scanNote,
  scanNotes,
  scanSettingsNote,
  scanSummary,
  settingsText,
  type ScanSettings,
} from './scan-cost.js';
import { NBSP, NNBSP } from './types.js';

const c = (name: string, left: number, top: number, main = false, width = 80, height = 44): ScanControl => ({ id: `button[${name}]`, name, main, left, top, width, height });
/** A header row of three links, a row of two fields, and a Send button below, in tab order. */
const FORM: ScanFacts = {
  controls: [c('Home', 0, 0), c('Help', 100, 0), c('Menu', 200, 0), c('Name', 0, 100), c('Email', 100, 110), c('Send', 0, 200, true)],
  truncated: false,
};
const LINEAR: ScanSettings = { mode: 'linear', pace: 'auto', intervalMs: 1_000 };
const ROWS: ScanSettings = { mode: 'row-column', pace: 'auto', intervalMs: 2_000 };
const STEP: ScanSettings = { mode: 'linear', pace: 'step', intervalMs: 1_000 };

describe('the defaults', () => {
  it('scans one by one with auto scan at 1.5 s, and offers the usual speeds', () => {
    expect(DEFAULT_SCAN).toEqual({ mode: 'linear', pace: 'auto', intervalMs: 1_500 });
    expect(SCAN_INTERVALS).toEqual([500, 1_000, 1_500, 2_000, 3_000]);
    expect(SCAN_INTERVALS).toContain(DEFAULT_SCAN.intervalMs);
  });
});

describe('rowsOf', () => {
  it('puts controls whose middle is within a row in that row, left to right, rows top to bottom', () => {
    expect(rowsOf(FORM.controls).map((r) => r.map((x) => x.name))).toEqual([['Home', 'Help', 'Menu'], ['Name', 'Email'], ['Send']]);
  });

  it('sorts by place on the screen, whatever the tab order', () => {
    const shuffled = [c('B', 100, 0), c('C', 0, 300), c('A', 0, 0)];
    expect(rowsOf(shuffled).map((r) => r.map((x) => x.name))).toEqual([['A', 'B'], ['C']]);
  });

  it('grows a row with a tall control, and has no row for no control', () => {
    expect(rowsOf([c('Tall', 0, 0, false, 80, 200), c('Beside', 100, 150)]).map((r) => r.length)).toEqual([2]);
    expect(rowsOf([])).toEqual([]);
  });
});

describe('buildScan', () => {
  it('counts linear steps in tab order, with the time at the interval and one press', () => {
    const m = buildScan(FORM, LINEAR);
    expect(m.costs.map((x) => [x.control.name, x.order, x.steps, x.ms, x.presses])).toEqual([
      ['Home', 1, 1, 1_000, 1],
      ['Help', 2, 2, 2_000, 1],
      ['Menu', 3, 3, 3_000, 1],
      ['Name', 4, 4, 4_000, 1],
      ['Email', 5, 5, 5_000, 1],
      ['Send', 6, 6, 6_000, 1],
    ]);
    expect([m.rows, m.longRows, m.backJumps, m.main?.control.name, m.last?.control.name, m.truncated]).toEqual([3, 0, 0, 'Send', 'Send', false]);
  });

  it('counts rows then the place in the row for row-column scanning, with two presses', () => {
    const m = buildScan(FORM, ROWS);
    expect(m.costs.map((x) => [x.control.name, x.steps, x.ms, x.presses])).toEqual([
      ['Home', 2, 4_000, 2],
      ['Help', 3, 6_000, 2],
      ['Menu', 4, 8_000, 2],
      ['Name', 3, 6_000, 2],
      ['Email', 4, 8_000, 2],
      ['Send', 4, 8_000, 2],
    ]);
    expect(m.last?.control.name).toBe('Menu');
  });

  it('counts a press a step, plus one to select, with step scan, and no time', () => {
    const m = buildScan(FORM, STEP);
    expect(m.costs.map((x) => [x.steps, x.ms, x.presses])[5]).toEqual([6, null, 7]);
  });

  it('counts the times tab order goes back up the screen', () => {
    const jumpy: ScanFacts = { controls: [c('Send', 0, 200, true), c('Home', 0, 0), c('Name', 0, 100), c('Help', 100, 0)], truncated: false };
    expect(buildScan(jumpy, LINEAR).backJumps).toBe(2);
  });

  it('counts rows with more than the limit of controls', () => {
    const wide: ScanFacts = { controls: Array.from({ length: LONG_ROW + 1 }, (_, i) => c(`B${i}`, i * 50, 0)), truncated: true };
    const m = buildScan(wide, ROWS);
    expect([m.rows, m.longRows, m.truncated]).toEqual([1, 1, true]);
  });

  it('has no main action when nothing looks like one, and nothing on an empty page', () => {
    expect(buildScan({ controls: [c('A', 0, 0)], truncated: false }, LINEAR).main).toBeNull();
    const empty = buildScan({ controls: [], truncated: false }, LINEAR);
    expect([empty.costs.length, empty.rows, empty.main, empty.last]).toEqual([0, 0, null, null]);
  });
});

describe('costliest', () => {
  it('lists the most steps first, ties in tab order, up to the limit', () => {
    expect(costliest(buildScan(FORM, ROWS), 3).map((x) => x.control.name)).toEqual(['Menu', 'Email', 'Send']);
    const many = buildScan({ controls: Array.from({ length: SCAN_LISTED + 5 }, (_, i) => c(`B${i}`, 0, i * 50)), truncated: false }, LINEAR);
    expect(costliest(many)).toHaveLength(SCAN_LISTED);
    expect(costliest(many)[0]?.control.name).toBe(`B${SCAN_LISTED + 4}`);
  });
});

describe('the words', () => {
  it('writes durations in seconds, then minutes and seconds, with a French comma', () => {
    expect(durationText(1_500, 'en')).toBe('1.5 s');
    expect(durationText(1_500, 'fr')).toBe(`1,5${NBSP}s`);
    expect(durationText(95_000, 'en')).toBe('1 min 35 s');
    expect(durationText(95_000, 'fr')).toBe(`1${NBSP}min 35${NBSP}s`);
  });

  it('says the settings', () => {
    expect(settingsText(LINEAR, 'en')).toBe('Scanning one by one, with auto scan, 1 s a step');
    expect(settingsText(ROWS, 'fr')).toBe(`Balayage ligne par ligne, en défilement automatique, 2${NBSP}s par étape`);
    expect(settingsText(STEP, 'en')).toBe('Scanning one by one, step by step, one press a step');
  });

  it('says one control’s cost', () => {
    const m = buildScan(FORM, LINEAR);
    expect(costText(m.costs[0]!, 'en')).toBe('“Home” (number 1 by Tab): 1 step, about 1 s, 1 press.');
    expect(costText(m.costs[5]!, 'fr')).toBe(`«${NNBSP}Send${NNBSP}» (n° 6 au clavier)${NBSP}: 6 étapes, environ 6${NBSP}s, 1 appui.`);
    expect(costText(buildScan(FORM, STEP).costs[1]!, 'en')).toBe('“Help” (number 2 by Tab): 2 steps, 3 presses.');
    expect(costText(buildScan({ controls: [c('', 0, 0)], truncated: false }, LINEAR).costs[0]!, 'en')).toMatch(/^UNKNOWN \(number 1/);
  });

  it('sums up the page with the main action, and the longest when it is another', () => {
    expect(scanSummary(buildScan(FORM, LINEAR), 'en')).toEqual([
      'Scanning one by one, with auto scan, 1 s a step.',
      '6 controls on 3 rows.',
      'The first control that looks like the main action: “Send” (number 6 by Tab): 6 steps, about 6 s, 1 press.',
    ]);
    expect(scanSummary(buildScan(FORM, ROWS), 'en')[3]).toBe('The longest to reach: “Menu” (number 3 by Tab): 4 steps, about 8 s, 2 presses.');
  });

  it('says the main action is UNKNOWN when none was found, and when the reading stopped', () => {
    const lines = scanSummary(buildScan({ controls: [c('A', 0, 0)], truncated: true }, LINEAR), 'en');
    expect(lines[1]).toBe('1 control on 1 row (the reading stopped before the end).');
    expect(lines[2]).toBe('No control looks like the main action, so what it costs is UNKNOWN.');
    expect(scanSummary(buildScan({ controls: [], truncated: false }, LINEAR), 'fr')).toEqual(['Aucune commande n’a été trouvée dans cette page, donc rien n’est à balayer.']);
  });
});

describe('scanNotes and scanAdvice', () => {
  const far: ScanFacts = { controls: [...Array.from({ length: FAR_STEPS }, (_, i) => c(`L${i}`, 0, 300 + i * 50)), c('Send', 0, 0, true)], truncated: false };

  it('says the main action is far, and the tab order jumps back, with linear scanning', () => {
    const m = buildScan(far, LINEAR);
    expect(scanNotes(m, 'en').map((n) => n.kind)).toEqual(['far-main', 'back-jumps']);
    expect(scanNotes(m, 'en')[1]?.text).toBe('The tab order goes back up the screen 1 time. The highlight then jumps back, which makes what comes next hard to predict.');
    expect(scanAdvice(m, 'en')).toEqual(['Put the main action early in the tab order, or a skip link that leads to it.', 'Make the tab order follow the screen, from top to bottom.']);
  });

  it('says rows are long with row-column scanning, and not the jumps', () => {
    const wide: ScanFacts = { controls: [c('Up', 0, 100), ...Array.from({ length: LONG_ROW + 1 }, (_, i) => c(`B${i}`, i * 50, 0))], truncated: false };
    const m = buildScan(wide, ROWS);
    expect(scanNotes(m, 'en').map((n) => n.kind)).toEqual(['long-rows']);
    expect(scanAdvice(m, 'fr')).toEqual(['Couper les longues rangées de boutons, ou les regrouper dans un menu.']);
  });

  it('advises an early main action on a long page with none found, and nothing on a short simple page', () => {
    const long = buildScan({ controls: Array.from({ length: FAR_STEPS + 1 }, (_, i) => c(`L${i}`, 0, i * 50)), truncated: false }, LINEAR);
    expect(scanNotes(long, 'en')).toEqual([]);
    expect(scanAdvice(long, 'en')).toHaveLength(1);
    expect(scanAdvice(buildScan(FORM, LINEAR), 'en')).toEqual([]);
  });
});

describe('scanNote', () => {
  it('gives the settings and the main action for the barrier text, or nothing before reading', () => {
    expect(scanNote(buildScan(FORM, LINEAR), 'en')).toBe('Switch scanning: one by one, with auto scan, 1 s a step. The main action takes 6 steps.');
    expect(scanNote(buildScan(FORM, ROWS), 'fr')).toBe(`Balayage par contacteur${NBSP}: ligne par ligne, en défilement automatique, 2${NBSP}s par étape. L’action principale demande 4${NBSP}étapes.`);
    expect(scanNote(buildScan({ controls: [c('A', 0, 0)], truncated: false }, STEP), 'en')).toBe('Switch scanning: one by one, step by step, one press a step.');
    expect(scanNote(null, 'en')).toBe('');
    expect(scanNote(buildScan({ controls: [], truncated: false }, LINEAR), 'en')).toBe('');
  });
});

describe('the French wording of the model', () => {
  it('follows French typography and makes no claim', () => {
    const far: ScanFacts = { controls: [...Array.from({ length: 25 }, (_, i) => c(`B${i}`, (i % 10) * 40, Math.floor(i / 10) * 50 + 100)), c('Envoyer', 0, 0, true)], truncated: true };
    const lines: string[] = [];
    for (const s of [LINEAR, ROWS, STEP]) {
      const m = buildScan(far, s);
      lines.push(...scanSummary(m, 'fr'), ...scanNotes(m, 'fr').map((n) => n.text), ...scanAdvice(m, 'fr'), scanNote(m, 'fr'), ...m.costs.map((x) => costText(x, 'fr')));
    }
    lines.push(...scanSummary(buildScan({ controls: [c('A', 0, 0)], truncated: false }, LINEAR), 'fr'));
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});

describe('scanSettingsNote', () => {
  it('gives the settings alone, for the access summary, with nothing about a page', () => {
    expect(scanSettingsNote(LINEAR, 'en')).toBe('Switch scanning: one by one, with auto scan, 1 s a step.');
    expect(scanSettingsNote(ROWS, 'fr')).toBe(`Balayage par contacteur${NBSP}: ligne par ligne, en défilement automatique, 2${NBSP}s par étape.`);
    expect(scanNote(buildScan(FORM, LINEAR), 'en').startsWith(scanSettingsNote(LINEAR, 'en'))).toBe(true);
    expect(scanSettingsNote(STEP, 'en')).not.toMatch(/main action|steps\./);
  });
});
