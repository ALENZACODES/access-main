import type { FocusProbe } from './inpage.js';
import type { CheckResult, Entry, Rect } from './types.js';

const inside = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/**
 * True when every part of the target is under at least one cover. Splits the
 * target along every cover edge and tests the centre of each cell.
 */
export function fullyCovered(target: Rect, covers: readonly Rect[]): boolean {
  if (target.right <= target.left || target.bottom <= target.top) return false;
  const xs = new Set<number>([target.left, target.right]);
  const ys = new Set<number>([target.top, target.bottom]);
  for (const c of covers) {
    for (const x of [c.left, c.right]) if (inside(x, target.left, target.right)) xs.add(x);
    for (const y of [c.top, c.bottom]) if (inside(y, target.top, target.bottom)) ys.add(y);
  }
  const sx = [...xs].sort((a, b) => a - b);
  const sy = [...ys].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sx.length; i++) {
    for (let j = 0; j + 1 < sy.length; j++) {
      const x0 = sx[i];
      const x1 = sx[i + 1];
      const y0 = sy[j];
      const y1 = sy[j + 1];
      if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) continue;
      if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (!covers.some((c) => cx > c.left && cx < c.right && cy > c.top && cy < c.bottom)) return false;
    }
  }
  return true;
}

/** 2.4.11: a focused control must not be entirely hidden by fixed or sticky content. */
export function auditFocusObscured(probes: readonly FocusProbe[]): CheckResult {
  const entries: Entry[] = [];
  for (const p of probes) {
    if (!p.focused) {
      entries.push({
        check: 'focus-obscured',
        id: p.id,
        status: 'unknown',
        message: { en: 'Focus could not be moved to this control.', fr: 'Le focus n’a pas pu être placé sur ce contrôle.' },
      });
    } else if (fullyCovered(p.rect, p.covers)) {
      entries.push({
        check: 'focus-obscured',
        id: p.id,
        status: 'fail',
        message: {
          en: 'The focused control is completely hidden behind fixed or sticky content.',
          fr: 'Le contrôle ciblé au clavier est entièrement masqué par un contenu fixe ou collant.',
        },
      });
    }
  }
  return { checked: probes.length, entries };
}
