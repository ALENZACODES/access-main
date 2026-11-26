import { NBSP, NNBSP, type Lang } from './types.js';
import type { MovingAnimation, MovingControl, MovingLook } from './moving-inpage.js';

/**
 * What moved between two looks at a page, set against the time the person
 * says they take to aim. A control that moves, appears or goes while
 * someone aims slowly (a head pointer, eye gaze, dwell clicking, tremor) can
 * make them miss it, or pick the wrong thing. An animation that never stops
 * needs a way to pause it (WCAG 2.2.2), and a device that asks for less
 * motion should get less.
 */

/** A control counts as moved when its box moved this many CSS pixels or more. */
export const MOVE_PX = 8;
/** The times a person can say they take to aim, in seconds. */
export const AIM_SECONDS: readonly number[] = [2, 5, 10];
export const DEFAULT_AIM = 5;
/** How many controls are listed for each kind of change. */
export const MOVING_LISTED = 12;

export interface Moved {
  readonly control: MovingControl;
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
  /** True when its new box no longer covers the middle of where it was: a pointer resting there misses it. */
  readonly left: boolean;
}

export interface MovingModel {
  readonly seconds: number;
  readonly moved: readonly Moved[];
  readonly appeared: readonly MovingControl[];
  readonly gone: readonly MovingControl[];
  readonly controls: number;
  /** Running animations at the second look, or null when the browser could not list them. */
  readonly animations: readonly MovingAnimation[] | null;
  readonly endless: number;
  readonly endlessControls: number;
  readonly pauseControls: readonly string[];
  readonly reduceMotion: boolean | null;
  readonly truncated: boolean;
}

const keyOf = (c: MovingControl): string => `${c.id}\u0000${c.name}`;

export function compareLooks(first: MovingLook, second: MovingLook): MovingModel {
  const before = new Map(first.controls.map((c) => [keyOf(c), c]));
  const after = new Map(second.controls.map((c) => [keyOf(c), c]));
  const moved: Moved[] = [];
  for (const [key, b] of after) {
    const a = before.get(key);
    if (!a) continue;
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const distance = Math.round(Math.hypot(dx, dy));
    const dw = Math.abs(b.width - a.width);
    const dh = Math.abs(b.height - a.height);
    if (distance < MOVE_PX && dw < MOVE_PX && dh < MOVE_PX) continue;
    const mx = a.left + a.width / 2;
    const my = a.top + a.height / 2;
    const covers = mx >= b.left && mx <= b.left + b.width && my >= b.top && my <= b.top + b.height;
    moved.push({ control: b, dx, dy, distance, left: !covers });
  }
  moved.sort((p, q) => Number(q.left) - Number(p.left) || q.distance - p.distance);
  const appeared = second.controls.filter((c) => !before.has(keyOf(c)));
  const gone = first.controls.filter((c) => !after.has(keyOf(c)));
  const animations = second.animations;
  return {
    seconds: Math.max(0, Math.round((second.at - first.at) / 100) / 10),
    moved,
    appeared,
    gone,
    controls: second.controls.length,
    animations,
    endless: animations ? animations.filter((a) => a.endless).length : 0,
    endlessControls: animations ? animations.filter((a) => a.endless && a.control).length : 0,
    pauseControls: second.pauseControls,
    reduceMotion: second.reduceMotion,
    truncated: first.truncated || second.truncated,
  };
}

const q = (name: string, lang: Lang): string => (name === '' ? 'UNKNOWN' : lang === 'fr' ? `«${NNBSP}${name}${NNBSP}»` : `“${name}”`);
const sec = (s: number, lang: Lang): string => (lang === 'fr' ? `${String(s).replace('.', ',')}${NBSP}s` : `${s} s`);
const px = (n: number, lang: Lang): string => (lang === 'fr' ? `${n}${NBSP}px` : `${n} px`);

export function movedText(m: Moved, lang: Lang): string {
  const fr = lang === 'fr';
  const way = fr ? `${px(m.distance, 'fr')}` : px(m.distance, 'en');
  const miss = m.left
    ? fr
      ? ' Un pointeur posé où elle était la manque maintenant.'
      : ' A pointer resting where it was now misses it.'
    : fr
      ? ' Elle couvre encore le milieu de son ancienne place.'
      : ' It still covers the middle of where it was.';
  if (m.distance < MOVE_PX) return fr ? `${q(m.control.name, 'fr')} a changé de taille.${miss}` : `${q(m.control.name, 'en')} changed size.${miss}`;
  return fr ? `${q(m.control.name, 'fr')} a bougé de ${way}.${miss}` : `${q(m.control.name, 'en')} moved ${way}.${miss}`;
}

export function animationText(a: MovingAnimation, lang: Lang): string {
  const fr = lang === 'fr';
  const what = a.control ? (fr ? 'une commande' : 'a control') : fr ? 'un élément' : 'an element';
  const end = a.endless ? (fr ? 'ne s’arrête jamais' : 'never stops') : fr ? 's’arrête d’elle-même' : 'stops by itself';
  return fr ? `${q(a.name, 'fr')}, sur ${what} (${a.target})${NBSP}: ${end}.` : `${q(a.name, 'en')}, on ${what} (${a.target}): ${end}.`;
}

/** What happened between the looks, in a few sentences. */
export function movingSummary(m: MovingModel, aimSeconds: number, lang: Lang): string[] {
  const fr = lang === 'fr';
  const lines = [
    fr
      ? `Deux lectures à ${sec(m.seconds, 'fr')} d’écart, pour ${m.controls} ${m.controls < 2 ? 'commande' : 'commandes'}${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}. Vous avez dit viser en environ ${sec(aimSeconds, 'fr')}.`
      : `Two looks ${sec(m.seconds, 'en')} apart, over ${m.controls} ${m.controls === 1 ? 'control' : 'controls'}${m.truncated ? ' (the reading stopped before the end)' : ''}. You said you take about ${sec(aimSeconds, 'en')} to aim.`,
    fr
      ? `Commandes qui ont bougé${NBSP}: ${m.moved.length}. Apparues${NBSP}: ${m.appeared.length}. Disparues${NBSP}: ${m.gone.length}.`
      : `Controls that moved: ${m.moved.length}. Appeared: ${m.appeared.length}. Gone: ${m.gone.length}.`,
  ];
  if (m.animations === null) {
    lines.push(fr ? 'Ce navigateur ne liste pas les animations, donc ce qui s’anime est UNKNOWN.' : 'This browser does not list animations, so what is animated is UNKNOWN.');
  } else {
    lines.push(
      fr
        ? `Animations en cours${NBSP}: ${m.animations.length}, dont ${m.endless} sans fin et ${m.endlessControls} sur des commandes.`
        : `Animations running: ${m.animations.length}, of which ${m.endless} never stop and ${m.endlessControls} are on controls.`,
    );
  }
  if (m.seconds < aimSeconds) {
    lines.push(
      fr
        ? `Les lectures couvrent moins que votre temps pour viser, donc ce qui bouge plus lentement est UNKNOWN.`
        : `The looks cover less than your time to aim, so what moves more slowly is UNKNOWN.`,
    );
  }
  return lines;
}

export type MovingNoteKind = 'moved' | 'appeared' | 'gone' | 'endless-control' | 'no-pause' | 'reduce-ignored';

/** What may make the page hard to aim at, each as a sentence. */
export function movingNotes(m: MovingModel, lang: Lang): Array<{ readonly kind: MovingNoteKind; readonly text: string }> {
  const fr = lang === 'fr';
  const out: Array<{ kind: MovingNoteKind; text: string }> = [];
  const leaving = m.moved.filter((x) => x.left).length;
  if (leaving > 0) {
    out.push({
      kind: 'moved',
      text: fr
        ? `${leaving} ${leaving < 2 ? 'commande a quitté' : 'commandes ont quitté'} sa place pendant que vous pourriez viser. Un appui lent peut tomber à côté, ou sur autre chose.`
        : `${leaving} ${leaving === 1 ? 'control left its place' : 'controls left their place'} while you might be aiming. A slow press may land beside it, or on something else.`,
    });
  }
  if (m.appeared.length > 0) {
    out.push({
      kind: 'appeared',
      text: fr
        ? 'Des commandes sont apparues entre les lectures. Ce qui apparaît sous le pointeur peut recevoir un appui destiné à autre chose.'
        : 'Controls appeared between the looks. What appears under the pointer may get a press meant for something else.',
    });
  }
  if (m.gone.length > 0) {
    out.push({
      kind: 'gone',
      text: fr ? 'Des commandes ont disparu entre les lectures. Une commande visée peut partir avant l’appui.' : 'Controls went away between the looks. A control being aimed at may go before the press.',
    });
  }
  if (m.endlessControls > 0) {
    out.push({
      kind: 'endless-control',
      text: fr ? 'Des commandes bougent sans fin. Elles sont difficiles à viser lentement.' : 'Some controls move without end. They are hard to aim at slowly.',
    });
  }
  if (m.endless > 0 && m.pauseControls.length === 0) {
    out.push({
      kind: 'no-pause',
      text: fr
        ? 'Quelque chose bouge sans fin et aucun bouton pour l’arrêter n’a été trouvé. Les règles d’accessibilité demandent un moyen de mettre en pause ce qui bouge plus de 5${NBSP}secondes.'.replace('${NBSP}', NBSP)
        : 'Something moves without end and no button to stop it was found. Accessibility rules ask for a way to pause what moves for more than 5 seconds.',
    });
  }
  if (m.reduceMotion === true && m.endless > 0) {
    out.push({
      kind: 'reduce-ignored',
      text: fr
        ? 'Votre appareil demande moins de mouvement, mais des animations sans fin tournent quand même.'
        : 'Your device asks for less motion, but endless animations run anyway.',
    });
  }
  return out;
}

/** General hints for the team, from what was found. */
export function movingAdvice(m: MovingModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const kinds = new Set(movingNotes(m, lang).map((n) => n.kind));
  const out: string[] = [];
  if (kinds.has('moved') || kinds.has('appeared') || kinds.has('gone')) {
    out.push(
      fr
        ? 'Garder les commandes en place une fois la page affichée${NBSP}: réserver la place des images et des bannières, et ne rien insérer au-dessus de ce qu’on lit.'.replace('${NBSP}', NBSP)
        : 'Keep controls in place once the page is shown: reserve room for pictures and banners, and insert nothing above what is being read.',
    );
  }
  if (kinds.has('endless-control') || kinds.has('no-pause')) {
    out.push(fr ? 'Donner un bouton Pause visible pour tout ce qui bouge sans fin, et arrêter le défilement automatique.' : 'Give a visible Pause button for anything that moves without end, and stop automatic rotation.');
  }
  if (kinds.has('reduce-ignored')) out.push(fr ? 'Respecter le réglage «${NNBSP}moins de mouvement${NNBSP}» de l’appareil.'.replaceAll('${NNBSP}', NNBSP) : 'Follow the device’s “reduce motion” setting.');
  return out;
}

/** One line for the barrier text: the person's time to aim, and what moved within it. */
/** The person's time to aim as one line, with nothing about any page: for the access summary. */
export function aimNote(aimSeconds: number, lang: Lang): string {
  return lang === 'fr'
    ? `Ce qui bouge${NBSP}: je mets environ ${sec(aimSeconds, 'fr')} à viser, et les commandes doivent rester en place pendant ce temps.`
    : `Things that move: I take about ${sec(aimSeconds, 'en')} to aim, and controls need to stay in place for that long.`;
}

export function movingNote(m: MovingModel | null, aimSeconds: number, lang: Lang): string {
  if (!m) return '';
  const fr = lang === 'fr';
  const head = aimNote(aimSeconds, lang);
  const leaving = m.moved.filter((x) => x.left).length;
  if (leaving === 0 && m.endlessControls === 0) return head;
  return `${head} ${fr ? `Ici, ${leaving + m.endlessControls} ${leaving + m.endlessControls < 2 ? 'commande a bougé' : 'commandes ont bougé'}.` : `Here, ${leaving + m.endlessControls} ${leaving + m.endlessControls === 1 ? 'control moved' : 'controls moved'}.`}`;
}
