/**
 * Plain-text and CSV copies of the places listed around one place. CSV column names, tag names and
 * direction names are fixed tokens, the same in both languages; distances are whole metres. Both
 * files say that distances and directions are straight lines on the map. The centre is a place of
 * the pack, never the person's own position, so nothing about where the person is goes into a file.
 */
import { compassShort } from "./aroundBearing";
import { aroundCaveat, colon, aroundSummary, beyondLine, centreName, distanceAndDirection, memberName, tagWord, aroundUnmeasuredLine } from "./aroundCopy";
import type { AroundMember, AroundResult } from "./aroundSearch";
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

type Ok = Extract<AroundResult, { status: "ok" }>;

export const AROUND_CSV_HEADER = ["centre_id", "centre_name", "radius_m", "place_id", "place_name", "wheelchair_tag", "kind", "address", "distance_m", "direction"] as const;
export const AROUND_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-around-a-place.csv", fr: "lieux-autour-d-un-lieu.csv" };
export const AROUND_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-around-a-place.txt", fr: "lieux-autour-d-un-lieu.txt" };

/** The fixed English token for a tag in a CSV cell. */
export function csvTag(tag: AroundMember["tag"]): string {
  return tag === "unknown" ? "UNKNOWN" : tag;
}

/** The fixed token for a direction: N, NE, E, SE, S, SW, W or NW, or SAME_SPOT for a place at the centre. */
export function csvDirection(m: Pick<AroundMember, "direction">): string {
  return m.direction === null ? "SAME_SPOT" : m.direction;
}

/** One row per shown place. With no places, only the header row. */
export function aroundToCsv(result: Ok, shown: readonly AroundMember[], opts: CsvOptions = {}): string {
  const rows: string[][] = [[...AROUND_CSV_HEADER]];
  for (const m of shown) {
    rows.push([
      result.centre.id,
      result.centre.name ?? "UNKNOWN",
      String(result.radius),
      m.id,
      m.name ?? "UNKNOWN",
      csvTag(m.tag),
      m.category ?? "UNKNOWN",
      m.address ?? "UNKNOWN",
      String(Math.round(m.metres)),
      csvDirection(m),
    ]);
  }
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A short, readable file: heading, the numbers in words, then one block per place, then the credit. */
export function aroundToText(result: Ok, shown: readonly AroundMember[], filtered: boolean, locale: Locale): string {
  const lines: string[] = [];
  lines.push(t(locale, `Places around ${centreName(result.centre, locale)}`, `Lieux autour de ${centreName(result.centre, locale)}`));
  lines.push("");
  lines.push(aroundSummary(result, shown.length, filtered, locale));
  lines.push(aroundCaveat(locale));
  lines.push("");
  if (shown.length === 0) {
    lines.push(t(locale, "No places to list.", "Aucun lieu à lister."));
  }
  shown.forEach((m, i) => {
    lines.push(`${i + 1}. ${memberName(m, locale)}`);
    lines.push(`   ${t(locale, "Distance and direction", "Distance et direction")}${colon(locale)}${distanceAndDirection(m.metres, m.direction, locale)}${m.direction === null ? "" : ` (${compassShort(m.direction, locale)})`}`);
    lines.push(`   ${t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}${colon(locale)}${tagWord(m.tag, locale)}`);
    if (m.category !== null) lines.push(`   ${t(locale, "Kind", "Genre")}${colon(locale)}${m.category.replace(/_/g, " ")}`);
    if (m.address !== null) lines.push(`   ${t(locale, "Address", "Adresse")}${colon(locale)}${m.address}`);
  });
  const beyond = beyondLine(result.beyond, result.radius, locale);
  const unmeasured = aroundUnmeasuredLine(result.unmeasured, locale);
  if (beyond !== "" || unmeasured !== "") lines.push("");
  if (beyond !== "") lines.push(beyond);
  if (unmeasured !== "") lines.push(unmeasured);
  lines.push("");
  lines.push(OSM_CREDIT);
  return lines.join("\n") + "\n";
}
