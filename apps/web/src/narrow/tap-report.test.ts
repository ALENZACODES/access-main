import { describe, expect, it } from 'vitest';
import { renderBarrierText, type BarrierDraft } from './barrier-report.js';
import { readDeviceFacts } from './device-facts.js';
import { mountFitPanel } from './fit-panel.js';
import { PHONE, fakeRoot, settle } from './fit-testkit.js';
import { frTypographyIssues } from './i18n.js';
import { nov } from './report-fixtures.js';
import { initialTapState, tapStep, type TapMeasure } from './tap-panel.js';
import { TAPS_PER_SIZE, TAP_SIZES, tapNote } from './tap-trial.js';
import { NBSP } from './types.js';

/** The tap size in the barrier text: the line the tap test gives, and how the fit panel asks for it. */

const NOW = nov(19);
const TOTAL = TAP_SIZES.length * TAPS_PER_SIZE;
const draft: BarrierDraft = { kind: 'too-small', what: 'The close button is too small to press.', includeSettings: true, includeFindings: false };
const measure: TapMeasure = { controls: () => [], width: () => 320 };

function finished(lang: 'en' | 'fr', miss: (i: number) => boolean = () => false) {
  let s = tapStep(initialTapState(), 'tap-start', lang, measure).state;
  for (let i = 0; i < TOTAL; i += 1) s = tapStep(s, miss(i) ? 'tap-miss' : 'tap-hit', lang, measure).state;
  return s;
}

describe('renderBarrierText with more lines about the screen', () => {
  const context = (extra?: readonly string[]) => ({ location: '/places/12', facts: readDeviceFacts(PHONE), report: null, now: NOW, ...(extra ? { extra } : {}) });

  it('adds the lines after the settings', () => {
    const text = renderBarrierText(draft, context(['Button size at which my taps land: 72 CSS pixels']), 'en');
    const lines = text.split('\n');
    const at = lines.indexOf('Button size at which my taps land: 72 CSS pixels');
    expect(at).toBeGreaterThan(lines.findIndex((l) => l.startsWith('Colour scheme:')));
    expect(lines[at + 1]).toBe('');
  });

  it('leaves them out with the settings, when the person does not want their settings in the text', () => {
    expect(renderBarrierText({ ...draft, includeSettings: false }, context(['Button size at which my taps land: 72 CSS pixels']), 'en')).not.toContain('Button size');
  });

  it('is the same text as before when there are no lines, or only blank ones', () => {
    const plain = renderBarrierText(draft, context(), 'en');
    expect(renderBarrierText(draft, context([]), 'en')).toBe(plain);
    expect(renderBarrierText(draft, context(['', '   ']), 'en')).toBe(plain);
  });

  it('trims each line', () => {
    expect(renderBarrierText(draft, context(['  A line.  ']), 'en')).toContain('\nA line.\n');
  });
});

describe('the tap line', () => {
  it('gives the size, or UNKNOWN, in both languages with French typography', () => {
    expect(tapNote(finished('en').trial, 'en')).toBe('Button size at which my taps land: 44 CSS pixels');
    expect(tapNote(finished('fr', (i) => i === 9).trial, 'fr')).toBe(`Taille de bouton où mes appuis atteignent leur cible${NBSP}: 72${NBSP}pixels CSS`);
    expect(tapNote(finished('en', (i) => i === 0).trial, 'en')).toBe('Button size at which my taps land: UNKNOWN');
    expect(frTypographyIssues(tapNote(finished('fr').trial, 'fr'))).toEqual([]);
  });

  it('reads in the French barrier text with French typography', () => {
    const text = renderBarrierText(draft, { location: '/', facts: readDeviceFacts(PHONE), report: null, now: NOW, extra: [tapNote(finished('fr', (i) => i === 9).trial, 'fr')] }, 'fr');
    for (const line of text.split('\n').filter((l) => !l.startsWith('The close'))) expect(frTypographyIssues(line), line).toEqual([]);
  });
});

describe('mountFitPanel with extraFacts', () => {
  const fill = (root: ReturnType<typeof fakeRoot>): void => {
    root.fields['input[name="fit-kind"]:checked'] = { value: draft.kind };
    root.fields['#fit-what'] = { value: draft.what };
    root.fields['#fit-settings'] = { checked: true };
    root.fields['#fit-findings'] = { checked: false };
  };

  it('asks for the lines when the text is prepared, not when the panel is mounted', async () => {
    let asked = 0;
    let line = '';
    const root = fakeRoot();
    const panel = mountFitPanel({ root, lang: 'en', env: () => PHONE, now: () => NOW, location: () => '/x', extraFacts: () => (asked++, line === '' ? [] : [line]) });
    expect(asked).toBe(0);
    line = 'Button size at which my taps land: 56 CSS pixels';
    fill(root);
    root.click('fit-make');
    await settle();
    expect(asked).toBe(1);
    expect(panel.getState().text).toContain('\nButton size at which my taps land: 56 CSS pixels\n');
  });

  it('prepares the same text as before without them', async () => {
    const a = fakeRoot();
    const b = fakeRoot();
    const one = mountFitPanel({ root: a, lang: 'en', env: () => PHONE, now: () => NOW, location: () => '/x' });
    const two = mountFitPanel({ root: b, lang: 'en', env: () => PHONE, now: () => NOW, location: () => '/x', extraFacts: () => [] });
    for (const r of [a, b]) {
      fill(r);
      r.click('fit-make');
    }
    await settle();
    expect(two.getState().text).toBe(one.getState().text);
  });
});
