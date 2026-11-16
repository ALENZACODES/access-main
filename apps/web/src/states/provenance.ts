/**
 * Provenance for any accessibility detail: where it came from, under which open
 * licence, and when it was retrieved. A detail without valid provenance is not shown
 * as known (see dataStatus.ts).
 */
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const OPEN_LICENCES = {
  "CC0-1.0": "CC0 1.0",
  "CC-BY-4.0": "CC BY 4.0",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "ODbL-1.0": "ODbL 1.0",
  "OGL-Canada-2.0": "Open Government Licence – Canada 2.0",
  "OGL-Ontario-1.0": "Open Government Licence – Ontario 1.0",
} as const;

export type OpenLicenceId = keyof typeof OPEN_LICENCES;

export interface Provenance {
  readonly source: string;
  readonly licence: OpenLicenceId;
  /** ISO calendar date, YYYY-MM-DD. */
  readonly retrievedOn: string;
  readonly url?: string;
}

export type ProvenanceProblem =
  | "not-an-object"
  | "missing-source"
  | "licence-not-open"
  | "bad-date"
  | "bad-url";

export type ProvenanceResult =
  | { readonly ok: true; readonly value: Provenance }
  | { readonly ok: false; readonly reason: ProvenanceProblem };

export function isOpenLicence(id: unknown): id is OpenLicenceId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(OPEN_LICENCES, id);
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateProvenance(input: unknown): ProvenanceResult {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "not-an-object" };
  const p = input as Record<string, unknown>;
  if (typeof p.source !== "string" || p.source.trim() === "") return { ok: false, reason: "missing-source" };
  if (!isOpenLicence(p.licence)) return { ok: false, reason: "licence-not-open" };
  if (!isIsoDate(p.retrievedOn)) return { ok: false, reason: "bad-date" };
  if (p.url !== undefined && !(typeof p.url === "string" && /^https:\/\/[^\s]+$/.test(p.url))) {
    return { ok: false, reason: "bad-url" };
  }
  const value: Provenance = {
    source: p.source.trim(),
    licence: p.licence,
    retrievedOn: p.retrievedOn,
    ...(typeof p.url === "string" ? { url: p.url } : {}),
  };
  return { ok: true, value };
}

const MONTHS: Record<Locale, readonly string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
};

/** "15 November 2026" / "15 novembre 2026" (FR: "1er" for the first of the month). */
export function formatDate(iso: string, locale: Locale): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const day = locale === "fr" && d === 1 ? "1er" : String(d);
  return `${day} ${MONTHS[locale][m - 1]!} ${y}`;
}

/** Whole days from one ISO date to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function attributionLine(p: Provenance, locale: Locale): string {
  const licence = OPEN_LICENCES[p.licence];
  const date = formatDate(p.retrievedOn, locale);
  return t(
    locale,
    `Source: ${p.source}. Licence: ${licence}. Retrieved ${date}.`,
    `Source : ${p.source}. Licence : ${licence}. Consulté le ${date}.`,
  );
}

/** Age text such as "3 days ago". Never claims the data is current. */
export function ageLabel(retrievedOn: string, today: string, locale: Locale): string {
  const n = daysBetween(retrievedOn, today);
  if (n < 0) return t(locale, "Date in the future", "Date située dans le futur");
  if (n === 0) return t(locale, "Retrieved today", "Consulté aujourd'hui");
  const en = n === 1 ? "Retrieved 1 day ago" : `Retrieved ${n} days ago`;
  const fr = n === 1 ? "Consulté il y a 1 jour" : `Consulté il y a ${n} jours`;
  return t(locale, en, fr);
}

/** Details older than this are flagged as possibly out of date. */
export const STALE_AFTER_DAYS = 365;

export function isStale(retrievedOn: string, today: string): boolean {
  return daysBetween(retrievedOn, today) > STALE_AFTER_DAYS;
}
