import { NBSP, NNBSP, type Lang } from './types.js';
import type { ScanControl, ScanFacts } from './scan-inpage.js';

/**
 * What reaching each control of a page costs a person who uses one or two
 * switches with scanning. The panel uses the person's own settings:
 *
 * - linear scanning highlights the controls one by one, in tab order;
 * - row-column scanning highlights the rows of the screen one by one, then
 *   the controls of the chosen row from left to right;
 * - with auto scan, a step passes every interval; with step scan, each step
 *   is one press of the switch.
 *
 * Steps count the highlights up to and including the control, from the start
 * of the page. One more press selects it. A real scanner may group controls
 * differently: these are counts for this page as laid out, said as such.
 */

export type ScanMode = 'linear' | 'row-column';
export type ScanPace = 'auto' | 'step';

export interface ScanSettings {
  readonly mode: ScanMode;
  readonly pace: ScanPace;
  /** Milliseconds a highlight stays, for auto scan. */
  readonly intervalMs: number;
}

export const SCAN_INTERVALS: readonly number[] = [500, 1_000, 1_500, 2_000, 3_000];
export const DEFAULT_SCAN: ScanSettings = { mode: 'linear', pace: 'auto', intervalMs: 1_500 };
/** More steps than this to reach the main action is called long. */
export const FAR_STEPS = 20;
/** More controls than this in one row makes row-column scanning slow in that row. */
export const LONG_ROW = 8;
/** How many of the costliest controls are listed. */
export const SCAN_LISTED = 10;

/**
 * The rows of the screen: a control joins a row when its middle is within the
 * row's top and bottom so far. Rows go from top to bottom, and controls in a
 * row from left to right.
 */
export function rowsOf(controls: readonly ScanControl[]): ScanControl[][] {
  const sorted = [...controls].sort((a, b) => a.top - b.top || a.left - b.left);
  const rows: Array<{ top: number; bottom: number; items: ScanControl[] }> = [];
  for (const c of sorted) {
    const mid = c.top + c.height / 2;
    const row = rows.find((r) => mid >= r.top && mid <= r.bottom);
    if (row) {
      row.items.push(c);
      row.bottom = Math.max(row.bottom, c.top + c.height);
    } else rows.push({ top: c.top, bottom: c.top + c.height, items: [c] });
  }
  return rows.sort((a, b) => a.top - b.top).map((r) => r.items.sort((a, b) => a.left - b.left));
}

export interface ScanCost {
  readonly control: ScanControl;
  /** Its place in tab order, from 1. */
  readonly order: number;
  readonly steps: number;
  /** Milliseconds to reach it with auto scan, or null with step scan. */
  readonly ms: number | null;
  /** Presses to reach and select it: 1 with auto scan (a press for the row with row-column, then one for the control), steps + 1 with step scan. */
  readonly presses: number;
}

export interface ScanModel {
  readonly settings: ScanSettings;
  readonly costs: readonly ScanCost[];
  readonly rows: number;
  readonly longRows: number;
  /** Times the tab order goes back up the screen to an earlier row. */
  readonly backJumps: number;
  /** The first control that looks like the main action, or null when none does. */
  readonly main: ScanCost | null;
  /** The control that takes the most steps, or null on a page with none. */
  readonly last: ScanCost | null;
  readonly truncated: boolean;
}

export function buildScan(facts: ScanFacts, settings: ScanSettings): ScanModel {
  const controls = facts.controls;
  const rows = rowsOf(controls);
  const rowOf = new Map<ScanControl, { row: number; col: number }>();
  rows.forEach((r, i) => r.forEach((c, j) => rowOf.set(c, { row: i, col: j })));
  const costs = controls.map((control, i): ScanCost => {
    const place = rowOf.get(control) ?? { row: 0, col: 0 };
    const steps = settings.mode === 'linear' ? i + 1 : place.row + 1 + place.col + 1;
    const autoPresses = settings.mode === 'linear' ? 1 : 2;
    return {
      control,
      order: i + 1,
      steps,
      ms: settings.pace === 'auto' ? steps * settings.intervalMs : null,
      presses: settings.pace === 'auto' ? autoPresses : steps + 1,
    };
  });
  let backJumps = 0;
  for (let i = 1; i < controls.length; i++) {
    const a = rowOf.get(controls[i - 1] as ScanControl);
    const b = rowOf.get(controls[i] as ScanControl);
    if (a && b && b.row < a.row) backJumps += 1;
  }
  const last = costs.reduce<ScanCost | null>((m, c) => (m === null || c.steps > m.steps ? c : m), null);
  return {
    settings,
    costs,
    rows: rows.length,
    longRows: rows.filter((r) => r.length > LONG_ROW).length,
    backJumps,
    main: costs.find((c) => c.control.main) ?? null,
    last,
    truncated: facts.truncated,
  };
}

/** The costliest controls, most steps first, ties in tab order. */
export function costliest(m: ScanModel, n = SCAN_LISTED): ScanCost[] {
  return [...m.costs].sort((a, b) => b.steps - a.steps || a.order - b.order).slice(0, n);
}

const num = (x: number, lang: Lang): string => (lang === 'fr' ? String(x).replace('.', ',') : String(x));
export function durationText(ms: number, lang: Lang): string {
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return lang === 'fr' ? `${num(s, 'fr')}${NBSP}s` : `${s} s`;
  const min = Math.floor(s / 60);
  const rest = Math.round(s - min * 60);
  return lang === 'fr' ? `${min}${NBSP}min ${rest}${NBSP}s` : `${min} min ${rest} s`;
}

const q = (name: string, lang: Lang): string => (name === '' ? 'UNKNOWN' : lang === 'fr' ? `«${NNBSP}${name}${NNBSP}»` : `“${name}”`);

export function settingsText(s: ScanSettings, lang: Lang): string {
  const fr = lang === 'fr';
  const mode = s.mode === 'linear' ? (fr ? 'un par un' : 'one by one') : fr ? 'ligne par ligne' : 'row by row';
  const pace =
    s.pace === 'auto'
      ? fr
        ? `en défilement automatique, ${durationText(s.intervalMs, 'fr')} par étape`
        : `with auto scan, ${durationText(s.intervalMs, 'en')} a step`
      : fr
        ? 'pas à pas, un appui par étape'
        : 'step by step, one press a step';
  return fr ? `Balayage ${mode}, ${pace}` : `Scanning ${mode}, ${pace}`;
}

/** One control's cost as a sentence. */
export function costText(c: ScanCost, lang: Lang): string {
  const fr = lang === 'fr';
  const steps = fr ? `${c.steps} ${c.steps < 2 ? 'étape' : 'étapes'}` : `${c.steps} ${c.steps === 1 ? 'step' : 'steps'}`;
  const time = c.ms === null ? '' : fr ? `, environ ${durationText(c.ms, 'fr')}` : `, about ${durationText(c.ms, 'en')}`;
  const presses = fr ? `${c.presses} ${c.presses < 2 ? 'appui' : 'appuis'}` : `${c.presses} ${c.presses === 1 ? 'press' : 'presses'}`;
  return fr ? `${q(c.control.name, 'fr')} (n° ${c.order} au clavier)${NBSP}: ${steps}${time}, ${presses}.` : `${q(c.control.name, 'en')} (number ${c.order} by Tab): ${steps}${time}, ${presses}.`;
}

/** The page in a few sentences, with the person's settings. */
export function scanSummary(m: ScanModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const n = m.costs.length;
  if (n === 0) return [fr ? 'Aucune commande n’a été trouvée dans cette page, donc rien n’est à balayer.' : 'No control was found on this page, so there is nothing to scan.'];
  const lines = [
    `${settingsText(m.settings, lang)}.`,
    fr
      ? `${n} ${n < 2 ? 'commande' : 'commandes'} sur ${m.rows} ${m.rows < 2 ? 'ligne' : 'lignes'}${m.truncated ? ' (la lecture s’est arrêtée avant la fin)' : ''}.`
      : `${n} ${n === 1 ? 'control' : 'controls'} on ${m.rows} ${m.rows === 1 ? 'row' : 'rows'}${m.truncated ? ' (the reading stopped before the end)' : ''}.`,
  ];
  if (m.main) {
    lines.push(fr ? `L’action principale qui semble la plus proche${NBSP}: ${costText(m.main, 'fr')}` : `The first control that looks like the main action: ${costText(m.main, 'en')}`);
  } else {
    lines.push(fr ? 'Aucune commande ne ressemble à l’action principale, donc son coût est UNKNOWN.' : 'No control looks like the main action, so what it costs is UNKNOWN.');
  }
  if (m.last && m.last !== m.main) lines.push(fr ? `La plus longue à atteindre${NBSP}: ${costText(m.last, 'fr')}` : `The longest to reach: ${costText(m.last, 'en')}`);
  return lines;
}

export type ScanNoteKind = 'far-main' | 'back-jumps' | 'long-rows';

/** What may make scanning this page harder, each as a sentence. */
export function scanNotes(m: ScanModel, lang: Lang): Array<{ readonly kind: ScanNoteKind; readonly text: string }> {
  const fr = lang === 'fr';
  const out: Array<{ kind: ScanNoteKind; text: string }> = [];
  if (m.main && m.main.steps > FAR_STEPS) {
    out.push({
      kind: 'far-main',
      text: fr
        ? `L’action principale demande plus de ${FAR_STEPS}${NBSP}étapes. Un faux appui en route peut obliger à tout recommencer.`
        : `The main action takes more than ${FAR_STEPS} steps. One wrong press on the way may mean starting over.`,
    });
  }
  if (m.settings.mode === 'linear' && m.backJumps > 0) {
    out.push({
      kind: 'back-jumps',
      text: fr
        ? `L’ordre du clavier remonte l’écran ${m.backJumps}${NBSP}fois. Le surlignage saute alors en arrière, ce qui rend la suite difficile à prévoir.`
        : `The tab order goes back up the screen ${m.backJumps} ${m.backJumps === 1 ? 'time' : 'times'}. The highlight then jumps back, which makes what comes next hard to predict.`,
    });
  }
  if (m.settings.mode === 'row-column' && m.longRows > 0) {
    out.push({
      kind: 'long-rows',
      text: fr
        ? `${m.longRows} ${m.longRows < 2 ? 'ligne compte' : 'lignes comptent'} plus de ${LONG_ROW}${NBSP}commandes. Le balayage de ces lignes est long.`
        : `${m.longRows} ${m.longRows === 1 ? 'row has' : 'rows have'} more than ${LONG_ROW} controls. Scanning ${m.longRows === 1 ? 'that row' : 'those rows'} is slow.`,
    });
  }
  return out;
}

/** General hints for the team, from what was found. */
export function scanAdvice(m: ScanModel, lang: Lang): string[] {
  const fr = lang === 'fr';
  const kinds = new Set(scanNotes(m, lang).map((n) => n.kind));
  const out: string[] = [];
  if (kinds.has('far-main') || (m.main === null && m.costs.length > FAR_STEPS)) {
    out.push(
      fr
        ? 'Mettre l’action principale tôt dans l’ordre du clavier, ou un lien d’évitement qui y mène.'
        : 'Put the main action early in the tab order, or a skip link that leads to it.',
    );
  }
  if (kinds.has('back-jumps')) out.push(fr ? 'Faire suivre à l’ordre du clavier l’ordre de l’écran, de haut en bas.' : 'Make the tab order follow the screen, from top to bottom.');
  if (kinds.has('long-rows')) out.push(fr ? 'Couper les longues rangées de boutons, ou les regrouper dans un menu.' : 'Break up long rows of buttons, or group them in a menu.');
  return out;
}

/** The person's settings as one line, with nothing about any page: for the access summary. */
export function scanSettingsNote(settings: ScanSettings, lang: Lang): string {
  return `${lang === 'fr' ? `Balayage par contacteur${NBSP}: ` : 'Switch scanning: '}${settingsText(settings, lang).replace(/^(Scanning|Balayage) /, '')}.`;
}

/** One line for the barrier text: the person's settings and the main action's cost. Empty until the page was read. */
export function scanNote(m: ScanModel | null, lang: Lang): string {
  if (!m || m.costs.length === 0) return '';
  const fr = lang === 'fr';
  const head = scanSettingsNote(m.settings, lang);
  if (!m.main) return head;
  return `${head} ${fr ? `L’action principale demande ${m.main.steps}${NBSP}étapes.` : `The main action takes ${m.main.steps} ${m.main.steps === 1 ? 'step' : 'steps'}.`}`;
}
