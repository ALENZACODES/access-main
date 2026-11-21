/**
 * Plain-text and CSV exports of the places in an offline pack.
 *
 * Every row and every text block carries the record's source, open licence, retrieval date and
 * tier. Whatever the pack does not state is written as UNKNOWN, never left blank and never
 * filled in. A record the parser cannot use is left out and counted, not repaired. CSV column
 * names and status tokens are the same in both languages so a file reads the same anywhere.
 */
import { canonicalTierFromForeign } from "@access/shared";
import { type CsvOptions, csvCell } from "./exportData";
import { type PackPlaceRecord, parsePackPlace } from "./packPlaces";
import { OPEN_LICENCES, attributionLine, ageLabel, formatDate, isStale } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const UNKNOWN_TOKEN = "UNKNOWN";

export const PACK_CSV_HEADER = [
  "place_id",
  "place_name",
  "kind",
  "address",
  "latitude",
  "longitude",
  "wheelchair_tag",
  "tag_status",
  "tag_unknown_reason",
  "source",
  "licence",
  "retrieved_on",
  "tier",
  "source_url",
] as const;

export const PACK_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "pack-places.csv", fr: "lieux-du-pack.csv" };

/** A pack record read together with the tier its provenance states. */
export interface ExportRecord {
  readonly place: PackPlaceRecord;
  /** "0" to "4" or "E"; null when the pack states none that is recognised. */
  readonly tier: string | null;
}

export interface ParsedExport {
  readonly records: readonly ExportRecord[];
  /** Records left out because they could not be read safely, or repeated an id. */
  readonly dropped: number;
}

function statedTier(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const prov = (raw as Record<string, unknown>).provenance;
  if (typeof prov !== "object" || prov === null) return null;
  const tier = canonicalTierFromForeign((prov as Record<string, unknown>).tier);
  return tier === null ? null : String(tier);
}

/** Read the raw `places` array of a pack. Anything that is not an array yields no records. */
export function readExportRecords(rawPlaces: unknown): ParsedExport {
  if (!Array.isArray(rawPlaces)) return { records: [], dropped: 0 };
  const seen = new Set<string>();
  const records: ExportRecord[] = [];
  let dropped = 0;
  for (const raw of rawPlaces as unknown[]) {
    const place = parsePackPlace(raw);
    if (!place || seen.has(place.id)) {
      dropped += 1;
      continue;
    }
    seen.add(place.id);
    records.push({ place, tier: statedTier(raw) });
  }
  return { records, dropped };
}

const orUnknown = (value: string | null | undefined): string => (value === null || value === undefined || value === "" ? UNKNOWN_TOKEN : value);

/** One CSV row for one record. */
export function packRow(r: ExportRecord): string[] {
  const { place: p } = r;
  const prov = p.provenance;
  return [
    p.id,
    orUnknown(p.name),
    orUnknown(p.category),
    orUnknown(p.address),
    p.location ? String(p.location.lat) : UNKNOWN_TOKEN,
    p.location ? String(p.location.lon) : UNKNOWN_TOKEN,
    p.tag === "unknown" ? UNKNOWN_TOKEN : p.tag,
    p.tag === "unknown" ? "unknown" : "reported",
    p.tagUnknownReason ?? "",
    orUnknown(prov?.source),
    prov?.licence ?? UNKNOWN_TOKEN,
    orUnknown(prov?.retrievedOn),
    orUnknown(r.tier),
    prov?.url ?? "",
  ];
}

/** CSV for the given records, RFC 4180 quoting with spreadsheet formulas neutralised. */
export function packPlacesToCsv(records: readonly ExportRecord[], opts: CsvOptions = {}): string {
  const rows = [[...PACK_CSV_HEADER] as string[], ...records.map(packRow)];
  return (opts.bom ? "﻿" : "") + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const TAG_WORD: Readonly<Record<PackPlaceRecord["tag"], { en: string; fr: string }>> = {
  yes: { en: "yes", fr: "oui" },
  limited: { en: "limited", fr: "limité" },
  no: { en: "no", fr: "non" },
  designated: { en: "designated", fr: "réservé" },
  unknown: { en: UNKNOWN_TOKEN, fr: UNKNOWN_TOKEN },
};

/** Plain text for one place, for sharing or printing. States the report and its source, nothing more. */
export function packPlaceToText(r: ExportRecord, locale: Locale, today: string): string {
  const { place: p } = r;
  const name = p.name ?? t(locale, `Name ${UNKNOWN_TOKEN}`, `Nom ${UNKNOWN_TOKEN}`);
  const lines = [
    name,
    "=".repeat(Math.min(name.length, 60)),
    t(locale, `Wheelchair tag as reported: ${TAG_WORD[p.tag][locale]}`, `Indication pour fauteuil roulant telle que signalée\u00a0: ${TAG_WORD[p.tag][locale]}`),
    t(locale, `Kind as tagged: ${orUnknown(p.category)}`, `Type indiqué\u00a0: ${orUnknown(p.category)}`),
    t(locale, `Address: ${orUnknown(p.address)}`, `Adresse\u00a0: ${orUnknown(p.address)}`),
    p.location
      ? t(locale, `Position: ${p.location.lat.toFixed(4)}, ${p.location.lon.toFixed(4)}`, `Position\u00a0: ${p.location.lat.toFixed(4)}, ${p.location.lon.toFixed(4)}`)
     : t(locale, `Position: ${UNKNOWN_TOKEN}`, `Position\u00a0: ${UNKNOWN_TOKEN}`),
    t(locale, `Tier: ${orUnknown(r.tier)}`, `Niveau\u00a0: ${orUnknown(r.tier)}`),
  ];
  if (p.note) lines.push(t(locale, `Note from contributors: ${p.note}`, `Note des contributeurs\u00a0: ${p.note}`));
  if (p.provenance) {
    lines.push("", attributionLine(p.provenance, locale), ageLabel(p.provenance.retrievedOn, today, locale));
    if (isStale(p.provenance.retrievedOn, today)) lines.push(t(locale, "This may be out of date.", "Ces renseignements peuvent être périmés."));
    if (p.provenance.url) lines.push(p.provenance.url);
  } else {
    lines.push("", t(locale, "No usable source is recorded for this place, so the tag above is not shown as known.", "Aucune source utilisable n’est consignée pour ce lieu\u00a0: l’indication ci-dessus n’est pas présentée comme connue."));
  }
  if (p.provenance?.licence === "ODbL-1.0" || /openstreetmap/i.test(p.provenance?.source ?? "")) lines.push("", "© OpenStreetMap contributors");
  return lines.join("\n") + "\n";
}

/** A short header line for a file of many places: when it was made and how many records it holds. */
export function packExportSummary(count: number, dropped: number, locale: Locale, today: string): string {
  const base = t(locale, `${count} place${count === 1 ? "" : "s"}, exported ${formatDate(today, locale)}.`, `${count} lieu${count === 1 ? "" : "x"}, exporté le ${formatDate(today, locale)}.`);
  if (dropped === 0) return base;
  return `${base} ${t(locale, `${dropped} left out because they could not be read safely.`, `${dropped} omis, car illisibles en toute sécurité.`)}`;
}

/** The licence names that can appear in an export, for a legend. Only open licences are listed. */
export function licenceLegend(records: readonly ExportRecord[]): string[] {
  const ids = [...new Set(records.map((r) => r.place.provenance?.licence).filter((x): x is keyof typeof OPEN_LICENCES => x !== undefined))].sort();
  return ids.map((id) => `${id}: ${OPEN_LICENCES[id]}`);
}
