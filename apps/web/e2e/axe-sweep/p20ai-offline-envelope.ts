import { isoCalendarDate, known, localRoute, unknownOrText, type Evidence, type Finding, type Locale } from "./p20ai-trace-model.ts";
/** How an offline-first app explains which bytes were actually available. */
export type ResourcePurpose = "shell" | "route" | "pack" | "image" | "font" | "map" | "other";
export type TransferResult = "cache" | "network" | "failed" | "UNKNOWN";
export type CacheDisposition = "hit" | "miss" | "stale" | "UNKNOWN";
export interface ResourceRecord {
  readonly url: string;
  readonly purpose: ResourcePurpose;
  readonly status: number | null;
  readonly result: TransferResult;
  readonly cache: CacheDisposition;
  readonly bytes: number | null;
  readonly capturedAt: number | null;
  readonly critical: boolean;
  readonly provenance?: Evidence;
}
export interface ResourceEnvelope {
  readonly route: string;
  readonly locale: Locale;
  readonly offline: boolean;
  readonly entries: readonly ResourceRecord[];
  readonly preparedAt: number | null;
  readonly displayReady: boolean;
  readonly displayedProvenance: readonly Evidence[];
}
export interface Budget {
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxMissingCritical: number;
}
export const DEFAULT_BUDGET: Budget = { maxEntryBytes: 524_288, maxTotalBytes: 8_388_608, maxMissingCritical: 0 };
const error = (code: string, step: number, detail: string): Finding => ({ code, step, detail, severity: "error" });
const information = (code: string, step: number, detail: string): Finding =>
  ({ code, step, detail, severity: "information" });
export function canonicalResourceUrl(input: string): string | null {
  try {
    const origin = "https://example.invalid";
    const url = new URL(input, origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (input.startsWith("//")) return null;
    if (url.origin !== origin) return null;
    if (!localRoute(url.pathname)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}
export function cacheMayServe(resource: ResourceRecord): boolean {
  return resource.result === "cache" && resource.cache === "hit" &&
    resource.status !== null && resource.status >= 200 && resource.status < 300;
}
export function networkMayServe(resource: ResourceRecord): boolean {
  return resource.result === "network" && resource.status !== null &&
    resource.status >= 200 && resource.status < 300;
}
export function resourceAvailable(resource: ResourceRecord, offline: boolean): boolean {
  return cacheMayServe(resource) || (!offline && networkMayServe(resource));
}
export function resourceUnknown(resource: ResourceRecord): boolean {
  return resource.result === "UNKNOWN" || resource.cache === "UNKNOWN" ||
    resource.status === null || resource.bytes === null;
}
export function contentTypeRisk(resource: ResourceRecord): string | null {
  if (resource.purpose === "font" && /\.(?:js|html)(?:\?|$)/i.test(resource.url)) return "font-type-suspect";
  if (resource.purpose === "image" && /\.(?:html|js|json)(?:\?|$)/i.test(resource.url)) return "image-type-suspect";
  if (resource.purpose === "map" && /\.(?:html|js)(?:\?|$)/i.test(resource.url)) return "map-type-suspect";
  return null;
}
export function validateBudget(budget: Budget): boolean {
  return Number.isSafeInteger(budget.maxEntryBytes) && budget.maxEntryBytes > 0 &&
    Number.isSafeInteger(budget.maxTotalBytes) && budget.maxTotalBytes >= budget.maxEntryBytes &&
    Number.isSafeInteger(budget.maxMissingCritical) && budget.maxMissingCritical >= 0;
}
export function resourceFindings(record: ResourceRecord, offline: boolean, step: number, budget: Budget): Finding[] {
  if (!validateBudget(budget)) throw new RangeError("Invalid resource budget");
  const issues: Finding[] = [];
  const url = canonicalResourceUrl(record.url);
  if (url === null) issues.push(error("resource-url-unsafe", step, record.url));
  if (record.bytes !== null && (!Number.isSafeInteger(record.bytes) || record.bytes < 0))
    issues.push(error("resource-bytes-invalid", step, record.url));
  if (record.bytes !== null && record.bytes > budget.maxEntryBytes)
    issues.push(error("resource-entry-budget", step, record.url));
  if (record.status !== null && (!Number.isInteger(record.status) || record.status < 100 || record.status > 599))
    issues.push(error("resource-http-status", step, record.url));
  if (record.capturedAt !== null && (!Number.isFinite(record.capturedAt) || record.capturedAt < 0))
    issues.push(error("resource-timestamp", step, record.url));
  if (offline && record.result === "network" && record.status !== null && record.status < 400)
    issues.push(error("offline-network-claim", step, record.url));
  if (record.result === "cache" && record.cache === "miss")
    issues.push(error("cache-miss-served", step, record.url));
  if (record.result === "cache" && record.cache === "stale")
    issues.push(information("cache-stale", step, record.url));
  if (record.critical && !resourceAvailable(record, offline))
    issues.push(error("critical-resource-unavailable", step, record.url));
  if (record.critical && resourceUnknown(record))
    issues.push(information("critical-resource-unknown", step, record.url));
  const risk = contentTypeRisk(record);
  if (risk) issues.push(error(risk, step, record.url));
  return issues;
}
export function envelopeFindings(envelope: ResourceEnvelope, budget = DEFAULT_BUDGET): Finding[] {
  if (!validateBudget(budget)) throw new RangeError("Invalid resource budget");
  const issues: Finding[] = [];
  if (!localRoute(envelope.route)) issues.push(error("envelope-route", 0, envelope.route));
  if (envelope.preparedAt !== null && (!Number.isFinite(envelope.preparedAt) || envelope.preparedAt < 0))
    issues.push(error("envelope-time", 0, envelope.route));
  const seen = new Set<string>();
  let measured = 0;
  let missing = 0;
  let unknownBytes = false;
  let criticalCount = 0;
  for (const [index, entry] of envelope.entries.entries()) {
    issues.push(...resourceFindings(entry, envelope.offline, index + 1, budget));
    const url = canonicalResourceUrl(entry.url);
    if (url !== null) {
      if (seen.has(url)) issues.push(error("duplicate-resource", index + 1, url));
      seen.add(url);
    }
    if (entry.bytes === null) unknownBytes = true;
    else if (Number.isSafeInteger(entry.bytes) && entry.bytes >= 0) measured += entry.bytes;
    if (entry.critical) {
      criticalCount += 1;
      if (!resourceAvailable(entry, envelope.offline)) missing += 1;
    }
    if (envelope.offline && entry.purpose === "pack" && resourceAvailable(entry, true) &&
      (entry.provenance === undefined || !known(entry.provenance.source)))
      issues.push(error("offline-pack-source-unknown", index + 1, entry.url));
  }
  if (criticalCount === 0) issues.push(information("critical-inventory-empty", 0, envelope.route));
  if (missing > budget.maxMissingCritical) issues.push(error("missing-critical-budget", 0, String(missing)));
  if (measured > budget.maxTotalBytes) issues.push(error("resource-total-budget", 0, String(measured)));
  if (unknownBytes) issues.push(information("resource-total-UNKNOWN", 0, envelope.route));
  if (envelope.displayReady && missing > 0) issues.push(error("ready-with-missing-critical", 0, envelope.route));
  if (envelope.offline && envelope.displayReady && envelope.entries.some((item) => item.result === "UNKNOWN"))
    issues.push(error("offline-readiness-UNKNOWN", 0, envelope.route));
  const recorded = new Map(envelope.entries.filter((item) => item.provenance !== undefined)
    .map((item) => [item.provenance!.id, item.provenance!]));
  for (const item of envelope.displayedProvenance) {
    const candidate = recorded.get(item.id);
    if (!candidate) issues.push(error("display-source-not-in-cache", 0, item.id));
    else if (unknownOrText(item.source) !== unknownOrText(candidate.source) ||
      unknownOrText(item.licence) !== unknownOrText(candidate.licence) ||
      unknownOrText(item.tier) !== unknownOrText(candidate.tier) ||
      item.retrievedOn !== candidate.retrievedOn)
      issues.push(error("display-source-drift", 0, item.id));
    if (!isoCalendarDate(item.retrievedOn)) issues.push(error("display-source-date-UNKNOWN", 0, item.id));
  }
  return issues;
}
export interface ResourceTransition {
  readonly before: ResourceEnvelope;
  readonly after: ResourceEnvelope;
  readonly action: "disconnect" | "reconnect" | "retry" | "navigate" | "clear-cache";
  readonly preserveSources: boolean;
}
export function resourceTransitionFindings(transition: ResourceTransition): Finding[] {
  const result = envelopeFindings(transition.after);
  const { before, after, action } = transition;
  if (action === "disconnect" && !after.offline) result.push(error("offline-not-entered", 0, after.route));
  if (action === "reconnect" && after.offline) result.push(error("online-not-entered", 0, after.route));
  if (action !== "navigate" && before.route !== after.route)
    result.push(error("resource-transition-route", 0, after.route));
  if (before.locale !== after.locale) result.push(error("resource-transition-locale", 0, after.locale));
  if (transition.preserveSources) {
    const afterSources = new Map(after.displayedProvenance.map((item) => [item.id, item]));
    for (const source of before.displayedProvenance) {
      const current = afterSources.get(source.id);
      if (!current) result.push(error("resource-source-lost", 0, source.id));
      else if (source.source !== current.source || source.licence !== current.licence ||
        source.retrievedOn !== current.retrievedOn || source.tier !== current.tier)
        result.push(error("resource-source-modified", 0, source.id));
    }
  }
  if (action === "clear-cache" && after.entries.some((item) => item.result === "cache" && item.cache === "hit"))
    result.push(error("clear-cache-still-serving", 0, after.route));
  return result;
}
export function measuredPrecacheBytes(entries: readonly ResourceRecord[]): number | null {
  if (entries.some((item) => item.bytes === null || !Number.isSafeInteger(item.bytes) || item.bytes < 0)) return null;
  return entries.reduce((sum, item) => sum + item.bytes!, 0);
}
export function missingCriticalUrls(envelope: ResourceEnvelope): string[] {
  return envelope.entries.filter((item) => item.critical && !resourceAvailable(item, envelope.offline))
    .map((item) => item.url);
}
export function sortedResourceFindings(issues: readonly Finding[]): Finding[] {
  return [...issues].sort((a, b) => a.step - b.step || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail));
}
export function budgetSummary(envelope: ResourceEnvelope): string {
  const bytes = measuredPrecacheBytes(envelope.entries);
  const count = missingCriticalUrls(envelope).length;
  return `route=${envelope.route} locale=${envelope.locale} bytes=${bytes ?? "UNKNOWN"} missingCritical=${count}`;
}
