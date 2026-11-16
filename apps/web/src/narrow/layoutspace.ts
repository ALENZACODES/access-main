import { clip, t, type CheckResult, type Entry } from './types.js';
import type { ClipFact, FixedFact } from './semantics.js';

/**
 * Two ways a narrow, short screen loses content that is on the page. A fixed
 * or sticky bar can leave little room for the page itself, and text can be cut
 * off by its own box. The share limits are this tool's own, not WCAG numbers,
 * so the middle band is UNKNOWN and only the extreme is a failure.
 */

export type FixedRule = 'fixed-covers' | 'fixed-large';
export type ClipRule = 'text-clipped' | 'text-ellipsis';

export const FIXED_RULES: readonly FixedRule[] = ['fixed-covers', 'fixed-large'];
export const CLIP_RULES: readonly ClipRule[] = ['text-clipped', 'text-ellipsis'];

/** Fixed content above this share of the screen height fails. */
export const FIXED_FAIL_SHARE = 0.5;
/** Above this share it is UNKNOWN. */
export const FIXED_ASK_SHARE = 0.33;

export function auditFixedSpace(fixed: readonly FixedFact[], viewport: { readonly width: number; readonly height: number }): CheckResult {
  const entries: Entry[] = [];
  if (viewport.height <= 0) return { checked: fixed.length, entries };
  // Only bars that span most of the width take the room of the page.
  const wide = fixed.filter((f) => f.width >= viewport.width * 0.6);
  const share = wide.reduce((n, f) => n + f.height, 0) / viewport.height;
  const names = wide.map((f) => f.id).join(', ');
  const pct = Math.round(share * 100);
  if (share > FIXED_FAIL_SHARE) {
    entries.push({
      check: 'fixed-space',
      id: clip(names, 60),
      status: 'fail',
      rule: 'fixed-covers',
      message: t(
        `Fixed and sticky bars take ${pct}% of a ${viewport.height}px high screen, leaving less than half for the page.`,
        `Les barres fixes et collantes occupent ${pct}\u00A0% d’un écran de ${viewport.height}\u00A0px de haut, ce qui laisse moins de la moitié à la page.`,
      ),
    });
  } else if (share > FIXED_ASK_SHARE) {
    entries.push({
      check: 'fixed-space',
      id: clip(names, 60),
      status: 'unknown',
      rule: 'fixed-large',
      message: t(
        `Fixed and sticky bars take ${pct}% of a ${viewport.height}px high screen. Check that this leaves enough room in landscape.`,
        `Les barres fixes et collantes occupent ${pct}\u00A0% d’un écran de ${viewport.height}\u00A0px de haut. Contrôlez que cela laisse assez de place en paysage.`,
      ),
    });
  }
  return { checked: fixed.length, entries };
}

export function auditClipping(clips: readonly ClipFact[], elementsChecked = clips.length): CheckResult {
  const entries: Entry[] = [];
  for (const c of clips) {
    if (c.ellipsis) {
      entries.push({
        check: 'clipping',
        id: c.id,
        status: 'unknown',
        rule: 'text-ellipsis',
        message: t(
          `The text “${clip(c.text, 24)}” is shortened with an ellipsis. Check that the whole text can still be read.`,
          `Le texte «\u202F${clip(c.text, 24)}\u202F» est raccourci par des points de suspension. Contrôlez que le texte entier peut encore être lu.`,
        ),
      });
    } else {
      entries.push({
        check: 'clipping',
        id: c.id,
        status: 'fail',
        rule: 'text-clipped',
        message: t(
          `The text “${clip(c.text, 24)}” is cut off ${c.axis === 'x' ? 'at the side' : 'at the bottom'} of its box and cannot be read in full.`,
          `Le texte «\u202F${clip(c.text, 24)}\u202F» est coupé ${c.axis === 'x' ? 'sur le côté' : 'en bas'} de son bloc et ne peut pas être lu en entier.`,
        ),
      });
    }
  }
  return { checked: elementsChecked, entries };
}
