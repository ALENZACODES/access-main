import { NBSP, type Lang } from './types.js';

/**
 * A short drag test: the person drags a handle along a track to its end, up
 * to three times, the way they usually point (a finger, a stylus, a mouse, a
 * trackball, a head pointer). The test keeps, for each try, whether the
 * handle reached the end, how long it took and how far it got. It can be
 * skipped by saying dragging is not possible here.
 *
 * Positions are fractions of the track, 0 at the start and 1 at the end.
 * Nothing here says anything about the person beyond what the tries showed.
 */

export const DRAG_TRIES = 3;
/** The part of the track that counts as the end. */
export const DRAG_END = 0.9;

export interface DragTry {
  readonly start: number;
  readonly end: number;
  readonly reached: boolean;
  /** How far the handle got, 0 to 1. */
  readonly furthest: number;
  readonly pointerType: string;
}

export interface DragTrial {
  readonly tries: readonly DragTry[];
  /** The try in progress: when it started, how far it is and with what. */
  readonly current: { readonly start: number; readonly at: number; readonly pointerType: string } | null;
  /** True when the person said they cannot drag here. */
  readonly gaveUp: boolean;
}

export const emptyDragTrial = (): DragTrial => ({ tries: [], current: null, gaveUp: false });

export type DragEvent =
  | { readonly kind: 'down'; readonly x: number; readonly at: number; readonly pointerType: string }
  | { readonly kind: 'move'; readonly x: number; readonly at: number }
  | { readonly kind: 'up'; readonly x: number; readonly at: number }
  | { readonly kind: 'cancel'; readonly at: number };

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export const dragDone = (t: DragTrial): boolean => t.gaveUp || t.tries.length >= DRAG_TRIES;

/**
 * What one pointer event does to the test. A try starts when the handle is
 * pressed, and ends when it reaches the end of the track or is let go. A
 * cancelled pointer (the browser took it for a scroll) ends the try where it
 * got to.
 */
export function dragTrialStep(t: DragTrial, e: DragEvent): DragTrial {
  if (dragDone(t)) return t;
  if (e.kind === 'down') {
    if (t.current) return t;
    return { ...t, current: { start: e.at, at: clamp01(e.x), pointerType: e.pointerType || 'UNKNOWN' } };
  }
  const cur = t.current;
  if (!cur) return t;
  const x = e.kind === 'cancel' ? cur.at : clamp01(e.x);
  const furthest = Math.max(cur.at, x);
  const reached = furthest >= DRAG_END;
  if (e.kind === 'move' && !reached) return { ...t, current: { ...cur, at: furthest } };
  const done: DragTry = { start: cur.start, end: e.at, reached, furthest: Math.round(furthest * 100) / 100, pointerType: cur.pointerType };
  return { ...t, tries: [...t.tries, done], current: null };
}

export const giveUpDrag = (t: DragTrial): DragTrial => ({ ...t, current: null, gaveUp: true });

export type DragOutcome = 'not-done' | 'cannot' | 'all' | 'some' | 'none';

export interface DragResult {
  readonly outcome: DragOutcome;
  readonly reached: number;
  readonly tries: number;
  /** The middle time of the tries that reached the end, in milliseconds, or null. */
  readonly middleMs: number | null;
  /** How far the best try that did not reach the end got, 0 to 1, or null. */
  readonly bestShort: number | null;
  readonly pointerTypes: readonly string[];
}

export function dragResult(t: DragTrial): DragResult {
  const reachedTries = t.tries.filter((x) => x.reached);
  const times = reachedTries.map((x) => Math.max(0, x.end - x.start)).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const middleMs = times.length === 0 ? null : times.length % 2 === 1 ? (times[mid] ?? null) : Math.round(((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2);
  const short = t.tries.filter((x) => !x.reached).map((x) => x.furthest);
  const outcome: DragOutcome =
    t.tries.length === 0 ? (t.gaveUp ? 'cannot' : 'not-done') : reachedTries.length === t.tries.length ? 'all' : reachedTries.length === 0 ? 'none' : 'some';
  return {
    outcome,
    reached: reachedTries.length,
    tries: t.tries.length,
    middleMs,
    bestShort: short.length === 0 ? null : Math.max(...short),
    pointerTypes: [...new Set(t.tries.map((x) => x.pointerType))],
  };
}

/** Whether dragging is a likely barrier for this person: true, false, or null when the test was not done. */
export function dragIsHard(r: DragResult): boolean | null {
  if (r.outcome === 'not-done') return null;
  return r.outcome !== 'all';
}

const secText = (ms: number, lang: Lang): string => {
  const s = Math.round(ms / 100) / 10;
  return lang === 'fr' ? `${String(s).replace('.', ',')}${NBSP}s` : `${s} s`;
};
const pct = (x: number, lang: Lang): string => (lang === 'fr' ? `${Math.round(x * 100)}${NBSP}%` : `${Math.round(x * 100)}%`);

const POINTER: Record<string, { en: string; fr: string }> = {
  mouse: { en: 'a mouse or similar pointer', fr: 'une souris ou un pointeur semblable' },
  touch: { en: 'touch', fr: 'le toucher' },
  pen: { en: 'a pen or stylus', fr: 'un stylet' },
};

export function pointerWords(types: readonly string[], lang: Lang): string {
  const words = types.map((p) => POINTER[p]?.[lang] ?? 'UNKNOWN');
  return [...new Set(words)].join(lang === 'fr' ? ' et ' : ' and ');
}

/** The test in a few sentences. */
export function dragSummary(r: DragResult, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (r.outcome === 'not-done') return [fr ? 'Le test de glissement n’a pas été fait, donc votre façon de glisser est UNKNOWN.' : 'The drag test was not done, so how dragging works for you is UNKNOWN.'];
  if (r.outcome === 'cannot') return [fr ? 'Vous avez indiqué ne pas pouvoir glisser ici.' : 'You said you cannot drag here.'];
  const lines = [
    fr
      ? `${r.reached} ${r.reached < 2 ? 'essai a atteint' : 'essais ont atteint'} le bout de la piste sur ${r.tries}, avec ${pointerWords(r.pointerTypes, 'fr')}.`
      : `${r.reached} of ${r.tries} ${r.tries === 1 ? 'try' : 'tries'} reached the end of the track, with ${pointerWords(r.pointerTypes, 'en')}.`,
  ];
  if (r.middleMs !== null) lines.push(fr ? `Temps au milieu de ceux qui ont réussi${NBSP}: ${secText(r.middleMs, 'fr')}.` : `Middle time of those that made it: ${secText(r.middleMs, 'en')}.`);
  if (r.bestShort !== null) lines.push(fr ? `Le meilleur essai arrêté en route est allé à ${pct(r.bestShort, 'fr')} de la piste.` : `The best try that stopped short got ${pct(r.bestShort, 'en')} of the way.`);
  return lines;
}

/** One line for the barrier text and the access summary, or nothing before the test. */
export function dragNote(r: DragResult, lang: Lang): string {
  const fr = lang === 'fr';
  const head = fr ? `Glisser${NBSP}: ` : 'Dragging: ';
  switch (r.outcome) {
    case 'not-done':
      return '';
    case 'cannot':
      return head + (fr ? 'je ne peux pas glisser. J’ai besoin d’une autre façon de faire, par un appui simple.' : 'I cannot drag. I need another way to do it, with a single tap or click.');
    case 'all':
      return head + (fr ? `${r.reached} essais sur ${r.tries} réussis, ${secText(r.middleMs ?? 0, 'fr')} au milieu.` : `${r.reached} of ${r.tries} tries made it, ${secText(r.middleMs ?? 0, 'en')} in the middle.`);
    default:
      return (
        head +
        (fr
          ? `${r.reached} ${r.reached < 2 ? 'essai réussi' : 'essais réussis'} sur ${r.tries}. J’ai besoin d’une autre façon de faire, par un appui simple.`
          : `${r.reached} of ${r.tries} tries made it. I need another way to do it, with a single tap or click.`)
      );
  }
}
