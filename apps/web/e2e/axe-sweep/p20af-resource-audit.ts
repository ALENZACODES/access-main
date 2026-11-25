/** Per-resource offline replay audit: distinguishes observed responses from assumptions. */
import { dateIsValid, normalized, safeRoute, type Problem, type Locale } from "./p20af-transition-ledger.ts";
export type RequestState = "pending" | "fulfilled" | "failed" | "cancelled" | "unknown";
export type StoreState = "present" | "absent" | "stale" | "unknown";
export type Purpose = "document" | "script" | "style" | "image" | "font" | "data" | "other";
export type Sensitivity = "public" | "private" | "unknown";
export interface Resource {
  id: string;
  url: string;
  purpose: Purpose;
  method: string;
  requestState: RequestState;
  status: number | null;
  cache: StoreState;
  bytes: number | null;
  started: number | null;
  finished: number | null;
  sensitive: Sensitivity;
  licence: string | null;
  source: string | null;
  retrievedOn: string | null;
}
export interface Budget { maxEntryBytes: number; maxTotalBytes: number; maximumEntries: number; }
export interface Bundle { name: string; locale: Locale; resources: readonly Resource[]; version: string | null; }
export interface RequestEdge { fromId: string; toId: string; reason: string; mandatory: boolean; }
export interface RequestGraph { bundle: Bundle; edges: readonly RequestEdge[]; entryId: string; }
export interface ResourceFinding extends Problem { resource: string; }
const item = (code: string, at: number, resource: string, detail: string, severity: Problem["severity"] = "error"): ResourceFinding => ({ code, at, resource, detail, severity });
export const DEFAULT_BUDGET: Budget = { maxEntryBytes: 524288, maxTotalBytes: 5242880, maximumEntries: 200 };
export function resourceKey(value: string): string | null {
  if (!value || value.startsWith("//") || value.startsWith("javascript:") || value.startsWith("data:") || value.startsWith("blob:")) return null;
  if (value.startsWith("/")) return safeRoute(value) ? value : null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password || parsed.hash) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch { return null; }
}
export function allowedMethod(value: string): boolean { return ["GET", "HEAD"].includes(value.toUpperCase()); }
export function observedCompletion(resource: Resource): boolean {
  return resource.requestState === "fulfilled" && resource.status !== null &&
    Number.isInteger(resource.status) && resource.status >= 200 && resource.status < 400;
}
export function cacheClaim(resource: Resource): "usable" | "not-usable" | "unknown" {
  if (resource.cache === "present" && observedCompletion(resource)) return "usable";
  if (resource.cache === "absent" || resource.cache === "stale" || resource.requestState === "failed") return "not-usable";
  return "unknown";
}
export function resourceFindings(resource: Resource, at: number, budget: Budget = DEFAULT_BUDGET): ResourceFinding[] {
  const issues: ResourceFinding[] = [];
  const add = (code: string, detail: string, severity?: Problem["severity"]): void => { issues.push(item(code, at, resource.id, detail, severity)); };
  if (!resource.id.trim()) add("resource-id-empty", "Resource identifier is missing");
  if (resourceKey(resource.url) === null) add("resource-url-invalid", resource.url);
  if (!allowedMethod(resource.method)) add("resource-method-unsafe", resource.method);
  if (resource.requestState === "fulfilled" && resource.status === null) add("resource-status-unknown", "Response status is missing");
  if (resource.status !== null && (!Number.isInteger(resource.status) || resource.status < 100 || resource.status > 599)) add("resource-status-invalid", String(resource.status));
  if (resource.status !== null && resource.status >= 400 && resource.requestState === "fulfilled") add("resource-http-failed", String(resource.status));
  if (resource.requestState === "pending" && resource.finished !== null) add("resource-pending-finished", resource.id);
  if (resource.requestState === "cancelled" && observedCompletion(resource)) add("resource-cancelled-fulfilled", resource.id);
  if (resource.started !== null && (!Number.isFinite(resource.started) || resource.started < 0)) add("resource-start-invalid", String(resource.started));
  if (resource.finished !== null && (!Number.isFinite(resource.finished) || resource.finished < 0)) add("resource-finish-invalid", String(resource.finished));
  if (resource.started !== null && resource.finished !== null && resource.finished < resource.started) add("resource-time-reversed", resource.id);
  if (resource.bytes === null) add("resource-bytes-unknown", "Size is UNKNOWN", "information");
  else if (!Number.isInteger(resource.bytes) || resource.bytes < 0) add("resource-size-invalid", String(resource.bytes));
  else if (resource.bytes > budget.maxEntryBytes) add("resource-entry-budget", `${resource.bytes} > ${budget.maxEntryBytes}`);
  if (resource.sensitive === "private" && resource.cache === "present") add("resource-private-cached", resource.id);
  if (resource.sensitive === "unknown" && resource.cache === "present") add("resource-cache-sensitivity-unknown", resource.id, "information");
  if (resource.cache === "present" && resource.requestState === "failed") add("resource-stale-response", resource.id, "warning");
  if (normalized(resource.source) === "UNKNOWN") add("resource-source-unknown", resource.id, "information");
  if (normalized(resource.licence) === "UNKNOWN") add("resource-licence-unknown", resource.id, "information");
  if (!dateIsValid(resource.retrievedOn)) add("resource-date-unknown", resource.id, "information");
  return issues;
}
export function budgetFindings(bundle: Bundle, budget: Budget = DEFAULT_BUDGET): ResourceFinding[] {
  const issues: ResourceFinding[] = [];
  if (bundle.resources.length > budget.maximumEntries) issues.push(item("bundle-count-budget", 0, bundle.name, `${bundle.resources.length} > ${budget.maximumEntries}`));
  let total = 0;
  let unknown = false;
  const seen = new Set<string>();
  for (const [index, resource] of bundle.resources.entries()) {
    issues.push(...resourceFindings(resource, index, budget));
    if (seen.has(resource.id)) issues.push(item("bundle-duplicate-id", index, resource.id, resource.id));
    seen.add(resource.id);
    if (resource.bytes === null || !Number.isInteger(resource.bytes) || resource.bytes < 0) unknown = true;
    else total += resource.bytes;
  }
  if (total > budget.maxTotalBytes) issues.push(item("bundle-total-budget", 0, bundle.name, `${total} > ${budget.maxTotalBytes}`));
  if (unknown) issues.push(item("bundle-size-unknown", 0, bundle.name, "Total size cannot be established", "information"));
  return issues;
}
export function graphFindings(graph: RequestGraph): ResourceFinding[] {
  const issues = budgetFindings(graph.bundle);
  const ids = new Set(graph.bundle.resources.map((resource) => resource.id));
  if (!ids.has(graph.entryId)) issues.push(item("graph-entry-missing", 0, graph.entryId, graph.entryId));
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.fromId}>${edge.toId}`;
    if (edges.has(key)) issues.push(item("graph-edge-duplicate", 0, edge.toId, key));
    edges.add(key);
    if (!ids.has(edge.fromId)) issues.push(item("graph-from-missing", 0, edge.fromId, key));
    if (!ids.has(edge.toId)) issues.push(item("graph-to-missing", 0, edge.toId, key));
    if (!edge.reason.trim()) issues.push(item("graph-reason-unknown", 0, edge.toId, key, "information"));
  }
  return issues;
}
export function reachable(graph: RequestGraph): string[] {
  const known = new Set(graph.bundle.resources.map((resource) => resource.id));
  if (!known.has(graph.entryId)) return [];
  const visited = new Set<string>();
  const queue = [graph.entryId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) if (edge.fromId === current && known.has(edge.toId) && !visited.has(edge.toId)) queue.push(edge.toId);
  }
  return [...visited];
}
export function essentialOfflineFindings(graph: RequestGraph): ResourceFinding[] {
  const issues: ResourceFinding[] = [];
  const items = new Map(graph.bundle.resources.map((resource) => [resource.id, resource]));
  const visit = new Set(reachable(graph));
  for (const edge of graph.edges) {
    if (!edge.mandatory || !visit.has(edge.fromId)) continue;
    const next = items.get(edge.toId);
    if (!next) continue;
    const claim = cacheClaim(next);
    if (claim === "not-usable") issues.push(item("essential-offline-unavailable", 0, edge.toId, edge.reason));
    if (claim === "unknown") issues.push(item("essential-offline-unknown", 0, edge.toId, edge.reason, "information"));
  }
  return issues;
}
export function changedResource(left: Resource, right: Resource): string[] {
  const changed: string[] = [];
  if (left.id !== right.id) changed.push("id");
  if (left.url !== right.url) changed.push("url");
  if (left.cache !== right.cache) changed.push("cache");
  if (left.status !== right.status) changed.push("status");
  if (left.bytes !== right.bytes) changed.push("bytes");
  if (left.source !== right.source) changed.push("source");
  if (left.licence !== right.licence) changed.push("licence");
  if (left.retrievedOn !== right.retrievedOn) changed.push("retrievedOn");
  if (left.sensitive !== right.sensitive) changed.push("sensitive");
  return changed;
}
export function bundleDrift(before: Bundle, after: Bundle): ResourceFinding[] {
  const issues: ResourceFinding[] = [];
  const afterMap = new Map(after.resources.map((resource) => [resource.id, resource]));
  const beforeIds = new Set(before.resources.map((resource) => resource.id));
  for (const resource of before.resources) {
    const next = afterMap.get(resource.id);
    if (!next) { issues.push(item("bundle-resource-lost", 0, resource.id, resource.id)); continue; }
    for (const field of changedResource(resource, next)) issues.push(item("bundle-field-changed", 0, resource.id, field, "warning"));
  }
  for (const resource of after.resources) if (!beforeIds.has(resource.id)) issues.push(item("bundle-resource-added", 0, resource.id, resource.id, "information"));
  return issues;
}
export function graphSummary(graph: RequestGraph): { reachable: number; unreachable: string[]; unknown: string[]; unusable: string[] } {
  const ids = new Set(reachable(graph));
  return {
    reachable: ids.size,
    unreachable: graph.bundle.resources.filter((resource) => !ids.has(resource.id)).map((resource) => resource.id),
    unknown: graph.bundle.resources.filter((resource) => cacheClaim(resource) === "unknown").map((resource) => resource.id),
    unusable: graph.bundle.resources.filter((resource) => cacheClaim(resource) === "not-usable").map((resource) => resource.id),
  };
}
