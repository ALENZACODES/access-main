import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { frTypographyIssues } from './i18n.js';
import { MANUAL_STEPS, NEED_LABELS, criteriaWithoutStep, describeStep, manualStep, type Need } from './manual-steps.js';
import { WCAG22_AA } from './wcag22.js';

describe('by-hand steps', () => {
  it('has one step for each Level A and AA criterion, in the same order', () => {
    expect(MANUAL_STEPS.map((s) => s.sc)).toEqual(WCAG22_AA.map((c) => c.sc));
    expect(criteriaWithoutStep()).toEqual([]);
  });

  it('says what to do and what to look for, in both languages', () => {
    for (const s of MANUAL_STEPS) {
      for (const text of [s.action.en, s.action.fr, s.look.en, s.look.fr]) {
        expect(text.length, `${s.sc}: ${text}`).toBeGreaterThan(20);
        expect(text.endsWith('.'), `${s.sc}: ${text}`).toBe(true);
      }
      expect(s.action.fr, s.sc).not.toBe(s.action.en);
      expect(s.look.fr, s.sc).not.toBe(s.look.en);
    }
  });

  it('follows French typography', () => {
    for (const s of MANUAL_STEPS) {
      expect(frTypographyIssues(s.action.fr), `${s.sc}: ${s.action.fr}`).toEqual([]);
      expect(frTypographyIssues(s.look.fr), `${s.sc}: ${s.look.fr}`).toEqual([]);
    }
  });

  it('uses none of the words the App keeps out of its copy', () => {
    for (const s of MANUAL_STEPS) {
      for (const text of [s.action.en, s.look.en]) expect(text, s.sc).not.toMatch(/\bverif|\bcompliant\b|\bconforms?\b|\bpass(es|ed)?\b/i);
      for (const text of [s.action.fr, s.look.fr]) expect(text, s.sc).not.toMatch(/vérif|conforme|réussi/i);
    }
  });

  it('never tells the reader that a criterion is met', () => {
    for (const s of MANUAL_STEPS) {
      expect(`${s.look.en} ${s.look.fr}`, s.sc).not.toMatch(/is met|criterion passes|est respecté|est conforme/i);
    }
  });

  it('raises nothing in the copy check', () => {
    const hits = MANUAL_STEPS.flatMap((s) => [s.action.en, s.look.en, s.action.fr, s.look.fr].flatMap((text) => scanCopy(text)));
    expect(hits).toEqual([]);
  });

  it('gives no two criteria the same step', () => {
    expect(new Set(MANUAL_STEPS.map((s) => s.action.en)).size).toBe(MANUAL_STEPS.length);
    expect(new Set(MANUAL_STEPS.map((s) => s.action.fr)).size).toBe(MANUAL_STEPS.length);
  });

  it('names what each step needs, and uses every kind of need', () => {
    const used = new Set<Need>(MANUAL_STEPS.map((s) => s.needs));
    expect([...used].sort()).toEqual((Object.keys(NEED_LABELS) as Need[]).sort());
    for (const label of Object.values(NEED_LABELS)) expect(frTypographyIssues(label.fr)).toEqual([]);
  });

  it('asks for a media page for every criterion of guideline 1.2', () => {
    for (const s of MANUAL_STEPS.filter((x) => x.sc.startsWith('1.2.'))) expect(s.needs, s.sc).toBe('media');
  });

  it('keeps the measured thresholds of the criteria', () => {
    expect(manualStep('1.4.3')?.look.en).toContain('4.5 to 1');
    expect(manualStep('1.4.3')?.look.fr).toContain('4,5 pour 1');
    expect(manualStep('1.4.10')?.action.en).toContain('320 CSS pixels');
    expect(manualStep('1.4.11')?.look.en).toContain('3 to 1');
    expect(manualStep('1.4.4')?.action.en).toContain('200%');
    expect(manualStep('2.5.8')?.look.en).toContain('24 by 24 CSS pixels');
    expect(manualStep('2.3.1')?.look.en).toContain('three times in one second');
    expect(manualStep('1.4.12')?.action.en).toContain('line height 1.5');
  });
});

describe('manualStep and describeStep', () => {
  it('finds a step by number', () => {
    expect(manualStep('2.4.7')?.needs).toBe('keyboard');
    expect(manualStep('1.4.8')).toBeNull();
    expect(manualStep('')).toBeNull();
  });

  it('puts a step on one line', () => {
    const step = manualStep('2.4.2');
    if (!step) throw new Error('no step');
    expect(describeStep(step, 'en')).toBe('Do: Read the title of each page in the browser tab. Look for: It names the page and differs from the titles of the other pages.');
    expect(describeStep(step, 'fr')).toBe('À faire\u00A0: Lisez le titre de chaque page dans l’onglet du navigateur. À observer\u00A0: Il nomme la page et diffère des titres des autres pages.');
  });
});
