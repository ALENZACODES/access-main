/**
 * Compare today's tag-and-note findings with an earlier findings file saved by this tool. Each place in the
 * earlier file is matched by its pack id. A place is "new" when it points different ways now and did not
 * before, "gone" when it did before and does not now (the tag or note changed, or the place left the pack),
 * and "same" otherwise. A place whose tag or note text changed while still pointing different ways is
 * listed as "changed". The file is read as data only: nothing in it is run, opened or fetched.
 */
import { parseCsv, undoFormulaGuard, MAX_CSV_BYTES } from "./csvParse";
import type { Disagreement } from "./tagNoteCheck";
import { TN_CSV_HEADER } from "./tagNoteCheckCopy";

export interface EarlierFinding {
  readonly id: string;
  readonly name: string | null;
  readonly tag: string;
  readonly kind: string;
  readonly note: string;
}

export type EarlierProblem = "empty" | "too-large" | "no-header" | "missing-columns" | "unterminated-quote" | "too-many-rows" | "no-rows";

export type EarlierReading =
  | { readonly ok: true; readonly findings: readonly EarlierFinding[]; readonly skipped: number }
  | { readonly ok: false; readonly problem: EarlierProblem; readonly missing?: readonly string[] };

const REQUIRED = ["place_id", "wheelchair_tag", "kind", "note"] as const;
const MAX_ID = 64;

/** Read a findings CSV written by this tool. Rows without a usable id or with too few cells are counted, not guessed at. */
export function readEarlierFindings(text: string): EarlierReading {
  if (text.trim() === "") return { ok: false, problem: "empty" };
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) return { ok: false, problem: "too-large" };
  const parsed = parseCsv(text);
  if (!parsed.ok) return { ok: false, problem: parsed.error };
  const [header, ...body] = parsed.rows;
  if (header === undefined) return { ok: false, problem: "no-header" };
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const k = h.trim();
    if (!index.has(k)) index.set(k, i);
  });
  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) return { ok: false, problem: "missing-columns", missing };
  if (body.length === 0) return { ok: false, problem: "no-rows" };
  const findings: EarlierFinding[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const nameAt = index.get("place_name");
  for (const cells of body) {
    const at = (c: string): string => undoFormulaGuard(cells[index.get(c)!] ?? "");
    const id = at("place_id").trim();
    if (cells.length < header.length || id === "" || id.length > MAX_ID || seen.has(id)) {
      skipped += 1;
      continue;
    }
    seen.add(id);
    const name = nameAt === undefined ? "" : undoFormulaGuard(cells[nameAt] ?? "").trim();
    findings.push({ id, name: name === "" ? null : name, tag: at("wheelchair_tag").trim(), kind: at("kind").trim(), note: at("note") });
  }
  return { ok: true, findings, skipped };
}

export type EarlierChange = "new" | "gone" | "changed" | "same";

export interface EarlierRow {
  readonly id: string;
  readonly name: string | null;
  readonly change: EarlierChange;
}

export interface EarlierDiff {
  readonly rows: readonly EarlierRow[];
  readonly counts: Readonly<Record<EarlierChange, number>>;
}

/** Same text apart from runs of white space; a re-saved file often differs only that way. */
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

export function compareWithEarlier(now: readonly Disagreement[], earlier: readonly EarlierFinding[]): EarlierDiff {
  const before = new Map(earlier.map((e) => [e.id, e] as const));
  const rows: EarlierRow[] = [];
  const counts: Record<EarlierChange, number> = { new: 0, gone: 0, changed: 0, same: 0 };
  const push = (id: string, name: string | null, change: EarlierChange) => {
    rows.push({ id, name, change });
    counts[change] += 1;
  };
  const current = new Set<string>();
  for (const d of now) {
    current.add(d.id);
    const e = before.get(d.id);
    if (e === undefined) push(d.id, d.name, "new");
    else push(d.id, d.name, e.tag === d.tag && e.kind === d.kind && squash(e.note) === squash(d.note) ? "same" : "changed");
  }
  for (const e of earlier) if (!current.has(e.id)) push(e.id, e.name, "gone");
  const rank: Record<EarlierChange, number> = { new: 0, changed: 1, gone: 2, same: 3 };
  rows.sort((a, b) => rank[a.change] - rank[b.change] || (a.name ?? "~").localeCompare(b.name ?? "~", "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
  return { rows, counts };
}

/** True when the header is the one this tool writes, so a wrong file can be told apart early. */
export const looksLikeFindingsFile = (text: string): boolean => {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return TN_CSV_HEADER.every((h) => first.includes(h));
};
