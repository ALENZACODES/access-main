/**
 * Plain-text and CSV copies of the "places by distance" table. CSV column names, band names and tag
 * names are fixed tokens, the same in both languages. The point the person typed is not in either
 * file: the files say only that distances were measured from a point on this device.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { type BandRow, BAND_TAG_ORDER, NO_POINT_BAND, bandLabel, bandRange, bandsLine, formatBandShare, reportedBandShare, straightLineNote } from "./packBands";
import { placeCount } from "./packCategories";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const BAND_CSV_HEADER = ["band", "from_m", "to_m", "places", "tag_yes", "tag_limited", "tag_no", "tag_designated", "tag_unknown", "tag_reported_percent"] as const;
export const BAND_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-by-distance.csv", fr: "lieux-par-distance.csv" };
export const BAND_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-by-distance.txt", fr: "lieux-par-distance.txt" };

/** One CSV row per band. Edges are whole metres; the open end and the no-point group use the token UNKNOWN. */
export function bandsToCsv(rows: readonly BandRow[], opts: CsvOptions = {}): string {
  const lines: string[][] = [[...BAND_CSV_HEADER]];
  for (const row of rows) {
    const range = row.key === NO_POINT_BAND ? null : bandRange(row.key);
    const share = reportedBandShare(row);
    lines.push([
      row.key,
      range === null ? "UNKNOWN" : String(range.from),
      range === null || range.to === null ? "UNKNOWN" : String(range.to),
      String(row.total),
      ...BAND_TAG_ORDER.map((tag) => String(row.byTag[tag])),
      share === null ? "UNKNOWN" : String(share),
    ]);
  }
  return (opts.bom ? "\uFEFF" : "") + lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function tagWord(tag: (typeof BAND_TAG_ORDER)[number], locale: Locale): string {
  switch (tag) {
    case "yes":
      return t(locale, "yes", "oui");
    case "limited":
      return t(locale, "limited", "limité");
    case "no":
      return t(locale, "no", "non");
    case "designated":
      return t(locale, "designated", "réservé");
    case "unknown":
      return "UNKNOWN";
  }
}

/** One block per band, with the tag counts spelled out. Ends with the credit line the pack requires. */
export function bandsToText(rows: readonly BandRow[], locale: Locale, today: string): string {
  const title = t(locale, "Places by distance from a point you typed", "Lieux par distance depuis un point saisi");
  const out: string[] = [title, "=".repeat(title.length), t(locale, `Date: ${today}`, `Date\u00a0: ${today}`), bandsLine(rows, locale), straightLineNote(locale), ""];
  for (const row of rows) {
    out.push(`${bandLabel(row.key, locale)} — ${placeCount(row.total, locale)}`);
    const tags = BAND_TAG_ORDER.map((tag) => `${tagWord(tag, locale)} ${row.byTag[tag]}`).join(", ");
    out.push(`  ${t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}${locale === "fr" ? "\u00a0:" : ":"} ${tags}`);
    out.push(`  ${t(locale, "Tag reported with a source", "Indication fournie avec une source")}${locale === "fr" ? "\u00a0:" : ":"} ${formatBandShare(reportedBandShare(row), locale)}`);
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}
