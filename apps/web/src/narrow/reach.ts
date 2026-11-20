import type { ReachFacts, ReachLandmark, ReachStop } from './reach-inpage.js';
import { NBSP, num, type Lang } from './types.js';

/**
 * How many presses it takes to reach each control of a page with the Tab
 * key, or with a switch that steps through the same order, and how long a
 * switch that scans on its own takes at a given interval.
 *
 * A press is one Tab, or one Enter on a skip link. The count assumes the
 * person starts at the top of the page and goes forward. With a skip link
 * near the start, the count through the link is given too, and the smaller
 * of the two is the one that counts. Time is UNKNOWN until the person gives
 * the interval of their own switch: there is no interval that fits everyone.
 */

/** A skip link counts only when it is one of the first few stops. */
export const SKIP_WITHIN = 3;

/** More presses than this to reach the main content is pointed out. */
export const LONG_TO_MAIN = 10;

/** The scan intervals a person may type, in seconds. */
export const MIN_INTERVAL = 0.2;
export const MAX_INTERVAL = 10;

export interface Skip {
  /** Index of the skip link among the stops. */
  readonly at: number;
  /** Index of the first stop after the place it points to. */
  readonly to: number;
  readonly toMain: boolean;
  /** True when following the link puts focus on stop `to` itself, with no Tab after it. */
  readonly lands: boolean;
}

export interface StopReach {
  readonly index: number;
  readonly stop: ReachStop;
  /** Tab presses from the top of the page. */
  readonly direct: number;
  /** Presses through the skip link, or null when the skip link does not help for this stop. */
  readonly viaSkip: number | null;
  /** The smaller of the two. */
  readonly best: number;
}

export interface LandmarkReach {
  readonly landmark: ReachLandmark;
  /** The first stop inside the landmark. */
  readonly first: StopReach;
  readonly stops: number;
}

export interface ReachModel {
  readonly stops: readonly StopReach[];
  readonly skip: Skip | null;
  readonly landmarks: readonly LandmarkReach[];
  /** The first stop inside the main landmark, or null when there is none. */
  readonly firstInMain: StopReach | null;
  readonly invisible: number;
  readonly positive: number;
  readonly truncated: boolean;
}

/** The first same-page link among the first stops that moves focus forward. */
export function findSkip(stops: readonly ReachStop[]): Skip | null {
  for (let i = 0; i < Math.min(SKIP_WITHIN, stops.length); i += 1) {
    const s = stops[i];
    if (s && s.jumpTo !== null && s.jumpTo > i + 1) return { at: i, to: s.jumpTo, toMain: s.jumpsToMain, lands: s.jumpLands };
  }
  return null;
}

/**
 * Presses to reach stop `index` through the skip link: the Tabs to the link,
 * one Enter, then the Tabs from the place it points to. When that place can
 * take focus itself, the Enter puts focus on it and no Tab is needed there.
 */
export function pressesViaSkip(skip: Skip, index: number): number | null {
  if (index < skip.to) return null;
  return skip.at + 1 + 1 + (index - skip.to) + (skip.lands ? 0 : 1);
}

export function buildReach(facts: ReachFacts): ReachModel {
  const skip = findSkip(facts.stops);
  // With a positive tabindex on the page, Chromium goes on from the place a link points to in an order that mixes the two, so the presses through the link are left UNKNOWN.
  const counted = skip !== null && facts.positive === 0;
  const stops: StopReach[] = facts.stops.map((stop, index) => {
    const direct = index + 1;
    const via = skip && counted ? pressesViaSkip(skip, index) : null;
    return { index, stop, direct, viaSkip: via !== null && via < direct ? via : null, best: via !== null && via < direct ? via : direct };
  });
  const order: ReachLandmark[] = [];
  const firsts = new Map<ReachLandmark, StopReach>();
  const counts = new Map<ReachLandmark, number>();
  for (const s of stops) {
    const l = s.stop.landmark;
    if (!firsts.has(l)) {
      firsts.set(l, s);
      order.push(l);
    }
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return {
    stops,
    skip,
    landmarks: order.map((landmark) => ({ landmark, first: firsts.get(landmark) as StopReach, stops: counts.get(landmark) ?? 0 })),
    firstInMain: firsts.get('main') ?? null,
    invisible: facts.invisible,
    positive: facts.positive,
    truncated: facts.truncated,
  };
}

export type ReadInterval = { readonly ok: true; readonly seconds: number | null } | { readonly ok: false; readonly error: string };

/** Reads the interval a person typed, with a point or a comma. Empty means not given, so time stays UNKNOWN. */
export function readInterval(text: string, lang: Lang): ReadInterval {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, seconds: null };
  const n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
  if (!Number.isFinite(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) {
    return {
      ok: false,
      error:
        lang === 'fr'
          ? `Écrivez un nombre de secondes entre ${num(MIN_INTERVAL, 'fr', 1)} et ${MAX_INTERVAL}, par exemple 1,5.`
          : `Write a number of seconds from ${num(MIN_INTERVAL, 'en', 1)} to ${MAX_INTERVAL}, such as 1.5.`,
    };
  }
  return { ok: true, seconds: n };
}

/** Seconds to reach a stop when a switch steps through on its own, one step per interval. Null when the interval is not given. */
export function scanSeconds(presses: number, interval: number | null): number | null {
  return interval === null ? null : Math.round(presses * interval * 10) / 10;
}

/** A number of seconds in words, or UNKNOWN. Above a minute it gives minutes and seconds. */
export function secondsText(seconds: number | null, lang: Lang): string {
  if (seconds === null) return 'UNKNOWN';
  const fr = lang === 'fr';
  if (seconds < 60) {
    const s = Number.isInteger(seconds) ? String(seconds) : num(seconds, lang, 1);
    return fr ? `${s}${NBSP}s` : `${s} s`;
  }
  const m = Math.floor(seconds / 60);
  const rest = Math.round(seconds - m * 60);
  return fr ? `${m}${NBSP}min ${rest}${NBSP}s` : `${m} min ${rest} s`;
}

export const LANDMARK_LABELS: Readonly<Record<ReachLandmark, { readonly en: string; readonly fr: string }>> = {
  banner: { en: 'Top of the page', fr: 'Haut de la page' },
  navigation: { en: 'Navigation', fr: 'Navigation' },
  main: { en: 'Main content', fr: 'Contenu principal' },
  complementary: { en: 'Side content', fr: 'Contenu annexe' },
  contentinfo: { en: 'Bottom of the page', fr: 'Bas de la page' },
  search: { en: 'Search', fr: 'Recherche' },
  form: { en: 'Form', fr: 'Formulaire' },
  region: { en: 'Named region', fr: 'Zone nommée' },
  none: { en: 'Outside any landmark', fr: 'Hors de tout repère' },
};

const presses = (n: number, lang: Lang): string => (lang === 'fr' ? `${n} ${n < 2 ? 'appui' : 'appuis'}` : `${n} ${n === 1 ? 'press' : 'presses'}`);

/** What was counted, in a few sentences. They count presses. They do not say whether the page is easy to use. */
export function reachSummary(model: ReachModel, interval: number | null, lang: Lang): string[] {
  const fr = lang === 'fr';
  const out: string[] = [];
  const n = model.stops.length;
  if (n === 0) {
    out.push(fr ? 'Aucune commande de cette page ne peut être atteinte avec la touche Tab.' : 'No control of this page can be reached with the Tab key.');
    return out;
  }
  out.push(
    fr
      ? `Cette page compte ${n} ${n < 2 ? 'arrêt' : 'arrêts'} au clavier. Passer de la première à la dernière demande ${presses(n, 'fr')}${interval === null ? '' : `, soit ${secondsText(scanSeconds(n, interval), 'fr')} avec un balayage d’un pas toutes les ${secondsText(interval, 'fr')}`}.`
      : `This page has ${n} keyboard ${n === 1 ? 'stop' : 'stops'}. Going from the first to the last takes ${presses(n, 'en')}${interval === null ? '' : `, or ${secondsText(scanSeconds(n, interval), 'en')} with a scan that steps every ${secondsText(interval, 'en')}`}.`,
  );
  const main = model.firstInMain;
  if (!main) {
    out.push(fr ? 'Contenu principal UNKNOWN. Aucun arrêt ne se trouve dans un repère principal (main).' : 'Main content UNKNOWN. No stop is inside a main landmark.');
  } else if (main.viaSkip !== null) {
    out.push(
      fr
        ? `La première commande du contenu principal demande ${presses(main.direct, 'fr')} depuis le haut, ou ${presses(main.viaSkip, 'fr')} avec le lien d’évitement.`
        : `The first control of the main content takes ${presses(main.direct, 'en')} from the top, or ${presses(main.viaSkip, 'en')} with the skip link.`,
    );
  } else {
    out.push(fr ? `La première commande du contenu principal demande ${presses(main.direct, 'fr')} depuis le haut.` : `The first control of the main content takes ${presses(main.direct, 'en')} from the top.`);
  }
  return out;
}

export type ReachNoteKind = 'long-to-main' | 'skip-not-main' | 'no-skip' | 'positive' | 'skip-unknown' | 'invisible' | 'truncated';

export interface ReachNote {
  readonly kind: ReachNoteKind;
  readonly text: string;
}

/** What the counts point to, as notes for the team. Each says what was counted and what it may mean. */
export function reachNotes(model: ReachModel, lang: Lang): ReachNote[] {
  const fr = lang === 'fr';
  const out: ReachNote[] = [];
  const main = model.firstInMain;
  if (main && main.best > LONG_TO_MAIN) {
    out.push({
      kind: 'long-to-main',
      text: fr
        ? `Il faut ${presses(main.best, 'fr')} pour atteindre le contenu principal. Chaque appui compte pour une personne qui utilise un contacteur. Un lien d’évitement en premier arrêt raccourcit ce chemin.`
        : `It takes ${presses(main.best, 'en')} to reach the main content. Each press counts for a person who uses a switch. A skip link as the first stop shortens this path.`,
    });
  }
  if (model.skip && !model.skip.toMain) {
    out.push({
      kind: 'skip-not-main',
      text: fr
        ? 'Le lien d’évitement mène ailleurs que dans le contenu principal. Vérifiez où il doit mener.'
        : 'The skip link leads somewhere other than the main content. Check where it should lead.',
    });
  }
  if (!model.skip && model.stops.length > LONG_TO_MAIN && main && main.index > 0) {
    out.push({
      kind: 'no-skip',
      text: fr
        ? `Aucun lien d’évitement n’a été trouvé parmi les ${SKIP_WITHIN} premiers arrêts.`
        : `No skip link was found among the first ${SKIP_WITHIN} stops.`,
    });
  }
  if (model.positive > 0) {
    out.push({
      kind: 'positive',
      text: fr
        ? `${model.positive} ${model.positive < 2 ? 'commande a' : 'commandes ont'} un tabindex positif et ${model.positive < 2 ? 'passe' : 'passent'} avant tout le reste, quel que soit leur place dans la page.`
        : `${model.positive} ${model.positive === 1 ? 'control has' : 'controls have'} a positive tabindex and ${model.positive === 1 ? 'comes' : 'come'} before everything else, wherever ${model.positive === 1 ? 'it sits' : 'they sit'} on the page.`,
    });
  }
  if (model.positive > 0 && model.skip) {
    out.push({
      kind: 'skip-unknown',
      text: fr
        ? 'Avec un tabindex positif sur la page, les appuis par le lien d’évitement sont UNKNOWN. Seuls les appuis depuis le haut sont comptés.'
        : 'With a positive tabindex on the page, the presses through the skip link are UNKNOWN. Only the presses from the top are counted.',
    });
  }
  if (model.invisible > 0) {
    out.push({
      kind: 'invisible',
      text: fr
        ? `${model.invisible} ${model.invisible < 2 ? 'commande peut' : 'commandes peuvent'} recevoir le focus sans avoir de taille. Le focus semble alors disparaître, et chacune demande quand même un appui.`
        : `${model.invisible} ${model.invisible === 1 ? 'control can' : 'controls can'} take focus with no size. Focus then seems to vanish, and each one still takes a press.`,
    });
  }
  if (model.truncated) {
    out.push({
      kind: 'truncated',
      text: fr ? 'La page est longue et seule une partie a été lue, donc les comptes sont UNKNOWN au-delà.' : 'The page is long and only part of it was read, so the counts are UNKNOWN beyond it.',
    });
  }
  return out;
}

/** The stops whose name holds the text, in either case. Empty text keeps every stop. */
export function findStops(model: ReachModel, text: string): StopReach[] {
  const t = text.trim().toLowerCase();
  if (t === '') return [...model.stops];
  return model.stops.filter((s) => s.stop.name.toLowerCase().includes(t));
}

/** The name of a stop in words, or what it is when it has no name. */
export function stopName(s: StopReach, lang: Lang): string {
  if (s.stop.name !== '') return s.stop.name;
  return lang === 'fr' ? `sans nom (${s.stop.id})` : `no name (${s.stop.id})`;
}

/** The counts as plain text, to paste into a message or a ticket. */
export function reachText(model: ReachModel, interval: number | null, lang: Lang, max = 40): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const lines = [fr ? 'Atteindre les commandes au clavier ou au contacteur' : 'Reaching controls by keyboard or switch', ...reachSummary(model, interval, lang), ...reachNotes(model, lang).map((n) => `- ${n.text}`)];
  const shown = model.stops.slice(0, max);
  for (const s of shown) {
    const time = interval === null ? '' : `, ${secondsText(scanSeconds(s.best, interval), lang)}`;
    lines.push(`${s.index + 1}. ${stopName(s, lang)} (${LANDMARK_LABELS[s.stop.landmark][lang]})${colon} ${presses(s.best, lang)}${time}`);
  }
  if (model.stops.length > shown.length) lines.push(fr ? `… et ${model.stops.length - shown.length} de plus.` : `… and ${model.stops.length - shown.length} more.`);
  lines.push(
    fr
      ? 'Ces comptes partent du haut de la page et vont vers l’avant, un pas à la fois. Ils ne disent pas si la page est facile à utiliser.'
      : 'These counts start at the top of the page and go forward, one step at a time. They do not say whether the page is easy to use.',
  );
  return `${lines.join('\n')}\n`;
}
