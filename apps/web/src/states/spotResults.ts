/**
 * Reading a filled-in spot-check sheet back. After looking, a person can type their answers into
 * the CSV from the sheet and paste it here; this reads it, one row per place. It reads only what
 * is there: a cell it cannot understand is reported, never guessed, and a row it cannot use is
 * left out and counted.
 *
 * The answers are one person's view on one day. They are never turned into a change to the pack.
 */
import { MAX_CSV_BYTES, parseCsv, undoFormulaGuard } from "./csvParse";
import { isIsoDate } from "./provenance";
import { CHECK_KEYS, type AnswerKey, type CheckKey, CHECK_ANSWERS } from "./spotSheetCopy";
import { SPOT_CSV_HEADER } from "./spotSheetExport";

export const MAX_RESULT_ROWS = 200;
export const MAX_RESULT_NOTES = 500;

export type ResultsProblem = "empty" | "too-large" | "not-csv" | "wrong-header" | "no-rows" | "too-many-rows";

export type CellProblem = "answer-not-understood" | "date-not-understood";

export interface ResultRow {
  /** The number on the sheet. */
  readonly n: string;
  readonly id: string;
  readonly name: string;
  /** The tag token the sheet carried: yes, limited, no, designated or UNKNOWN. */
  readonly tag: string;
  readonly source: string;
  readonly retrievedOn: string;
  readonly answers: Readonly<Partial<Record<CheckKey, AnswerKey>>>;
  /** ISO date, or null when blank or not a date. */
  readonly dateLooked: string | null;
  readonly notes: string;
  /** Cells that could not be read, by column. */
  readonly problems: readonly { readonly column: string; readonly problem: CellProblem }[];
}

export type ReadResults =
  | { readonly ok: true; readonly rows: readonly ResultRow[]; /** Rows with no place id. */ readonly skipped: number }
  | { readonly ok: false; readonly problem: ResultsProblem };

/** Words accepted for an answer, in either language, lower case and without accents or extra spaces. */
const WORDS: Readonly<Record<string, AnswerKey>> = {
  yes: "yes", y: "yes", oui: "yes",
  no: "no", n: "no", non: "no",
  "not sure": "not-sure", "not-sure": "not-sure", unsure: "not-sure", "pas certain": "not-sure", "pas certaine": "not-sure",
  same: "same", pareil: "same", identique: "same", "meme": "same",
  different: "different", differente: "different", differ: "different",
  "could not tell": "could-not-tell", "could-not-tell": "could-not-tell", "cannot tell": "could-not-tell", "impossible a dire": "could-not-tell",
};

/** Fold accents and case, and collapse spaces, so "Différent" and " different " read the same. */
export function foldAnswer(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The answer a cell holds for a question, or null when blank. `undefined` means it was not understood. */
export function readAnswer(key: CheckKey, cell: string): AnswerKey | null | undefined {
  const folded = foldAnswer(cell);
  if (folded === "") return null;
  const answer = WORDS[folded];
  return answer !== undefined && CHECK_ANSWERS[key].includes(answer) ? answer : undefined;
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (s: string): string => undoFormulaGuard(s).replace(CONTROL, "").trim();

export function readSpotResults(input: string): ReadResults {
  if (input.trim() === "") return { ok: false, problem: "empty" };
  const parsed = parseCsv(input);
  if (!parsed.ok) return { ok: false, problem: parsed.error === "too-large" ? "too-large" : parsed.error === "too-many-rows" ? "too-many-rows" : "not-csv" };
  const [head, ...body] = parsed.rows;
  if (!head || head.length !== SPOT_CSV_HEADER.length || head.some((h, i) => h.trim().toLowerCase() !== SPOT_CSV_HEADER[i])) return { ok: false, problem: "wrong-header" };
  if (body.length === 0) return { ok: false, problem: "no-rows" };
  if (body.length > MAX_RESULT_ROWS) return { ok: false, problem: "too-many-rows" };

  const col = (name: (typeof SPOT_CSV_HEADER)[number]): number => SPOT_CSV_HEADER.indexOf(name);
  const rows: ResultRow[] = [];
  let skipped = 0;
  for (const cells of body) {
    const get = (name: (typeof SPOT_CSV_HEADER)[number]): string => clean(cells[col(name)] ?? "");
    const id = get("place_id");
    if (id === "") {
      skipped += 1;
      continue;
    }
    const problems: { column: string; problem: CellProblem }[] = [];
    const answers: Partial<Record<CheckKey, AnswerKey>> = {};
    for (const key of CHECK_KEYS) {
      const a = readAnswer(key, cells[col(key)] ?? "");
      if (a === undefined) problems.push({ column: key, problem: "answer-not-understood" });
      else if (a !== null) answers[key] = a;
    }
    const rawDate = get("date_looked");
    const dateLooked = rawDate === "" ? null : isIsoDate(rawDate) ? rawDate : null;
    if (rawDate !== "" && dateLooked === null) problems.push({ column: "date_looked", problem: "date-not-understood" });
    const notes = get("notes");
    rows.push({
      n: get("n"),
      id,
      name: get("place_name") || "UNKNOWN",
      tag: get("pack_tag") || "UNKNOWN",
      source: get("pack_source") || "UNKNOWN",
      retrievedOn: get("pack_retrieved_on") || "UNKNOWN",
      answers,
      dateLooked,
      notes: notes.length > MAX_RESULT_NOTES ? `${notes.slice(0, MAX_RESULT_NOTES - 1).trimEnd()}…` : notes,
      problems,
    });
  }
  if (rows.length === 0) return { ok: false, problem: "no-rows" };
  return { ok: true, rows, skipped };
}

export const MAX_RESULTS_CHARS = MAX_CSV_BYTES;
