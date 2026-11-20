import { BUDGET_BYTES, issue, knownNumber, safeRoute, UNKNOWN, type CacheEntry, type Connection, type Finding, type PageSnapshot, type ServiceWorkerState } from "./p20ak-types.ts";

/** Inspect only measured resource state; never infer a successful cache hit. */
export function localResourceUrl(raw: string, origin = "https://example.test"): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !["https:", "http:"].includes(url.protocol)) return null;
    if (url.username || url.password || url.search || url.hash || !safeRoute(url.pathname)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}
export function resourceFindings(resources: readonly CacheEntry[], now: number | null = null): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const record of resources) {
    const scope = `resource/${record.url}`;
    const path = localResourceUrl(record.url);
    if (path === null) findings.push(issue("resource-unsafe-url", scope, "Resource URL is not an allowed local path"));
    if (seen.has(record.url)) findings.push(issue("resource-duplicate", scope, "URL repeated in observation"));
    seen.add(record.url);
    if (record.phase === "success" && record.responseStatus === null) findings.push(issue("resource-unmeasured-status", scope, "Successful response status UNKNOWN"));
    if (record.phase === "success" && record.responseStatus !== null && (record.responseStatus < 200 || record.responseStatus >= 400)) findings.push(issue("resource-status-conflict", scope, "Success conflicts with HTTP status"));
    if (record.phase === "failure" && record.responseStatus !== null && record.responseStatus >= 200 && record.responseStatus < 400) findings.push(issue("resource-failure-conflict", scope, "Failure conflicts with status"));
    if (record.measuredBytes !== null && (!Number.isSafeInteger(record.measuredBytes) || record.measuredBytes < 0)) findings.push(issue("resource-size-invalid", scope, "Invalid byte count"));
    if (record.measuredBytes !== null && record.measuredBytes > BUDGET_BYTES) findings.push(issue("resource-precache-budget", scope, "Resource exceeds per-file 512 KiB budget"));
    if (record.phase === "success" && record.measuredBytes === null) findings.push(issue("resource-size-unknown", scope, "Byte count UNKNOWN", 0, "information"));
    if (record.observedAt !== null && (!Number.isFinite(record.observedAt) || record.observedAt < 0)) findings.push(issue("resource-time-invalid", scope, "Invalid observation time"));
    if (now !== null && record.observedAt !== null && record.observedAt > now) findings.push(issue("resource-from-future", scope, "Observation precedes resource measurement"));
    if (record.phase === "UNKNOWN" && record.cacheKey !== null) findings.push(issue("resource-cache-assumption", scope, "Cache key supplied without measured state", 0, "warning"));
    if (record.contentType !== null && /[\r\n]/.test(record.contentType)) findings.push(issue("resource-content-type-invalid", scope, "Invalid media type"));
  }
  return findings;
}
export function workerFindings(state: ServiceWorkerState, connection: Connection, at = 0): Finding[] {
  const findings: Finding[] = [];
  if (state.supported === false && state.controlling === true) findings.push(issue("worker-unsupported-controller", "worker", "Controller cannot exist on unsupported platform", at));
  if (state.controlling === true && !state.controllerScript) findings.push(issue("worker-script-unknown", "worker", "Controller script UNKNOWN", at, "information"));
  if (state.controlling === true && !state.registrationScope) findings.push(issue("worker-scope-unknown", "worker", "Registration scope UNKNOWN", at, "information"));
  if (state.cacheNames !== null && new Set(state.cacheNames).size !== state.cacheNames.length) findings.push(issue("worker-cache-duplicate", "worker", "Duplicate cache name", at));
  if (state.cacheNames !== null && state.cacheNames.some((name) => !name.trim())) findings.push(issue("worker-cache-blank", "worker", "Unnamed cache", at));
  if (state.measuredAt !== null && (!Number.isFinite(state.measuredAt) || state.measuredAt < 0)) findings.push(issue("worker-time-invalid", "worker", "Invalid timestamp", at));
  if (state.updatePending === true && state.supported === false) findings.push(issue("worker-update-impossible", "worker", "Update reported without worker support", at));
  if (connection === "offline" && state.controlling === null) findings.push(issue("worker-offline-unknown", "worker", "Offline worker state UNKNOWN", at, "information"));
  if (state.controllerScript && localResourceUrl(state.controllerScript) === null) findings.push(issue("worker-script-url", "worker", "Worker script is not a local static path", at));
  return findings;
}
export function offlineFallbackFindings(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  if (snapshot.connectivity !== "offline") return findings;
  const ready = snapshot.phase === "ready";
  const successful = snapshot.resources.some((resource) => resource.phase === "success" && resource.cacheKey !== null);
  const uncertain = snapshot.resources.every((resource) => resource.phase !== "success") || snapshot.worker.controlling === null;
  if (ready && !successful && snapshot.resources.length > 0) findings.push(issue("offline-ready-without-evidence", snapshot.route, "Offline ready state has no successful cached resource", snapshot.observedAt));
  if (ready && uncertain) findings.push(issue("offline-readiness-unknown", snapshot.route, "Offline readiness cannot be established", snapshot.observedAt, "information"));
  if (snapshot.phase === "error" && !snapshot.announcements.some((message) => message.visible && message.politeness !== "off" && message.text.trim())) {
    findings.push(issue("offline-error-silent", snapshot.route, "Error has no accessible status", snapshot.observedAt));
  }
  if (snapshot.phase === "offline" && snapshot.announcements.length === 0) findings.push(issue("offline-state-silent", snapshot.route, "Offline state has no status message", snapshot.observedAt, "warning"));
  return findings;
}
export function resourceTransitionFindings(before: readonly CacheEntry[], after: readonly CacheEntry[], expected: "preserve" | "refresh" | "clear", at = 0): Finding[] {
  const findings: Finding[] = [];
  const mapped = new Map(after.map((entry) => [entry.url, entry]));
  for (const entry of before) {
    const current = mapped.get(entry.url);
    if (expected === "preserve" && !current) findings.push(issue("resource-lost", entry.url, "Preserved cache entry disappeared", at));
    if (expected === "preserve" && current?.cacheKey !== entry.cacheKey) findings.push(issue("resource-cache-key-drift", entry.url, "Cache key changed unexpectedly", at));
    if (expected === "clear" && current?.cacheKey) findings.push(issue("resource-clear-failed", entry.url, "Expected cleared cache entry", at));
    if (expected === "refresh" && current?.observedAt !== null && entry.observedAt !== null && current?.observedAt !== undefined && current.observedAt < entry.observedAt) findings.push(issue("resource-time-reversed", entry.url, "Refresh observation moved backwards", at));
    if (current?.phase === "success" && entry.phase === "UNKNOWN" && current.observedAt === entry.observedAt) findings.push(issue("resource-unexplained-upgrade", entry.url, "UNKNOWN changed without new observation", at));
  }
  return findings;
}
export function resourceBudgetSummary(resources: readonly CacheEntry[]): { bytes: number; unknown: number; overBudget: number; count: number } {
  let bytes = 0;
  let unknown = 0;
  let overBudget = 0;
  for (const entry of resources) {
    if (!knownNumber(entry.measuredBytes)) unknown += 1;
    else {
      bytes += Math.max(0, entry.measuredBytes);
      if (entry.measuredBytes > BUDGET_BYTES) overBudget += 1;
    }
  }
  return { bytes, unknown, overBudget, count: resources.length };
}
export function cacheConfidence(snapshot: PageSnapshot): "ready" | "not-ready" | "UNKNOWN" {
  if (snapshot.connectivity === "UNKNOWN" || snapshot.worker.controlling === null) return UNKNOWN;
  if (snapshot.connectivity === "online") return UNKNOWN;
  const resourceStates = snapshot.resources.map((entry) => entry.phase);
  if (resourceStates.length === 0 || resourceStates.includes("UNKNOWN") || resourceStates.includes("pending")) return UNKNOWN;
  if (resourceStates.some((state) => state === "failure" || state === "blocked")) return "not-ready";
  return snapshot.resources.every((entry) => entry.cacheKey !== null) ? "ready" : UNKNOWN;
}
export function safePrecacheList(resources: readonly CacheEntry[]): string[] {
  return [...new Set(resources.filter((entry) => entry.phase === "success" && entry.cacheKey !== null &&
    entry.measuredBytes !== null && entry.measuredBytes <= BUDGET_BYTES && entry.measuredBytes >= 0)
    .map((entry) => localResourceUrl(entry.url)).filter((entry): entry is string => entry !== null))].sort();
}
export function workerStateSummary(state: ServiceWorkerState): string {
  if (state.supported === null) return UNKNOWN;
  if (!state.supported) return "unsupported";
  if (state.controlling === null) return UNKNOWN;
  if (!state.controlling) return "uncontrolled";
  return state.updatePending === true ? "updating" : "controlling";
}
export function requestStatusClass(status: number | null): "success" | "redirect" | "failure" | "UNKNOWN" {
  if (status === null || !Number.isInteger(status) || status < 100 || status > 599) return UNKNOWN;
  if (status < 300) return "success";
  if (status < 400) return "redirect";
  return "failure";
}
export function missingOfflineResources(required: readonly string[], observed: readonly CacheEntry[]): string[] {
  const hits = new Set(observed.filter((item) => item.phase === "success" && item.cacheKey !== null).map((item) => localResourceUrl(item.url)));
  return required.filter((path) => !hits.has(path));
}
