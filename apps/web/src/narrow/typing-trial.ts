import { NBSP, NNBSP, type Lang } from './types.js';

/**
 * My typing pace: a short practice in which the person types three short
 * things the way they usually do (with a keyboard, an on-screen keyboard,
 * a mouth stick, switch scanning or dictation), so the panel can measure
 * their own pace: the time from the first change to the last in each field,
 * the characters typed, and how many were taken back.
 *
 * With that pace, the panel sets the text fields of this page against any
 * time limit the page states. Every time it gives is an estimate from the
 * practice, said as such. Nothing here says anything about the person.
 */

export interface PracticeItem {
  readonly id: 'name' | 'postal' | 'email';
  /** What to type, shown to the person. */
  readonly text: { readonly en: string; readonly fr: string };
  readonly label: { readonly en: string; readonly fr: string };
}

export const PRACTICE: readonly PracticeItem[] = [
  { id: 'name', text: { en: 'Alex Martin', fr: 'Alex Martin' }, label: { en: 'A name', fr: 'Un nom' } },
  { id: 'postal', text: { en: 'K1A 0B1', fr: 'K1A 0B1' }, label: { en: 'A postal code', fr: 'Un code postal' } },
  { id: 'email', text: { en: 'alex@example.ca', fr: 'alex@example.ca' }, label: { en: 'An email address', fr: 'Une adresse courriel' } },
];

/** What happened in one practice field. Times in milliseconds from any fixed start. */
export interface FieldRun {
  readonly first: number | null;
  readonly last: number | null;
  /** Changes that took characters back: Backspace, Delete, undo. */
  readonly takenBack: number;
  /** The text in the field at the end. */
  readonly value: string;
}

export const emptyRun = (): FieldRun => ({ first: null, last: null, takenBack: 0, value: '' });

/** One change in a field: when, whether it took characters back, and the value after it. */
export function recordChange(run: FieldRun, at: number, takesBack: boolean, value: string): FieldRun {
  return { first: run.first ?? at, last: at, takenBack: run.takenBack + (takesBack ? 1 : 0), value };
}

/** Input types of the InputEvent that take characters back. */
export function takesBack(inputType: string | undefined): boolean {
  return typeof inputType === 'string' && (inputType.startsWith('delete') || inputType === 'historyUndo');
}

export interface FieldResult {
  readonly id: PracticeItem['id'];
  /** Milliseconds from the first change to the last, or null when the field was not used. */
  readonly ms: number | null;
  readonly chars: number;
  readonly takenBack: number;
  /** Whether the field holds what was asked, ignoring case and spaces. Said only as a fact of the practice. */
  readonly same: boolean;
}

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

export function fieldResults(runs: readonly FieldRun[], lang: Lang): FieldResult[] {
  return PRACTICE.map((item, i) => {
    const run = runs[i] ?? emptyRun();
    const ms = run.first === null || run.last === null ? null : Math.max(0, Math.round(run.last - run.first));
    return { id: item.id, ms, chars: run.value.length, takenBack: run.takenBack, same: squash(run.value) === squash(item.text[lang]) };
  });
}

export interface Pace {
  /** Characters per minute over the fields used, or null when there is too little to measure. */
  readonly perMinute: number | null;
  /** The middle of the times per field used, in milliseconds, or null. */
  readonly perField: number | null;
  readonly used: number;
  readonly takenBack: number;
}

export function paceOf(results: readonly FieldResult[]): Pace {
  const used = results.filter((r) => r.ms !== null && r.ms > 0 && r.chars > 0);
  const ms = used.reduce((a, r) => a + (r.ms ?? 0), 0);
  const chars = used.reduce((a, r) => a + r.chars, 0);
  const times = used.map((r) => r.ms ?? 0).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const perField = times.length === 0 ? null : times.length % 2 === 1 ? (times[mid] ?? null) : Math.round(((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2);
  return {
    perMinute: ms > 0 ? Math.round((chars / ms) * 60_000) : null,
    perField,
    used: used.length,
    takenBack: results.reduce((a, r) => a + r.takenBack, 0),
  };
}

/** What the page holds: its text fields and a time limit it states, in minutes, or null. */
export interface PageTyping {
  readonly fields: number;
  readonly limitMinutes: number | null;
  /** The sentence the limit was found in, shortened, so the person can check it. */
  readonly limitText: string;
}

const LIMIT_WORDS = /(session|expire|expir|time ?out|timed out|délai|inactivit|déconnect|logged out|signed out)/i;
const MINUTES = /(\d{1,3})\s*(?:minutes?|mins?\b|min\b)/i;

/** Finds a time limit stated in a sentence: a number of minutes next to words about a session or a time-out. */
export function findLimit(sentences: readonly string[]): { readonly minutes: number; readonly text: string } | null {
  for (const s of sentences) {
    if (!LIMIT_WORDS.test(s)) continue;
    const m = MINUTES.exec(s);
    if (m) {
      const minutes = Number(m[1]);
      if (minutes > 0) return { minutes, text: s.length > 140 ? `${s.slice(0, 139)}…` : s };
    }
  }
  return null;
}

const minutesText = (ms: number, lang: Lang): string => {
  const m = Math.round((ms / 60_000) * 10) / 10;
  const n = lang === 'fr' ? String(m).replace('.', ',') : String(m);
  return lang === 'fr' ? `${n}${NBSP}min` : `${n} min`;
};
const secText = (ms: number, lang: Lang): string => {
  const s = Math.round(ms / 100) / 10;
  const n = lang === 'fr' ? String(s).replace('.', ',') : String(s);
  return lang === 'fr' ? `${n}${NBSP}s` : `${n} s`;
};

/** The practice in a few sentences. UNKNOWN for what could not be measured. */
export function paceSummary(p: Pace, lang: Lang): string[] {
  const fr = lang === 'fr';
  if (p.used === 0 || p.perMinute === null || p.perField === null) {
    return [fr ? 'Aucun champ d’essai n’a été rempli, donc votre rythme est UNKNOWN.' : 'No practice field was filled in, so your pace is UNKNOWN.'];
  }
  return [
    fr
      ? `${p.used} ${p.used < 2 ? 'champ d’essai rempli' : 'champs d’essai remplis'} sur ${PRACTICE.length}. Votre rythme${NBSP}: environ ${p.perMinute} caractères par minute, et ${secText(p.perField, 'fr')} par champ au milieu de vos essais.`
      : `${p.used} of ${PRACTICE.length} practice fields filled in. Your pace: about ${p.perMinute} characters a minute, and ${secText(p.perField, 'en')} a field in the middle of your tries.`,
    fr
      ? `${p.takenBack} ${p.takenBack < 2 ? 'correction' : 'corrections'} (effacement ou annulation).`
      : `${p.takenBack} ${p.takenBack === 1 ? 'correction' : 'corrections'} (deleting or undoing).`,
  ];
}

export type TypingNoteKind = 'over-limit' | 'near-limit' | 'no-limit' | 'no-fields';

/**
 * The page set against the pace. The time for the page is the time per field
 * of the practice, times the text fields of the page: an estimate, said so.
 */
export function pageNotes(p: Pace, page: PageTyping, lang: Lang): Array<{ readonly kind: TypingNoteKind; readonly text: string }> {
  const fr = lang === 'fr';
  if (page.fields === 0) {
    return [{ kind: 'no-fields', text: fr ? 'Cette page n’a aucun champ de texte, donc rien n’est à taper.' : 'This page has no text field, so there is nothing to type.' }];
  }
  if (p.perField === null) return [];
  const need = p.perField * page.fields;
  const est = fr
    ? `Au rythme de vos essais, les ${page.fields}${NBSP}champs de texte de cette page prendraient environ ${minutesText(need, 'fr')}. C’est une estimation tirée des essais, pas une mesure de la page.`
    : `At the pace of your tries, the ${page.fields} text ${page.fields === 1 ? 'field' : 'fields'} of this page would take about ${minutesText(need, 'en')}. This is an estimate from the practice, not a measure of the page.`;
  if (page.limitMinutes === null) {
    return [
      {
        kind: 'no-limit',
        text: `${est} ${fr ? 'Aucune limite de temps n’a été trouvée dans le texte de la page. Une limite peut tout de même s’appliquer, donc elle reste UNKNOWN.' : 'No time limit was found in the text of the page. One may still apply, so it stays UNKNOWN.'}`,
      },
    ];
  }
  const limit = page.limitMinutes * 60_000;
  const said = page.limitText.replace(/[.!?…]+$/, '');
  const q = fr ? `«${NNBSP}${said}${NNBSP}»` : `“${said}”`;
  if (need > limit) {
    return [
      {
        kind: 'over-limit',
        text: `${est} ${fr ? `La page indique une limite de ${page.limitMinutes}${NBSP}min${NBSP}: ${q}. Cela peut ne pas suffire. Les règles d’accessibilité demandent un moyen de prolonger ou d’arrêter une limite de temps.` : `The page states a limit of ${page.limitMinutes} min: ${q}. That may not be enough. Accessibility rules ask for a way to extend or turn off a time limit.`}`,
      },
    ];
  }
  if (need > limit / 2) {
    return [
      {
        kind: 'near-limit',
        text: `${est} ${fr ? `La page indique une limite de ${page.limitMinutes}${NBSP}min${NBSP}: ${q}. Cela laisse peu de marge pour une pause.` : `The page states a limit of ${page.limitMinutes} min: ${q}. That leaves little room for a break.`}`,
      },
    ];
  }
  return [];
}

/** One line for the access summary: the measured pace. Empty until something was measured. */
export function typingNote(p: Pace, lang: Lang): string {
  if (p.perMinute === null || p.perField === null) return '';
  return lang === 'fr'
    ? `Mon rythme de saisie${NBSP}: environ ${p.perMinute} caractères par minute, ${secText(p.perField, 'fr')} par champ court.`
    : `My typing pace: about ${p.perMinute} characters a minute, ${secText(p.perField, 'en')} a short field.`;
}
