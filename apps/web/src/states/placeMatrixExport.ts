/** The distance table as plain text and as CSV (one row for each pair, in the order of the list). */
import { csvCell } from "./exportData";
import { formatPackDistance } from "./packGeo";
import { type DistanceMatrix, cellText, matrixCaveat, matrixSummary } from "./placeMatrix";
import type { Locale } from "./stateCopy";
import { compassName } from "./textMap";
import { t } from "./typography";

export const MATRIX_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "distances-between-places.txt", fr: "distances-entre-les-lieux.txt" };
export const MATRIX_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "distances-between-places.csv", fr: "distances-entre-les-lieux.csv" };

const UNKNOWN = "UNKNOWN";
const nameOf = (n: string | null): string => n ?? UNKNOWN;

export function matrixToText(m: DistanceMatrix, locale: Locale): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const out = [t(locale, "Distances between the listed places", "Distances entre les lieux de la liste"), "", ...matrixSummary(m, locale), matrixCaveat(locale), ""];
  m.places.forEach((p, i) => {
    out.push(`${nameOf(p.name)}${colon}`);
    m.places.forEach((q, j) => {
      if (i !== j) out.push(`- ${t(locale, "to", "vers")} ${nameOf(q.name)}${colon} ${cellText(m.cells[i]![j]!, locale)}`);
    });
  });
  return `${out.join("\n")}\n`;
}

/** One row for each ordered pair of different places: from, to, direction, metres (a plain whole number) and the distance as written. */
export function matrixToCsv(m: DistanceMatrix, locale: Locale): string {
  const header = [t(locale, "From", "De"), t(locale, "From id", "Identifiant de départ"), t(locale, "To", "Vers"), t(locale, "To id", "Identifiant d’arrivée"), t(locale, "Direction", "Direction"), t(locale, "Metres", "Mètres"), t(locale, "Distance", "Distance")].map(csvCell).join(",");
  const rows: string[] = [];
  m.places.forEach((p, i) => {
    m.places.forEach((q, j) => {
      if (i === j) return;
      const c = m.cells[i]![j]!;
      const head = [csvCell(nameOf(p.name)), csvCell(p.id), csvCell(nameOf(q.name)), csvCell(q.id)];
      if (c.metres === null) rows.push([...head, csvCell(UNKNOWN), csvCell(UNKNOWN), csvCell(UNKNOWN)].join(","));
      else rows.push([...head, csvCell(c.compass === null ? t(locale, "same spot", "même endroit") : compassName(c.compass, locale)), String(Math.round(c.metres)), csvCell(formatPackDistance(c.metres, locale))].join(","));
    });
  });
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
