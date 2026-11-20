/** Offline-first resource policy: absence of bytes is UNKNOWN, not a passing budget. */
export type ResourceClass = "document" | "script" | "style" | "image" | "font" | "data" | "other";
export type Cached = "present" | "missing" | "UNKNOWN";
export type ResourceOutcome = "success" | "error" | "pending" | "UNKNOWN";
export interface ResourceEntry {
  readonly url: string;
  readonly kind: ResourceClass;
  readonly cached: Cached;
  readonly bytes: number | null;
  readonly outcome: ResourceOutcome;
  readonly revision: string | null;
  readonly required: boolean;
  readonly external: boolean;
}
export interface ResourceFinding {
  readonly code: string;
  readonly url: string;
  readonly detail: string;
  readonly blocking: boolean;
}
export interface ResourceSnapshot {
  readonly route: string;
  readonly locale: "en" | "fr";
  readonly offline: boolean;
  readonly entries: readonly ResourceEntry[];
  readonly cacheName: string | null;
  readonly serviceWorker: "active" | "absent" | "UNKNOWN";
  readonly requestedAt: number | null;
}
const issue = (code: string, url: string, detail: string, blocking = true): ResourceFinding => ({ code, url, detail, blocking });
export const MAX_PRECACHE_ENTRY_BYTES = 524288;
export function safeResourceUrl(url: string): boolean {
  if (!url.trim()) return false;
  if (url.startsWith("//") || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("file:")) return false;
  if (url.includes("\\")) return false;
  for (const char of url) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  try {
    const absolute = new URL(url, "https://example.invalid/");
    return ["http:", "https:"].includes(absolute.protocol);
  } catch { return false; }
}
export function cachedState(entry: ResourceEntry): "ready" | "unavailable" | "UNKNOWN" {
  if (entry.cached === "UNKNOWN" || entry.outcome === "UNKNOWN" || entry.outcome === "pending") return "UNKNOWN";
  if (entry.cached === "missing") return "unavailable";
  if (entry.outcome !== "success") return "unavailable";
  return "ready";
}
export function entryFindings(entry: ResourceEntry, budget = MAX_PRECACHE_ENTRY_BYTES): ResourceFinding[] {
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError("Invalid byte budget");
  const findings: ResourceFinding[] = [];
  if (!safeResourceUrl(entry.url)) findings.push(issue("resource-url-unsafe", entry.url, "Invalid resource URL"));
  if (entry.external && entry.required && entry.cached !== "present") {
    findings.push(issue("offline-external-required", entry.url, "Required external request is not local"));
  }
  if (entry.bytes === null) findings.push(issue("resource-bytes-unknown", entry.url, "UNKNOWN", false));
  else if (!Number.isInteger(entry.bytes) || entry.bytes < 0) findings.push(issue("resource-bytes-invalid", entry.url, String(entry.bytes)));
  else if (entry.cached === "present" && entry.bytes > budget) findings.push(issue("precache-entry-too-large", entry.url, String(entry.bytes)));
  if (entry.required && entry.cached === "missing") findings.push(issue("required-resource-missing", entry.url, "Missing in cache"));
  if (entry.required && entry.cached === "UNKNOWN") findings.push(issue("required-cache-unknown", entry.url, "UNKNOWN", false));
  if (entry.required && entry.outcome === "error") findings.push(issue("required-request-failed", entry.url, "Resource failed"));
  if (entry.required && entry.outcome === "UNKNOWN") findings.push(issue("required-outcome-unknown", entry.url, "UNKNOWN", false));
  if (entry.revision !== null && !/^[a-z0-9._-]{1,128}$/i.test(entry.revision)) {
    findings.push(issue("resource-revision-invalid", entry.url, "Revision token invalid"));
  }
  return findings;
}
export function snapshotResourceFindings(snapshot: ResourceSnapshot): ResourceFinding[] {
  const findings: ResourceFinding[] = [];
  if (snapshot.offline && snapshot.serviceWorker === "absent") {
    findings.push(issue("offline-worker-absent", snapshot.route, "No offline worker observed"));
  }
  if (snapshot.offline && snapshot.serviceWorker === "UNKNOWN") {
    findings.push(issue("offline-worker-unknown", snapshot.route, "UNKNOWN", false));
  }
  if (snapshot.offline && snapshot.cacheName === null) findings.push(issue("offline-cache-unknown", snapshot.route, "UNKNOWN", false));
  if (snapshot.requestedAt !== null && (!Number.isFinite(snapshot.requestedAt) || snapshot.requestedAt < 0)) {
    findings.push(issue("request-time-invalid", snapshot.route, String(snapshot.requestedAt)));
  }
  const urls = new Set<string>();
  for (const entry of snapshot.entries) {
    if (urls.has(entry.url)) findings.push(issue("resource-duplicate", entry.url, "Duplicate request"));
    urls.add(entry.url);
    findings.push(...entryFindings(entry));
    if (snapshot.offline && entry.required && cachedState(entry) === "unavailable") {
      findings.push(issue("offline-required-unavailable", entry.url, "Required cached resource not available"));
    }
  }
  return findings;
}
export function snapshotCompare(before: ResourceSnapshot, after: ResourceSnapshot): ResourceFinding[] {
  const findings: ResourceFinding[] = [];
  const indexed = new Map(after.entries.map((entry) => [entry.url, entry]));
  for (const original of before.entries) {
    if (!original.required) continue;
    const next = indexed.get(original.url);
    if (!next) findings.push(issue("required-resource-lost", original.url, "Absent after transition"));
    else if (original.cached === "present" && next.cached === "missing") {
      findings.push(issue("resource-evicted", original.url, "Present changed to missing"));
    } else if (original.revision !== null && next.revision !== null && original.revision !== next.revision) {
      findings.push(issue("resource-revision-drift", original.url, "Revision changed"));
    }
  }
  if (before.locale !== after.locale) {
    const requiredAfter = after.entries.filter((entry) => entry.required);
    if (requiredAfter.length === 0) findings.push(issue("locale-resources-empty", after.route, "No required locale resources"));
  }
  return findings;
}
export function budgetSummary(snapshot: ResourceSnapshot): Readonly<{
  knownBytes: number; unknownCount: number; overBudgetCount: number; requiredUnavailable: number;
}> {
  let knownBytes = 0; let unknownCount = 0; let overBudgetCount = 0; let requiredUnavailable = 0;
  for (const entry of snapshot.entries) {
    if (entry.bytes === null || !Number.isInteger(entry.bytes) || entry.bytes < 0) unknownCount += 1;
    else knownBytes += entry.bytes;
    if (entry.bytes !== null && entry.bytes > MAX_PRECACHE_ENTRY_BYTES) overBudgetCount += 1;
    if (entry.required && cachedState(entry) === "unavailable") requiredUnavailable += 1;
  }
  return { knownBytes, unknownCount, overBudgetCount, requiredUnavailable };
}
export function resourceMatrix(routes: readonly string[], locales: readonly ("en" | "fr")[]): readonly { route: string; locale: "en" | "fr"; offline: boolean }[] {
  return routes.flatMap((route) => locales.flatMap((locale) => [false, true].map((offline) => ({ route, locale, offline }))));
}
export function matrixCoverage(routes: readonly string[], actual: readonly { route: string; locale: "en" | "fr"; offline: boolean }[]): ResourceFinding[] {
  const expected = resourceMatrix(routes, ["en", "fr"]);
  const key = (cell: { route: string; locale: "en" | "fr"; offline: boolean }) => `${cell.route}|${cell.locale}|${cell.offline}`;
  const seen = new Set<string>();
  const findings: ResourceFinding[] = [];
  const expectedKeys = new Set(expected.map(key));
  for (const cell of actual) {
    const id = key(cell);
    if (seen.has(id)) findings.push(issue("matrix-duplicate", cell.route, id));
    if (!expectedKeys.has(id)) findings.push(issue("matrix-unexpected", cell.route, id));
    seen.add(id);
  }
  for (const cell of expected) if (!seen.has(key(cell))) findings.push(issue("matrix-missing", cell.route, key(cell)));
  return findings;
}
