import type { Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** Publication age describes a dataset, never the accessibility of a place. */
export type AgeBand = "recent" | "older" | "future" | "UNKNOWN";
export type CopyBand = "saved" | "missing" | "stale" | "unreadable" | "UNKNOWN";
export type AgeIssue =
  | "none" | "missing-inventory" | "region-mismatch" | "duplicate-manifest"
  | "duplicate-inventory" | "unlisted-inventory" | "invalid-manifest"
  | "unsupported-licence" | "invalid-source-date" | "future-source-date"
  | "stale-copy" | "missing-copy" | "unreadable-copy" | "mismatched-copy";
export type AgeFilter = "all" | "recent" | "older" | "future" | "unknown" | "needs-attention";
export type AgeSort = "manifest" | "oldest" | "newest" | "source" | "status";

export interface AgeCell {
  readonly id: string;
  readonly listedBytes: number | null;
  readonly provenance: Provenance | null;
  readonly ageDays: number | null;
  readonly ageBand: AgeBand;
  readonly copyBand: CopyBand;
  readonly issue: AgeIssue;
  readonly evidenceTier: "UNKNOWN";
}
export interface AgeSummary {
  readonly regionId: string;
  readonly asOf: string;
  readonly thresholdDays: number;
  readonly state: "ready" | "UNKNOWN";
  readonly total: number;
  readonly saved: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly recent: number;
  readonly older: number;
  readonly future: number;
  readonly unknown: number;
  readonly rows: readonly AgeCell[];
  readonly findings: readonly AgeIssue[];
}
export interface AgeGroup {
  readonly source: Provenance;
  readonly rows: number;
  readonly saved: number;
  readonly unknown: number;
  readonly older: number;
  readonly newestDays: number | null;
  readonly oldestDays: number | null;
}
export interface AgePage {
  readonly rows: readonly AgeCell[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export interface AgeQuery {
  readonly filter: AgeFilter;
  readonly sort: AgeSort;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

const DAY_MS = 86_400_000;
const MAX_CELLS = 50_000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_CELL_BYTES = 256 * 1024 * 1024;

/** ISO parsing is deliberately strict, including leap years. */
export function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(day)) return null;
  return new Date(day).toISOString().slice(0, 10) === value ? day : null;
}

export function ageDaysOn(sourceDate: string, today: string): number | null {
  const source = parseDay(sourceDate);
  const current = parseDay(today);
  if (source === null || current === null) return null;
  const days = (current - source) / DAY_MS;
  return Number.isSafeInteger(days) ? days : null;
}

export function classifyAge(days: number | null, thresholdDays: number): AgeBand {
  if (days === null || !Number.isSafeInteger(days) ||
    !Number.isSafeInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 3650) {
    return "UNKNOWN";
  }
  if (days < 0) return "future";
  return days > thresholdDays ? "older" : "recent";
}

function saneId(id: string): boolean {
  return id.length > 0 && id.length <= 160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(id) && !id.includes("..");
}

export function sourceIssues(provenance: Provenance): readonly AgeIssue[] {
  const issues: AgeIssue[] = [];
  if (!provenance.source.trim() || provenance.source.length > 500) issues.push("invalid-manifest");
  if (!OPEN_LICENCES.some((licence) => licence === provenance.licence)) {
    issues.push("unsupported-licence");
  }
  if (parseDay(provenance.date) === null) issues.push("invalid-source-date");
  return issues;
}

function matchingProvenance(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function inventoryIssue(record: InventoryCell | undefined, expected: {
  readonly id: string; readonly bytes: number; readonly provenance: Provenance;
}): { copyBand: CopyBand; issue: AgeIssue } {
  if (!record) return { copyBand: "UNKNOWN", issue: "unreadable-copy" };
  if (record.id !== expected.id || record.expectedBytes !== expected.bytes ||
    !matchingProvenance(record.provenance, expected.provenance)) {
    return { copyBand: "UNKNOWN", issue: "mismatched-copy" };
  }
  if (record.cause === "missing") return { copyBand: "missing", issue: "missing-copy" };
  if (record.cause === "stale") return { copyBand: "stale", issue: "stale-copy" };
  if (record.cause === "unreadable") return { copyBand: "unreadable", issue: "unreadable-copy" };
  if (record.cause === "present" && record.state === "saved") {
    return { copyBand: "saved", issue: "none" };
  }
  return { copyBand: "UNKNOWN", issue: "unreadable-copy" };
}

/** Does not alter data, fetch anything, or infer physical accessibility. */
export function reviewSourceAge(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  today: string,
  thresholdDays = 365,
): AgeSummary {
  if (parseDay(today) === null) throw new RangeError("Invalid review date");
  if (!Number.isSafeInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 3650) {
    throw new RangeError("Invalid review threshold");
  }
  const findings = new Set<AgeIssue>();
  const manifestIds = new Set<string>();
  const observed = new Map<string, InventoryCell>();
  const globalIssues = new Set<AgeIssue>();
  if (!saneId(manifest.regionId) || manifest.cells.length > MAX_CELLS) {
    globalIssues.add("invalid-manifest");
  }
  let totalBytes = 0;
  for (const cell of manifest.cells) {
    if (manifestIds.has(cell.id)) globalIssues.add("duplicate-manifest");
    manifestIds.add(cell.id);
    if (!saneId(cell.id) || !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      cell.bytes > MAX_CELL_BYTES) globalIssues.add("invalid-manifest");
    if (Number.isSafeInteger(cell.bytes) && cell.bytes >= 0) totalBytes += cell.bytes;
    for (const issue of sourceIssues(cell.provenance)) globalIssues.add(issue);
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_BYTES) {
    globalIssues.add("invalid-manifest");
  }
  if (!inventory) globalIssues.add("missing-inventory");
  else if (inventory.regionId !== manifest.regionId) globalIssues.add("region-mismatch");
  else {
    for (const record of inventory.cells) {
      if (observed.has(record.id)) globalIssues.add("duplicate-inventory");
      if (!manifestIds.has(record.id)) globalIssues.add("unlisted-inventory");
      observed.set(record.id, record);
    }
  }
  const blockAll = globalIssues.size > 0;
  for (const issue of globalIssues) findings.add(issue);
  const rows: AgeCell[] = manifest.cells.map((cell) => {
    const issues = sourceIssues(cell.provenance);
    const days = issues.length === 0 ? ageDaysOn(cell.provenance.date, today) : null;
    const band = classifyAge(days, thresholdDays);
    const copy = blockAll ? { copyBand: "UNKNOWN" as const, issue: "unreadable-copy" as const } :
      inventoryIssue(observed.get(cell.id), cell);
    let issue: AgeIssue = blockAll ? "invalid-manifest" : copy.issue;
    if (issues.length > 0) issue = issues[0] ?? "invalid-manifest";
    else if (band === "future") issue = "future-source-date";
    if (issue !== "none") findings.add(issue);
    return {
      id: cell.id,
      listedBytes: Number.isSafeInteger(cell.bytes) && cell.bytes >= 0 ? cell.bytes : null,
      provenance: issues.length === 0 ? cell.provenance : null,
      ageDays: band === "UNKNOWN" ? null : days,
      ageBand: band,
      copyBand: copy.copyBand,
      issue,
      evidenceTier: "UNKNOWN",
    };
  });
  const count = (property: "copyBand" | "ageBand", value: string): number =>
    rows.filter((row) => row[property] === value).length;
  return {
    regionId: manifest.regionId,
    asOf: today,
    thresholdDays,
    state: blockAll || rows.some((row) => row.copyBand === "UNKNOWN" || row.ageBand === "UNKNOWN" ||
      row.ageBand === "future") ? "UNKNOWN" : "ready",
    total: rows.length,
    saved: count("copyBand", "saved"),
    missing: count("copyBand", "missing"),
    stale: count("copyBand", "stale"),
    unreadable: count("copyBand", "unreadable") + count("copyBand", "UNKNOWN"),
    recent: count("ageBand", "recent"),
    older: count("ageBand", "older"),
    future: count("ageBand", "future"),
    unknown: count("ageBand", "UNKNOWN"),
    rows,
    findings: [...findings],
  };
}

/** Group only identical source/licence/date triples, never invent a group date. */
export function sourceAgeGroups(review: AgeSummary): readonly AgeGroup[] {
  const groups = new Map<string, { source: Provenance; rows: AgeCell[] }>();
  for (const row of review.rows) {
    if (!row.provenance) continue;
    const source = row.provenance;
    const key = JSON.stringify([source.source, source.licence, source.date]);
    const group = groups.get(key) ?? { source, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ source, rows }) => {
    const ages = rows.map((row) => row.ageDays).filter((x): x is number => x !== null);
    return {
      source, rows: rows.length,
      saved: rows.filter((row) => row.copyBand === "saved").length,
      unknown: rows.filter((row) => row.copyBand === "UNKNOWN").length,
      older: rows.filter((row) => row.ageBand === "older").length,
      newestDays: ages.length ? Math.min(...ages) : null,
      oldestDays: ages.length ? Math.max(...ages) : null,
    };
  }).sort((a, b) => a.source.source.localeCompare(b.source.source) ||
    a.source.date.localeCompare(b.source.date));
}

export function sourceAgePage(review: AgeSummary, query: AgeQuery): AgePage {
  const pageSize = Number.isSafeInteger(query.pageSize) ?
    Math.max(1, Math.min(query.pageSize, 100)) : 12;
  const search = query.search.slice(0, 160).trim().normalize("NFKC").toLocaleLowerCase();
  const matching = review.rows.filter((row) => {
    if (query.filter === "recent" && row.ageBand !== "recent") return false;
    if (query.filter === "older" && row.ageBand !== "older") return false;
    if (query.filter === "future" && row.ageBand !== "future") return false;
    if (query.filter === "unknown" && row.ageBand !== "UNKNOWN" && row.copyBand !== "UNKNOWN") return false;
    if (query.filter === "needs-attention" && row.ageBand === "recent" && row.copyBand === "saved") return false;
    if (!search) return true;
    return [row.id, row.provenance?.source, row.provenance?.licence, row.provenance?.date, row.issue]
      .filter((x): x is string => typeof x === "string")
      .join("\n").normalize("NFKC").toLocaleLowerCase().includes(search);
  });
  if (query.sort !== "manifest") matching.sort((a, b) => {
    if (query.sort === "source") return (a.provenance?.source ?? "").localeCompare(b.provenance?.source ?? "") || a.id.localeCompare(b.id);
    if (query.sort === "status") return a.copyBand.localeCompare(b.copyBand) || a.id.localeCompare(b.id);
    const av = a.ageDays ?? (query.sort === "oldest" ? -Infinity : Infinity);
    const bv = b.ageDays ?? (query.sort === "oldest" ? -Infinity : Infinity);
    return (query.sort === "oldest" ? bv - av : av - bv) || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Number.isSafeInteger(query.page) ? Math.min(Math.max(0, query.page), pages - 1) : 0;
  return {
    rows: matching.slice(page * pageSize, (page + 1) * pageSize),
    total: matching.length, page, pages, previous: page > 0, next: page + 1 < pages,
  };
}

/** No classification here is a recommendation to discard existing offline data. */
export function ageReviewAction(row: AgeCell): "none" | "inspect" | "review-source" {
  if (!row.provenance || row.copyBand === "UNKNOWN" || row.copyBand === "unreadable" ||
    row.copyBand === "missing") return "inspect";
  if (row.issue === "future-source-date" || row.issue === "mismatched-copy" ||
    row.ageBand === "older") return "review-source";
  if (row.copyBand !== "saved") return "inspect";
  return "none";
}
