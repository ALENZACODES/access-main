/**
 * The outing as a text file, a CSV and a GeoJSON file, all made on this device from the stops as
 * they are. UNKNOWN stays the token UNKNOWN. Text and GeoJSON end with the OpenStreetMap credit.
 */
import { OSM_CREDIT } from "./dataCredits";
import { csvCell, type CsvOptions } from "./exportData";
import { formatPackDistance } from "./packGeo";
import { UNKNOWN_TOKEN } from "./packExport";
import { type Outing, type Stop } from "./outingPlan";
import { legText, legTimeText, paceNote, startLine, outingStraightLineNote, summaryLine, tagText } from "./outingCopy";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const OUTING_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "outing-plan.csv", fr: "plan-de-sortie.csv" };
export const OUTING_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "outing-plan.txt", fr: "plan-de-sortie.txt" };
export const OUTING_GEOJSON_FILENAMES: Readonly<Record<Locale, string>> = { en: "outing-stops.geojson", fr: "arrets-de-sortie.geojson" };

export const OUTING_CSV_HEADER = ["stop", "place_id", "place_name", "wheelchair_tag", "kind", "address", "latitude", "longitude", "leg_metres", "total_metres", "total_is_complete"] as const;

const orUnknown = (v: string | null): string => (v === null || v === "" ? UNKNOWN_TOKEN : v);
const metresToken = (m: number | null): string => (m === null ? UNKNOWN_TOKEN : String(Math.round(m)));

/** One CSV row for a stop. The tag is the pack's word (yes, limited, no, designated) or UNKNOWN. */
export function stopRow(s: Stop): string[] {
  return [
    String(s.position),
    s.id,
    orUnknown(s.name),
    s.tag === "unknown" ? UNKNOWN_TOKEN : s.tag,
    orUnknown(s.category),
    orUnknown(s.address),
    s.point ? String(s.point.lat) : UNKNOWN_TOKEN,
    s.point ? String(s.point.lon) : UNKNOWN_TOKEN,
    metresToken(s.legMetres),
    String(Math.round(s.totalMetres)),
    s.totalComplete ? "yes" : "no",
  ];
}

/** A plain number (such as a negative longitude) is data, not a formula, so it is written as it is. Everything else goes through the usual quoting and formula guard. */
const cell = (value: string): string => (/^-?\d+(\.\d+)?$/.test(value) ? value : csvCell(value));

export function outingToCsv(outing: Outing, opts: CsvOptions = {}): string {
  const rows = [[...OUTING_CSV_HEADER], ...outing.stops.map(stopRow)];
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** The outing as plain text, one numbered block per stop. */
export function outingToText(outing: Outing, locale: Locale, today: string, kmh: number | null = null): string {
  const title = t(locale, "Outing plan", "Plan de sortie");
  const out: string[] = [title, "=".repeat(title.length), t(locale, `Date: ${today}`, `Date\u00a0: ${today}`), summaryLine(outing, locale, kmh), startLine(outing.start !== null, locale), outingStraightLineNote(locale)];
  if (kmh !== null) out.push(paceNote(locale));
  out.push("");
  const field = (en: string, fr: string, value: string): string => `   ${t(locale, `${en}: ${value}`, `${fr}\u00a0: ${value}`)}`;
  for (const s of outing.stops) {
    const noLeg = s.position === 1 && outing.start === null;
    out.push(`${s.position}. ${s.name ?? "UNKNOWN"} — ${tagText(s.tag, locale)}`);
    out.push(field("Kind", "Type", orUnknown(s.category)));
    out.push(field("Address", "Adresse", orUnknown(s.address)));
    out.push(field("Straight line from the previous point", "Ligne droite depuis le point précédent", noLeg ? t(locale, "none (first stop, no starting point)", "aucune (premier arrêt, pas de point de départ)") : legText(s.legMetres, locale)));
    const time = legTimeText(s.legMetres, kmh);
    if (time !== "" && !noLeg) out.push(field("At least", "Au moins", time));
    out.push(field("Total so far", "Total jusqu’ici", `${formatPackDistance(s.totalMetres, locale)}${s.totalComplete ? "" : t(locale, " (not counting UNKNOWN distances)", " (sans les distances UNKNOWN)")}`));
    out.push(field("ID", "ID", s.id));
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}

type Position = [number, number];
interface Feature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: Position };
  properties: Record<string, string | number | null>;
}

/**
 * GeoJSON (RFC 7946) points, one for each stop with a map point, in outing order. Coordinates are
 * [longitude, latitude]. Stops with no point are listed by id in `unlocated`, since a feature
 * cannot have a made-up position. The tag is the pack's word or UNKNOWN; a missing name is UNKNOWN.
 */
export function outingToGeoJson(outing: Outing): string {
  const features: Feature[] = [];
  const unlocated: string[] = [];
  for (const s of outing.stops) {
    if (s.point === null) {
      unlocated.push(s.id);
      continue;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.point.lon, s.point.lat] },
      properties: {
        stop: s.position,
        id: s.id,
        name: orUnknown(s.name),
        wheelchair_tag: s.tag === "unknown" ? UNKNOWN_TOKEN : s.tag,
        kind: orUnknown(s.category),
        address: orUnknown(s.address),
        leg_metres: s.legMetres === null ? null : Math.round(s.legMetres),
      },
    });
  }
  const doc = { type: "FeatureCollection", features, unlocated, attribution: OSM_CREDIT };
  return JSON.stringify(doc, null, 2) + "\n";
}
