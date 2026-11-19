import { keyOf, ruleIdOf, validDate } from './ci.js';
import type { AuditReport } from './report.js';
import { NBSP, type Entry, type Lang } from './types.js';

/**
 * Notes from a person who looked at findings by hand. An UNKNOWN is a
 * question the tool cannot answer, so the answer has to come from a person,
 * with a name and a date. A note is kept beside the report and never changes
 * it: counts and statuses stay as the checks produced them, and "no problem
 * found" is a dated record of one look, not a pass. A note goes stale when
 * its finding is no longer reported or when it is older than a set number of
 * days, because pages change after someone has looked.
 */

export type Decision = 'problem' | 'no-problem-found' | 'not-sure';

export const DECISIONS: readonly Decision[] = ['problem', 'no-problem-found', 'not-sure'];

export interface ReviewNote {
  /** Route, check, rule and element id, as printed in the worksheet. */
  readonly key: string;
  readonly decision: Decision;
  /** Who looked. */
  readonly by: string;
  /** The day they looked, as YYYY-MM-DD. */
  readonly on: string;
  readonly note?: string;
}

export interface ReviewFile {
  readonly version: 1;
  readonly notes: readonly ReviewNote[];
}

export const EMPTY_REVIEW: ReviewFile = { version: 1, notes: [] };
/** A note older than this is listed as stale. */
export const DEFAULT_MAX_AGE_DAYS = 180;

export type ParsedReview = { readonly ok: true; readonly value: ReviewFile } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export function parseReview(text: string): ParsedReview {
  const bad = (en: string, fr: string): ParsedReview => ({ ok: false, error: { en, fr } });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('The review file is not valid JSON.', 'Le fichier de revue n’est pas un JSON valide.');
  }
  const o = raw as { version?: unknown; notes?: unknown } | null;
  if (!o || typeof o !== 'object' || o.version !== 1 || !Array.isArray(o.notes)) {
    return bad('The review file needs version 1 and a "notes" list.', 'Le fichier de revue doit avoir version 1 et une liste "notes".');
  }
  const seen = new Set<string>();
  for (const [i, n] of (o.notes as Array<Record<string, unknown> | null>).entries()) {
    const at = i + 1;
    if (n === null || typeof n !== 'object') return bad(`Note ${at} of the review file is not an object.`, `La note ${at} du fichier de revue n’est pas un objet.`);
    if (typeof n['key'] !== 'string' || n['key'].split('|').length < 4) return bad(`Note ${at} needs the key printed in the worksheet.`, `La note ${at} doit porter la clé imprimée dans la feuille de revue.`);
    if (!DECISIONS.includes(n['decision'] as Decision)) return bad(`Note ${at} needs a decision: ${DECISIONS.join(', ')}.`, `La note ${at} doit porter une décision\u00A0: ${DECISIONS.join(', ')}.`);
    if (typeof n['by'] !== 'string' || n['by'].trim() === '') return bad(`Note ${at} needs the name of the person who looked.`, `La note ${at} doit porter le nom de la personne qui a regardé.`);
    if (typeof n['on'] !== 'string' || !validDate(n['on'])) return bad(`Note ${at} needs the day it was looked at, as YYYY-MM-DD.`, `La note ${at} doit porter le jour du contrôle, au format AAAA-MM-JJ.`);
    if (n['note'] !== undefined && typeof n['note'] !== 'string') return bad(`The text of note ${at} must be text.`, `Le texte de la note ${at} doit être du texte.`);
    if (seen.has(n['key'])) return bad(`Note ${at} repeats the key of an earlier note. Keep one note per finding.`, `La note ${at} reprend la clé d’une note précédente. Gardez une seule note par anomalie.`);
    seen.add(n['key']);
  }
  return { ok: true, value: { version: 1, notes: o.notes as ReviewNote[] } };
}

export interface ReviewedItem {
  readonly route: string;
  readonly entry: Entry;
  readonly note: ReviewNote;
}

export interface ReviewResult {
  /** UNKNOWN findings with a current note. */
  readonly reviewed: readonly ReviewedItem[];
  /** UNKNOWN findings nobody has a current note for. */
  readonly pending: readonly { readonly route: string; readonly entry: Entry }[];
  /** Notes that are too old. Their findings are listed as pending again. */
  readonly expired: readonly ReviewNote[];
  /** Notes whose finding is not in this report. */
  readonly unmatched: readonly ReviewNote[];
  /** Notes dated after the day of the run, which cannot be right. They are not counted. */
  readonly future: readonly ReviewNote[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** Matches notes to the UNKNOWN findings of a report. The report itself is not changed. */
export function applyReview(report: AuditReport, review: ReviewFile, now: Date, maxAgeDays = DEFAULT_MAX_AGE_DAYS): ReviewResult {
  const limit = Math.max(1, Math.floor(maxAgeDays));
  const byKey = new Map(review.notes.map((n) => [n.key, n] as const));
  const used = new Set<string>();
  const reviewed: ReviewedItem[] = [];
  const pending: { route: string; entry: Entry }[] = [];
  const expired: ReviewNote[] = [];
  const future: ReviewNote[] = [];
  const stale = new Set<string>();
  for (const n of review.notes) {
    const age = (now.getTime() - dayOf(n.on)) / DAY_MS;
    if (age < 0) {
      future.push(n);
      stale.add(n.key);
    } else if (age > limit) {
      expired.push(n);
      stale.add(n.key);
    }
  }
  const listed = new Set<string>();
  for (const r of report.routes) {
    for (const e of r.entries) {
      if (e.status !== 'unknown') continue;
      const key = keyOf(r.route, e);
      if (listed.has(key)) continue;
      listed.add(key);
      const note = byKey.get(key);
      if (note) used.add(key);
      if (note && !stale.has(key)) reviewed.push({ route: r.route, entry: e, note });
      else pending.push({ route: r.route, entry: e });
    }
  }
  return { reviewed, pending, expired, unmatched: review.notes.filter((n) => !used.has(n.key)), future };
}

/** A worksheet: the UNKNOWN findings nobody has a current note for, by route, with the key to copy into the review file. */
export function worksheet(report: AuditReport, review: ReviewFile, now: Date, lang: Lang, maxAgeDays = DEFAULT_MAX_AGE_DAYS): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const { pending } = applyReview(report, review, now, maxAgeDays);
  if (pending.length === 0) {
    return fr
      ? 'Rien à contrôler à la main\u00A0: chaque point inconnu a une note récente. Cela ne dit rien de ce que les contrôles ne regardent pas.\n'
      : 'Nothing to check by hand: every unknown item has a recent note. This says nothing about what the checks do not look at.\n';
  }
  const lines: string[] = [];
  lines.push(
    fr
      ? `${pending.length} ${pending.length < 2 ? 'point à contrôler' : 'points à contrôler'} à la main. Pour chacun, regardez la page, puis ajoutez une note au fichier de revue avec la clé, une décision (${DECISIONS.join(', ')}), votre nom et la date.`
      : `${pending.length} ${pending.length === 1 ? 'item' : 'items'} to check by hand. For each one, look at the page, then add a note to the review file with the key, a decision (${DECISIONS.join(', ')}), your name and the date.`,
  );
  let current = '';
  for (const p of pending) {
    if (p.route !== current) {
      current = p.route;
      lines.push('', `${p.route}${colon}`);
    }
    lines.push(`  [ ] ${ruleIdOf(p.entry)} ${p.entry.id}`);
    lines.push(`      ${p.entry.message[lang].replace(/\s+/g, ' ').trim()}`);
    lines.push(`      ${fr ? 'clé' : 'key'}${colon} ${keyOf(p.route, p.entry)}`);
  }
  return lines.join('\n') + '\n';
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pluriel = (n: number, one: string, many: string): string => `${n} ${n < 2 ? one : many}`;

/** Plain text: what people found when they looked, and what is still waiting. */
export function describeReview(result: ReviewResult, lang: Lang): string {
  const fr = lang === 'fr';
  const colon = fr ? `${NBSP}:` : ':';
  const count = (d: Decision): number => result.reviewed.filter((x) => x.note.decision === d).length;
  const lines: string[] = [];
  lines.push(
    fr
      ? `Revue à la main${colon} ${pluriel(result.reviewed.length, 'point inconnu a une note récente', 'points inconnus ont une note récente')}, ${result.pending.length} en attente.`
      : `Hand review${colon} ${plural(result.reviewed.length, 'unknown item has a recent note', 'unknown items have a recent note')}, ${result.pending.length} waiting.`,
  );
  if (result.reviewed.length > 0) {
    lines.push(
      fr
        ? `  ${count('problem')} avec un problème constaté, ${count('no-problem-found')} sans problème constaté, ${count('not-sure')} sans certitude.`
        : `  ${count('problem')} with a problem found, ${count('no-problem-found')} with no problem found, ${count('not-sure')} not sure.`,
    );
    lines.push(
      fr
        ? '  «\u202FSans problème constaté\u202F» consigne un regard à une date donnée. Ce n’est pas une réussite, et les décomptes du rapport ne changent pas.'
        : '  “No problem found” records one look on one date. It is not a pass, and the counts of the report do not change.',
    );
  }
  for (const x of result.reviewed.filter((r) => r.note.decision === 'problem')) {
    lines.push(
      fr
        ? `  Problème constaté par ${x.note.by} le ${x.note.on}${colon} ${ruleIdOf(x.entry)} ${x.entry.id} (${x.route})${x.note.note ? ` – ${x.note.note.replace(/\s+/g, ' ').trim()}` : ''}`
        : `  Problem found by ${x.note.by} on ${x.note.on}${colon} ${ruleIdOf(x.entry)} ${x.entry.id} (${x.route})${x.note.note ? ` – ${x.note.note.replace(/\s+/g, ' ').trim()}` : ''}`,
    );
  }
  if (result.expired.length > 0) {
    lines.push(
      fr
        ? `  ${pluriel(result.expired.length, 'note est trop ancienne', 'notes sont trop anciennes')}${colon} le point est de nouveau en attente.`
        : `  ${plural(result.expired.length, 'note is too old', 'notes are too old')}${colon} the item is waiting again.`,
    );
  }
  if (result.future.length > 0) {
    lines.push(
      fr
        ? `  ${pluriel(result.future.length, 'note est datée dans le futur et n’est pas prise en compte', 'notes sont datées dans le futur et ne sont pas prises en compte')}.`
        : `  ${plural(result.future.length, 'note is dated in the future and is not counted', 'notes are dated in the future and are not counted')}.`,
    );
  }
  if (result.unmatched.length > 0) {
    lines.push(
      fr
        ? `  ${pluriel(result.unmatched.length, 'note ne correspond à aucun point inconnu de ce rapport', 'notes ne correspondent à aucun point inconnu de ce rapport')}${colon} l’anomalie a pu disparaître, changer de statut ou d’élément.`
        : `  ${plural(result.unmatched.length, 'note matches no unknown item of this report', 'notes match no unknown item of this report')}${colon} the finding may be gone, or have changed status or element.`,
    );
  }
  return lines.join('\n') + '\n';
}
