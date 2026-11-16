import { t, type CheckResult, type Entry } from './types.js';
import type { TimingFacts } from './structure.js';

/**
 * Moving content and time limits (WCAG 2.2.1 and 2.2.2). A marquee and a
 * blinking text are measured failures. A carousel with no pause control and a
 * sentence about a session that ends need a person to read the page, so they
 * are UNKNOWN. A timed meta refresh is already a rule of the static-html
 * check, so it is not repeated here.
 */

export type TimingRule = 'marquee' | 'text-blink' | 'carousel-no-pause' | 'session-expiry';

export const TIMING_RULES: readonly TimingRule[] = ['marquee', 'text-blink', 'carousel-no-pause', 'session-expiry'];

export function auditTiming(f: TimingFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, status: 'fail' | 'unknown', rule: TimingRule, en: string, fr: string): void => {
    entries.push({ check: 'timing', id, status, rule, message: t(en, fr) });
  };
  let checked = 0;
  for (const id of f.marquee) {
    checked++;
    add(
      id,
      'fail',
      'marquee',
      'This element scrolls or blinks on its own and cannot be stopped. Use static text, or give a control that stops it.',
      'Cet élément défile ou clignote tout seul et ne peut pas être arrêté. Utilisez du texte fixe, ou donnez une commande qui l’arrête.',
    );
  }
  for (const id of f.blink) {
    checked++;
    add(
      id,
      'fail',
      'text-blink',
      'This text blinks through its text decoration. Blinking for more than five seconds cannot be paused.',
      'Ce texte clignote par sa décoration. Un clignotement de plus de cinq secondes ne peut pas être mis en pause.',
    );
  }
  for (const c of f.carousels) {
    checked++;
    if (!c.pause) {
      add(
        c.id,
        'unknown',
        'carousel-no-pause',
        'This looks like a carousel and has no control named pause or stop. If it moves on its own, a person needs a way to stop it.',
        'Cet élément ressemble à un carrousel et n’a aucune commande nommée pause ou arrêt. S’il bouge tout seul, il faut un moyen de l’arrêter.',
      );
    }
  }
  for (const id of f.expiry) {
    checked++;
    add(
      id,
      'unknown',
      'session-expiry',
      'This text speaks of a time limit. Check that a person can turn it off, extend it or be warned with enough time to extend it.',
      'Ce texte parle d’une limite de temps. Contrôlez qu’une personne peut la désactiver, la prolonger ou être avertie assez tôt pour la prolonger.',
    );
  }
  return { checked, entries };
}
