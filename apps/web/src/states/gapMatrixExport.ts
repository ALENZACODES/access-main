/** The gaps grid as CSV, for a spreadsheet. Header and cells are written with the same quoting as the other exports. */
import { csvCell } from "./exportData";
import { cellWord, type GapMatrix } from "./gapMatrix";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const GAP_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "place-gaps.csv", fr: "lacunes-des-lieux.csv" };

/** Rows in the list's order. Values are the word Given, or UNKNOWN; the pack's own values are in the place sheet. */
export function gapMatrixToCsv(matrix: GapMatrix, locale: Locale): string {
  const header = [t(locale, "Place", "Lieu"), t(locale, "Id", "Identifiant"), ...matrix.columns.map((c) => c.label), t(locale, "Details given", "Détails donnés")].map(csvCell).join(",");
  const body = matrix.rows.map((r) => [r.title, r.id, ...r.cells.map((c) => cellWord(c, locale)), String(r.recorded)].map(csvCell).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}
