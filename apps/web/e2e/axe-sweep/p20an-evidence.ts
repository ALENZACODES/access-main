/** Evidence continuity contracts. Observations are not assertions about actual places. */
export const UNKNOWN = "UNKNOWN" as const;
export type Locale = "en" | "fr";
export type Connection = "online" | "offline" | "UNKNOWN";
export type Availability = "present" | "absent" | "stale" | "UNKNOWN";
export type Tier = "A" | "B" | "C" | "D" | "E" | "UNKNOWN";
export type Finding = Readonly<{
  code: string;
  route: string;
  detail: string;
  severity: "error" | "warning" | "information";
}>;
export interface Provenance {
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: Tier;
}
export interface Evidence {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly provenance: Provenance;
  readonly unknownReason: string | null;
}
export interface EvidenceInventory {
  readonly route: string;
  readonly locale: Locale;
  readonly records: readonly Evidence[];
  readonly observedAt: string | null;
}
export interface EvidenceComparison {
  readonly oldInventory: EvidenceInventory;
  readonly newInventory: EvidenceInventory;
  readonly preserveIdentity: boolean;
  readonly allowRemoval: boolean;
}
const unknownTokens = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "n.d.", "—", "-", "null", "undefined"]);
export function valueOrUnknown(value: string | null | undefined): string {
  if (value === undefined || value === null) return UNKNOWN;
  const normalized = value.trim().replace(/\s+/g, " ");
  return unknownTokens.has(normalized.toLocaleLowerCase()) ? UNKNOWN : normalized;
}
export function isKnown(value: string | null | undefined): boolean {
  return valueOrUnknown(value) !== UNKNOWN;
}
export function calendarDate(text: string | null): boolean {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parts = text.split("-").map(Number);
  const year = parts[0], month = parts[1], day = parts[2];
  if (!year || !month || !day || year > 9999 || month > 12 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
export function safeRoute(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  if (/[?#*:]/.test(path)) return false;
  if (path.split("/").some((part) => part === "." || part === "..")) return false;
  for (const point of path) if (point.charCodeAt(0) < 32 || point.charCodeAt(0) === 127) return false;
  return true;
}
export function normalizedRoute(route: string): string | null {
  if (!safeRoute(route)) return null;
  return route.length > 1 && route.endsWith("/") ? route.slice(0, -1) : route;
}
export function finding(code: string, route: string, detail: string, severity: Finding["severity"] = "error"): Finding {
  return { code, route, detail, severity };
}
export function evidenceKey(evidence: Evidence): string {
  return evidence.id.trim();
}
export function provenanceIdentity(record: Evidence): string {
  const p = record.provenance;
  return JSON.stringify([record.id, valueOrUnknown(p.source), valueOrUnknown(p.licence),
    valueOrUnknown(p.retrievedOn), p.tier]);
}
export function evidenceKnown(record: Evidence): boolean {
  return record.id.trim().length > 0 && isKnown(record.label) && isKnown(record.value) &&
    isKnown(record.provenance.source) && isKnown(record.provenance.licence) &&
    calendarDate(record.provenance.retrievedOn) && record.provenance.tier !== UNKNOWN;
}
export function provenanceFindings(record: Evidence, route: string): Finding[] {
  const failures: Finding[] = [];
  if (!record.id.trim()) failures.push(finding("record-id-empty", route, "Record lacks a stable identifier"));
  if (!isKnown(record.label)) failures.push(finding("record-label-UNKNOWN", route, record.id, "warning"));
  if (!isKnown(record.value)) failures.push(finding("record-value-UNKNOWN", route, record.id, "information"));
  if (!isKnown(record.provenance.source)) failures.push(finding("record-source-UNKNOWN", route, record.id, "information"));
  if (!isKnown(record.provenance.licence)) failures.push(finding("record-licence-UNKNOWN", route, record.id, "information"));
  if (!calendarDate(record.provenance.retrievedOn)) failures.push(finding("record-date-UNKNOWN", route, record.id, "information"));
  if (record.provenance.tier === UNKNOWN) failures.push(finding("record-tier-UNKNOWN", route, record.id, "information"));
  if (isKnown(record.value) && !evidenceKnown(record)) {
    failures.push(finding("record-known-with-incomplete-provenance", route, record.id));
  }
  if (record.unknownReason && evidenceKnown(record)) {
    failures.push(finding("record-unknown-reason-conflict", route, record.id, "warning"));
  }
  return failures;
}
export function inventoryFindings(inventory: EvidenceInventory): Finding[] {
  const failures: Finding[] = [];
  const ids = new Set<string>();
  if (!safeRoute(inventory.route)) failures.push(finding("inventory-route-unsafe", inventory.route, inventory.route));
  if (inventory.observedAt !== null && !calendarDate(inventory.observedAt)) {
    failures.push(finding("inventory-observation-date-invalid", inventory.route, inventory.observedAt));
  }
  for (const record of inventory.records) {
    if (ids.has(record.id)) failures.push(finding("record-duplicate-id", inventory.route, record.id));
    ids.add(record.id);
    failures.push(...provenanceFindings(record, inventory.route));
  }
  return failures;
}
export function compareInventories(input: EvidenceComparison): Finding[] {
  const failures: Finding[] = [];
  const before = input.oldInventory, after = input.newInventory;
  if (before.route !== after.route) failures.push(finding("inventory-route-changed", after.route, before.route));
  if (before.locale !== after.locale && !input.preserveIdentity) {
    failures.push(finding("inventory-language-transition-untracked", after.route, `${before.locale} to ${after.locale}`, "warning"));
  }
  const newer = new Map(after.records.map((record) => [record.id, record]));
  for (const oldRecord of before.records) {
    const changed = newer.get(oldRecord.id);
    if (!changed) {
      if (!input.allowRemoval) failures.push(finding("inventory-record-lost", after.route, oldRecord.id));
      continue;
    }
    if (input.preserveIdentity && provenanceIdentity(oldRecord) !== provenanceIdentity(changed)) {
      failures.push(finding("record-provenance-drift", after.route, oldRecord.id));
    }
    if (input.preserveIdentity && !isKnown(oldRecord.value) && isKnown(changed.value)) {
      failures.push(finding("record-UNKNOWN-promoted", after.route, oldRecord.id));
    }
  }
  return failures;
}
export function mergeObservations(first: EvidenceInventory, second: EvidenceInventory): EvidenceInventory {
  if (first.route !== second.route || first.locale !== second.locale) throw new Error("Incompatible inventories");
  const map = new Map(first.records.map((record) => [record.id, record]));
  for (const record of second.records) {
    const existing = map.get(record.id);
    if (existing && provenanceIdentity(existing) !== provenanceIdentity(record)) throw new Error("Conflicting source metadata");
    if (existing && !isKnown(existing.value) && isKnown(record.value)) throw new Error("UNKNOWN must not be silently promoted");
    map.set(record.id, record);
  }
  return { route: first.route, locale: first.locale, records: [...map.values()], observedAt: second.observedAt ?? first.observedAt };
}
export function sourceSummary(inventory: EvidenceInventory): Readonly<{ known: number; unknown: number; missingSource: number; missingDate: number }> {
  let known = 0, unknown = 0, missingSource = 0, missingDate = 0;
  for (const record of inventory.records) {
    if (evidenceKnown(record)) known += 1; else unknown += 1;
    if (!isKnown(record.provenance.source)) missingSource += 1;
    if (!calendarDate(record.provenance.retrievedOn)) missingDate += 1;
  }
  return { known, unknown, missingSource, missingDate };
}
export function sortedInventory(inventory: EvidenceInventory): EvidenceInventory {
  return { ...inventory, records: [...inventory.records].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function boundedReport(findings: readonly Finding[], max = 30): string {
  if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be a positive integer");
  const lines = [...new Set(findings.map((item) => `${item.code} ${item.route}: ${item.detail}`))];
  const more = lines.length - Math.min(lines.length, max);
  return [...lines.slice(0, max), ...(more ? [`${more} additional findings`] : [])].join("\n");
}
