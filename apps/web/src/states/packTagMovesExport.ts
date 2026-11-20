/**
 * A CSV and a plain-text copy of the tag moves. The CSV uses fixed English tokens in both
 * languages. Each row is one move that has places, in table order (earlier tag, then tag now),
 * so the same two lists always give the same file.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { placesWord } from "./packDiffText";
import { type MoveKey, MOVE_KEYS, type TagMoves, addedRemovedLine, moveLabel, placesIn, tagMovesLine, tagMovesNote } from "./packTagMoves";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const MOVE_CSV_HEADER = ["from", "to", "places", "place_ids"] as const;
export const MOVE_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "tag-changes.csv", fr: "changements-d-indication.csv" };
export const MOVE_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "tag-changes.txt", fr: "changements-d-indication.txt" };

/** The side of a move in a CSV: the tag name, UNKNOWN, or one of two fixed tokens for a place on only one side. */
export function moveToken(key: MoveKey, side: "from" | "to"): string {
  if (key === "unknown") return "UNKNOWN";
  if (key === "absent") return side === "from" ? "not_in_earlier_file" : "not_listed_now";
  return key;
}

function movesWithPlaces(moves: TagMoves): Array<{ from: MoveKey; to: MoveKey }> {
  const out: Array<{ from: MoveKey; to: MoveKey }> = [];
  for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) if (moves.cells[from][to] > 0) out.push({ from, to });
  return out;
}

export function tagMovesToCsv(moves: TagMoves, opts: CsvOptions = {}): string {
  const rows: string[][] = [[...MOVE_CSV_HEADER]];
  for (const { from, to } of movesWithPlaces(moves)) {
    rows.push([moveToken(from, "from"), moveToken(to, "to"), String(moves.cells[from][to]), placesIn(moves, from, to).map((p) => p.id).join(" ")]);
  }
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function tagMovesToText(moves: TagMoves, locale: Locale, today: string): string {
  const title = t(locale, "How wheelchair tags changed", "Comment les indications pour fauteuil roulant ont changé");
  const out: string[] = [title, "=".repeat(title.length), t(locale, `Date: ${today}`, `Date\u00a0: ${today}`), tagMovesLine(moves, locale)];
  const extra = addedRemovedLine(moves, locale);
  if (extra) out.push(extra);
  out.push(tagMovesNote(locale), "");
  for (const { from, to } of movesWithPlaces(moves)) {
    out.push(`${moveLabel(from, to, locale)} — ${placesWord(moves.cells[from][to], locale)}`);
    for (const p of placesIn(moves, from, to)) out.push(`  - ${p.name ?? "UNKNOWN"} (${p.id})`);
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}
