import { NBSP, NNBSP, type Lang } from './types.js';
import { HIT_POINTS, type HitControl, type HitFacts } from './hit-inpage.js';

/**
 * Controls a pointer cannot reach where they are drawn, because something
 * else is on top of them: a cookie banner, a bar stuck to the screen, a chat
 * button, or a layer that shows nothing. A finger, a stylus, a head pointer
 * or eye gaze lands on what is on top, not on the control. A control covered
 * at some points only is said too: a press near its edge may land on the
 * other thing, which matters for an unsteady pointer.
 *
 * Controls that could not be brought fully onto the screen are UNKNOWN.
 */

export type HitStatus = 'covered' | 'partly' | 'clear';

export interface HitFinding {
  readonly control: HitControl;
  readonly status: HitStatus;
}

export interface HitModel {
  readonly findings: readonly HitFinding[];
  readonly covered: number;
  readonly partly: number;
  readonly clear: number;
  /** Covers that show nothing: a press lands on something the person cannot see. */
  readonly invisibleCovers: number;
  /** Covers stuck to the screen: they stay over whatever scrolls under them. */
  readonly pinnedCovers: number;
  readonly offScreen: number;
  readonly truncated: boolean;
}

/** How many controls are listed on screen. */
export const HIT_LISTED = 15;

export function hitStatusOf(c: HitControl): HitStatus {
  if (c.reached === 0) return 'covered';
  if (c.reached < HIT_POINTS.length) return 'partly';
  return 'clear';
}

export function buildHit(facts: HitFacts): HitModel {
  const findings = facts.controls.map((control): HitFinding => ({ control, status: hitStatusOf(control) })).filter((f) => f.status !== 'clear');
  findings.sort((a, b) => (a.status === b.status ? a.control.reached - b.control.reached : a.status === 'covered' ? -1 : 1));
  const covers = findings.map((f) => f.control.cover).filter((c) => c !== null);
  return {
    findings,
    covered: findings.filter((f) => f.status === 'covered').length,
    partly: findings.filter((f) => f.status === 'partly').length,
    clear: facts.controls.length - findings.length,
    invisibleCovers: covers.filter((c) => c.invisible).length,
    pinnedCovers: covers.filter((c) => c.pinned).length,
    offScreen: facts.offScreen,
    truncated: facts.truncated,
  };
}

const q = (s: string, lang: Lang): string => (s === '' ? 'UNKNOWN' : lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);

/** What is on top, in words. */
export function coverText(f: HitFinding, lang: Lang): string {
  const c = f.control.cover;
  const fr = lang === 'fr';
  if (!c) return 'UNKNOWN';
  const kind = c.invisible
    ? fr
      ? 'une couche qui ne montre rien'
      : 'a layer that shows nothing'
    : c.pinned
      ? fr
        ? 'un élément fixé à l’écran'
        : 'something stuck to the screen'
      : fr
        ? 'un autre élément'
        : 'another element';
  const named = c.name === '' ? '' : ` ${q(c.name, lang)}`;
  return `${kind}${named} (${c.what})`;
}

export function hitFindingText(f: HitFinding, lang: Lang): string {
  const fr = lang === 'fr';
  const name = q(f.control.name, lang);
  const total = HIT_POINTS.length;
  if (f.status === 'covered') {
    return fr ? `${name} est entièrement couvert par ${coverText(f, 'fr')}. Un appui y tombe sur autre chose.` : `${name} is fully covered by ${coverText(f, 'en')}. A press there lands on something else.`;
  }
  return fr
    ? `${name} est couvert en partie par ${coverText(f, 'fr')}${NBSP}: ${f.control.reached} points sur ${total} l’atteignent. Un appui près du bord peut tomber à côté.`
    : `${name} is partly covered by ${coverText(f, 'en')}: ${f.control.reached} of ${total} points reach it. A press near its edge may land elsewhere.`;
}

/** The page in a few sentences. */
export function hitSummary(m: HitModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const tested = m.covered + m.partly + m.clear;
  const lines: string[] = [];
  if (tested === 0) {
    lines.push(fr ? 'Aucune commande n’a pu être testée.' : 'No control could be tested.');
  } else {
    lines.push(
      fr
        ? `${tested} ${tested < 2 ? 'commande testée' : 'commandes testées'}${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}. Entièrement couvertes${NBSP}: ${m.covered}. En partie${NBSP}: ${m.partly}. Libres${NBSP}: ${m.clear}.`
        : `${tested} ${tested === 1 ? 'control' : 'controls'} tested${m.truncated ? ' (the reading stopped before the end)' : ''}. Fully covered: ${m.covered}. Partly: ${m.partly}. Clear: ${m.clear}.`,
    );
  }
  if (m.offScreen > 0) {
    lines.push(
      fr
        ? `${m.offScreen} ${m.offScreen < 2 ? 'commande n’a pas pu être amenée' : 'commandes n’ont pas pu être amenées'} en entier à l’écran, donc ${m.offScreen < 2 ? 'elle reste' : 'elles restent'} UNKNOWN.`
        : `${m.offScreen} ${m.offScreen === 1 ? 'control' : 'controls'} could not be brought fully onto the screen, so ${m.offScreen === 1 ? 'it stays' : 'they stay'} UNKNOWN.`,
    );
  }
  if (m.invisibleCovers > 0) {
    lines.push(
      fr
        ? `${m.invisibleCovers} ${m.invisibleCovers < 2 ? 'couverture ne montre' : 'couvertures ne montrent'} rien${NBSP}: on ne voit pas ce qui reçoit l’appui.`
        : `${m.invisibleCovers} ${m.invisibleCovers === 1 ? 'cover shows' : 'covers show'} nothing: you cannot see what gets the press.`,
    );
  }
  if (m.pinnedCovers > 0) {
    lines.push(
      fr
        ? `${m.pinnedCovers} ${m.pinnedCovers < 2 ? 'couverture est fixée' : 'couvertures sont fixées'} à l’écran${NBSP}: ${m.pinnedCovers < 2 ? 'elle reste' : 'elles restent'} par-dessus ce qui défile.`
        : `${m.pinnedCovers} ${m.pinnedCovers === 1 ? 'cover is' : 'covers are'} stuck to the screen: ${m.pinnedCovers === 1 ? 'it stays' : 'they stay'} over whatever scrolls under.`,
    );
  }
  return lines;
}

/** General hints for the team, from what was found. */
export function hitAdvice(m: HitModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const out: string[] = [];
  if (m.pinnedCovers > 0) {
    out.push(
      fr
        ? 'Laisser de la place sous une bande fixée à l’écran (bannière, barre), pour qu’elle ne couvre aucune commande, et permettre de la fermer.'
        : 'Leave room under a bar stuck to the screen (a banner, a toolbar) so it covers no control, and let it be closed.',
    );
  }
  if (m.invisibleCovers > 0) {
    out.push(
      fr
        ? 'Retirer les couches invisibles posées sur les commandes, ou mettre leur propriété pointer-events à none pour que les appuis les traversent.'
        : 'Remove invisible layers over controls, or give them pointer-events: none.',
    );
  }
  if (m.covered + m.partly > m.pinnedCovers + m.invisibleCovers) {
    out.push(fr ? 'Éviter que des éléments se chevauchent sur les commandes.' : 'Keep other elements from overlapping controls.');
  }
  return out;
}

/** One line for the barrier text, when a control is covered. */
export function hitNote(m: HitModel | null, lang: Lang): string {
  if (!m || m.covered + m.partly === 0) return '';
  const n = m.covered + m.partly;
  return lang === 'fr'
    ? `Commandes couvertes${NBSP}: ${n}${NBSP}${n < 2 ? 'commande' : 'commandes'} ${n < 2 ? 'est couverte' : 'sont couvertes'} par autre chose, en tout ou en partie, et un appui peut ne pas ${n < 2 ? 'l’atteindre' : 'les atteindre'}.`
    : `Covered controls: ${n} ${n === 1 ? 'control' : 'controls'} ${n === 1 ? 'is' : 'are'} covered by something else, fully or partly, so a press may not reach ${n === 1 ? 'it' : 'them'}.`;
}
