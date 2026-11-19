import { validDate } from './ci.js';
import type { ReportCoverageRow } from './coverage.js';
import { daysSince } from './ledger.js';
import { manualStep } from './manual-steps.js';
import { DECISIONS, DEFAULT_MAX_AGE_DAYS, type Decision } from './review.js';
import { NBSP, type Lang } from './types.js';
import { aaCriterion } from './wcag22.js';

/**
 * A log of what people found when they looked at a criterion by hand, kept
 * in a JSON file next to the audit:
 *
 *   { "version": 1, "notes": [
 *     { "sc": "2.4.7", "result": "no-problem-found", "on": "2026-11-12", "by": "@sam", "note": "Light and dark, all five pages." },
 *     { "sc": "1.2.2", "result": "problem", "on": "2026-11-12", "by": "@sam", "note": "The intro video has no captions." } ] }
 *
 * The worksheet page saves nothing, so this file is where a by-hand look is
 * recorded. The newest note for a criterion is the one that counts, and a
 * note older than 180 days is listed as stale, because pages change after
 * someone has looked.
 *
 * `no-problem-found` is what one person saw on the pages they looked at, on
 * that day. It is not a statement that the criterion is met.
 */

type Text = { readonly en: string; readonly fr: string };

export interface ManualNote {
  /** Number of a Level A or AA criterion of WCAG 2.2. */
  readonly sc: string;
  readonly result: Decision;
  /** The day the person looked, as YYYY-MM-DD. */
  readonly on: string;
  /** Who looked. */
  readonly by: string;
  readonly note?: string;
}

export interface ManualLog {
  readonly version: 1;
  readonly notes: readonly ManualNote[];
}

export const EMPTY_MANUAL_LOG: ManualLog = { version: 1, notes: [] };

export type ParsedManualLog = { readonly ok: true; readonly value: ManualLog } | { readonly ok: false; readonly error: Text };

const NOTE_KEYS: readonly string[] = ['sc', 'result', 'on', 'by', 'note'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a log. `now` refuses a note dated after today, which is always a typing slip. */
export function parseManualLog(text: string, now: Date): ParsedManualLog {
  const bad = (en: string, fr: string): ParsedManualLog => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return bad('The by-hand log is not valid JSON.', 'Le journal des contrôles à la main n’est pas du JSON valide.');
  }
  if (!isObject(raw) || raw['version'] !== 1 || !Array.isArray(raw['notes'])) {
    return bad('The by-hand log needs "version": 1 and a "notes" list.', 'Le journal des contrôles à la main demande "version": 1 et une liste "notes".');
  }
  const today = now.toISOString().slice(0, 10);
  const notes: ManualNote[] = [];
  for (let i = 0; i < raw['notes'].length; i++) {
    const n: unknown = raw['notes'][i];
    const wrong = (en: string, fr: string): ParsedManualLog => bad(`By-hand log, note ${i + 1}: ${en}`, `Journal des contrôles à la main, note ${i + 1}${NBSP}: ${fr}`);
    if (!isObject(n)) return wrong('it must be an object.', 'elle doit être un objet.');
    const extra = Object.keys(n).find((k) => !NOTE_KEYS.includes(k));
    if (extra !== undefined) return wrong(`the key "${extra}" is not known. Keys: ${NOTE_KEYS.join(', ')}.`, `la clé "${extra}" n’est pas reconnue. Clés possibles${NBSP}: ${NOTE_KEYS.join(', ')}.`);
    const sc = n['sc'];
    if (typeof sc !== 'string' || aaCriterion(sc.trim()) === null) {
      return wrong('"sc" must be the number of a Level A or AA criterion of WCAG 2.2, such as "2.4.7".', '"sc" doit être le numéro d’un critère de niveau A ou AA des WCAG 2.2, par exemple "2.4.7".');
    }
    if (!DECISIONS.includes(n['result'] as Decision)) {
      return wrong(`"result" must be one of: ${DECISIONS.join(', ')}.`, `"result" doit valoir l’une de ces valeurs${NBSP}: ${DECISIONS.join(', ')}.`);
    }
    const on = n['on'];
    if (typeof on !== 'string' || !validDate(on)) return wrong('"on" must be a real date written YYYY-MM-DD.', '"on" doit être une date réelle écrite AAAA-MM-JJ.');
    if (on > today) return wrong(`"on" is ${on}, which is after today.`, `"on" vaut ${on}, une date postérieure à aujourd’hui.`);
    const by = n['by'];
    if (typeof by !== 'string' || by.trim() === '') return wrong('"by" must say who looked.', '"by" doit dire qui a regardé.');
    const note = n['note'];
    if (note !== undefined && typeof note !== 'string') return wrong('"note" must be text.', '"note" doit être du texte.');
    if (n['result'] === 'problem' && (typeof note !== 'string' || note.trim() === '')) {
      return wrong('a note with the result "problem" needs a "note" that says what was seen.', 'une note dont le résultat est "problem" demande un champ "note" qui dit ce qui a été vu.');
    }
    notes.push({ sc: sc.trim(), result: n['result'] as Decision, on, by: by.trim(), ...(typeof note === 'string' && note.trim() !== '' ? { note: note.trim() } : {}) });
  }
  return { ok: true, value: { version: 1, notes } };
}

/** The newest note for each criterion. Of two notes of the same day, the later one in the file counts. */
export function latestNotes(log: ManualLog): Map<string, ManualNote> {
  const out = new Map<string, ManualNote>();
  for (const n of log.notes) {
    const have = out.get(n.sc);
    if (!have || n.on >= have.on) out.set(n.sc, n);
  }
  return out;
}

/** `looked`: a note within the age limit. `stale`: only an older note. `never`: no note at all. */
export type LookState = 'looked' | 'stale' | 'never';

export interface ManualRow {
  readonly row: ReportCoverageRow;
  readonly state: LookState;
  readonly note: ManualNote | null;
  /** Days since the note, or null. */
  readonly days: number | null;
}

/** Each criterion of a report's coverage with the newest by-hand note for it. */
export function applyManualLog(rows: readonly ReportCoverageRow[], log: ManualLog, now: Date, maxAgeDays = DEFAULT_MAX_AGE_DAYS): ManualRow[] {
  const latest = latestNotes(log);
  return rows.map((row): ManualRow => {
    const note = latest.get(row.criterion.sc) ?? null;
    if (!note) return { row, state: 'never', note: null, days: null };
    const days = daysSince(`${note.on}T00:00:00.000Z`, now);
    return { row, state: days > maxAgeDays ? 'stale' : 'looked', note, days };
  });
}

const RESULT_WORDS: Readonly<Record<Decision, Text>> = {
  problem: { en: 'a problem was seen', fr: 'un problème a été vu' },
  'no-problem-found': { en: 'no problem was found', fr: 'aucun problème n’a été trouvé' },
  'not-sure': { en: 'the person was not sure', fr: 'la personne n’était pas sûre' },
};

/** One line on the by-hand state of a criterion: `Looked on 2026-11-12 by @sam (7 days ago): no problem was found.` */
export function describeLook(m: ManualRow, lang: Lang): string {
  const fr = lang === 'fr';
  if (!m.note || m.days === null) return fr ? 'Aucune note à la main dans le journal.' : 'No by-hand note in the log.';
  const ago = fr ? `il y a ${m.days} ${m.days < 2 ? 'jour' : 'jours'}` : `${m.days} ${m.days === 1 ? 'day' : 'days'} ago`;
  const stale = m.state === 'stale' ? (fr ? ' La note est ancienne, la page a pu changer.' : ' The note is old, and the page may have changed.') : '';
  const text = m.note.note ? ` ${m.note.note}` : '';
  return fr
    ? `Regardé le ${m.note.on} par ${m.note.by} (${ago})${NBSP}: ${RESULT_WORDS[m.note.result].fr}.${text}${stale}`
    : `Looked on ${m.note.on} by ${m.note.by} (${ago}): ${RESULT_WORDS[m.note.result].en}.${text}${stale}`;
}

export interface ManualSummary {
  readonly looked: number;
  readonly stale: number;
  readonly never: number;
  readonly problems: number;
  readonly noProblemFound: number;
  readonly notSure: number;
  /** Criteria with no check at all and no current note: nothing and nobody has looked at them. */
  readonly unseen: number;
}

export function summariseManual(rows: readonly ManualRow[]): ManualSummary {
  const current = rows.filter((m) => m.state === 'looked');
  return {
    looked: current.length,
    stale: rows.filter((m) => m.state === 'stale').length,
    never: rows.filter((m) => m.state === 'never').length,
    problems: current.filter((m) => m.note?.result === 'problem').length,
    noProblemFound: current.filter((m) => m.note?.result === 'no-problem-found').length,
    notSure: current.filter((m) => m.note?.result === 'not-sure').length,
    unseen: rows.filter((m) => m.state !== 'looked' && m.row.kind === 'by-hand').length,
  };
}

/** Plain text: how many criteria a person has looked at, what they saw, and which criteria nothing and nobody has looked at. */
export function describeManualLog(rows: readonly ManualRow[], lang: Lang, max = 10): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const s = summariseManual(rows);
  const lines: string[] = [
    fr
      ? `Contrôles à la main${colon} ${s.looked} critères sur ${rows.length} ont une note récente, ${s.stale} une note ancienne, ${s.never} aucune note.`
      : `By-hand looks${colon} ${s.looked} of ${rows.length} criteria have a recent note, ${s.stale} an old note, ${s.never} no note.`,
    fr
      ? `  Parmi les notes récentes${colon} ${s.problems} avec un problème vu, ${s.noProblemFound} sans problème trouvé, ${s.notSure} sans certitude.`
      : `  Among the recent notes${colon} ${s.problems} with a problem seen, ${s.noProblemFound} with no problem found, ${s.notSure} not sure.`,
  ];
  const problems = rows.filter((m) => m.state === 'looked' && m.note?.result === 'problem');
  for (const m of problems.slice(0, max)) lines.push(`  ${m.row.criterion.sc} ${m.row.criterion[lang]}${colon} ${describeLook(m, lang)}`);
  if (problems.length > max) lines.push(fr ? `  … et ${problems.length - max} de plus.` : `  … and ${problems.length - max} more.`);
  const unseen = rows.filter((m) => m.state !== 'looked' && m.row.kind === 'by-hand');
  if (unseen.length > 0) {
    lines.push(
      fr
        ? `  ${unseen.length} critères n’ont ni contrôle automatisé ni note récente${colon} ${unseen.map((m) => m.row.criterion.sc).join(', ')}`
        : `  ${unseen.length} criteria have neither an automated check nor a recent note${colon} ${unseen.map((m) => m.row.criterion.sc).join(', ')}`,
    );
  }
  lines.push(
    fr
      ? '  «\u202FAucun problème trouvé\u202F» est ce qu’une personne a vu ce jour-là sur les pages regardées. Ce n’est pas une déclaration de conformité.'
      : '  “No problem found” is what one person saw that day on the pages they looked at. It is not a conformance statement.',
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The criteria to look at next, most pressing first: those with no check at
 * all and no recent note, then those whose checks did not run, then the rest
 * with no recent note. Criteria with a recent note are left out. Within a
 * group, a criterion never looked at comes before one with an old note.
 */
export function nextLooks(rows: readonly ManualRow[]): ManualRow[] {
  const group = (m: ManualRow): number => (m.row.kind === 'by-hand' ? 0 : m.row.state === 'not-run' ? 1 : 2);
  return rows
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.state !== 'looked')
    .sort((a, b) => group(a.m) - group(b.m) || Number(a.m.state === 'stale') - Number(b.m.state === 'stale') || a.i - b.i)
    .map(({ m }) => m);
}

/** Plain text: the first criteria to look at next, each with its by-hand step. Empty when every criterion has a recent note. */
export function describeNextLooks(rows: readonly ManualRow[], lang: Lang, max = 5): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const todo = nextLooks(rows);
  if (todo.length === 0) return '';
  const limit = Math.max(1, Math.floor(max));
  const lines: string[] = [fr ? `À regarder à la main ensuite${colon} ${Math.min(limit, todo.length)} sur ${todo.length} critères sans note récente` : `To look at by hand next${colon} ${Math.min(limit, todo.length)} of ${todo.length} criteria with no recent note`];
  for (const m of todo.slice(0, limit)) {
    const c = m.row.criterion;
    const why =
      m.row.kind === 'by-hand'
        ? fr
          ? 'aucun contrôle automatisé'
          : 'no automated check'
        : m.row.state === 'not-run'
          ? fr
            ? 'contrôles non exécutés dans ce rapport'
            : 'checks not run in this report'
          : fr
            ? 'les contrôles n’en regardent qu’une partie'
            : 'the checks look at part of it only';
    const old = m.state === 'stale' && m.note ? (fr ? `, dernière note le ${m.note.on}` : `, last note on ${m.note.on}`) : '';
    lines.push(`  ${c.sc} ${c[lang]} (${why}${old})`);
    const step = manualStep(c.sc);
    if (step) lines.push(`    ${step.action[lang]}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A log to start from, with one note of each result. The dates are examples. */
export function sampleManualLog(): string {
  const log: ManualLog = {
    version: 1,
    notes: [
      { sc: '2.4.7', result: 'no-problem-found', on: '2026-11-12', by: '@name', note: 'Light and dark mode, home and place pages.' },
      { sc: '1.2.2', result: 'problem', on: '2026-11-12', by: '@name', note: 'The intro video has no captions.' },
      { sc: '2.4.3', result: 'not-sure', on: '2026-11-12', by: '@name', note: 'Focus goes to the map before the list. Ask the design lead.' },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
