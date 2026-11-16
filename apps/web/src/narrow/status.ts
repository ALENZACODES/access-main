import { t, type CheckResult, type Entry } from './types.js';
import type { LiveFact, ProgressFact } from './semantics.js';

/**
 * Status messages (WCAG 4.1.3): a message that appears without taking focus
 * has to be announced. Contradictory or empty announcements are measured
 * failures. A box that looks like a toast but is not in a live region is
 * UNKNOWN, because it may be shown only to people who can see it on purpose.
 */

export type StatusRule = 'live-conflict' | 'progress-unnamed' | 'toast-silent' | 'live-hidden' | 'too-assertive';

export const STATUS_RULES: readonly StatusRule[] = ['live-conflict', 'progress-unnamed', 'toast-silent', 'live-hidden', 'too-assertive'];

export interface StatusFacts {
  readonly live: readonly LiveFact[];
  readonly toasts: readonly string[];
  readonly progress: readonly ProgressFact[];
}

/** More than this many assertive regions makes announcements cut each other off. */
export const ASSERTIVE_LIMIT = 2;

export function auditStatus(facts: StatusFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, status: 'fail' | 'unknown', rule: StatusRule, en: string, fr: string): void => {
    entries.push({ check: 'status', id, status, rule, message: t(en, fr) });
  };
  let assertive = 0;
  for (const l of facts.live) {
    if ((l.role === 'alert' || l.role === 'status') && l.live === 'off') {
      add(l.id, 'fail', 'live-conflict', `The ${l.role} role is switched off by aria-live off, so nothing is announced.`, `Le rôle ${l.role} est désactivé par aria-live off, rien n’est donc annoncé.`);
    }
    if (l.hidden) {
      add(l.id, 'unknown', 'live-hidden', 'A live region is hidden. Check that it is shown before its text is set, or it may stay silent.', 'Une région live est masquée. Contrôlez qu’elle est affichée avant que son texte soit défini, sinon elle peut rester muette.');
    }
    if (l.role === 'alert' || l.live === 'assertive') assertive++;
  }
  if (assertive > ASSERTIVE_LIMIT) {
    add('page', 'unknown', 'too-assertive', `${assertive} assertive regions are on the page. Check that they do not cut each other off.`, `${assertive} régions assertives sont sur la page. Contrôlez qu’elles ne se coupent pas la parole.`);
  }
  for (const id of facts.toasts) {
    add(id, 'unknown', 'toast-silent', 'This box looks like a message that appears by itself but is not in a live region. Check that it is announced.', 'Ce bloc ressemble à un message qui apparaît seul mais n’est pas dans une région live. Contrôlez qu’il est annoncé.');
  }
  for (const p of facts.progress) {
    if (!p.named) {
      add(p.id, 'fail', 'progress-unnamed', 'The progress indicator has no name, so nobody knows what is in progress.', 'L’indicateur de progression n’a pas de nom, on ne sait donc pas ce qui est en cours.');
    }
  }
  return { checked: facts.live.length + facts.toasts.length + facts.progress.length, entries };
}
