import { personalDetails } from './barrier-report.js';
import { manualScript, type ScriptItem } from './coverage.js';
import { describeLook, latestNotes, parseManualLog, type ManualLog, type ManualNote } from './manual-log.js';
import type { Need } from './manual-steps.js';
import { DECISIONS, DEFAULT_MAX_AGE_DAYS, type Decision } from './review.js';
import { NBSP, type Lang } from './types.js';
import { aaLabel } from './wcag22.js';

/**
 * A session of looking at pages by hand, one criterion at a time: which
 * steps fit what the person has at hand, what they found at each, and the
 * log that comes out of it. The log is the same file `--manual-log` reads,
 * so what a person records in the app goes straight into the reports.
 *
 * A session lives in memory only. Nothing is stored and nothing is sent:
 * the person copies or saves the log. Going through every step records
 * that someone looked. It does not make a page conform, and no text here
 * says that it does.
 */

type Text = { readonly en: string; readonly fr: string };

export interface HandAnswer {
  readonly result: Decision;
  readonly note: string;
}

export interface HandSession {
  /** Who is looking, as it will read in the log. */
  readonly who: string;
  /** What the person has besides a browser. Steps that need something else are left out. */
  readonly needs: readonly Need[];
  /** The criterion of the step on screen, or null when no step fits. */
  readonly current: string | null;
  /** Saved answers, by criterion. */
  readonly answers: Readonly<Record<string, HandAnswer>>;
  /** A log read in at the start, so earlier looks show next to each step and stay in the log. */
  readonly earlier: ManualLog;
}

/** What a person may or may not have. A browser is taken for granted. */
export const OPTIONAL_NEEDS: readonly Need[] = ['keyboard', 'screen-reader', 'touch-device', 'media'];

export const MAX_NOTE = 500;
export const MAX_WHO = 60;

const withBrowser = (needs: readonly Need[]): Need[] => ['browser', ...OPTIONAL_NEEDS.filter((n) => needs.includes(n))];

/** The steps of a session, in the order of WCAG, in one language. */
export function stepsOf(session: Pick<HandSession, 'needs'>, lang: Lang): ScriptItem[] {
  return manualScript({ needs: withBrowser(session.needs) }, lang);
}

export function stepIds(session: Pick<HandSession, 'needs'>): string[] {
  return stepsOf(session, 'en').map((s) => s.row.criterion.sc);
}

/** A session for someone with a browser and a keyboard, at the first step. */
export function newSession(): HandSession {
  const needs: Need[] = ['keyboard'];
  return { who: '', needs, current: stepIds({ needs })[0] ?? null, answers: {}, earlier: { version: 1, notes: [] } };
}

export function currentStep(session: HandSession, lang: Lang): ScriptItem | null {
  return stepsOf(session, lang).find((s) => s.row.criterion.sc === session.current) ?? null;
}

/** The first step with no saved answer, after `from` when given, wrapping round to the start. Null when every step has one. */
export function nextOpen(session: HandSession, from: string | null = null): string | null {
  const ids = stepIds(session);
  const start = from === null ? 0 : ids.indexOf(from) + 1;
  const order = [...ids.slice(start), ...ids.slice(0, start)];
  return order.find((sc) => session.answers[sc] === undefined) ?? null;
}

/** Changes what the person has. Answers are kept, also for steps that no longer show. The step on screen stays when it still fits. */
export function setNeeds(session: HandSession, needs: readonly Need[]): HandSession {
  const kept = OPTIONAL_NEEDS.filter((n) => needs.includes(n));
  const ids = stepIds({ needs: kept });
  const next = { ...session, needs: kept };
  const current = session.current !== null && ids.includes(session.current) ? session.current : (nextOpen({ ...next, current: null }) ?? ids[0] ?? null);
  return { ...next, current };
}

export type Move = 'next' | 'previous' | 'next-open' | { readonly to: string };

/** Moves to another step. At either end, `next` and `previous` stay where they are. */
export function move(session: HandSession, where: Move): HandSession {
  const ids = stepIds(session);
  if (ids.length === 0) return { ...session, current: null };
  if (typeof where === 'object') return ids.includes(where.to) ? { ...session, current: where.to } : session;
  const at = session.current === null ? -1 : ids.indexOf(session.current);
  if (where === 'next-open') return { ...session, current: nextOpen(session, session.current) ?? session.current };
  const to = where === 'next' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at - 1);
  return { ...session, current: ids[to] ?? session.current };
}

export type HandField = 'result' | 'note' | 'who';

export interface HandError {
  readonly field: HandField;
  readonly message: string;
}

export const RESULT_LABELS: Readonly<Record<Decision, Text>> = {
  problem: { en: 'I saw a problem', fr: 'J’ai vu un problème' },
  'no-problem-found': { en: 'I found no problem', fr: 'Je n’ai trouvé aucun problème' },
  'not-sure': { en: 'I am not sure', fr: 'Je ne suis pas sûr' },
};

/** What has to change before an answer can be saved. A problem needs a note that says what was seen, as the log does. */
export function validateAnswer(result: string, note: string, lang: Lang): HandError[] {
  const fr = lang === 'fr';
  const out: HandError[] = [];
  if (!(DECISIONS as readonly string[]).includes(result)) {
    out.push({ field: 'result', message: fr ? 'Choisissez ce que vous avez constaté.' : 'Choose what you found.' });
  }
  const text = note.trim();
  if (result === 'problem' && text === '') {
    out.push({ field: 'note', message: fr ? 'Dites ce que vous avez vu, et sur quelle page.' : 'Say what you saw, and on which page.' });
  } else if (text.length > MAX_NOTE) {
    out.push({
      field: 'note',
      message: fr ? `La note compte ${text.length} caractères. Raccourcissez-la à ${MAX_NOTE} caractères au plus.` : `The note is ${text.length} characters long. Shorten it to ${MAX_NOTE} characters at most.`,
    });
  }
  return out;
}

/** Saves an answer for a criterion. The caller checks it first with `validateAnswer`. */
export function answer(session: HandSession, sc: string, result: Decision, note: string): HandSession {
  return { ...session, answers: { ...session.answers, [sc]: { result, note: note.trim() } } };
}

export function clearAnswer(session: HandSession, sc: string): HandSession {
  const rest = { ...session.answers };
  delete rest[sc];
  return { ...session, answers: rest };
}

export interface HandProgress {
  /** Steps that fit what the person has. */
  readonly total: number;
  /** Of those, the ones with a saved answer. */
  readonly answered: number;
  readonly problem: number;
  readonly noProblem: number;
  readonly notSure: number;
  /** Saved answers for steps that no longer show. They still go into the log. */
  readonly hidden: number;
}

export function progress(session: HandSession): HandProgress {
  const ids = stepIds(session);
  const shown = ids.map((sc) => session.answers[sc]).filter((a): a is HandAnswer => a !== undefined);
  return {
    total: ids.length,
    answered: shown.length,
    problem: shown.filter((a) => a.result === 'problem').length,
    noProblem: shown.filter((a) => a.result === 'no-problem-found').length,
    notSure: shown.filter((a) => a.result === 'not-sure').length,
    hidden: Object.keys(session.answers).filter((sc) => !ids.includes(sc)).length,
  };
}

/** One sentence on where the session stands. It counts looks. It does not rate the page. */
export function progressSentence(p: HandProgress, lang: Lang): string {
  const fr = lang === 'fr';
  if (p.total === 0) return fr ? 'Aucune étape ne correspond à ce que vous avez sous la main.' : 'No step fits what you have at hand.';
  const head = fr ? `${p.answered} sur ${p.total} ${p.total < 2 ? 'étape regardée' : 'étapes regardées'}` : `${p.answered} of ${p.total} ${p.total === 1 ? 'step' : 'steps'} looked at`;
  if (p.answered === 0) return `${head}.`;
  const parts = fr
    ? `${p.problem} avec un problème, ${p.noProblem} sans problème trouvé, ${p.notSure} sans certitude`
    : `${p.problem} with a problem, ${p.noProblem} with no problem found, ${p.notSure} not sure`;
  return fr ? `${head}${NBSP}: ${parts}.` : `${head}: ${parts}.`;
}

/** What is wrong with the name for the log, or an empty string. */
export function validateWho(who: string, lang: Lang): string {
  const fr = lang === 'fr';
  const text = who.trim();
  if (text === '') return fr ? 'Indiquez qui a regardé. Un pseudonyme ou des initiales suffisent.' : 'Say who looked. A handle or initials is enough.';
  if (text.length > MAX_WHO) return fr ? `Ce nom compte ${text.length} caractères. Gardez-en ${MAX_WHO} au plus.` : `This name is ${text.length} characters long. Keep it to ${MAX_WHO} at most.`;
  if (personalDetails(text).length > 0) {
    return fr
      ? 'Ce nom ressemble à une adresse courriel ou à un numéro de téléphone. Le journal est partagé avec l’équipe, alors utilisez un pseudonyme ou des initiales.'
      : 'This name looks like an email address or a phone number. The log is shared with the team, so use a handle or initials.';
  }
  return '';
}

export type ReadEarlier = { readonly ok: true; readonly session: HandSession; readonly count: number } | { readonly ok: false; readonly error: string };

/** Reads an earlier log into the session. A log that cannot be read changes nothing and gives the reason. */
export function readEarlier(session: HandSession, text: string, now: Date, lang: Lang): ReadEarlier {
  if (text.trim() === '') {
    return { ok: false, error: lang === 'fr' ? 'Collez d’abord le contenu d’un journal.' : 'Paste the content of a log first.' };
  }
  const parsed = parseManualLog(text, now);
  if (!parsed.ok) return { ok: false, error: parsed.error[lang] };
  return { ok: true, session: { ...session, earlier: parsed.value }, count: parsed.value.notes.length };
}

/** The newest earlier note for a criterion, or null. */
export function earlierNote(session: HandSession, sc: string): ManualNote | null {
  return latestNotes(session.earlier).get(sc) ?? null;
}

/** The earlier look at a criterion in one line, or an empty string when the earlier log has none. */
export function earlierLine(session: HandSession, sc: string, now: Date, lang: Lang): string {
  const note = earlierNote(session, sc);
  if (!note) return '';
  const days = Math.floor((now.getTime() - new Date(`${note.on}T00:00:00.000Z`).getTime()) / 86_400_000);
  const row = stepsOf({ needs: OPTIONAL_NEEDS }, lang).find((s) => s.row.criterion.sc === sc)?.row;
  if (!row) return '';
  return describeLook({ row: { ...row, state: 'by-hand', ran: [], failed: 0, unknown: 0 }, state: days > DEFAULT_MAX_AGE_DAYS ? 'stale' : 'looked', note, days }, lang);
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The log of the session: the earlier notes as they were, then one note per
 * saved answer, dated today, in the order of WCAG. Answers for steps that
 * no longer show are included: the person did look.
 */
export function exportLog(session: HandSession, now: Date): ManualLog {
  const order = stepIds({ needs: OPTIONAL_NEEDS });
  const fresh: ManualNote[] = order
    .filter((sc) => session.answers[sc] !== undefined)
    .map((sc) => {
      const a = session.answers[sc] as HandAnswer;
      return { sc, result: a.result, on: day(now), by: session.who.trim(), ...(a.note !== '' ? { note: a.note } : {}) };
    });
  return { version: 1, notes: [...session.earlier.notes, ...fresh] };
}

/** The log as the text of a file `--manual-log` reads. */
export function exportText(session: HandSession, now: Date): string {
  return `${JSON.stringify(exportLog(session, now), null, 2)}\n`;
}

export function logFileName(now: Date): string {
  return `narrow-audit.manual-log.${day(now)}.json`;
}

/** What was found, as plain text for a message or a ticket: one line per saved answer, problems first. */
export function summaryText(session: HandSession, now: Date, lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const rank: Readonly<Record<Decision, number>> = { problem: 0, 'not-sure': 1, 'no-problem-found': 2 };
  const order = stepIds({ needs: OPTIONAL_NEEDS });
  const rows = order.filter((sc) => session.answers[sc] !== undefined).map((sc) => ({ sc, a: session.answers[sc] as HandAnswer }));
  rows.sort((x, y) => rank[x.a.result] - rank[y.a.result] || order.indexOf(x.sc) - order.indexOf(y.sc));
  const who = session.who.trim() === '' ? 'UNKNOWN' : session.who.trim();
  const lines = [
    fr ? `Examen à la main du ${day(now)}, par ${who}` : `Look by hand on ${day(now)}, by ${who}`,
    rows.length === 0 ? (fr ? 'Aucune étape n’a encore été regardée.' : 'No step has been looked at yet.') : progressSentence(progress({ ...session, needs: OPTIONAL_NEEDS }), lang),
    ...rows.map(({ sc, a }) => `- ${aaLabel(sc, lang)}${colon} ${RESULT_LABELS[a.result][lang]}${a.note === '' ? '.' : `. ${a.note}`}`),
    fr
      ? 'Ces lignes disent ce qu’une personne a regardé et vu. Elles ne disent pas que les pages sont conformes.'
      : 'These lines say what a person looked at and saw. They do not say that the pages conform.',
  ];
  return `${lines.join('\n')}\n`;
}
