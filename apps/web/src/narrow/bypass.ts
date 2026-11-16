import { t, type CheckResult, type Entry } from './types.js';
import type { BypassFacts } from './structure.js';

/**
 * The skip link and the top heading on the rendered page (WCAG 2.4.1). A skip
 * link that points to an id that is not on the page is a measured failure. A
 * skip link that is not the first control, a long run of links before the
 * content with no skip link and more than one top heading are UNKNOWN, because
 * a page may be built that way on purpose. Whether the page has a main
 * landmark, an h1 and ordered headings is already the job of the static-html
 * check, so it is not repeated here.
 */

export type BypassRule = 'skip-target-missing' | 'skip-not-first' | 'no-skip-long-run' | 'many-h1';

export const BYPASS_RULES: readonly BypassRule[] = ['skip-target-missing', 'skip-not-first', 'no-skip-long-run', 'many-h1'];

/** Links and buttons before the content from which a page without a skip link is asked about. */
export const LONG_RUN = 10;

export function auditBypass(f: BypassFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, status: 'fail' | 'unknown', rule: BypassRule, en: string, fr: string): void => {
    entries.push({ check: 'bypass', id, status, rule, message: t(en, fr) });
  };
  let checked = 1;
  if (f.skip) {
    checked++;
    if (!f.skip.targetFound) {
      add(
        f.skip.id,
        'fail',
        'skip-target-missing',
        'The skip link points to an id that is not on the page, so it moves nowhere.',
        'Le lien d’évitement pointe vers un identifiant absent de la page, il ne déplace donc nulle part.',
      );
    } else if (!f.skip.first) {
      add(
        f.skip.id,
        'unknown',
        'skip-not-first',
        'The skip link is not the first control on the page. Check that a keyboard user reaches it before the navigation.',
        'Le lien d’évitement n’est pas la première commande de la page. Contrôlez qu’une personne au clavier l’atteint avant la navigation.',
      );
    }
  } else if (f.mains > 0 && f.controlsBeforeMain >= LONG_RUN) {
    add(
      'main',
      'unknown',
      'no-skip-long-run',
      `${f.controlsBeforeMain} links or buttons come before the main content and the page has no skip link. A keyboard user must tab through all of them, because landmarks help screen reader commands, not the Tab key.`,
      `${f.controlsBeforeMain} liens ou boutons précèdent le contenu principal et la page n’a pas de lien d’évitement. Une personne au clavier doit tous les parcourir, car les repères aident les commandes des lecteurs d’écran, pas la touche Tab.`,
    );
  }
  if (f.h1.length > 1) {
    add(
      f.h1[1] ?? 'h1',
      'unknown',
      'many-h1',
      `The page has ${f.h1.length} headings of level 1. Check that they are not all about the page itself.`,
      `La page a ${f.h1.length} titres de niveau 1. Contrôlez qu’ils ne parlent pas tous de la page elle-même.`,
    );
  }
  return { checked, entries };
}
