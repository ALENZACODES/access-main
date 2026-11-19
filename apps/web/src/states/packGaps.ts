/**
 * Which kinds of place are missing which details.
 *
 * Counts, for each kind as tagged, how many records have no name, no address or no position. A
 * record with no kind is grouped under UNKNOWN. This is a count of what the pack leaves out; it
 * does not say why, and it does not fill anything in.
 */
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { NBSP, t } from "./typography";

export const UNKNOWN_KIND = "UNKNOWN";
export const MAX_GAP_ROWS = 10;

export interface GapRow {
  /** The kind as the pack tags it, or UNKNOWN. */
  readonly kind: string;
  readonly records: number;
  readonly noName: number;
  readonly noAddress: number;
  readonly noPosition: number;
}

export interface GapResult {
  readonly rows: readonly GapRow[];
  /** How many kinds have at least one gap, which can be more than the rows listed. */
  readonly kindsWithGaps: number;
}

const missing = (r: GapRow): number => r.noName + r.noAddress + r.noPosition;

export function computeGaps(places: readonly PackPlaceRecord[]): GapResult {
  const by = new Map<string, { display: string; row: { -readonly [K in keyof GapRow]: GapRow[K] } }>();
  for (const p of places) {
    const display = p.category === null || p.category.trim() === "" ? UNKNOWN_KIND : p.category.trim();
    const key = display.toLowerCase();
    let entry = by.get(key);
    if (!entry) {
      entry = { display, row: { kind: display, records: 0, noName: 0, noAddress: 0, noPosition: 0 } };
      by.set(key, entry);
    }
    entry.row.records += 1;
    if (p.name === null) entry.row.noName += 1;
    if (p.address === null) entry.row.noAddress += 1;
    if (p.location === null) entry.row.noPosition += 1;
  }
  const withGaps = [...by.values()].map((e) => e.row).filter((r) => missing(r) > 0);
  withGaps.sort((a, b) => missing(b) - missing(a) || b.records - a.records || a.kind.localeCompare(b.kind));
  return { rows: withGaps.slice(0, MAX_GAP_ROWS), kindsWithGaps: withGaps.length };
}

/** One line for a row: the kind, how many records, and what is missing. Zero counts are left out. */
export function gapRowLine(r: GapRow, locale: Locale): string {
  const parts: string[] = [];
  if (r.noName > 0) parts.push(t(locale, `${r.noName} with no name`, `${r.noName} sans nom`));
  if (r.noAddress > 0) parts.push(t(locale, `${r.noAddress} with no address`, `${r.noAddress} sans adresse`));
  if (r.noPosition > 0) parts.push(t(locale, `${r.noPosition} with no position`, `${r.noPosition} sans position`));
  const records = t(locale, `${r.records} ${r.records === 1 ? "record" : "records"}`, `${r.records} ${r.records === 1 ? "fiche" : "fiches"}`);
  // The kind comes from the data, so it is placed as it is; only the separator is typeset.
  return `${r.kind} (${records})${locale === "fr" ? NBSP : ""}: ${parts.join(", ")}`;
}

export function gapLines(g: GapResult, locale: Locale): string[] {
  const lines = g.rows.map((r) => gapRowLine(r, locale));
  if (g.kindsWithGaps > g.rows.length) {
    const more = g.kindsWithGaps - g.rows.length;
    lines.push(t(locale, `${more} more ${more === 1 ? "kind" : "kinds"} not listed (the list stops at ${MAX_GAP_ROWS}).`, `${more} ${more === 1 ? "autre type non listé" : "autres types non listés"} (la liste s’arrête à ${MAX_GAP_ROWS}).`));
  }
  return lines;
}
