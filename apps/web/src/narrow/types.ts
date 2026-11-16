import type { LocalizedText } from './audit.js';

export const NBSP = '\u00A0';
export const NNBSP = '\u202F';

export type Lang = 'en' | 'fr';

export type CheckId =
  | 'target-size'
  | 'reflow'
  | 'target-spacing'
  | 'contrast'
  | 'name'
  | 'label-in-name'
  | 'language'
  | 'focus-obscured'
  | 'text-spacing'
  | 'i18n'
  | 'offline'
  | 'keyboard'
  | 'focus-visible'
  | 'motion'
  | 'static-html'
  | 'copy'
  | 'provenance';

/** WCAG 2.2 success criterion each check relates to, or null when it is not a WCAG check. */
export const CHECK_SC: Readonly<Record<CheckId, string | null>> = {
  'target-size': '2.5.8',
  reflow: '1.4.10',
  'target-spacing': '2.5.8',
  contrast: '1.4.3',
  name: '4.1.2',
  'label-in-name': '2.5.3',
  language: '3.1.1',
  'focus-obscured': '2.4.11',
  'text-spacing': '1.4.12',
  i18n: null,
  offline: null,
  keyboard: '2.1.1',
  'focus-visible': '2.4.7',
  motion: null,
  'static-html': null,
  copy: null,
  provenance: null,
};

export const CHECK_ORDER: readonly CheckId[] = [
  'reflow',
  'target-size',
  'target-spacing',
  'contrast',
  'name',
  'label-in-name',
  'language',
  'focus-obscured',
  'text-spacing',
  'i18n',
  'offline',
  'keyboard',
  'focus-visible',
  'motion',
  'static-html',
  'copy',
  'provenance',
];

export const CHECK_LABELS: Readonly<Record<CheckId, LocalizedText>> = {
  'target-size': { en: 'Touch target size', fr: 'Taille des cibles tactiles' },
  reflow: { en: 'Reflow at 320px', fr: `Réorganisation à 320${NBSP}px` },
  'target-spacing': { en: 'Target spacing', fr: 'Espacement des cibles' },
  contrast: { en: 'Text contrast', fr: 'Contraste du texte' },
  name: { en: 'Accessible names', fr: 'Noms accessibles' },
  'label-in-name': { en: 'Label in name', fr: 'Étiquette dans le nom' },
  language: { en: 'Page language', fr: 'Langue de la page' },
  'focus-obscured': { en: 'Focus not obscured', fr: 'Focus non masqué' },
  'text-spacing': { en: 'Text spacing', fr: 'Espacement du texte' },
  i18n: { en: 'EN and FR strings', fr: 'Chaînes EN et FR' },
  offline: { en: 'Offline reload', fr: 'Rechargement hors ligne' },
  keyboard: { en: 'Keyboard access', fr: 'Accès au clavier' },
  'focus-visible': { en: 'Focus visible', fr: 'Focus visible' },
  motion: { en: 'Motion', fr: 'Animations' },
  'static-html': { en: 'Page markup', fr: 'Balisage de la page' },
  copy: { en: 'Wording rules', fr: 'Règles de rédaction' },
  provenance: { en: 'Data sources and licences', fr: 'Sources et licences des données' },
};

/** A fail is a measured problem. Unknown means the check could not measure, never a pass. */
export type EntryStatus = 'fail' | 'unknown';

export interface Entry {
  readonly check: CheckId;
  readonly id: string;
  readonly status: EntryStatus;
  readonly message: LocalizedText;
  /** Short code of the rule that produced the entry, for filtering in CI. */
  readonly rule?: string;
}

export interface CheckResult {
  /** Number of items the check looked at (including the ones that passed). */
  readonly checked: number;
  readonly entries: readonly Entry[];
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function t(en: string, fr: string): LocalizedText {
  return { en, fr };
}

/** Number with a decimal comma for French. */
export function num(n: number, lang: Lang, digits = 2): string {
  const s = n.toFixed(digits);
  return lang === 'fr' ? s.replace('.', ',') : s;
}

export function clip(s: string, max = 40): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : one.slice(0, max - 1) + '…';
}
