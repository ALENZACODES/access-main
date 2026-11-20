/**
 * Read back a places file the App saved earlier (the pack places CSV from packExport.ts), so it can
 * be compared with the pack stored now. The file is untrusted: it may be hand-edited, cut short or
 * from another program. Columns are found by name, so their order does not matter. A row that cannot
 * be used is skipped and listed with its line number; it is never repaired and never guessed.
 */
import { MAX_CSV_BYTES, parseCsv, undoFormulaGuard, type CsvError } from "./csvParse";
import { PACK_CSV_HEADER, UNKNOWN_TOKEN } from "./packExport";
import { isShortId } from "./packEarlierId";
import { WHEELCHAIR_TAGS, type WheelchairTag } from "./packPlaces";
import { isIsoDate } from "./provenance";

export interface EarlierPlace {
  readonly id: string;
  readonly name: string | null;
  readonly kind: string | null;
  readonly address: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly tag: WheelchairTag;
  readonly source: string | null;
  readonly retrievedOn: string | null;
  readonly tier: string | null;
}

export type SkipReason = "no-id" | "bad-id" | "repeated-id" | "short-row" | "bad-tag" | "bad-position";

export interface SkippedRow {
  /** Line number in the file, counting the header as line 1. */
  readonly line: number;
  readonly reason: SkipReason;
}

export type EarlierFileProblem = CsvError | "empty" | "no-header" | "missing-columns" | "no-places";

export type EarlierFile =
  | { readonly ok: true; readonly places: readonly EarlierPlace[]; readonly skipped: readonly SkippedRow[]; readonly skippedTotal: number }
  | { readonly ok: false; readonly problem: EarlierFileProblem; readonly missing?: readonly string[] };

/** Columns the comparison needs. The others (reason, licence, url) are ignored if present. */
export const REQUIRED_COLUMNS = ["place_id", "place_name", "kind", "address", "latitude", "longitude", "wheelchair_tag", "source", "retrieved_on", "tier"] as const;
/** How many skipped rows are listed one by one. The rest are only counted. */
export const MAX_LISTED_SKIPS = 50;

const orNull = (value: string | undefined): string | null => {
  const text = undoFormulaGuard((value ?? "").trim());
  return text === "" || text.toUpperCase() === UNKNOWN_TOKEN ? null : text;
};

function readCoordinate(value: string | undefined, limit: number): number | null | "bad" {
  const text = orNull(value);
  if (text === null) return null;
  if (!/^-?\d{1,3}(\.\d+)?$/.test(text)) return "bad";
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : "bad";
}

function readTag(value: string | undefined): WheelchairTag | "bad" {
  const text = orNull(value);
  if (text === null) return "unknown";
  const lower = text.toLowerCase();
  return (WHEELCHAIR_TAGS as readonly string[]).includes(lower) ? (lower as WheelchairTag) : "bad";
}

export function readEarlierFile(text: string): EarlierFile {
  if (text.trim() === "") return { ok: false, problem: "empty" };
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) return { ok: false, problem: "too-large" };
  const parsed = parseCsv(text);
  if (!parsed.ok) return { ok: false, problem: parsed.error };
  const [header, ...body] = parsed.rows;
  if (header === undefined) return { ok: false, problem: "no-header" };
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    const key = name.trim();
    if (!index.has(key)) index.set(key, i);
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  if (missing.length > 0) return { ok: false, problem: "missing-columns", missing };

  const places: EarlierPlace[] = [];
  const skipped: SkippedRow[] = [];
  let skippedTotal = 0;
  const seen = new Set<string>();
  const skip = (line: number, reason: SkipReason) => {
    skippedTotal += 1;
    if (skipped.length < MAX_LISTED_SKIPS) skipped.push({ line, reason });
  };
  body.forEach((cells, i) => {
    const line = i + 2;
    const at = (column: string): string | undefined => cells[index.get(column)!];
    if (cells.length < header.length) return skip(line, "short-row");
    const id = (at("place_id") ?? "").trim();
    if (id === "") return skip(line, "no-id");
    if (!isShortId(id)) return skip(line, "bad-id");
    if (seen.has(id)) return skip(line, "repeated-id");
    const tag = readTag(at("wheelchair_tag"));
    if (tag === "bad") return skip(line, "bad-tag");
    const lat = readCoordinate(at("latitude"), 90);
    const lon = readCoordinate(at("longitude"), 180);
    // A position needs both coordinates; one alone cannot be placed anywhere.
    if (lat === "bad" || lon === "bad" || (lat === null) !== (lon === null)) return skip(line, "bad-position");
    const retrieved = orNull(at("retrieved_on"));
    seen.add(id);
    places.push({
      id,
      name: orNull(at("place_name")),
      kind: orNull(at("kind")),
      address: orNull(at("address")),
      lat,
      lon,
      tag,
      source: orNull(at("source")),
      retrievedOn: retrieved !== null && isIsoDate(retrieved) ? retrieved : null,
      tier: orNull(at("tier")),
    });
  });
  if (places.length === 0) return { ok: false, problem: "no-places" };
  return { ok: true, places, skipped, skippedTotal };
}

/** The header the App writes, for tests and for naming the file the comparison expects. */
export const EXPECTED_HEADER: readonly string[] = PACK_CSV_HEADER;
