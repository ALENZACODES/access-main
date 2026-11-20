/** The place sheet as plain text, for a message, a note or a printout. Same rows, same UNKNOWN, same reasons. */
import { sheetSummary, type PlaceSheet } from "./placeSheet";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "place-details.txt", fr: "details-du-lieu.txt" };

/** Title, the count sentence, then one line per detail: `Label: value`, with the reason after an UNKNOWN. Lines end with LF. */
export function placeSheetToText(sheet: PlaceSheet, locale: Locale): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const lines = [sheet.title, sheetSummary(sheet, locale)];
  if (sheet.staleNotice) lines.push(sheet.staleNotice);
  lines.push("");
  for (const row of sheet.rows) lines.push(row.reason ? `${row.label}${colon} ${row.value}. ${row.reason}` : `${row.label}${colon} ${row.value}`);
  lines.push("", t(locale, "This is what the pack reports and not a check of the place.", "Ceci est ce que le pack indique, pas un contrôle du lieu."));
  return `${lines.join("\n")}\n`;
}
