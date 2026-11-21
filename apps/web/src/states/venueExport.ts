/** The venue groups as plain text and as CSV (one row for each part of each venue). */
import { csvCell } from "./exportData";
import { tagValue } from "./placeSheet";
import { TAG_COLUMNS, type VenueData, type VenueGroup, groupHeading, kindTagRows, memberDistance, venueCaveat, venuePartLabel, venueSummary } from "./venueGroups";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const VENUE_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "venues-by-name.txt", fr: "lieux-par-nom.txt" };
export const VENUE_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "venues-by-name.csv", fr: "lieux-par-nom.csv" };

const UNKNOWN = "UNKNOWN";

export function venuesToText(d: VenueData, locale: Locale, only?: readonly VenueGroup[]): string {
  const groups = only ?? d.groups;
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const out = [t(locale, "Venues by name", "Lieux par nom"), "", ...venueSummary(d, locale), venueCaveat(locale), ""];
  const rows = kindTagRows(groups);
  if (rows.length > 0) {
    out.push(t(locale, "Parts by kind and wheelchair tag", "Parties par type et étiquette fauteuil roulant"));
    for (const r of rows) out.push(`- ${venuePartLabel(r.kind, locale)}${colon} ${TAG_COLUMNS.filter((c) => r.counts[c] > 0).map((c) => `${tagValue(c, locale)} ${r.counts[c]}`).join(", ")}`);
    out.push("");
  }
  for (const g of groups) {
    out.push(groupHeading(g, locale));
    for (const m of g.members) {
      const how = m.basis === "name" ? ` (${t(locale, "joined by name only", "joint par le nom seulement")})` : "";
      out.push(`- ${venuePartLabel(m.kind, locale)}${colon} ${m.name ?? UNKNOWN} — ${tagValue(m.tag, locale)} — ${memberDistance(m, locale)}${how}`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** One row for each part: venue, part, place, id, wheelchair tag, straight-line metres from the first part (a plain whole number), how it was joined. */
export function venuesToCsv(d: VenueData, locale: Locale): string {
  const header = [t(locale, "Venue", "Lieu"), t(locale, "Part", "Partie"), t(locale, "Place", "Nom"), t(locale, "Place id", "Identifiant du lieu"), t(locale, "Wheelchair tag", "Étiquette fauteuil roulant"), t(locale, "Metres from the first part", "Mètres depuis la première partie"), t(locale, "Joined by", "Regroupé par")].map(csvCell).join(",");
  const rows: string[] = [];
  for (const g of d.groups) {
    for (const m of g.members) {
      const metres = m.first ? "0" : m.metres === null ? UNKNOWN : String(Math.round(m.metres));
      rows.push([csvCell(g.label), csvCell(venuePartLabel(m.kind, locale)), csvCell(m.name ?? UNKNOWN), csvCell(m.id), csvCell(tagValue(m.tag, locale)), metres, csvCell(m.basis === "name" ? t(locale, "name only", "nom seulement") : t(locale, "name and map point", "nom et point de carte"))].join(","));
    }
  }
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
