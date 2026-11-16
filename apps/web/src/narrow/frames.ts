import { clip, t, type CheckResult, type Entry } from './types.js';
import type { FrameFact } from './structure.js';

/**
 * Frames and graphics (WCAG 4.1.2 and 1.1.1). A frame titled with a generic
 * word or only its host, a canvas and an embedded object with no text for
 * people who cannot see them are UNKNOWN. A frame with no title and an svg
 * with no name are already rules of the static-html check, so they are not
 * repeated here.
 */

export type FrameRule = 'frame-title-weak' | 'canvas-fallback' | 'object-fallback';

export const FRAME_RULES: readonly FrameRule[] = ['frame-title-weak', 'canvas-fallback', 'object-fallback'];

const GENERIC = new Set(['iframe', 'frame', 'embed', 'content', 'untitled', 'widget', 'external', 'contenu', 'sans titre', 'cadre']);

/** True when a title says nothing about the content, or only repeats the host. */
export function isWeakTitle(title: string, host: string): boolean {
  const s = title.trim().toLowerCase();
  if (s === '') return false;
  return GENERIC.has(s) || (host !== '' && (s === host || s === `www.${host}`));
}

const kindOf = (f: FrameFact): { en: string; fr: string } =>
  f.tag === 'iframe' ? { en: 'frame', fr: 'cadre' } : f.tag === 'canvas' ? { en: 'canvas', fr: 'canevas' } : { en: 'embedded object', fr: 'objet intégré' };

export function auditFrames(frames: readonly FrameFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (f: FrameFact, status: 'fail' | 'unknown', rule: FrameRule, en: string, fr: string): void => {
    entries.push({ check: 'frames', id: f.id, status, rule, message: t(en, fr) });
  };
  let checked = 0;
  for (const f of frames) {
    if (f.decorative) continue;
    checked++;
    const k = kindOf(f);
    if (f.tag === 'iframe') {
      if (isWeakTitle(f.name, f.host)) {
        add(
          f,
          'unknown',
          'frame-title-weak',
          `The title “${clip(f.name, 30)}” does not say what the frame holds. Use words about the content.`,
          `Le titre «\u202F${clip(f.name, 30)}\u202F» ne dit pas ce que contient le cadre. Utilisez des mots sur le contenu.`,
        );
      }
      continue;
    }
    if (f.tag === 'canvas') {
      if (f.name === '' && !f.fallback) {
        add(
          f,
          'unknown',
          'canvas-fallback',
          'This canvas has no name and no text inside it. Check that the same information reaches a person who cannot see the drawing.',
          'Ce canevas n’a ni nom ni texte à l’intérieur. Contrôlez que la même information parvient à une personne qui ne voit pas le dessin.',
        );
      }
      continue;
    }
    if (f.name === '' && !f.fallback) {
      add(
        f,
        'unknown',
        'object-fallback',
        `This ${k.en} has no name and no text inside it. Check that a person without the plug-in or the content still gets the information.`,
        `Ce ${k.fr} n’a ni nom ni texte à l’intérieur. Contrôlez qu’une personne sans le module ou le contenu obtient quand même l’information.`,
      );
    }
  }
  return { checked, entries };
}
