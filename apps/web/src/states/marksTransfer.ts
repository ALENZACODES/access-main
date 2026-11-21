/**
 * Move the visit marks to another device as text, the way the list moves: a "marks code" is a short
 * block of text that can be pasted into a message, and a pasted code becomes a plan of what would
 * be set. The code holds place ids, the mark and the place's name for the reader, nothing about the
 * person. A code is checked against the pack on this device before anything is set: ids the pack
 * does not hold, marks that are already the same and marks past the limit are counted and left out.
 */
import { MAX_CODE_CHARS, MAX_CODE_LINES } from "./listTransfer";
import { isShortlistId } from "./shortlist";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { MAX_VISIT_MARKS, type VisitMark, type VisitStatus, isVisitStatus } from "./visitMarks";
import { statusName } from "./visitMarksCopy";

export const MARKS_CODE_HEADER = "MARKS v1";

const UNKNOWN = "UNKNOWN";
// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
/** A lone bullet is not an id: "- | been" is a line with no id. */
const BULLET_ONLY = /^[-*\u2022]$/;
const LINE = /^\s*(?:[-*\u2022]|\d{1,3}[.)])?\s*([^\s|]+)\s*\|\s*([a-z-]+)\s*(?:\|.*)?$/;

export interface CodeMark {
  readonly id: string;
  readonly status: VisitStatus;
  readonly name: string | null;
}

/** One line per mark: `- id | status | name`. The name is for the reader; only the id and status are read back. */
export function marksToCode(marks: readonly CodeMark[]): string {
  const lines = marks
    .filter((m) => isShortlistId(m.id) && isVisitStatus(m.status))
    .map((m) => `- ${m.id} | ${m.status} | ${(m.name ?? UNKNOWN).replace(CONTROL, " ").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || UNKNOWN}`);
  return `${[MARKS_CODE_HEADER, ...lines].join("\n")}\n`;
}

export interface ParsedMarksCode {
  /** Valid marks in the order written. A repeated id keeps its first line. */
  readonly marks: readonly { readonly id: string; readonly status: VisitStatus }[];
  /** Non-empty lines that were not the header or a mark line, and lines with an invalid id or status. */
  readonly ignored: number;
  readonly hadHeader: boolean;
  readonly cut: boolean;
}

export function parseMarksCode(text: string): ParsedMarksCode {
  const cut = text.length > MAX_CODE_CHARS;
  const rawLines = text.slice(0, MAX_CODE_CHARS).split(/\r\n|\r|\n/);
  const lines = rawLines.slice(0, MAX_CODE_LINES);
  const seen = new Set<string>();
  const marks: { id: string; status: VisitStatus }[] = [];
  let ignored = 0;
  let hadHeader = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === MARKS_CODE_HEADER) {
      hadHeader = true;
      continue;
    }
    const m = LINE.exec(line);
    if (m === null || !isShortlistId(m[1]) || BULLET_ONLY.test(m[1]) || !isVisitStatus(m[2])) {
      ignored += 1;
      continue;
    }
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      marks.push({ id: m[1], status: m[2] });
    }
  }
  return { marks, ignored, hadHeader, cut: cut || rawLines.length > MAX_CODE_LINES };
}

export interface MarksPlan {
  /** Marks to set: places with no mark, or with a different one, in the order of the code. */
  readonly toSet: readonly { readonly id: string; readonly status: VisitStatus; readonly replaces: VisitStatus | null }[];
  readonly same: readonly string[];
  readonly notInPack: readonly string[];
  /** New marks that would not fit; they are left out, not swapped for others. */
  readonly overCapacity: readonly string[];
}

export function planMarksImport(parsed: ParsedMarksCode, current: readonly VisitMark[], packIds: ReadonlySet<string>, limit = MAX_VISIT_MARKS): MarksPlan {
  const have = new Map(current.map((m) => [m.id, m.status] as const));
  const toSet: { id: string; status: VisitStatus; replaces: VisitStatus | null }[] = [];
  const same: string[] = [];
  const notInPack: string[] = [];
  const overCapacity: string[] = [];
  let room = Math.max(0, limit - current.length);
  for (const m of parsed.marks) {
    if (!packIds.has(m.id)) notInPack.push(m.id);
    else if (have.get(m.id) === m.status) same.push(m.id);
    else if (have.has(m.id)) toSet.push({ id: m.id, status: m.status, replaces: have.get(m.id) ?? null });
    else if (room > 0) {
      room -= 1;
      toSet.push({ id: m.id, status: m.status, replaces: null });
    } else overCapacity.push(m.id);
  }
  return { toSet, same, notInPack, overCapacity };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What reading the code found, as sentences. Counts only. */
export function marksImportSummary(plan: MarksPlan, parsed: ParsedMarksCode, locale: Locale): string {
  if (parsed.marks.length === 0) {
    return t(locale, `No marks found in this text. A marks code starts with ${MARKS_CODE_HEADER} and has one line for each mark.`, `Aucune marque trouvée dans ce texte. Un code de marques commence par ${MARKS_CODE_HEADER} et compte une ligne par marque.`);
  }
  const parts = [t(locale, `${plural(plan.toSet.length, "mark would be set", "marks would be set")}.`, `${plural(plan.toSet.length, "marque serait appliquée", "marques seraient appliquées")}.`)];
  const replacing = plan.toSet.filter((s) => s.replaces !== null).length;
  if (replacing > 0) parts.push(t(locale, `${plural(replacing, "replaces", "replace")} a mark you already have.`, `${plural(replacing, "remplace", "remplacent")} une marque que vous avez déjà.`));
  if (plan.same.length > 0) parts.push(t(locale, `${plural(plan.same.length, "is", "are")} already the same.`, `${plural(plan.same.length, "est déjà identique", "sont déjà identiques")}.`));
  if (plan.notInPack.length > 0) parts.push(t(locale, `${plural(plan.notInPack.length, "is", "are")} on a place that is not in the pack on this device.`, `${plural(plan.notInPack.length, "concerne", "concernent")} un lieu absent du pack de cet appareil.`));
  if (plan.overCapacity.length > 0) parts.push(t(locale, `${plural(plan.overCapacity.length, "does", "do")} not fit: at most ${MAX_VISIT_MARKS} marks are kept.`, `${plural(plan.overCapacity.length, "ne tient pas", "ne tiennent pas")}\u00a0: au plus ${MAX_VISIT_MARKS} marques sont conservées.`));
  if (parsed.ignored > 0) parts.push(t(locale, `${plural(parsed.ignored, "line was", "lines were")} not understood and left out.`, `${plural(parsed.ignored, "ligne n’a pas été comprise", "lignes n’ont pas été comprises")} et ${parsed.ignored === 1 ? "a été laissée" : "ont été laissées"} de côté.`));
  if (parsed.cut) parts.push(t(locale, "The text was long, so only the start was read.", "Le texte était long\u00a0: seul le début a été lu."));
  return parts.join(" ");
}

/** One line for a planned mark, for the list the person confirms: the place, the new mark and any mark it replaces. */
export function plannedLine(name: string, status: VisitStatus, replaces: VisitStatus | null, locale: Locale): string {
  const base = `${name}\u00a0: ${statusName(status, locale)}`;
  return replaces === null ? base : t(locale, `${name}: ${statusName(status, locale)} (was ${statusName(replaces, locale)})`, `${base} (était ${statusName(replaces, locale)})`);
}
