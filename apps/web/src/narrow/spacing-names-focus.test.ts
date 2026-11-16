import { describe, expect, it } from 'vitest';
import { auditFocusObscured, fullyCovered } from './focus.js';
import { auditLanguage, auditNames, normaliseLabel } from './names.js';
import { auditTargetSpacing, circleIntersectsRect, type TargetRect } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';
import type { ElSnap } from './inpage.js';

const r = (id: string, left: number, top: number, w: number, h: number): TargetRect => ({
  id,
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe('target spacing (2.5.8)', () => {
  it('geometry treats touching as not overlapping', () => {
    const rect = { left: 12, top: 0, right: 40, bottom: 20 };
    expect(circleIntersectsRect(0, 10, 12, rect)).toBe(false);
    expect(circleIntersectsRect(1, 10, 12, rect)).toBe(true);
  });
  it('fails small targets that sit close to another target', () => {
    const res = auditTargetSpacing([r('a', 0, 0, 16, 16), r('b', 20, 0, 16, 16), r('far', 200, 0, 16, 16)]);
    expect(res.checked).toBe(3);
    expect(res.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('passes small targets with enough room and ignores targets of 24px or more', () => {
    expect(auditTargetSpacing([r('a', 0, 0, 16, 16), r('b', 40, 0, 16, 16)]).entries).toEqual([]);
    expect(auditTargetSpacing([r('a', 0, 0, 44, 44), r('b', 45, 0, 44, 44)]).checked).toBe(0);
  });
  it('fails a small target next to a large one', () => {
    expect(auditTargetSpacing([r('s', 0, 0, 16, 16), r('big', 18, 0, 44, 44)]).entries.map((e) => e.id)).toEqual(['s']);
  });
});

const el = (id: string, name: string, text: string): ElSnap => ({
  id,
  tag: 'button',
  role: null,
  rect: { left: 0, top: 0, right: 50, bottom: 50 },
  name,
  text,
});

describe('names and label in name', () => {
  it('flags missing names and labels not contained in the name', () => {
    const res = auditNames([
      el('ok', 'Save draft', 'Save'),
      el('none', '', ''),
      el('bad', 'Submit form', 'Send'),
      el('icon', 'Menu', ''),
    ]);
    expect(res.names.checked).toBe(4);
    expect(res.names.entries.map((e) => e.id)).toEqual(['none']);
    expect(res.labels.checked).toBe(2);
    expect(res.labels.entries.map((e) => e.id)).toEqual(['bad']);
    expect(res.labels.entries[0]?.message.fr).toContain('\u202F');
  });
  it('normalises case and whitespace', () => {
    expect(normaliseLabel('  Hello\n World ')).toBe('hello world');
    expect(auditNames([el('a', 'hello world now', 'Hello   World')]).labels.entries).toEqual([]);
  });
});

describe('language (3.1.1)', () => {
  it('flags a missing or malformed lang', () => {
    expect(auditLanguage({ lang: '' }).entries).toHaveLength(1);
    expect(auditLanguage({ lang: 'en ca!' }).entries).toHaveLength(1);
    expect(auditLanguage({ lang: 'fr-CA' }).entries).toEqual([]);
  });
});

describe('focus not obscured (2.4.11)', () => {
  const target = { left: 0, top: 0, right: 100, bottom: 40 };
  it('detects full coverage by one or several covers', () => {
    expect(fullyCovered(target, [{ left: -5, top: -5, right: 105, bottom: 45 }])).toBe(true);
    expect(
      fullyCovered(target, [
        { left: 0, top: 0, right: 60, bottom: 40 },
        { left: 50, top: 0, right: 100, bottom: 40 },
      ]),
    ).toBe(true);
  });
  it('does not call partial coverage hidden', () => {
    expect(fullyCovered(target, [{ left: 0, top: 0, right: 100, bottom: 39 }])).toBe(false);
    expect(fullyCovered(target, [])).toBe(false);
  });
  it('reports fails and unknowns', () => {
    const res = auditFocusObscured([
      { id: 'a', rect: target, covers: [{ left: 0, top: 0, right: 100, bottom: 40 }], focused: true },
      { id: 'b', rect: target, covers: [], focused: true },
      { id: 'c', rect: target, covers: [], focused: false },
    ]);
    expect(res.checked).toBe(3);
    expect(res.entries.map((e) => [e.id, e.status])).toEqual([
      ['a', 'fail'],
      ['c', 'unknown'],
    ]);
  });
});

describe('text spacing (1.4.12)', () => {
  it('turns newly clipped elements into fails', () => {
    const res = auditTextSpacing({
      checked: 5,
      newlyClipped: [{ id: 'p[3]', scrollWidth: 1, clientWidth: 1, scrollHeight: 2, clientHeight: 1 }],
    });
    expect(res.checked).toBe(5);
    expect(res.entries[0]?.status).toBe('fail');
  });
});
