import { NBSP, NNBSP, type Lang } from './types.js';
import type { TravelControl, TravelFacts } from './travel-inpage.js';

/**
 * Pointer travel. A person who moves a pointer with their head, their eyes,
 * a mouth stick or a trackball pays for every centimetre: filling a form
 * means moving from each field to the next, then to the button that sends
 * it. This counts, for each form of the page, how far the pointer travels
 * from the centre of each control to the next in document order, how often
 * it has to go back the other way (fields set side by side), and the longest
 * single move.
 *
 * Distances are in CSS pixels and in widths of the window as it is now. They
 * are a measure of the layout, not of anyone's effort.
 */

/** A move left or right shorter than this is not counted as a change of direction. */
export const ZIG_DX = 40;
/** More changes of direction than this in one form are pointed out. */
export const ZIGZAG_MAX = 2;
/** A path to the send button longer than this, in window widths, is pointed out. */
export const FAR_SUBMIT = 3;

export interface TravelMove {
  readonly from: TravelControl;
  readonly to: TravelControl;
  readonly px: number;
}

export interface FormTravel {
  readonly index: number;
  readonly name: string;
  readonly controls: readonly TravelControl[];
  /** From the first control to the last, in CSS pixels, rounded. */
  readonly total: number;
  /** From the first control to the send button, or null when the form has none. */
  readonly toSubmit: number | null;
  readonly zigzags: number;
  readonly longest: TravelMove | null;
}

export interface TravelModel {
  readonly width: number | null;
  readonly forms: readonly FormTravel[];
  /** Controls outside any form, not counted in a path. */
  readonly outside: number;
  readonly truncated: boolean;
}

const centre = (c: TravelControl): { x: number; y: number } => ({ x: c.left + c.width / 2, y: c.top + c.height / 2 });

export function moveLength(a: TravelControl, b: TravelControl): number {
  const p = centre(a);
  const q = centre(b);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/** The path through controls in order: its length, its changes of direction left and right, and its longest move. */
export function pathOf(cs: readonly TravelControl[]): { total: number; zigzags: number; longest: TravelMove | null } {
  let total = 0;
  let zigzags = 0;
  let longest: TravelMove | null = null;
  let lastSign = 0;
  for (let i = 1; i < cs.length; i += 1) {
    const a = cs[i - 1];
    const b = cs[i];
    if (!a || !b) continue;
    const d = moveLength(a, b);
    total += d;
    if (!longest || d > longest.px) longest = { from: a, to: b, px: Math.round(d) };
    const dx = centre(b).x - centre(a).x;
    if (Math.abs(dx) >= ZIG_DX) {
      const sign = Math.sign(dx);
      if (lastSign !== 0 && sign !== lastSign) zigzags += 1;
      lastSign = sign;
    }
  }
  return { total: Math.round(total), zigzags, longest };
}

export function buildTravel(f: TravelFacts): TravelModel {
  const forms: FormTravel[] = [];
  f.forms.forEach((name, index) => {
    const cs = f.controls.filter((c) => c.form === index);
    if (cs.length === 0) return;
    const path = pathOf(cs);
    const submitAt = cs.findIndex((c) => c.submit);
    forms.push({ index, name, controls: cs, total: path.total, toSubmit: submitAt < 0 ? null : pathOf(cs.slice(0, submitAt + 1)).total, zigzags: path.zigzags, longest: path.longest });
  });
  return { width: f.viewportWidth, forms, outside: f.controls.filter((c) => c.form < 0).length, truncated: f.truncated };
}

const q = (s: string, lang: Lang): string => (lang === 'fr' ? `«${NNBSP}${s}${NNBSP}»` : `“${s}”`);
const num = (n: number, lang: Lang): string => (lang === 'fr' ? String(n).replace('.', ',') : String(n));

/** A distance in pixels and, when the window width is known, in window widths. */
export function distanceText(px: number, width: number | null, lang: Lang): string {
  const fr = lang === 'fr';
  const p = fr ? `${px}${NBSP}px` : `${px} px`;
  if (width === null || width <= 0) return fr ? `${p} (largeur de fenêtre UNKNOWN)` : `${p} (window width UNKNOWN)`;
  const w = Math.round((px / width) * 10) / 10;
  return fr ? `${p}, soit ${num(w, 'fr')}${NBSP}${w < 2 ? 'largeur' : 'largeurs'} de fenêtre` : `${p}, or ${num(w, 'en')} window ${w === 1 ? 'width' : 'widths'}`;
}

export const travelControlName = (c: TravelControl, lang: Lang): string => (c.name !== '' ? c.name : lang === 'fr' ? `sans nom (${c.id})` : `no name (${c.id})`);

/** A form in words: its name, or its order on the page. */
export function formName(f: FormTravel, lang: Lang): string {
  if (f.name !== '') return q(f.name, lang);
  return lang === 'fr' ? `Formulaire ${f.index + 1}` : `Form ${f.index + 1}`;
}

/** What was found, in a few sentences. */
export function travelSummary(m: TravelModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (m.forms.length === 0) {
    return [fr ? 'Cette page n’a aucun formulaire avec des commandes visibles, donc aucun trajet n’a été compté.' : 'This page has no form with visible controls, so no path was counted.'];
  }
  const lines = [
    fr
      ? `${m.forms.length}${NBSP}${m.forms.length < 2 ? 'formulaire a été compté' : 'formulaires ont été comptés'}, d’une commande à la suivante dans l’ordre de la page.`
      : `${m.forms.length} ${m.forms.length === 1 ? 'form was' : 'forms were'} counted, from each control to the next in page order.`,
  ];
  if (m.width === null) lines.push(fr ? 'Largeur de la fenêtre UNKNOWN, donc les distances sont en pixels seulement.' : 'Window width UNKNOWN, so the distances are in pixels only.');
  if (m.truncated) lines.push(fr ? 'La page est longue et seule une partie a été lue, donc le reste est UNKNOWN.' : 'The page is long and only part of it was read, so the rest is UNKNOWN.');
  return lines;
}

/** One form in a few sentences. */
export function formLines(f: FormTravel, width: number | null, lang: Lang): string[] {
  const fr = lang === 'fr';
  const n = f.controls.length;
  const lines = [
    fr
      ? `${n}${NBSP}${n < 2 ? 'commande' : 'commandes'}. Trajet de la première à la dernière${NBSP}: ${distanceText(f.total, width, 'fr')}.`
      : `${n} ${n === 1 ? 'control' : 'controls'}. Path from the first to the last: ${distanceText(f.total, width, 'en')}.`,
  ];
  lines.push(
    f.toSubmit === null
      ? fr
        ? 'Bouton d’envoi UNKNOWN, aucun n’a été trouvé dans ce formulaire.'
        : 'Send button UNKNOWN, none was found in this form.'
      : fr
        ? `Jusqu’au bouton d’envoi${NBSP}: ${distanceText(f.toSubmit, width, 'fr')}.`
        : `To the send button: ${distanceText(f.toSubmit, width, 'en')}.`,
  );
  if (f.longest) {
    lines.push(
      fr
        ? `Le plus long déplacement va de ${q(travelControlName(f.longest.from, 'fr'), 'fr')} à ${q(travelControlName(f.longest.to, 'fr'), 'fr')}${NBSP}: ${distanceText(f.longest.px, width, 'fr')}.`
        : `The longest move goes from ${q(travelControlName(f.longest.from, 'en'), 'en')} to ${q(travelControlName(f.longest.to, 'en'), 'en')}: ${distanceText(f.longest.px, width, 'en')}.`,
    );
  }
  return lines;
}

export type TravelNoteKind = 'zigzag' | 'long-move' | 'far-submit';

/** What one form's path points to. */
export function formNotes(f: FormTravel, width: number | null, lang: Lang): Array<{ readonly kind: TravelNoteKind; readonly text: string }> {
  const fr = lang === 'fr';
  const out: Array<{ kind: TravelNoteKind; text: string }> = [];
  if (f.zigzags > ZIGZAG_MAX) {
    out.push({
      kind: 'zigzag',
      text: fr
        ? `Le pointeur change ${f.zigzags}${NBSP}fois de sens, de gauche à droite puis de droite à gauche. Des champs côte à côte coûtent ces allers-retours. Une seule colonne raccourcit le trajet.`
        : `The pointer changes direction ${f.zigzags} times, left then right then left. Fields set side by side cost these trips back and forth. One column shortens the path.`,
    });
  }
  if (width !== null && f.longest && f.longest.px > width) {
    out.push({
      kind: 'long-move',
      text: fr
        ? 'Un seul déplacement dépasse la largeur de la fenêtre. Rapprocher ces deux commandes, ou les placer dans l’ordre où on les remplit, réduit l’effort.'
        : 'A single move is longer than the window is wide. Bringing those two controls closer, or placing them in the order they are filled in, cuts the effort.',
    });
  }
  if (width !== null && f.toSubmit !== null && f.toSubmit > FAR_SUBMIT * width) {
    out.push({
      kind: 'far-submit',
      text: fr
        ? `Le trajet jusqu’au bouton d’envoi dépasse ${FAR_SUBMIT}${NBSP}largeurs de fenêtre. Un formulaire plus court, ou en plusieurs étapes, le raccourcit.`
        : `The path to the send button is longer than ${FAR_SUBMIT} window widths. A shorter form, or one in steps, shortens it.`,
    });
  }
  return out;
}

/** The result as plain text, to paste into a message or a ticket. */
export function travelText(m: TravelModel, lang: Lang): string {
  const fr = lang === 'fr';
  const lines = [fr ? 'Déplacement du pointeur' : 'Pointer travel', ...travelSummary(m, lang)];
  for (const f of m.forms) {
    lines.push('', formName(f, lang), ...formLines(f, m.width, lang), ...formNotes(f, m.width, lang).map((n) => `- ${n.text}`));
  }
  lines.push(
    '',
    fr
      ? 'Ces distances vont du centre d’une commande au centre de la suivante, à cette taille de fenêtre. Elles mesurent la mise en page, pas l’effort de qui que ce soit.'
      : 'These distances go from the centre of one control to the centre of the next, at this window size. They measure the layout, not anyone’s effort.',
  );
  return `${lines.join('\n')}\n`;
}
