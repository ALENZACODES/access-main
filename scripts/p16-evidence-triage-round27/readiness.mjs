/** Deterministic publication triage. No network, storage or implicit data upgrades. */
import { collectionIssues, dayOrdinal, finding, plain, sortFindings, validId } from "./contracts.mjs";

export const DECISIONS = Object.freeze(["READY", "HOLD", "UNKNOWN"]);
export const PRIORITIES = Object.freeze(["immediate", "high", "normal", "low"]);

export function policyOptions(value = {}) {
  if (!plain(value)) throw new TypeError("Policy must be an object");
  const policy = {
    asOf: value.asOf ?? "2026-11-19",
    maxSourceAgeDays: value.maxSourceAgeDays ?? 120,
    maxCacheAgeDays: value.maxCacheAgeDays ?? 30,
    maxCacheBytes: value.maxCacheBytes ?? 100_000_000,
    allowCommunity: value.allowCommunity ?? true,
    requirePairs: value.requirePairs ?? true,
    frenchTypography: value.frenchTypography ?? false,
  };
  if (dayOrdinal(policy.asOf) === null) throw new TypeError("Invalid asOf");
  for (const key of ["maxSourceAgeDays", "maxCacheAgeDays"]) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 0 || policy[key] > 36500) throw new TypeError(`Invalid ${key}`);
  }
  if (!Number.isSafeInteger(policy.maxCacheBytes) || policy.maxCacheBytes < 1 || policy.maxCacheBytes > 1_000_000_000) {
    throw new TypeError("Invalid maxCacheBytes");
  }
  if (typeof policy.allowCommunity !== "boolean" || typeof policy.requirePairs !== "boolean" ||
    typeof policy.frenchTypography !== "boolean") throw new TypeError("Invalid boolean policy");
  return Object.freeze(policy);
}

/** Compare two policy values without depending on process time or timezone. */
export function policyDifferences(left, right) {
  const before = policyOptions(left);
  const after = policyOptions(right);
  return Object.keys(before).filter((key) => before[key] !== after[key]).sort();
}

export function evidenceAge(source, asOf) {
  const collected = dayOrdinal(source?.collectedOn);
  const today = dayOrdinal(asOf);
  return collected === null || today === null ? null : today - collected;
}

export function cacheAge(cache, asOf) {
  const captured = dayOrdinal(cache?.capturedOn);
  const today = dayOrdinal(asOf);
  return captured === null || today === null ? null : today - captured;
}

export function sourceReadiness(source, inputPolicy = {}) {
  const rules = policyOptions(inputPolicy);
  if (!plain(source)) return { status: "HOLD", codes: ["source.missing"] };
  const codes = [];
  if (source.claim === "UNKNOWN" || source.tier === "UNKNOWN") return { status: "UNKNOWN", codes: ["source.unknown"] };
  if (source.claim !== "SUPPORTED") codes.push("source.unsupported");
  if (source.tier === "COMMUNITY" && !rules.allowCommunity) codes.push("source.community-restricted");
  const age = evidenceAge(source, rules.asOf);
  if (age === null) codes.push("source.missing-date");
  else if (age < 0) codes.push("source.future-date");
  else if (age > rules.maxSourceAgeDays) codes.push("source.stale");
  return { status: codes.length ? "HOLD" : "READY", codes };
}

export function cacheReadiness(cache, inputPolicy = {}) {
  const rules = policyOptions(inputPolicy);
  if (!plain(cache)) return { status: "HOLD", codes: ["cache.missing"] };
  if (cache.state === "UNKNOWN") return { status: "UNKNOWN", codes: ["cache.unknown"] };
  if (cache.state === "ABSENT") return { status: "HOLD", codes: ["cache.absent"] };
  const codes = [];
  if (cache.state !== "PRESENT") codes.push("cache.state");
  const age = cacheAge(cache, rules.asOf);
  if (age === null) codes.push("cache.missing-date");
  else if (age < 0) codes.push("cache.future-date");
  else if (age > rules.maxCacheAgeDays) codes.push("cache.stale");
  if (!Number.isSafeInteger(cache.bytes) || cache.bytes < 1) codes.push("cache.bytes");
  else if (cache.bytes > rules.maxCacheBytes) codes.push("cache.over-budget");
  return { status: codes.length ? "HOLD" : "READY", codes };
}

export function joinDecisions(results) {
  if (results.some((item) => item.status === "HOLD")) return "HOLD";
  if (results.some((item) => item.status === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

export function recordReadiness(record, inputPolicy = {}) {
  const policy = policyOptions(inputPolicy);
  const issues = collectionIssues([record], { ...policy, requirePairs: false });
  if (issues.some((item) => item.severity === "error")) {
    return { status: "HOLD", codes: [...new Set(issues.map((item) => item.code))].sort(), findings: issues };
  }
  if (record.access === "UNKNOWN") return { status: "UNKNOWN", codes: ["record.unknown"], findings: issues };
  if (record.access === "UNSUPPORTED") return { status: "HOLD", codes: ["record.unsupported"], findings: issues };
  const sources = record.sources.map((source) => sourceReadiness(source, policy));
  const cache = cacheReadiness(record.cache, policy);
  const status = joinDecisions([...sources, cache]);
  const codes = [...new Set([...sources.flatMap((item) => item.codes), ...cache.codes])].sort();
  return { status, codes, findings: issues };
}

export function batchReadiness(records, inputPolicy = {}) {
  const policy = policyOptions(inputPolicy);
  const findings = collectionIssues(records, policy);
  if (!Array.isArray(records)) {
    return { status: "HOLD", findings, pairs: [], totals: { READY: 0, HOLD: 0, UNKNOWN: 0 } };
  }
  const pairs = new Map();
  records.forEach((record, index) => {
    if (!plain(record) || !validId(record.translationKey)) return;
    const entry = pairs.get(record.translationKey) ?? [];
    entry.push({ index, record });
    pairs.set(record.translationKey, entry);
  });
  const results = [];
  for (const [translationKey, items] of pairs) {
    const decisions = items.map((item) => recordReadiness(item.record, policy));
    const languages = new Set(items.map((item) => item.record.language));
    const codes = [...new Set(decisions.flatMap((item) => item.codes))];
    if (policy.requirePairs && (!languages.has("en") || !languages.has("fr"))) codes.push("translation.missing");
    const pairFindings = findings.filter((issue) => items.some((item) => issue.path.startsWith(`records[${item.index}]`)));
    const isInvalid = pairFindings.some((item) => item.severity === "error");
    const status = isInvalid || codes.includes("translation.missing") ? "HOLD" : joinDecisions(decisions);
    results.push({ translationKey, status, codes: [...new Set(codes)].sort() });
  }
  results.sort((a, b) => a.translationKey.localeCompare(b.translationKey, "en"));
  const totals = { READY: 0, HOLD: 0, UNKNOWN: 0 };
  for (const item of results) totals[item.status] += 1;
  const status = findings.some((item) => item.severity === "error") ? "HOLD" : joinDecisions(results);
  return { status, findings, pairs: results, totals };
}

export function queueByStatus(result) {
  const queues = { READY: [], HOLD: [], UNKNOWN: [] };
  for (const item of result.pairs) queues[item.status].push(item.translationKey);
  return queues;
}

export function readinessTrends(records, dates, inputPolicy = {}) {
  if (!Array.isArray(dates) || dates.length > 366) throw new TypeError("Invalid date series");
  const history = [];
  let prior = null;
  for (const asOf of dates) {
    const day = dayOrdinal(asOf);
    if (day === null || (prior !== null && day <= prior)) throw new TypeError("Date series must increase");
    prior = day;
    const result = batchReadiness(records, { ...inputPolicy, asOf });
    history.push({ asOf, status: result.status, ...result.totals, findings: result.findings.length });
  }
  return history;
}

export function trendSignals(history) {
  const changes = [];
  for (let index = 1; index < history.length; index += 1) {
    const before = history[index - 1];
    const after = history[index];
    if (before.status !== after.status) changes.push({ asOf: after.asOf, code: "status.changed" });
    if (after.READY < before.READY) changes.push({ asOf: after.asOf, code: "ready.decreased" });
    if (after.HOLD > before.HOLD) changes.push({ asOf: after.asOf, code: "hold.increased" });
    if (after.UNKNOWN > before.UNKNOWN) changes.push({ asOf: after.asOf, code: "unknown.increased" });
  }
  return changes;
}

export function classifyFindingPriority(issue) {
  if (issue.severity === "error") return "high";
  if (issue.severity === "unknown") return "normal";
  if (issue.code.startsWith("fr.")) return "low";
  return "normal";
}

export function actionQueue(records, inputPolicy = {}) {
  const assessed = batchReadiness(records, inputPolicy);
  const queue = assessed.findings.map((issue) => ({
    code: issue.code,
    path: issue.path,
    priority: classifyFindingPriority(issue),
    action: issue.severity === "unknown" ? "RESEARCH" : issue.severity === "review" ? "REVIEW" : "REPAIR",
  }));
  assessed.pairs.forEach((pair) => {
    if (pair.status === "READY") return;
    for (const code of pair.codes) {
      queue.push({ code, path: `translations.${pair.translationKey}`, priority: "normal", action: pair.status === "UNKNOWN" ? "RESEARCH" : "REVIEW" });
    }
  });
  return queue.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

export function releaseGate(records, options = {}) {
  const result = batchReadiness(records, options);
  const outstanding = actionQueue(records, options);
  return {
    status: result.status,
    canPublish: result.status === "READY" && result.findings.length === 0,
    pairedRecords: result.pairs.length,
    findings: result.findings.length,
    outstandingActions: outstanding.length,
    unknownPairs: result.totals.UNKNOWN,
  };
}

export function reasonSummary(records, policy = {}) {
  const list = actionQueue(records, policy);
  const counts = new Map();
  for (const item of list) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code, "en"));
}

export function readinessIssues(records, options = {}) {
  const assessed = batchReadiness(records, options);
  const more = assessed.pairs.flatMap((pair) => pair.status === "READY" ? [] :
    pair.codes.map((code) => finding(`readiness.${code}`, `translations.${pair.translationKey}`, pair.status === "UNKNOWN" ? "unknown" : "review")));
  return sortFindings([...assessed.findings, ...more]);
}
