import { UNKNOWN, finding, type Finding, type Connection, type Availability } from "./p20an-evidence.ts";
import { type Screen, type Sequence } from "./p20an-interactions.ts";
/** Offline availability is measured, never inferred from a service worker alone. */
export interface CachedResource {
  readonly url: string;
  readonly cached: Availability;
  readonly bytes: number | null;
  readonly contentType: string | null;
  readonly required: boolean;
  readonly responseOk: boolean | null;
}
export interface ResourceBudget {
  readonly maximumEntryBytes: number;
  readonly maximumTotalBytes: number;
  readonly totalBytes: number | null;
}
export interface OfflineObservation {
  readonly route: string;
  readonly connection: Connection;
  readonly serviceWorker: "controlling" | "not-controlling" | "UNKNOWN";
  readonly cacheNames: readonly string[] | null;
  readonly resources: readonly CachedResource[];
  readonly fallbackVisible: boolean | null;
  readonly retryAvailable: boolean | null;
  readonly testedAt: string | null;
}
export interface RecoveryObservation {
  readonly before: OfflineObservation;
  readonly after: OfflineObservation;
  readonly beforeScreen: Screen;
  readonly afterScreen: Screen;
  readonly action: "disconnect" | "reconnect" | "retry";
}
export const DEFAULT_ENTRY_CAP = 524288;
export const DEFAULT_TOTAL_CAP = 8 * 1024 * 1024;
export function resourceSafe(url: string): boolean {
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return false;
  const forbidden = ["javascript:", "data:", "blob:"];
  if (forbidden.some((value) => url.toLowerCase().includes(value))) return false;
  return !url.split("/").some((part) => part === ".." || part === ".");
}
export function resourceFindings(item: CachedResource, route: string, budget: ResourceBudget): Finding[] {
  const issues: Finding[] = [];
  if (!resourceSafe(item.url)) issues.push(finding("resource-path-unsafe", route, item.url));
  if (item.bytes === null || !Number.isSafeInteger(item.bytes) || item.bytes < 0) {
    issues.push(finding("resource-size-UNKNOWN", route, item.url, "information"));
  } else if (item.bytes > budget.maximumEntryBytes) issues.push(finding("resource-entry-over-budget", route, item.url));
  if (item.required && item.cached === "absent") issues.push(finding("required-resource-absent", route, item.url));
  if (item.required && item.cached === UNKNOWN) issues.push(finding("required-resource-UNKNOWN", route, item.url, "information"));
  if (item.cached === "present" && item.responseOk === false) issues.push(finding("resource-response-invalid", route, item.url));
  if (item.required && !item.contentType?.trim()) issues.push(finding("resource-content-type-UNKNOWN", route, item.url, "information"));
  return issues;
}
export function resourceBudgetFindings(items: readonly CachedResource[], budget: ResourceBudget, route: string): Finding[] {
  const failures = items.flatMap((item) => resourceFindings(item, route, budget));
  if (!Number.isSafeInteger(budget.maximumEntryBytes) || budget.maximumEntryBytes < 1 ||
      !Number.isSafeInteger(budget.maximumTotalBytes) || budget.maximumTotalBytes < 1) {
    failures.push(finding("budget-invalid", route, "Budget must use positive integers"));
  }
  if (budget.totalBytes === null || !Number.isSafeInteger(budget.totalBytes) || budget.totalBytes < 0) {
    failures.push(finding("budget-total-UNKNOWN", route, UNKNOWN, "information"));
  } else if (budget.totalBytes > budget.maximumTotalBytes) {
    failures.push(finding("budget-total-exceeded", route, String(budget.totalBytes)));
  }
  const observed = items.every((item) => item.bytes !== null && Number.isSafeInteger(item.bytes) && item.bytes >= 0);
  if (observed && budget.totalBytes !== null) {
    const sum = items.reduce((n, item) => n + (item.bytes ?? 0), 0);
    if (sum > budget.totalBytes) failures.push(finding("budget-inconsistent", route, `${sum} > ${budget.totalBytes}`));
  }
  return failures;
}
export function offlineFindings(observation: OfflineObservation, budget: ResourceBudget): Finding[] {
  const failures = resourceBudgetFindings(observation.resources, budget, observation.route);
  if (observation.connection === "offline" && observation.serviceWorker === UNKNOWN) {
    failures.push(finding("worker-state-UNKNOWN", observation.route, UNKNOWN, "information"));
  }
  if (observation.connection === "offline" && observation.resources.some((item) => item.required && item.cached === "absent") && observation.fallbackVisible !== true) {
    failures.push(finding("offline-fallback-not-observed", observation.route, "Missing required resources"));
  }
  if (observation.connection === "offline" && observation.fallbackVisible === null) {
    failures.push(finding("offline-fallback-UNKNOWN", observation.route, UNKNOWN, "information"));
  }
  if (observation.cacheNames === null) failures.push(finding("cache-inventory-UNKNOWN", observation.route, UNKNOWN, "information"));
  if (observation.cacheNames && new Set(observation.cacheNames).size !== observation.cacheNames.length) {
    failures.push(finding("cache-name-duplicate", observation.route, "Repeated cache name"));
  }
  return failures;
}
export function recoveryFindings(recovery: RecoveryObservation): Finding[] {
  const errors: Finding[] = [];
  const { before, after } = recovery;
  if (before.route !== after.route) errors.push(finding("recovery-route-changed", after.route, before.route));
  if (recovery.action === "disconnect" && after.connection !== "offline") errors.push(finding("recovery-disconnect-not-observed", after.route, after.connection));
  if (recovery.action === "reconnect" && after.connection !== "online") errors.push(finding("recovery-reconnect-not-observed", after.route, after.connection));
  if (recovery.action === "retry" && before.retryAvailable !== true) errors.push(finding("recovery-retry-not-available", after.route, UNKNOWN));
  if (recovery.beforeScreen.locale !== recovery.afterScreen.locale) errors.push(finding("recovery-language-changed", after.route, recovery.afterScreen.locale));
  if (recovery.beforeScreen.route !== recovery.afterScreen.route) errors.push(finding("recovery-page-lost", after.route, recovery.afterScreen.route));
  if (recovery.beforeScreen.focusId && recovery.afterScreen.focusId === null) errors.push(finding("recovery-focus-lost", after.route, recovery.beforeScreen.focusId));
  return errors;
}
export function expectedOfflineMatrix(routes: readonly string[]): ReadonlyArray<{ route: string; connection: Connection }> {
  return routes.flatMap((route) => (["online", "offline", UNKNOWN] as const).map((connection) => ({ route, connection })));
}
export function coverageMissing(expected: ReturnType<typeof expectedOfflineMatrix>, actual: ReturnType<typeof expectedOfflineMatrix>): string[] {
  const present = new Set(actual.map((cell) => `${cell.route}|${cell.connection}`));
  return expected.filter((cell) => !present.has(`${cell.route}|${cell.connection}`)).map((cell) => `${cell.route}|${cell.connection}`);
}
export function unknownCount(snapshot: OfflineObservation): number {
  return (snapshot.connection === UNKNOWN ? 1 : 0) +
    (snapshot.serviceWorker === UNKNOWN ? 1 : 0) +
    (snapshot.cacheNames === null ? 1 : 0) +
    (snapshot.fallbackVisible === null ? 1 : 0) +
    snapshot.resources.filter((item) => item.cached === UNKNOWN || item.bytes === null).length;
}
export function recoverySequenceSummary(sequence: Sequence): Readonly<{ steps: number; offline: number; online: number; unknown: number }> {
  let offline = 0, online = 0, unknown = 0;
  for (const step of sequence.steps) {
    if (step.after.connection === "offline") offline += 1;
    else if (step.after.connection === "online") online += 1;
    else unknown += 1;
  }
  return { steps: sequence.steps.length, offline, online, unknown };
}
