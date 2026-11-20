/** The street index as plain text and as CSV (one row for each place on a street). */
import { csvCell } from "./exportData";
import { tagValue } from "./placeSheet";
import { type StreetGroup, type StreetIndexData, streetGroupLine, streetCaveat, streetSummary } from "./streetIndex";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const STREET_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-by-street.txt", fr: "lieux-par-rue.txt" };
export const STREET_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-by-street.csv", fr: "lieux-par-rue.csv" };

const UNKNOWN = "UNKNOWN";

function entryLine(g: StreetGroup, i: number, locale: Locale): string {
  const e = g.entries[i]!;
  const num = e.number === null ? UNKNOWN : e.number;
  const parity = e.parity === null ? "" : ` (${e.parity === "odd" ? t(locale, "odd", "impair") : t(locale, "even", "pair")})`;
  const unit = e.unit === null ? "" : `, ${e.unit}`;
  return `- ${num}${parity}${unit}: ${e.name ?? UNKNOWN} — ${tagValue(e.tag, locale)}`.replace(": ", locale === "fr" ? "\u00a0: " : ": ");
}

/** One street at a time, or all of them. `only` limits the text to the streets it names. */
export function streetIndexToText(d: StreetIndexData, locale: Locale, only?: readonly string[]): string {
  const groups = only === undefined ? d.groups : d.groups.filter((g) => only.includes(g.key));
  const out = [t(locale, "Places by street", "Lieux par rue"), "", ...streetSummary(d, locale), streetCaveat(locale), ""];
  for (const g of groups) {
    out.push(streetGroupLine(g, locale));
    g.entries.forEach((_, i) => out.push(entryLine(g, i, locale)));
    if (g.sameAddressIds.length > 0) {
      out.push(t(locale, `Same number and street for ${g.sameAddressIds.length} places here.`, `Même numéro et même rue pour ${g.sameAddressIds.length} lieux ici.`));
    }
    out.push("");
  }
  if (only === undefined) {
    const apart = (label: string, ids: readonly string[]) => (ids.length === 0 ? [] : [`${label}${locale === "fr" ? "\u00a0:" : ":"} ${ids.join(", ")}`]);
    out.push(
      ...apart(t(locale, "No address (UNKNOWN)", "Aucune adresse (UNKNOWN)"), d.noAddressIds),
      ...apart(t(locale, "Post office box", "Case postale"), d.poBoxIds),
      ...apart(t(locale, "Corner of two streets", "Coin de deux rues"), d.intersectionIds),
    );
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** One row for each place on a street: street, number, odd or even, unit, place, id, wheelchair tag, and the address as the pack gives it. */
export function streetIndexToCsv(d: StreetIndexData, locale: Locale): string {
  const header = [t(locale, "Street", "Rue"), t(locale, "Number", "Numéro"), t(locale, "Odd or even", "Pair ou impair"), t(locale, "Unit", "Unité"), t(locale, "Place", "Lieu"), t(locale, "Place id", "Identifiant du lieu"), t(locale, "Wheelchair tag", "Étiquette fauteuil roulant"), t(locale, "Address as given", "Adresse telle que donnée")].map(csvCell).join(",");
  const rows: string[] = [];
  for (const g of d.groups) {
    for (const e of g.entries) {
      const parity = e.parity === null ? UNKNOWN : e.parity === "odd" ? t(locale, "odd", "impair") : t(locale, "even", "pair");
      rows.push([csvCell(g.name), csvCell(e.number ?? UNKNOWN), csvCell(parity), csvCell(e.unit ?? UNKNOWN), csvCell(e.name ?? UNKNOWN), csvCell(e.id), csvCell(tagValue(e.tag, locale)), csvCell(e.address === "" ? UNKNOWN : e.address)].join(","));
    }
  }
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
