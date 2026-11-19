/**
 * Audit and coverage for the places in an offline pack (schema "offline-pack-1.0.0").
 *
 * The audit reads the raw `places` array and reports every record that the App would otherwise
 * have to repair or silently drop: it never fixes anything and never fills a value in. It can be
 * run from a data package's own tests so CI fails on bad pack data.
 *
 * The coverage summary counts what the parsed records report and what stays UNKNOWN.
 */
import { isPoint } from "./packGeo";
import { type PackPlaceRecord, WHEELCHAIR_TAGS, countByTag, normaliseTag } from "./packPlaces";
import { type Provenance, daysBetween, formatDate, isStale, validateProvenance } from "./provenance";
import type { Locale } from "./stateCopy";
import { NBSP, t } from "./typography";

export type PackIssueCode =
  | "not-an-object"
  | "bad-id"
  | "duplicate-id"
  | "missing-name"
  | "bad-coordinates"
  | "tag-unrecognised"
  | "tag-without-source"
  | "provenance-missing"
  | "provenance-no-source"
  | "provenance-licence-not-open"
  | "provenance-bad-date"
  | "provenance-bad-url"
  | "provenance-future-date";

/** Errors make the record unusable or its tag untrusted. Warnings are gaps the person will see as UNKNOWN. */
export type PackIssueSeverity = "error" | "warning";

export interface PackIssue {
  readonly severity: PackIssueSeverity;
  readonly code: PackIssueCode;
  /** Position in the array, so a data owner can find the record. */
  readonly index: number;
  readonly id: string | null;
}

export interface PackAuditResult {
  readonly checked: number;
  readonly issues: readonly PackIssue[];
  readonly errors: number;
  readonly warnings: number;
  readonly clean: boolean;
}

const SEVERITY: Readonly<Record<PackIssueCode, PackIssueSeverity>> = {
  "not-an-object": "error",
  "bad-id": "error",
  "duplicate-id": "error",
  "missing-name": "warning",
  "bad-coordinates": "warning",
  "tag-unrecognised": "error",
  "tag-without-source": "error",
  "provenance-missing": "warning",
  "provenance-no-source": "error",
  "provenance-licence-not-open": "error",
  "provenance-bad-date": "error",
  "provenance-bad-url": "error",
  "provenance-future-date": "error",
};

// eslint-disable-next-line no-control-regex -- ids may not hold control characters or spaces
const BAD_ID = /[\u0000-\u001F\u007F\s]/;
const MAX_ID = 200;

function present(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.trim().toUpperCase() !== "UNKNOWN";
}

/** The provenance problems of one pack record's provenance object, as issue codes. Empty means usable. */
export function provenanceIssues(input: unknown, today: string): PackIssueCode[] {
  if (typeof input !== "object" || input === null) return ["provenance-missing"];
  const p = input as Record<string, unknown>;
  const retrieved = typeof p.retrieved_at === "string" ? p.retrieved_at.slice(0, 10) : "";
  const r = validateProvenance({
    source: p.source_name,
    licence: p.licence,
    retrievedOn: retrieved,
    ...(typeof p.source_url === "string" ? { url: p.source_url } : {}),
  });
  if (r.ok) return daysBetween(today, r.value.retrievedOn) > 0 ? ["provenance-future-date"] : [];
  switch (r.reason) {
    case "missing-source":
      return ["provenance-no-source"];
    case "licence-not-open":
      return ["provenance-licence-not-open"];
    case "bad-date":
      return ["provenance-bad-date"];
    case "bad-url":
      return ["provenance-bad-url"];
    default:
      return ["provenance-missing"];
  }
}

/** Audit the raw `places` array of a pack. `today` is an ISO date supplied by the caller. */
export function auditPackPlaces(places: readonly unknown[], today: string): PackAuditResult {
  const issues: PackIssue[] = [];
  const seen = new Set<string>();
  places.forEach((raw, index) => {
    let id: string | null = null;
    const push = (code: PackIssueCode): void => void issues.push({ severity: SEVERITY[code], code, index, id });

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return push("not-an-object");
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > MAX_ID || BAD_ID.test(r.id)) return push("bad-id");
    id = r.id;
    if (seen.has(id)) push("duplicate-id");
    seen.add(id);

    if (!present(r.name)) push("missing-name");
    if (!isPoint({ lat: r.lat, lon: r.lon })) push("bad-coordinates");

    const tag = normaliseTag(r.wheelchair);
    const problems = provenanceIssues(r.provenance, today);
    for (const code of problems) push(code);
    if (tag.reason === "unrecognised-value") push("tag-unrecognised");
    if (tag.tag !== "unknown" && problems.length > 0) push("tag-without-source");
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  return { checked: places.length, issues, errors, warnings: issues.length - errors, clean: issues.length === 0 };
}

export class PackAuditError extends Error {
  readonly result: PackAuditResult;
  constructor(result: PackAuditResult) {
    const first = result.issues
      .slice(0, 5)
      .map((i) => `#${i.index}${i.id ? ` ${i.id}` : ""}: ${i.code}`)
      .join("; ");
    super(`Pack audit found ${result.errors} error(s) and ${result.warnings} warning(s). ${first}`);
    this.name = "PackAuditError";
    this.result = result;
  }
}

/** For a data package's own test: throws when the pack has any error. Warnings are allowed. */
export function assertPackClean(places: readonly unknown[], today: string): PackAuditResult {
  const result = auditPackPlaces(places, today);
  if (result.errors > 0) throw new PackAuditError(result);
  return result;
}

export interface PackCoverage {
  readonly total: number;
  readonly byTag: Readonly<Record<(typeof WHEELCHAIR_TAGS)[number] | "unknown", number>>;
  /** Records whose tag is reported with a source. */
  readonly reported: number;
  /** Whole percent of records with a reported tag; 0 when there are no records. */
  readonly reportedPercent: number;
  readonly unknownNotRecorded: number;
  readonly unknownUnrecognised: number;
  readonly unknownNoSource: number;
  readonly withName: number;
  readonly withAddress: number;
  readonly withCategory: number;
  readonly withLocation: number;
  readonly withSource: number;
  readonly staleRecords: number;
  readonly sources: number;
  readonly latestRetrieval: string | null;
}

export function computePackCoverage(places: readonly PackPlaceRecord[], today: string): PackCoverage {
  const byTag = countByTag(places);
  const total = places.length;
  const reported = total - byTag.unknown;
  const names = new Set<string>();
  let latest: string | null = null;
  const prov = places.map((p) => p.provenance).filter((p): p is Provenance => p !== null);
  for (const p of prov) {
    names.add(`${p.source.toLowerCase()}\u0000${p.licence}`);
    if (latest === null || p.retrievedOn > latest) latest = p.retrievedOn;
  }
  return {
    total,
    byTag,
    reported,
    reportedPercent: total === 0 ? 0 : Math.round((reported / total) * 100),
    unknownNotRecorded: places.filter((p) => p.tagUnknownReason === "not-recorded").length,
    unknownUnrecognised: places.filter((p) => p.tagUnknownReason === "unrecognised-value").length,
    unknownNoSource: places.filter((p) => p.tagUnknownReason === "missing-provenance").length,
    withName: places.filter((p) => p.name !== null).length,
    withAddress: places.filter((p) => p.address !== null).length,
    withCategory: places.filter((p) => p.category !== null).length,
    withLocation: places.filter((p) => p.location !== null).length,
    withSource: prov.length,
    staleRecords: prov.filter((p) => isStale(p.retrievedOn, today)).length,
    sources: names.size,
    latestRetrieval: latest,
  };
}

function pct(n: number, locale: Locale): string {
  return locale === "fr" ? `${n}${NBSP}%` : `${n}%`;
}

function share(n: number, total: number, locale: Locale): string {
  return `${n} / ${total} (${pct(total === 0 ? 0 : Math.round((n / total) * 100), locale)})`;
}

const TAG_WORD: Readonly<Record<keyof PackCoverage["byTag"], { en: string; fr: string }>> = {
  yes: { en: "yes", fr: "oui" },
  limited: { en: "limited", fr: "limité" },
  no: { en: "no", fr: "non" },
  designated: { en: "designated", fr: "réservé" },
  unknown: { en: "UNKNOWN", fr: "UNKNOWN" },
};

/** The coverage as short lines of plain text. It states what is reported, not whether it is right. */
export function packCoverageLines(c: PackCoverage, locale: Locale): string[] {
  if (c.total === 0) return [t(locale, "No places in the pack on this device.", "Aucun lieu dans le pack sur cet appareil.")];
  const tags = (Object.keys(TAG_WORD) as (keyof typeof TAG_WORD)[]).map((k) => `${TAG_WORD[k][locale]}: ${c.byTag[k]}`);
  const lines = [
    t(locale, `${c.total} places in the pack.`, `${c.total} lieux dans le pack.`),
    t(locale, `Wheelchair tag reported with a source: ${share(c.reported, c.total, locale)}.`, `Indication pour fauteuil roulant avec source : ${share(c.reported, c.total, locale)}.`),
    t(locale, `By tag, ${tags.join(", ")}.`, `Par indication, ${tags.join(", ")}.`),
    t(
      locale,
      `UNKNOWN because not recorded: ${c.unknownNotRecorded}; unrecognised value: ${c.unknownUnrecognised}; no usable source: ${c.unknownNoSource}.`,
      `UNKNOWN faute d’indication : ${c.unknownNotRecorded} ; valeur non reconnue : ${c.unknownUnrecognised} ; aucune source utilisable : ${c.unknownNoSource}.`,
    ),
    t(
      locale,
      `With a name: ${share(c.withName, c.total, locale)}. With an address: ${share(c.withAddress, c.total, locale)}. With a kind: ${share(c.withCategory, c.total, locale)}. With a position: ${share(c.withLocation, c.total, locale)}.`,
      `Avec un nom : ${share(c.withName, c.total, locale)}. Avec une adresse : ${share(c.withAddress, c.total, locale)}. Avec un type : ${share(c.withCategory, c.total, locale)}. Avec une position : ${share(c.withLocation, c.total, locale)}.`,
    ),
    t(locale, `With a usable source: ${share(c.withSource, c.total, locale)}, from ${c.sources} source${c.sources === 1 ? "" : "s"}.`, `Avec une source utilisable : ${share(c.withSource, c.total, locale)}, de ${c.sources} source${c.sources === 1 ? "" : "s"}.`),
  ];
  if (c.latestRetrieval) lines.push(t(locale, `Most recent retrieval: ${formatDate(c.latestRetrieval, locale)}.`, `Consultation la plus récente : ${formatDate(c.latestRetrieval, locale)}.`));
  if (c.staleRecords > 0) lines.push(t(locale, `${c.staleRecords} may be out of date.`, `${c.staleRecords} peuvent être périmés.`));
  return lines;
}
