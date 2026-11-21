/**
 * Words and files for a pack comparison: a summary line, a plain-text report and a CSV. The CSV uses
 * fixed English column names and tokens in both languages. Values are as the files state them; a
 * missing value is the token UNKNOWN. The report says what differs and never whether it is better.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import { CHANGE_FIELDS, type ChangeField, type PackDiff, isUnchanged } from "./packDiff";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const DIFF_CSV_HEADER = ["change", "place_id", "place_name", "field", "before", "after"] as const;
export const DIFF_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-changes.csv", fr: "changements-du-pack.csv" };
export const DIFF_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-changes.txt", fr: "changements-du-pack.txt" };

const UNKNOWN = "UNKNOWN";

function count(n: number, locale: Locale, en: [string, string], fr: [string, string]): string {
  const one = locale === "fr" ? n === 0 || n === 1 : n === 1;
  return (one ? (locale === "fr" ? fr : en)[0] : (locale === "fr" ? fr : en)[1]).replace("{n}", String(n));
}

export function placesWord(n: number, locale: Locale): string {
  return count(n, locale, ["{n} place", "{n} places"], ["{n} lieu", "{n} lieux"]);
}

export function fieldLabel(field: ChangeField, locale: Locale): string {
  switch (field) {
    case "tag":
      return t(locale, "Wheelchair tag", "Indication pour fauteuil roulant");
    case "name":
      return t(locale, "Name", "Nom");
    case "kind":
      return t(locale, "Kind", "Type");
    case "address":
      return t(locale, "Address", "Adresse");
    case "position":
      return t(locale, "Position", "Position");
    case "source":
      return t(locale, "Source", "Source");
    case "retrieved":
      return t(locale, "Retrieved on", "Récupéré le");
    case "tier":
      return t(locale, "Tier", "Niveau");
  }
}

/** One sentence that says how the two lists differ. */
export function diffSummaryLine(diff: PackDiff, locale: Locale): string {
  if (isUnchanged(diff)) {
    return t(
      locale,
      `No difference found: ${placesWord(diff.unchanged, locale)} in both.`,
      `Aucune différence trouvée\u00a0: ${placesWord(diff.unchanged, locale)} dans les deux.`,
    );
  }
  const parts = [
    t(locale, `${diff.added.length} added`, `${diff.added.length} ajouté${diff.added.length > 1 ? "s" : ""}`),
    t(locale, `${diff.removed.length} no longer listed`, `${diff.removed.length} qui ne ${diff.removed.length > 1 ? "figurent" : "figure"} plus`),
    t(locale, `${diff.changed.length} changed`, `${diff.changed.length} modifié${diff.changed.length > 1 ? "s" : ""}`),
    t(locale, `${diff.unchanged} unchanged`, `${diff.unchanged} inchangé${diff.unchanged > 1 ? "s" : ""}`),
  ];
  return `${parts.join(locale === "fr" ? "\u202f; " : "; ")}.`;
}

/** "Wheelchair tag: 2, Address: 1": how many places changed in each field, fields with none left out. */
export function fieldCountsLine(diff: PackDiff, locale: Locale): string | null {
  const parts = CHANGE_FIELDS.filter((f) => diff.byField[f] > 0).map((f) => `${fieldLabel(f, locale)}${locale === "fr" ? "\u00a0:" : ":"} ${diff.byField[f]}`);
  return parts.length === 0 ? null : parts.join(", ");
}

/** One CSV row per added place, removed place or changed field. */
export function diffToCsv(diff: PackDiff, opts: CsvOptions = {}): string {
  const rows: string[][] = [[...DIFF_CSV_HEADER]];
  for (const p of diff.added) rows.push(["added", p.id, p.name ?? UNKNOWN, "", "", ""]);
  for (const p of diff.removed) rows.push(["no_longer_listed", p.id, p.name ?? UNKNOWN, "", "", ""]);
  for (const c of diff.changed) for (const f of c.changes) rows.push(["changed", c.id, c.name ?? UNKNOWN, f.field, f.before, f.after]);
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A report of every difference, with the credit line the pack requires. */
export function diffToText(diff: PackDiff, locale: Locale, today: string): string {
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const out: string[] = [
    t(locale, "Changes in the saved places", "Changements dans les lieux enregistrés"),
    t(locale, `Date: ${today}`, `Date\u00a0: ${today}`),
    diffSummaryLine(diff, locale),
    t(locale, `Earlier file: ${placesWord(diff.earlierCount, locale)}. Pack now: ${placesWord(diff.currentCount, locale)}.`, `Fichier précédent\u00a0: ${placesWord(diff.earlierCount, locale)}. Pack actuel\u00a0: ${placesWord(diff.currentCount, locale)}.`),
  ];
  const counts = fieldCountsLine(diff, locale);
  if (counts) out.push(counts);
  const name = (n: string | null) => n ?? UNKNOWN;
  if (diff.added.length > 0) {
    out.push("", t(locale, "Added", "Ajoutés"));
    for (const p of diff.added) out.push(`- ${name(p.name)} (${p.id})`);
  }
  if (diff.removed.length > 0) {
    out.push("", t(locale, "No longer listed (this does not say the place is gone)", "Ne figurent plus (cela ne dit pas que le lieu a disparu)"));
    for (const p of diff.removed) out.push(`- ${name(p.name)} (${p.id})`);
  }
  if (diff.changed.length > 0) {
    out.push("", t(locale, "Changed", "Modifiés"));
    for (const c of diff.changed) {
      out.push(`- ${name(c.name)} (${c.id})`);
      for (const f of c.changes) out.push(`    ${fieldLabel(f.field, locale)}${colon} ${f.before} → ${f.after}`);
    }
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}
