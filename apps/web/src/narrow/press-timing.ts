import { NBSP, NNBSP, type Lang } from './types.js';

/**
 * "How I press": a short test that times the person's own presses on a large
 * button, by touch, pointer or key. It measures how long each press is held,
 * the time between presses, and how often a held key repeated. Those times
 * are then set against the timing many devices and pages use, so the person
 * and the team can see which may misfire: a long press, a key that repeats,
 * two presses taken as a double press.
 *
 * It says nothing about the person: the times are those of this screen, this
 * input, today. Nothing is stored or sent.
 */

/** Presses in one test. */
export const PRESSES = 8;

/** Many phones treat a touch held this long as a long press, and many keyboards start repeating a held key after about this long. */
export const LONG_PRESS_MS = 500;

/** Two presses closer than this are often read as one double press. */
export const DOUBLE_PRESS_MS = 500;

/** A press shorter than this is often a bounce or a slip, not a press. */
export const BOUNCE_MS = 30;

export type PressVia = 'touch' | 'pointer' | 'key';

export interface PressSample {
  /** Times in milliseconds, from any fixed start. */
  readonly down: number;
  readonly up: number;
  readonly via: PressVia;
}

export interface PressState {
  readonly phase: 'idle' | 'running' | 'done';
  readonly samples: readonly PressSample[];
  /** The press under way: when it went down and how. Null between presses. */
  readonly pending: { readonly down: number; readonly via: PressVia } | null;
  /** Key repeats seen while a key was held. */
  readonly repeats: number;
  readonly stopped: boolean;
}

export const initialPress = (): PressState => ({ phase: 'idle', samples: [], pending: null, repeats: 0, stopped: false });

export function startPress(): PressState {
  return { ...initialPress(), phase: 'running' };
}

/** A press goes down. A second down before the up (another finger, a key repeat) is not a new press. */
export function pressDown(s: PressState, at: number, via: PressVia, repeat = false): PressState {
  if (s.phase !== 'running') return s;
  if (repeat) return s.pending ? { ...s, repeats: s.repeats + 1 } : s;
  if (s.pending) return s;
  return { ...s, pending: { down: at, via } };
}

/** The press comes up: it is counted, and the test ends after the last one. An up with no down is ignored. */
export function pressUp(s: PressState, at: number): PressState {
  if (s.phase !== 'running' || !s.pending) return s;
  const sample: PressSample = { down: s.pending.down, up: Math.max(at, s.pending.down), via: s.pending.via };
  const samples = [...s.samples, sample];
  return { ...s, samples, pending: null, phase: samples.length >= PRESSES ? 'done' : 'running' };
}

/** The press under way was cancelled by the browser (a scroll took it, say): it is not counted. */
export function pressCancel(s: PressState): PressState {
  return s.phase === 'running' ? { ...s, pending: null } : s;
}

export function stopPress(s: PressState): PressState {
  return s.phase === 'running' ? { ...s, phase: 'done', pending: null, stopped: true } : s;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const m = v.length % 2 === 1 ? (v[mid] ?? 0) : ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2;
  return Math.round(m);
}

export interface PressStats {
  readonly count: number;
  /** How long each press was held, in milliseconds, in order. */
  readonly holds: readonly number[];
  /** The time from each press coming up to the next going down. */
  readonly gaps: readonly number[];
  readonly holdMedian: number | null;
  readonly holdMin: number | null;
  readonly holdMax: number | null;
  readonly gapMedian: number | null;
  readonly gapMin: number | null;
  readonly repeats: number;
  readonly vias: readonly PressVia[];
}

export function pressStats(s: PressState): PressStats {
  const holds = s.samples.map((x) => Math.round(x.up - x.down));
  const gaps: number[] = [];
  for (let i = 1; i < s.samples.length; i += 1) {
    const a = s.samples[i - 1];
    const b = s.samples[i];
    if (a && b) gaps.push(Math.max(0, Math.round(b.down - a.up)));
  }
  const vias = [...new Set(s.samples.map((x) => x.via))];
  return {
    count: s.samples.length,
    holds,
    gaps,
    holdMedian: median(holds),
    holdMin: holds.length ? Math.min(...holds) : null,
    holdMax: holds.length ? Math.max(...holds) : null,
    gapMedian: median(gaps),
    gapMin: gaps.length ? Math.min(...gaps) : null,
    repeats: s.repeats,
    vias,
  };
}

export type PressFindingKind = 'long-hold' | 'repeat' | 'close-presses' | 'bounce';

export interface PressFinding {
  readonly kind: PressFindingKind;
  /** How many presses, gaps or repeats it is about. */
  readonly count: number;
  readonly text: string;
}

const ms = (n: number | null, lang: Lang): string => (n === null ? 'UNKNOWN' : lang === 'fr' ? `${n}${NBSP}ms` : `${n} ms`);
const sec = (n: number, lang: Lang): string => {
  const t = (Math.round(n / 100) / 10).toFixed(1);
  return lang === 'fr' ? `${t.replace('.', ',')}${NBSP}s` : `${t} s`;
};

/** What the times point to. Each says what was measured and what it may cause, never what the person can do. */
export function pressFindings(st: PressStats, lang: Lang): PressFinding[] {
  const fr = lang === 'fr';
  const out: PressFinding[] = [];
  const long = st.holds.filter((h) => h >= LONG_PRESS_MS).length;
  if (long > 0) {
    out.push({
      kind: 'long-hold',
      count: long,
      text: fr
        ? `${long} ${long < 2 ? 'appui a duré' : 'appuis ont duré'} ${ms(LONG_PRESS_MS, 'fr')} ou plus, jusqu’à ${ms(st.holdMax, 'fr')}. Beaucoup de téléphones prennent un tel appui pour un appui long, qui ouvre un menu au lieu d’activer, et beaucoup de claviers répètent alors la touche.`
        : `${long} ${long === 1 ? 'press was' : 'presses were'} held ${ms(LONG_PRESS_MS, 'en')} or more, up to ${ms(st.holdMax, 'en')}. Many phones take such a press as a long press, which opens a menu in place of acting, and many keyboards then repeat the key.`,
    });
  }
  if (st.repeats > 0) {
    out.push({
      kind: 'repeat',
      count: st.repeats,
      text: fr
        ? `La touche s’est répétée ${st.repeats} fois pendant qu’elle était tenue. Dans un champ, cela écrit le caractère plusieurs fois.`
        : `The key repeated ${st.repeats} ${st.repeats === 1 ? 'time' : 'times'} while it was held. In a text field, that types the character more than once.`,
    });
  }
  const close = st.gaps.filter((g) => g < DOUBLE_PRESS_MS).length;
  if (close > 0) {
    out.push({
      kind: 'close-presses',
      count: close,
      text: fr
        ? `${close} ${close < 2 ? 'appui a suivi' : 'appuis ont suivi'} le précédent de moins de ${ms(DOUBLE_PRESS_MS, 'fr')}. Une page ou un appareil peut prendre deux appuis aussi proches pour un double appui.`
        : `${close} ${close === 1 ? 'press came' : 'presses came'} less than ${ms(DOUBLE_PRESS_MS, 'en')} after the one before. A page or a device may take two presses that close as one double press.`,
    });
  }
  const bounce = st.holds.filter((h) => h < BOUNCE_MS).length;
  if (bounce > 0) {
    out.push({
      kind: 'bounce',
      count: bounce,
      text: fr
        ? `${bounce} ${bounce < 2 ? 'appui a duré' : 'appuis ont duré'} moins de ${ms(BOUNCE_MS, 'fr')}. Certains appareils ignorent des appuis aussi brefs.`
        : `${bounce} ${bounce === 1 ? 'press was' : 'presses were'} shorter than ${ms(BOUNCE_MS, 'en')}. Some devices ignore presses that brief.`,
    });
  }
  return out;
}

/** What the result means for settings, in general terms: no product, no promise. */
export function pressSettings(findings: readonly PressFinding[], lang: Lang): string[] {
  const fr = lang === 'fr';
  const kinds = new Set(findings.map((f) => f.kind));
  const out: string[] = [];
  if (kinds.has('long-hold')) {
    out.push(
      fr
        ? 'Les réglages d’accessibilité de nombreux téléphones permettent d’allonger le délai d’un appui long. Ceux de nombreux ordinateurs permettent d’allonger le délai avant qu’une touche se répète, ou de couper la répétition.'
        : 'The accessibility settings of many phones let you lengthen the delay of a long press. Those of many computers let you lengthen the delay before a key repeats, or turn repeating off.',
    );
  } else if (kinds.has('repeat')) {
    out.push(
      fr
        ? 'Les réglages d’accessibilité de nombreux ordinateurs permettent d’allonger le délai avant qu’une touche se répète, ou de couper la répétition.'
        : 'The accessibility settings of many computers let you lengthen the delay before a key repeats, or turn repeating off.',
    );
  }
  if (kinds.has('close-presses') || kinds.has('bounce')) {
    out.push(
      fr
        ? 'De nombreux appareils ont un réglage qui ignore les appuis répétés de près ou trop brefs.'
        : 'Many devices have a setting that ignores presses repeated close together, or too brief.',
    );
  }
  return out;
}

/** The result in a few sentences. UNKNOWN for what could not be measured. */
export function pressSummary(s: PressState, lang: Lang): string[] {
  const fr = lang === 'fr';
  const st = pressStats(s);
  if (st.count === 0) {
    return [fr ? 'Aucun appui n’a été mesuré, donc le résultat est UNKNOWN.' : 'No press was measured, so the result is UNKNOWN.'];
  }
  const lines = [
    fr
      ? `${st.count} ${st.count < 2 ? 'appui mesuré' : 'appuis mesurés'} sur ${PRESSES}${s.stopped ? ', le test a été arrêté avant la fin' : ''}. Durée de chaque appui${NBSP}: de ${ms(st.holdMin, 'fr')} à ${ms(st.holdMax, 'fr')}, médiane ${ms(st.holdMedian, 'fr')}.`
      : `${st.count} of ${PRESSES} ${st.count === 1 ? 'press' : 'presses'} measured${s.stopped ? ', the test was stopped before the end' : ''}. Each press was held from ${ms(st.holdMin, 'en')} to ${ms(st.holdMax, 'en')}, median ${ms(st.holdMedian, 'en')}.`,
    st.gaps.length === 0
      ? fr
        ? 'Temps entre les appuis UNKNOWN, car il faut au moins deux appuis.'
        : 'Time between presses UNKNOWN, since it takes at least two presses.'
      : fr
        ? `Temps entre deux appuis${NBSP}: au moins ${ms(st.gapMin, 'fr')}, médiane ${ms(st.gapMedian, 'fr')}.`
        : `Time between presses: at least ${ms(st.gapMin, 'en')}, median ${ms(st.gapMedian, 'en')}.`,
  ];
  const first = s.samples[0];
  const last = s.samples.at(-1);
  if (first && last && st.count > 1) {
    lines.push(fr ? `Le test a pris ${sec(last.up - first.down, 'fr')} du premier appui au dernier.` : `The test took ${sec(last.up - first.down, 'en')} from the first press to the last.`);
  }
  return lines;
}

const VIA_NAMES: Readonly<Record<PressVia, { readonly en: string; readonly fr: string }>> = {
  touch: { en: 'touch', fr: 'toucher' },
  pointer: { en: 'mouse or pointer', fr: 'souris ou pointeur' },
  key: { en: 'key', fr: 'touche' },
};

/** How the presses were made, in words. */
export function viaText(vias: readonly PressVia[], lang: Lang): string {
  if (vias.length === 0) return 'UNKNOWN';
  return vias.map((v) => VIA_NAMES[v][lang]).join(', ');
}

/**
 * One line for the barrier text: how the person's presses were timed. Empty
 * until a press was measured, so nothing is said for the person.
 */
export function pressNote(s: PressState, lang: Lang): string {
  if (s.phase !== 'done') return '';
  const st = pressStats(s);
  if (st.count === 0) return '';
  const fr = lang === 'fr';
  const gaps = st.gaps.length === 0 ? 'UNKNOWN' : ms(st.gapMin, lang);
  return fr
    ? `Mes appuis (${viaText(st.vias, 'fr')})${NBSP}: tenus de ${ms(st.holdMin, 'fr')} à ${ms(st.holdMax, 'fr')}${NNBSP}; au moins ${gaps} entre deux appuis${st.repeats > 0 ? `${NNBSP}; la touche s’est répétée ${st.repeats}${NBSP}fois` : ''}.`
    : `My presses (${viaText(st.vias, 'en')}): held from ${ms(st.holdMin, 'en')} to ${ms(st.holdMax, 'en')}; at least ${gaps} between presses${st.repeats > 0 ? `; the key repeated ${st.repeats} ${st.repeats === 1 ? 'time' : 'times'}` : ''}.`;
}

/** The result as plain text, to paste into a message or a ticket. */
export function pressText(s: PressState, lang: Lang): string {
  if (s.phase !== 'done') return '';
  const fr = lang === 'fr';
  const st = pressStats(s);
  const findings = pressFindings(st, lang);
  const lines = [fr ? 'Ma façon d’appuyer' : 'How I press'];
  const note = pressNote(s, lang);
  if (note !== '') lines.push(note);
  lines.push(...pressSummary(s, lang));
  for (const f of findings) lines.push(`- ${f.text}`);
  lines.push(...pressSettings(findings, lang));
  lines.push(
    fr
      ? 'Ces temps sont ceux de cet écran, de cette façon d’appuyer, aujourd’hui. Ils ne disent rien de la personne.'
      : 'These times are those of this screen, this way of pressing, today. They say nothing about the person.',
  );
  return `${lines.join('\n')}\n`;
}
