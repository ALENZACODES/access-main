/**
 * Plain-text and CSV copies of the "kinds of place" table. CSV column names and tag names are the
 * same fixed English tokens in both languages so a file reads the same anywhere. Counts are
 * counts of what the pack says; a share that cannot be worked out (no places) is the token UNKNOWN.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { type KindRow, KIND_TAG_ORDER, formatKindShare, kindLabel, kindsLine, placeCount, reportedShare, summariseKinds, UNKNOWN_KIND } from "./packCategories";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const KIND_CSV_HEADER = [
  "kind",
  "places",
  "tag_yes",
  "tag_limited",
  "tag_no",
  "tag_designated",
  "tag_unknown",
  "tag_reported_percent",
  "with_location",
  "with_name",
  "source_older_than_a_year",
] as const;

export const KIND_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-kinds.csv", fr: "types-du-pack.csv" };
export const KIND_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-kinds.txt", fr: "types-du-pack.txt" };

/** One CSV row per kind. The kind cell is the label as shown; UNKNOWN places use the token UNKNOWN. */
export function kindsToCsv(rows: readonly KindRow[], opts: CsvOptions = {}): string {
  const lines: string[][] = [[...KIND_CSV_HEADER]];
  for (const row of rows) {
    const share = reportedShare(row);
    lines.push([
      kindLabel(row),
      String(row.total),
      ...KIND_TAG_ORDER.map((tag) => String(row.byTag[tag])),
      share === null ? "UNKNOWN" : String(share),
      String(row.withLocation),
      String(row.withName),
      String(row.stale),
    ]);
  }
  return (opts.bom ? "﻿" : "") + lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function tagWord(tag: (typeof KIND_TAG_ORDER)[number], locale: Locale): string {
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

/** One block per kind, with the tag counts spelled out. Ends with the credit line the pack requires. */
export function kindsToText(rows: readonly KindRow[], locale: Locale, today: string): string {
  const summary = summariseKinds(rows);
  const out: string[] = [t(locale, "Kinds of place in the saved pack", "Types de lieux du pack enregistré"), kindsLine(summary, locale), t(locale, `Date: ${today}`, `Date\u00a0: ${today}`), ""];
  for (const row of rows) {
    const heading = row.key === UNKNOWN_KIND ? t(locale, "No kind stated (UNKNOWN)", "Aucun type indiqué (UNKNOWN)") : kindLabel(row);
    out.push(`${heading} — ${placeCount(row.total, locale)}`);
    const tags = KIND_TAG_ORDER.map((tag) => `${tagWord(tag, locale)} ${row.byTag[tag]}`).join(", ");
    out.push(`  ${t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}${locale === "fr" ? " :" : ":"} ${tags}`);
    out.push(`  ${t(locale, "Tag reported with a source", "Indication fournie avec une source")}${locale === "fr" ? " :" : ":"} ${formatKindShare(reportedShare(row), locale)}`);
    if (row.stale > 0) out.push(`  ${t(locale, `Source older than a year: ${row.stale}`, `Source datant de plus d’un an\u00a0: ${row.stale}`)}`);
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}
