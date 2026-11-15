import { validateDirectoryRecord } from "./directory.ts";
import {
  FINDER_KINDS,
  type ModuleContext,
  type ModuleId,
  type ModuleRegistry,
  type ModuleResult,
} from "./modules.ts";
import { findForbiddenKeys, validateProvenance, type FieldIssue, type Provenance } from "./provenance.ts";
import { canonicalTierFromForeign } from "./tiers.ts";

/**
 * Checks a lane module's result against the shell contract before the shell
 * shows it. A result that fails is replaced by an empty `error` result, so
 * the screen never lists a record without a source, a licence, a date, and a
 * tier. The checker does not repair records and does not fill in values.
 */

const AVAILABILITY = new Set(["stub", "ready", "error"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  return !Number.isNaN(new Date(value.length === 10 ? `${value}T00:00:00Z` : value).getTime());
}

function provenanceIssues(item: Record<string, unknown>, at: string): FieldIssue[] {
  return validateProvenance(item.provenance as Provenance | undefined, `${at}.provenance`);
}

function needText(item: Record<string, unknown>, key: string, at: string): FieldIssue[] {
  return nonEmpty(item[key]) ? [] : [{ field: `${at}.${key}`, code: key === "id" ? "missing_id" : "empty_title" }];
}

/** Item-level rules for each route. Exported for lane repositories that copy the contract tests. */
export function checkModuleItem(id: ModuleId, item: unknown, at = "items[0]"): FieldIssue[] {
  if (!isRecord(item)) return [{ field: at, code: "not_an_object" }];
  const issues: FieldIssue[] = [];
  switch (id) {
    case "places":
      issues.push(...needText(item, "id", at), ...needText(item, "name", at), ...provenanceIssues(item, at));
      break;
    case "journey":
      issues.push(...needText(item, "id", at), ...needText(item, "summary", at), ...provenanceIssues(item, at));
      if (item.liveStatus !== "unavailable") issues.push({ field: `${at}.liveStatus`, code: "live_status_claimed" });
      break;
    case "finders":
      issues.push(...needText(item, "id", at), ...needText(item, "name", at), ...provenanceIssues(item, at));
      if (!(FINDER_KINDS as readonly unknown[]).includes(item.kind)) issues.push({ field: `${at}.kind`, code: "invalid_enum" });
      if (item.detail !== "unknown") issues.push({ field: `${at}.detail`, code: "measurement_claimed" });
      break;
    case "navigator":
      issues.push(...validateDirectoryRecord(item).map((issue) => ({ ...issue, field: `${at}.${issue.field}` })));
      if (canonicalTierFromForeign(item.verificationTier) !== "E") {
        issues.push({ field: `${at}.verificationTier`, code: "invalid_tier" });
      }
      break;
    case "games":
      issues.push(...needText(item, "id", at), ...needText(item, "title", at));
      if (item.clinicalClaim !== false) issues.push({ field: `${at}.clinicalClaim`, code: "clinical_claim" });
      if (item.seizureRiskFlash !== false) issues.push({ field: `${at}.seizureRiskFlash`, code: "flash" });
      if (item.keyboardOperable !== true) issues.push({ field: `${at}.keyboardOperable`, code: "not_keyboard_operable" });
      break;
    case "help":
      issues.push(...needText(item, "id", at), ...needText(item, "title", at), ...provenanceIssues(item, at));
      if (item.locale !== "en" && item.locale !== "fr") issues.push({ field: `${at}.locale`, code: "invalid_enum" });
      break;
  }
  // Provenance is checked above; this catches health or credential keys anywhere else in the item.
  const rest: Record<string, unknown> = { ...item };
  delete rest.provenance;
  issues.push(...findForbiddenKeys(rest, at));
  return issues;
}

/** Result-level and item-level rules. An empty list means the shell may show the result. */
export function checkModuleResult(id: ModuleId, result: unknown): FieldIssue[] {
  if (!isRecord(result)) return [{ field: "result", code: "not_an_object" }];
  const issues: FieldIssue[] = [];
  if (result.moduleId !== id) issues.push({ field: "moduleId", code: "wrong_module" });
  if (!AVAILABILITY.has(result.availability as string)) issues.push({ field: "availability", code: "invalid_enum" });
  if (result.liveStatus !== "unavailable") issues.push({ field: "liveStatus", code: "live_status_claimed" });
  if (!nonEmpty(result.messageKey)) issues.push({ field: "messageKey", code: "missing_message" });
  if (result.asOf !== null && !(typeof result.asOf === "string" && isIsoDateTime(result.asOf))) {
    issues.push({ field: "asOf", code: "invalid_date" });
  }
  if (!Array.isArray(result.items)) {
    issues.push({ field: "items", code: "not_an_array" });
    return issues;
  }
  if (result.availability !== "ready" && result.items.length > 0) {
    issues.push({ field: "items", code: "items_without_ready" });
  }
  const seen = new Set<string>();
  result.items.forEach((item, index) => {
    const at = `items[${index}]`;
    issues.push(...checkModuleItem(id, item, at));
    const itemId = isRecord(item) ? item.id : undefined;
    if (typeof itemId === "string") {
      if (seen.has(itemId)) issues.push({ field: `${at}.id`, code: "duplicate_id" });
      seen.add(itemId);
    }
  });
  return issues;
}

function errorResult<T>(id: ModuleId, messageKey: string): ModuleResult<T> {
  return { moduleId: id, availability: "error", items: [], messageKey, asOf: null, liveStatus: "unavailable" };
}

/** Last check the shell made of each route. Read by tests and the technical note. Not stored. */
export const lastContractIssues = new Map<ModuleId, FieldIssue[]>();

async function guarded<T>(id: ModuleId, call: () => Promise<ModuleResult<T>>): Promise<ModuleResult<T>> {
  let result: ModuleResult<T>;
  try {
    result = await call();
  } catch {
    lastContractIssues.set(id, [{ field: "result", code: "module_threw" }]);
    return errorResult(id, "modules.error");
  }
  const issues = checkModuleResult(id, result);
  lastContractIssues.set(id, issues);
  return issues.length > 0 ? errorResult(id, "modules.contractError") : result;
}

/** Wraps every route so a failing or nonconforming lane module returns an empty error result. */
export function guardModules(registry: ModuleRegistry): ModuleRegistry {
  return {
    places: { id: "places", search: (query, ctx) => guarded("places", () => registry.places.search(query, ctx)) },
    journey: { id: "journey", plan: (request, ctx) => guarded("journey", () => registry.journey.plan(request, ctx)) },
    finders: { id: "finders", search: (query, ctx) => guarded("finders", () => registry.finders.search(query, ctx)) },
    navigator: { id: "navigator", list: (ctx: ModuleContext) => guarded("navigator", () => registry.navigator.list(ctx)) },
    games: { id: "games", list: (ctx: ModuleContext) => guarded("games", () => registry.games.list(ctx)) },
    help: { id: "help", list: (ctx: ModuleContext) => guarded("help", () => registry.help.list(ctx)) },
  };
}
