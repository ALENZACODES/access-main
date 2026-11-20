import { NBSP, NNBSP, type Lang } from './types.js';
import type { ZoneControl, ZoneFacts } from './zones-inpage.js';

/**
 * Screen zones a person can reach. The window is cut into a grid of 3
 * columns and 4 rows. The person marks the zones they can reach with the
 * hand, finger, stylus or pointer they use. Each control of the page is then
 * checked: can it be brought into a marked zone, by scrolling if needed?
 *
 * A control that scrolls with the page can be brought up or down, as far as
 * the page scrolls, but never sideways. A control inside something fixed or
 * sticky stays where it is. The centre of each control is what counts.
 *
 * Nothing here says what a person can or cannot do: the zones are what the
 * person marked, on this screen, today.
 */

export const COLS = 3;
export const ROWS = 4;
export const CELLS = COLS * ROWS;

const ROW_NAMES: Readonly<Record<Lang, readonly string[]>> = {
  en: ['Top', 'Upper middle', 'Lower middle', 'Bottom'],
  fr: ['Haut', 'Mi-haut', 'Mi-bas', 'Bas'],
};
const COL_NAMES: Readonly<Record<Lang, readonly string[]>> = { en: ['left', 'centre', 'right'], fr: ['gauche', 'centre', 'droite'] };
const COL_PHRASES: Readonly<Record<Lang, readonly string[]>> = {
  en: ['the left column', 'the centre column', 'the right column'],
  fr: ['la colonne de gauche', 'la colonne du centre', 'la colonne de droite'],
};

export const rowOf = (cell: number): number => Math.floor(cell / COLS);
export const colOf = (cell: number): number => cell % COLS;

/** The name of a zone, such as "Bottom, left". */
export function cellName(cell: number, lang: Lang): string {
  return `${ROW_NAMES[lang][rowOf(cell)] ?? ''}, ${COL_NAMES[lang][colOf(cell)] ?? ''}`;
}

export const noCells = (): boolean[] => Array.from({ length: CELLS }, () => false);
export const allCells = (): boolean[] => Array.from({ length: CELLS }, () => true);
export const markedCount = (cells: readonly boolean[]): number => cells.filter(Boolean).length;

/** Sets of zones marked with one press, for those who mark the same shape often: fewer presses than one zone at a time. */
export const ZONE_PRESETS = ['bottom', 'left', 'right'] as const;
export type ZonePreset = (typeof ZONE_PRESETS)[number];

/** The zones of a set: the bottom half, the left column or the right column. */
export function presetCells(preset: ZonePreset): boolean[] {
  return noCells().map((_, i) => (preset === 'bottom' ? rowOf(i) >= ROWS / 2 : preset === 'left' ? colOf(i) === 0 : colOf(i) === COLS - 1));
}

/** A copy with one zone switched. An index outside the grid changes nothing. */
export function toggleCell(cells: readonly boolean[], cell: number): boolean[] {
  return cells.map((on, i) => (i === cell ? !on : on));
}

export type ZoneWhy = 'column' | 'pinned' | 'scroll-range' | 'off-screen' | 'beside';

export interface ZoneOutcome {
  readonly control: ZoneControl;
  /** The column of the centre of the control. */
  readonly col: number;
  /** For a control that stays in place, its zone. Null when it scrolls or sits outside the window. */
  readonly cell: number | null;
  /** The marked rows of its column it can be brought into. */
  readonly rows: readonly number[];
  readonly reachable: boolean;
  /** Why it cannot be brought into a marked zone. Null when it can. */
  readonly why: ZoneWhy | null;
}

export interface ZoneResult {
  readonly outcomes: readonly ZoneOutcome[];
  readonly out: readonly ZoneOutcome[];
  readonly marked: number;
  readonly width: number;
  readonly height: number;
  readonly offPage: number;
  readonly truncated: boolean;
}

export type ZoneCheck = { readonly kind: 'result'; readonly result: ZoneResult } | { readonly kind: 'no-size' } | { readonly kind: 'no-zone' };

/** Whether the range from `lo` to `hi` meets the band from `a` up to, but not including, `b`. */
const meets = (lo: number, hi: number, a: number, b: number): boolean => lo < b && hi >= a;

export function outcomeOf(c: ZoneControl, cells: readonly boolean[], width: number, height: number, scrollY: number, maxScrollY: number): ZoneOutcome {
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  const colW = width / COLS;
  const rowH = height / ROWS;
  const col = Math.min(COLS - 1, Math.max(0, Math.floor(cx / colW)));
  if (cx < 0 || cx >= width) return { control: c, col, cell: null, rows: [], reachable: false, why: 'beside' };
  if (c.pinned) {
    if (cy < 0 || cy >= height) return { control: c, col, cell: null, rows: [], reachable: false, why: 'off-screen' };
    const cell = Math.floor(cy / rowH) * COLS + col;
    const on = cells[cell] === true;
    return { control: c, col, cell, rows: on ? [rowOf(cell)] : [], reachable: on, why: on ? null : 'pinned' };
  }
  // Scrolled by s, from 0 to the end of the page, the centre sits at (cy + scrollY - s) in the window.
  const docY = cy + scrollY;
  const lo = docY - maxScrollY;
  const hi = docY;
  const rows: number[] = [];
  let columnMarked = false;
  for (let r = 0; r < ROWS; r += 1) {
    if (cells[r * COLS + col] !== true) continue;
    columnMarked = true;
    if (meets(lo, hi, r * rowH, (r + 1) * rowH)) rows.push(r);
  }
  const reachable = rows.length > 0;
  return { control: c, col, cell: null, rows, reachable, why: reachable ? null : columnMarked ? 'scroll-range' : 'column' };
}

export function checkZones(facts: ZoneFacts, cells: readonly boolean[]): ZoneCheck {
  const width = facts.viewportWidth;
  const height = facts.viewportHeight;
  if (width === null || height === null) return { kind: 'no-size' };
  const marked = markedCount(cells);
  if (marked === 0) return { kind: 'no-zone' };
  const outcomes = facts.controls.map((c) => outcomeOf(c, cells, width, height, facts.scrollY, facts.maxScrollY));
  return { kind: 'result', result: { outcomes, out: outcomes.filter((o) => !o.reachable), marked, width, height, offPage: facts.offPage, truncated: facts.truncated } };
}

const controls = (n: number, lang: Lang): string => (lang === 'fr' ? `${n} ${n < 2 ? 'commande' : 'commandes'}` : `${n} ${n === 1 ? 'control' : 'controls'}`);

/**
 * For each zone of the grid, how many controls of the page can be brought
 * into it, by scrolling if needed. It does not depend on what the person
 * marked, so it can help them see which zones the page uses most. Null with
 * no window size.
 */
export function zoneCounts(facts: ZoneFacts): number[] | null {
  const width = facts.viewportWidth;
  const height = facts.viewportHeight;
  if (width === null || height === null) return null;
  return Array.from({ length: CELLS }, (_, cell) => {
    const only = noCells().map((_, i) => i === cell);
    return facts.controls.filter((c) => outcomeOf(c, only, width, height, facts.scrollY, facts.maxScrollY).reachable).length;
  });
}

/** The zone, or zones, that can hold the most controls, and how many. Null with no window size or no control. */
export function busiestZones(counts: readonly number[] | null): { readonly cells: readonly number[]; readonly count: number } | null {
  if (!counts) return null;
  const count = Math.max(0, ...counts);
  if (count === 0) return null;
  return { cells: counts.map((n, i) => (n === count ? i : -1)).filter((i) => i >= 0), count };
}

/** One sentence on the zone that can hold the most controls. */
export function busiestText(facts: ZoneFacts, lang: Lang): string {
  const fr = lang === 'fr';
  const best = busiestZones(zoneCounts(facts));
  if (!best) return fr ? 'Zone la plus utile UNKNOWN.' : 'Most useful zone UNKNOWN.';
  const names = best.cells.map((c) => cellName(c, lang)).join(fr ? `${NNBSP}; ` : '; ');
  const total = facts.controls.length;
  return fr
    ? `${best.cells.length < 2 ? 'La zone qui peut recevoir' : 'Les zones qui peuvent recevoir'} le plus de commandes${NBSP}: ${names}, avec ${best.count} sur ${total}.`
    : `The ${best.cells.length === 1 ? 'zone' : 'zones'} that can take the most controls: ${names}, with ${best.count} of ${total}.`;
}

/** What was found, in a few sentences. */
export function zoneSummary(check: ZoneCheck, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (check.kind === 'no-size') {
    return [fr ? 'Taille de la fenêtre UNKNOWN, donc les zones ne peuvent pas être placées. Rien n’a été compté.' : 'Window size UNKNOWN, so the zones cannot be placed. Nothing was counted.'];
  }
  if (check.kind === 'no-zone') return [fr ? 'Aucune zone n’est cochée. Le résultat reste UNKNOWN.' : 'No zone is marked. The result stays UNKNOWN.'];
  const r = check.result;
  const total = r.outcomes.length;
  const out = r.out.length;
  const lines = [
    fr
      ? `Vous avez coché ${r.marked} ${r.marked < 2 ? 'zone' : 'zones'} sur ${CELLS}. Le compte vaut pour cette fenêtre de ${Math.round(r.width)} sur ${Math.round(r.height)} pixels CSS. Une autre taille ou un autre zoom déplace les commandes.`
      : `You marked ${r.marked} of ${CELLS} zones. Counted for this window, ${Math.round(r.width)} by ${Math.round(r.height)} CSS pixels. Another size or zoom moves the controls.`,
  ];
  if (total === 0) {
    lines.push(fr ? 'Aucune commande visible n’a été trouvée sur cette page.' : 'No visible control was found on this page.');
  } else if (out === 0 && total === 1) {
    lines.push(
      fr
        ? 'La seule commande de cette page peut être amenée dans une zone cochée, en faisant défiler au besoin.'
        : 'The one control of this page can be brought into a zone you marked, by scrolling if needed.',
    );
  } else if (out === 0) {
    lines.push(
      fr
        ? `Les ${total} commandes de cette page peuvent être amenées dans une zone cochée, en faisant défiler au besoin.`
        : `All ${total} controls of this page can be brought into a zone you marked, by scrolling if needed.`,
    );
  } else {
    lines.push(
      fr
        ? `Sur ${controls(total, 'fr')}, ${total - out} ${total - out < 2 ? 'peut' : 'peuvent'} être ${total - out < 2 ? 'amenée' : 'amenées'} dans une zone cochée, en faisant défiler au besoin, et ${out} ne le ${out < 2 ? 'peut' : 'peuvent'} pas.`
        : `Of ${controls(total, 'en')}, ${total - out} can be brought into a zone you marked, by scrolling if needed, and ${out} cannot.`,
    );
  }
  if (r.offPage > 0) {
    lines.push(
      fr
        ? `${controls(r.offPage, 'fr')} ${r.offPage < 2 ? 'est placée' : 'sont placées'} hors de la page jusqu’à ce qu’${r.offPage < 2 ? 'elle reçoive' : 'elles reçoivent'} le focus, comme un lien d’évitement. ${r.offPage < 2 ? 'Elle est laissée' : 'Elles sont laissées'} de côté.`
        : `${controls(r.offPage, 'en')} ${r.offPage === 1 ? 'sits' : 'sit'} off the page until ${r.offPage === 1 ? 'it takes' : 'they take'} focus, like a skip link. ${r.offPage === 1 ? 'It was' : 'They were'} left out.`,
    );
  }
  if (r.truncated) lines.push(fr ? 'La page est longue et seule une partie a été lue, donc le reste est UNKNOWN.' : 'The page is long and only part of it was read, so the rest is UNKNOWN.');
  return lines;
}

/** Why one control is out of reach, in one sentence. */
export function whyText(o: ZoneOutcome, lang: Lang): string {
  const fr = lang === 'fr';
  switch (o.why) {
    case 'column':
      return fr ? `Dans ${COL_PHRASES.fr[o.col] ?? ''}, où aucune zone n’est cochée.` : `In ${COL_PHRASES.en[o.col] ?? ''}, where no zone is marked.`;
    case 'pinned':
      return fr
        ? `Reste en place, zone ${cellName(o.cell ?? 0, 'fr')}, quand la page défile.`
        : `Stays in place, at ${cellName(o.cell ?? 0, 'en')}, when the page scrolls.`;
    case 'scroll-range':
      return fr
        ? 'La page ne défile pas assez pour l’amener dans une zone cochée de sa colonne.'
        : 'The page does not scroll far enough to bring it into a marked zone of its column.';
    case 'off-screen':
      return fr ? 'Reste en place hors de la fenêtre.' : 'Stays in place outside the window.';
    case 'beside':
      return fr ? 'Se trouve à côté de la fenêtre, au-delà de son bord.' : 'Sits beside the window, past its edge.';
    default:
      return '';
  }
}

/** The name of a control in words, or what it is when it has no name. */
export function controlName(c: ZoneControl, lang: Lang): string {
  if (c.name !== '') return c.name;
  return lang === 'fr' ? `sans nom (${c.id})` : `no name (${c.id})`;
}

export type ZoneNoteKind = 'pinned-out' | 'side-out' | 'all-pinned-in';

/** Notes for the team about what the result points to. */
export function zoneNotes(check: ZoneCheck, lang: Lang): Array<{ readonly kind: ZoneNoteKind; readonly text: string }> {
  if (check.kind !== 'result') return [];
  const fr = lang === 'fr';
  const out: Array<{ kind: ZoneNoteKind; text: string }> = [];
  const pinned = check.result.out.filter((o) => o.why === 'pinned' || o.why === 'off-screen').length;
  const side = check.result.out.filter((o) => o.why === 'column' || o.why === 'beside').length;
  if (pinned > 0) {
    out.push({
      kind: 'pinned-out',
      text: fr
        ? `${controls(pinned, 'fr')} hors d’atteinte ${pinned < 2 ? 'reste' : 'restent'} en place quand la page défile, donc défiler ne les rapproche pas. Une version de ces commandes qui défile avec la page, ou une copie en bas, pourrait les rendre atteignables.`
        : `${controls(pinned, 'en')} out of reach ${pinned === 1 ? 'stays' : 'stay'} in place when the page scrolls, so scrolling does not bring ${pinned === 1 ? 'it' : 'them'} closer. A version that scrolls with the page, or a copy at the bottom, could bring ${pinned === 1 ? 'it' : 'them'} within reach.`,
    });
  }
  if (side > 0) {
    out.push({
      kind: 'side-out',
      text: fr
        ? `${controls(side, 'fr')} hors d’atteinte ${side < 2 ? 'est' : 'sont'} dans une colonne sans zone cochée. Défiler ne déplace pas sur le côté. Un zoom différent ou une mise en page sur une colonne peut les rapprocher.`
        : `${controls(side, 'en')} out of reach ${side === 1 ? 'is' : 'are'} in a column with no marked zone. Scrolling does not move sideways. Another zoom or a one-column layout may bring ${side === 1 ? 'it' : 'them'} closer.`,
    });
  }
  return out;
}

/**
 * One line for the barrier text: the zones the person marked. Empty when
 * none is marked, so nothing is said for the person.
 */
export function zoneNote(cells: readonly boolean[], lang: Lang): string {
  const marked = cells.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  if (marked.length === 0) return '';
  const names = marked.map((i) => cellName(i, lang));
  return lang === 'fr'
    ? `Zones de l’écran que j’atteins${NBSP}: ${names.join(`${NNBSP}; `)} (${marked.length} sur ${CELLS}).`
    : `Screen zones I can reach: ${names.join('; ')} (${marked.length} of ${CELLS}).`;
}

/** The result as plain text, to paste into a message or a ticket. */
export function zonesText(check: ZoneCheck, cells: readonly boolean[], lang: Lang, max = 40, facts: ZoneFacts | null = null): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines = [fr ? 'Zones de l’écran que j’atteins' : 'Screen zones I can reach'];
  const note = zoneNote(cells, lang);
  if (note !== '') lines.push(note);
  lines.push(...zoneSummary(check, lang));
  for (const n of zoneNotes(check, lang)) lines.push(`- ${n.text}`);
  if (facts) lines.push(busiestText(facts, lang));
  if (check.kind === 'result') {
    const shown = check.result.out.slice(0, max);
    for (const o of shown) lines.push(`${controlName(o.control, lang)}${colon} ${whyText(o, lang)}`);
    const more = check.result.out.length - shown.length;
    if (more > 0) lines.push(fr ? `… et ${more} de plus.` : `… and ${more} more.`);
  }
  lines.push(
    fr
      ? 'Les zones sont celles que la personne a cochées, sur cet écran, aujourd’hui. Le centre de chaque commande est ce qui compte.'
      : 'The zones are the ones the person marked, on this screen, today. The centre of each control is what counts.',
  );
  return `${lines.join('\n')}\n`;
}
