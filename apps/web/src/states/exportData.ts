/**
 * Plain-text and CSV exports. Both carry status, source, licence and retrieval date for
 * every reported detail and write UNKNOWN for everything else. The CSV neutralises
 * spreadsheet formulas and follows RFC 4180 quoting.
 */
import { type Locale } from "./stateCopy";
import { FEATURE_IDS, evaluateFeature } from "./dataStatus";
import { message } from "./messages";
import type { PlaceRecord } from "./placeRecord";
import { resolveLocation } from "./placeRecord";
import { summarizePlace } from "./placeSummary";
import { attributionLine } from "./provenance";
import { t } from "./typography";

/** Plain-text summary of one place, suitable for sharing or printing. */
export function placeToText(place: PlaceRecord, locale: Locale, today: string): string {
  const s = summarizePlace(place, locale, today);
  const loc = resolveLocation(place.location);
  const where = loc.status === "known"
    ? message("map.coordinates", locale, { lat: loc.point.lat.toFixed(4), lon: loc.point.lon.toFixed(4) })
    : message("map.locationUnknown", locale);
  const lines: string[] = [place.name, "=".repeat(Math.min(place.name.length, 60)), s.countsText, where, ""];
  for (const r of s.rows) lines.push(t(locale, `${r.label}: ${r.statusText}`, `${r.label} : ${r.statusText}`));
  const sources = new Set(s.sources);
  if (loc.status === "known") sources.add(attributionLine(loc.provenance, locale));
  if (sources.size > 0) lines.push("", ...sources);
  if (s.staleNotice) lines.push("", s.staleNotice);
  lines.push("", message("footer.note", locale), "");
  return lines.join("\n");
}

export const CSV_HEADER = ["place_id", "place_name", "feature", "status", "source", "licence", "retrieved_on", "source_url"] as const;

/** Quote per RFC 4180, and prefix cells that a spreadsheet could read as a formula. */
export function csvCell(value: string): string {
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvOptions {
  /** Prepend a byte order mark so spreadsheet software reads UTF-8 correctly. */
  readonly bom?: boolean;
}

/** One row per place and feature. Status values are fixed English tokens: yes, no, partial, unknown. */
export function placesToCsv(places: readonly PlaceRecord[], opts: CsvOptions = {}): string {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const p of places) {
    const byFeature = new Map(p.features.map((f) => [f.feature, f] as const));
    for (const feature of FEATURE_IDS) {
      const e = evaluateFeature(byFeature.get(feature) ?? { feature });
      const prov = e.provenance;
      rows.push([p.id, p.name, feature, e.status, prov?.source ?? "", prov?.licence ?? "", prov?.retrievedOn ?? "", prov?.url ?? ""]);
    }
  }
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "saved-places.csv", fr: "lieux-enregistres.csv" };
