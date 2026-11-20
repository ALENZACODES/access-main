import { factsAsText, type DeviceFacts } from './device-facts.js';
import { plainSummaryText, summarisePlainly } from './plain-summary.js';
import type { AuditReport } from './report.js';
import { NBSP, type Lang } from './types.js';

/**
 * A report of something in the App that gets in a person's way: what kind of
 * barrier, on which page, in their own words, and, if they choose, the
 * settings of their screen and what the checks found. The result is text the
 * person copies or saves and sends however they like.
 *
 * Nothing leaves the device from here. The report holds no name, no email
 * address and no location. The page is given by its path only, without the
 * part after `?`, because that part can hold what a person searched for.
 */

export type BarrierKind = 'cut-off' | 'too-small' | 'cannot-reach' | 'hard-to-read' | 'screen-reader' | 'moves' | 'other';

export const BARRIER_KINDS: readonly BarrierKind[] = ['cut-off', 'too-small', 'cannot-reach', 'hard-to-read', 'screen-reader', 'moves', 'other'];

export const KIND_LABELS: Readonly<Record<BarrierKind, { readonly en: string; readonly fr: string }>> = {
  'cut-off': { en: 'Something is cut off or needs sideways scrolling', fr: 'Un contenu est coupé ou demande un défilement de côté' },
  'too-small': { en: 'A button or link is too small or too close to another', fr: 'Un bouton ou un lien est trop petit ou trop proche d’un autre' },
  'cannot-reach': { en: 'I cannot reach or use something with my keyboard, switch or voice', fr: 'Je ne peux pas atteindre ou utiliser un élément au clavier, au contacteur ou à la voix' },
  'hard-to-read': { en: 'Text is hard to read (size, contrast, spacing)', fr: 'Un texte est difficile à lire (taille, contraste, espacement)' },
  'screen-reader': { en: 'My screen reader says the wrong thing or nothing', fr: 'Mon lecteur d’écran annonce autre chose, ou rien' },
  moves: { en: 'Something moves, flashes or times out', fr: 'Un élément bouge, clignote ou expire' },
  other: { en: 'Something else', fr: 'Autre chose' },
};

export interface BarrierDraft {
  /** Empty until the person chooses. */
  readonly kind: BarrierKind | '';
  /** What happened, in the person's own words. */
  readonly what: string;
  readonly includeSettings: boolean;
  readonly includeFindings: boolean;
}

export const EMPTY_DRAFT: BarrierDraft = { kind: '', what: '', includeSettings: true, includeFindings: false };

export const MIN_WHAT = 10;
export const MAX_WHAT = 1000;

export type BarrierField = 'kind' | 'what';

export interface BarrierError {
  readonly field: BarrierField;
  readonly message: string;
}

/** What has to change before a report can be made. Empty when the draft can be used. */
export function validateBarrier(draft: BarrierDraft, lang: Lang): BarrierError[] {
  const fr = lang === 'fr';
  const out: BarrierError[] = [];
  if (!BARRIER_KINDS.includes(draft.kind as BarrierKind)) {
    out.push({ field: 'kind', message: fr ? 'Choisissez le type d’obstacle.' : 'Choose the kind of barrier.' });
  }
  const what = draft.what.trim();
  if (what.length < MIN_WHAT) {
    out.push({
      field: 'what',
      message: fr ? `Décrivez ce qui s’est passé, en au moins ${MIN_WHAT} caractères.` : `Say what happened, in at least ${MIN_WHAT} characters.`,
    });
  } else if (what.length > MAX_WHAT) {
    out.push({
      field: 'what',
      message: fr
        ? `La description compte ${what.length} caractères. Raccourcissez-la à ${MAX_WHAT} caractères au plus.`
        : `The description is ${what.length} characters long. Shorten it to ${MAX_WHAT} characters at most.`,
    });
  }
  return out;
}

export type PersonalKind = 'email' | 'phone';

/** Kinds of personal detail the description seems to hold. The text is never changed: the person decides what to share. */
export function personalDetails(text: string): PersonalKind[] {
  const out: PersonalKind[] = [];
  if (/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i.test(text)) out.push('email');
  if (/(?:\+?\d[\s().-]{0,2}){10,}/.test(text)) out.push('phone');
  return out;
}

/** A sentence that tells the person their description seems to hold a personal detail, or an empty string. */
export function personalWarning(text: string, lang: Lang): string {
  const kinds = personalDetails(text);
  if (kinds.length === 0) return '';
  const fr = lang === 'fr';
  const names = kinds.map((k) => (k === 'email' ? (fr ? 'une adresse courriel' : 'an email address') : fr ? 'un numéro de téléphone' : 'a phone number'));
  const list = names.join(fr ? ' et ' : ' and ');
  return fr
    ? `Votre description semble contenir ${list}. Retirez ce détail, sauf si vous voulez le partager.`
    : `Your description seems to hold ${list}. Take it out unless you mean to share it.`;
}

/** The path of a page with no query and no fragment: `/places/12?q=ramp#top` gives `/places/12`. */
export function pagePath(location: string): string {
  const path = location.split(/[?#]/)[0] ?? '';
  const clean = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return clean === '' ? '/' : clean;
}

export interface BarrierContext {
  /** Where the person is in the App. Only its path is used. */
  readonly location: string;
  readonly facts: DeviceFacts;
  /** The audit of the page, when the person asked for it. */
  readonly report: AuditReport | null;
  readonly now: Date;
}

/** The report as plain text, in the language of the page. */
export function renderBarrierText(draft: BarrierDraft, context: BarrierContext, lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const kind = BARRIER_KINDS.includes(draft.kind as BarrierKind) ? KIND_LABELS[draft.kind as BarrierKind][lang] : 'UNKNOWN';
  const lines: string[] = [];
  lines.push(fr ? 'Obstacle rencontré dans l’App' : 'Barrier met in the App');
  lines.push(`${fr ? 'Date' : 'Date'}${colon} ${context.now.toISOString().slice(0, 10)}`);
  lines.push(`${fr ? 'Page' : 'Page'}${colon} ${pagePath(context.location)}`);
  lines.push(`${fr ? 'Type d’obstacle' : 'Kind of barrier'}${colon} ${kind}`);
  lines.push('', fr ? `Ce qui s’est passé${colon}` : `What happened${colon}`, draft.what.trim());
  if (draft.includeSettings) {
    lines.push('', fr ? `Mon écran et mes réglages, tels que le navigateur les indique${colon}` : `My screen and settings, as the browser reports them${colon}`, factsAsText(context.facts, lang));
  }
  if (draft.includeFindings) {
    lines.push('', fr ? `Ce que les contrôles de l’App ont trouvé sur cette page${colon}` : `What the checks of the App found on this page${colon}`);
    lines.push(
      context.report
        ? plainSummaryText(summarisePlainly(context.report), lang)
        : fr
          ? 'UNKNOWN. Les contrôles n’ont pas pu s’exécuter.'
          : 'UNKNOWN. The checks could not run.',
    );
  }
  lines.push(
    '',
    fr
      ? 'Ce texte a été préparé sur l’appareil. Il ne contient ni nom, ni adresse courriel, ni position, sauf ce que la description ci-dessus en dit.'
      : 'This text was prepared on the device. It holds no name, no email address and no location, apart from what the description above says.',
  );
  return `${lines.join('\n')}\n`;
}

/** A file name for the report: `barrier-2026-11-19.txt`, or `obstacle-...` in French. */
export function barrierFileName(now: Date, lang: Lang): string {
  return `${lang === 'fr' ? 'obstacle' : 'barrier'}-${now.toISOString().slice(0, 10)}.txt`;
}

/** The report as a `data:` address, so a link can save it as a file with no request to a server. */
export function barrierDataUrl(text: string): string {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}
