/**
 * Data credits: which sources the saved records on this device came from, under which open
 * licence, from when, and at which tier. Built from the records alone, offline.
 *
 * Records are grouped by source and licence. A record with no valid provenance is not credited
 * to anyone: it is counted as having no source, never folded into a named group. A tier that is
 * missing or not recognised stays UNKNOWN. Nothing here claims data is current or checked: it
 * reports what the records say.
 */
import { canonicalTierFromForeign } from "@access/shared";
import { OPEN_LICENCES, type OpenLicenceId, type Provenance, STALE_AFTER_DAYS, daysBetween, formatDate, isStale } from "./provenance";
import { pluralCategory } from "./messages";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type CreditTier = 0 | 1 | 2 | 3 | 4 | "E";

/** The least a record must offer to be credited. Extra fields on a record are ignored. */
export interface CreditRecord {
  readonly provenance: Provenance | null;
  /** The tier as the pack states it; anything unrecognised counts as UNKNOWN. */
  readonly tier: unknown;
}

export interface CreditGroup {
  readonly key: string;
  readonly source: string;
  readonly licence: OpenLicenceId;
  readonly licenceName: string;
  readonly licenceUrl: string;
  readonly records: number;
  readonly earliest: string;
  readonly latest: string;
  readonly staleRecords: number;
  /** Count of records per stated tier, in tier order. Only tiers that occur are listed. */
  readonly tiers: readonly { readonly tier: CreditTier; readonly records: number }[];
  readonly tierUnknownRecords: number;
  /** Distinct https source pages, in first-seen order, capped. */
  readonly urls: readonly string[];
}

export interface Credits {
  readonly groups: readonly CreditGroup[];
  readonly recordCount: number;
  readonly withoutSource: number;
  /** True when any group is OpenStreetMap data or under the ODbL: the credit line is then required. */
  readonly needsOsmCredit: boolean;
}

/** Licence pages. All are open-data licences; none is a custom or paid licence. */
export const LICENCE_URLS: Readonly<Record<OpenLicenceId, string>> = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "ODbL-1.0": "https://opendatacommons.org/licenses/odbl/1-0/",
  "OGL-Canada-2.0": "https://open.canada.ca/en/open-government-licence-canada",
  "OGL-Ontario-1.0": "https://www.ontario.ca/page/open-government-licence-ontario",
};

/** The credit OpenStreetMap asks for. It must read exactly this, in both languages. */
export const OSM_CREDIT = "© OpenStreetMap contributors";

export const MAX_URLS_PER_GROUP = 3;
const TIER_ORDER: readonly CreditTier[] = [0, 1, 2, 3, 4, "E"];

export function creditTier(value: unknown): CreditTier | null {
  const tier = canonicalTierFromForeign(value);
  return tier === null ? null : (tier as CreditTier);
}

function isOsm(source: string, licence: OpenLicenceId): boolean {
  return licence === "ODbL-1.0" || /openstreetmap/i.test(source);
}

interface Acc {
  source: string;
  licence: OpenLicenceId;
  records: number;
  earliest: string;
  latest: string;
  stale: number;
  tiers: Map<CreditTier, number>;
  unknown: number;
  urls: string[];
}

/** Group records by source and licence. `today` is an ISO date supplied by the caller. */
export function buildCredits(records: readonly CreditRecord[], today: string): Credits {
  const groups = new Map<string, Acc>();
  let withoutSource = 0;
  for (const r of records) {
    const p = r.provenance;
    if (!p) {
      withoutSource += 1;
      continue;
    }
    const key = `${p.source.toLowerCase()}\u0000${p.licence}`;
    let g = groups.get(key);
    if (!g) {
      g = { source: p.source, licence: p.licence, records: 0, earliest: p.retrievedOn, latest: p.retrievedOn, stale: 0, tiers: new Map(), unknown: 0, urls: [] };
      groups.set(key, g);
    }
    g.records += 1;
    if (p.retrievedOn < g.earliest) g.earliest = p.retrievedOn;
    if (p.retrievedOn > g.latest) g.latest = p.retrievedOn;
    if (isStale(p.retrievedOn, today)) g.stale += 1;
    const tier = creditTier(r.tier);
    if (tier === null) g.unknown += 1;
    else g.tiers.set(tier, (g.tiers.get(tier) ?? 0) + 1);
    if (p.url && !g.urls.includes(p.url) && g.urls.length < MAX_URLS_PER_GROUP) g.urls.push(p.url);
  }
  const list: CreditGroup[] = [...groups.entries()].map(([key, g]) => ({
    key,
    source: g.source,
    licence: g.licence,
    licenceName: OPEN_LICENCES[g.licence],
    licenceUrl: LICENCE_URLS[g.licence],
    records: g.records,
    earliest: g.earliest,
    latest: g.latest,
    staleRecords: g.stale,
    tiers: TIER_ORDER.filter((tier) => g.tiers.has(tier)).map((tier) => ({ tier, records: g.tiers.get(tier) ?? 0 })),
    tierUnknownRecords: g.unknown,
    urls: g.urls,
  }));
  // Most records first; the name and licence break ties so the order never changes between renders.
  list.sort((a, b) => b.records - a.records || a.source.localeCompare(b.source) || a.licence.localeCompare(b.licence));
  return {
    groups: list,
    recordCount: records.length,
    withoutSource,
    needsOsmCredit: list.some((g) => isOsm(g.source, g.licence)),
  };
}

function records(n: number, locale: Locale): string {
  const one = pluralCategory(locale, n) === "one";
  return t(locale, one ? `${n} record` : `${n} records`, one ? `${n} enregistrement` : `${n} enregistrements`);
}

export function tierCountsText(g: Pick<CreditGroup, "tiers" | "tierUnknownRecords">, locale: Locale): string {
  const parts = g.tiers.map((x) => t(locale, `Tier ${x.tier}: ${x.records}`, `Niveau ${x.tier} : ${x.records}`));
  if (g.tierUnknownRecords > 0) parts.push(t(locale, `Tier UNKNOWN: ${g.tierUnknownRecords}`, `Niveau UNKNOWN : ${g.tierUnknownRecords}`));
  return parts.join("; ");
}

export function dateRangeText(g: Pick<CreditGroup, "earliest" | "latest">, locale: Locale): string {
  return g.earliest === g.latest
    ? t(locale, `Retrieved ${formatDate(g.earliest, locale)}`, `Consulté le ${formatDate(g.earliest, locale)}`)
    : t(locale, `Retrieved ${formatDate(g.earliest, locale)} to ${formatDate(g.latest, locale)}`, `Consulté du ${formatDate(g.earliest, locale)} au ${formatDate(g.latest, locale)}`);
}

/** One group as one paragraph of plain text. */
export function groupText(g: CreditGroup, locale: Locale, today: string): string {
  const lines = [
    t(locale, `${g.source}. Licence: ${g.licenceName} (${g.licenceUrl}).`, `${g.source}. Licence : ${g.licenceName} (${g.licenceUrl}).`),
    `${records(g.records, locale)}. ${dateRangeText(g, locale)}.`,
    `${tierCountsText(g, locale)}.`,
  ];
  if (g.staleRecords > 0) {
    lines.push(
      t(
        locale,
        `${g.staleRecords} of these were retrieved more than ${STALE_AFTER_DAYS} days before ${formatDate(today, locale)} and may be out of date.`,
        `${g.staleRecords} de ces enregistrements ont été consultés plus de ${STALE_AFTER_DAYS} jours avant le ${formatDate(today, locale)} et peuvent être périmés.`,
      ),
    );
  }
  for (const url of g.urls) lines.push(url);
  return lines.join("\n");
}

/** The whole credits page as plain text, for a file or a screen reader view. */
export function creditsToText(c: Credits, locale: Locale, today: string): string {
  if (c.recordCount === 0) return t(locale, "No saved records on this device, so there is nothing to credit yet.", "Aucun enregistrement sur cet appareil : il n’y a encore rien à créditer.");
  const out: string[] = [t(locale, "Sources of the records saved on this device", "Sources des enregistrements sur cet appareil")];
  if (c.needsOsmCredit) out.push(OSM_CREDIT);
  for (const g of c.groups) out.push("", groupText(g, locale, today));
  if (c.withoutSource > 0) {
    out.push(
      "",
      t(
        locale,
        `${records(c.withoutSource, locale)} carry no usable source, so no detail from them is shown as known.`,
        `${records(c.withoutSource, locale)} sans source utilisable : aucun détail qui en provient n’est présenté comme connu.`,
      ),
    );
  }
  return out.join("\n");
}

export const CREDITS_CSV_HEADER = ["source", "licence", "licence_url", "records", "earliest_retrieved_on", "latest_retrieved_on", "tiers", "tier_unknown_records", "stale_records"] as const;

function cell(value: string): string {
  // A leading formula character is neutralised so a spreadsheet never runs source text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Credits as CSV. Column names are the same in both languages; tiers are "0:3;1:1". */
export function creditsToCsv(c: Credits): string {
  const rows: string[][] = [[...CREDITS_CSV_HEADER]];
  for (const g of c.groups) {
    rows.push([
      g.source,
      g.licence,
      g.licenceUrl,
      String(g.records),
      g.earliest,
      g.latest,
      g.tiers.map((x) => `${x.tier}:${x.records}`).join(";"),
      String(g.tierUnknownRecords),
      String(g.staleRecords),
    ]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Whole days from the oldest record in any group to today, or null with no sourced records. */
export function oldestAgeDays(c: Credits, today: string): number | null {
  const dates = c.groups.map((g) => g.earliest).sort();
  return dates.length === 0 ? null : daysBetween(dates[0]!, today);
}
