import { NBSP, type CheckResult, type Entry, type Rect } from './types.js';

export interface TargetRect extends Rect {
  readonly id: string;
}

/** WCAG 2.5.8 uses a 24 CSS px target size and a 24px circle. */
export const SPACING_PX = 24;
/** The audit pass cannot compare every pair on huge pages. */
export const MAX_SPACING_TARGETS = 2000;

const width = (r: Rect): number => r.right - r.left;
const height = (r: Rect): number => r.bottom - r.top;

/** True when the circle overlaps the rectangle (touching is not overlapping). */
export function circleIntersectsRect(cx: number, cy: number, radius: number, r: Rect): boolean {
  const nx = Math.min(Math.max(cx, r.left), r.right);
  const ny = Math.min(Math.max(cy, r.top), r.bottom);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * For each target under 24x24px, a 24px circle centred on it must not overlap
 * another target or the circle of another undersized target.
 * Targets of 24px or more are not checked here.
 */
export function auditTargetSpacing(targets: readonly TargetRect[]): CheckResult {
  const list = targets.slice(0, MAX_SPACING_TARGETS).filter((t) => width(t) > 0 && height(t) > 0);
  const radius = SPACING_PX / 2;
  const centre = (t: Rect): { x: number; y: number } => ({
    x: (t.left + t.right) / 2,
    y: (t.top + t.bottom) / 2,
  });
  const small = list.filter((t) => width(t) < SPACING_PX || height(t) < SPACING_PX);
  const entries: Entry[] = [];
  for (const a of small) {
    const ca = centre(a);
    let hit = false;
    for (const b of list) {
      if (b === a) continue;
      if (circleIntersectsRect(ca.x, ca.y, radius, b)) {
        hit = true;
        break;
      }
      if (width(b) < SPACING_PX || height(b) < SPACING_PX) {
        const cb = centre(b);
        if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < SPACING_PX) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      entries.push({
        check: 'target-spacing',
        id: a.id,
        status: 'fail',
        message: {
          en: `Target is under ${SPACING_PX}px and closer than ${SPACING_PX}px to another target.`,
          fr: `La cible fait moins de ${SPACING_PX}${NBSP}px et se trouve à moins de ${SPACING_PX}${NBSP}px d’une autre cible.`,
        },
      });
    }
  }
  return { checked: small.length, entries };
}
