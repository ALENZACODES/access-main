/**
 * Offline publication policy. Read-only operations with explicit UNKNOWN
 * decisions. No returned result upgrades uncertain claims or missing sources.
 */
import {
  LANGUAGES, TIERS, auditCollection, calendarOrdinal, canonicalIdentifier,
  diagnostic, findRecordIssues, localCachePath, plainObject, sortDiagnostics,
} from "./contract.mjs";

export const DECISIONS = Object.freeze(["READY", "HOLD", "UNKNOWN"]);
export const PRIORITIES = Object.freeze(["critical", "high", "normal", "low"]);

export function policyOptions(input = {}) {
  if (!plainObject(input)) throw new TypeError("Policy must be an object");
  const asOf = input.asOf ?? "2026-11-19";
  const maximumAgeDays = input.maximumAgeDays ?? 90;
  const maximumCaptureAgeDays = input.maximumCaptureAgeDays ?? 30;
  const maximumBytes = input.maximumBytes ?? 50_000_000;
  const allowCommunity = input.allowCommunity ?? true;
  if (calendarOrdinal(asOf) === null) throw new TypeError("Invalid asOf date");
  if (!Number.isSafeInteger(maximumAgeDays) || maximumAgeDays < 0 || maximumAgeDays > 3650) {
    throw new TypeError("Invalid maximum age");
  }
  if (!Number.isSafeInteger(maximumCaptureAgeDays) || maximumCaptureAgeDays < 0 || maximumCaptureAgeDays > 3650) {
    throw new TypeError("Invalid maximum capture age");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 1_000_000_000) {
    throw new TypeError("Invalid maximum bytes");
  }
  if (typeof allowCommunity !== "boolean") throw new TypeError("Invalid community setting");
  return Object.freeze({ asOf, maximumAgeDays, maximumCaptureAgeDays, maximumBytes, allowCommunity });
}

export function sourceAge(source, asOf) {
  const date = calendarOrdinal(source?.collectedOn);
  const today = calendarOrdinal(asOf);
  return date === null || today === null ? null : today - date;
}

export function cacheAge(cache, asOf) {
  const captured = calendarOrdinal(cache?.capturedOn);
  const today = calendarOrdinal(asOf);
  return captured === null || today === null ? null : today - captured;
}

export function sourceDecision(source, policy) {
  const reasons = [];
  if (!plainObject(source)) return { decision: "HOLD", reasons: ["source.missing"] };
  if (source.tier === "UNKNOWN") return { decision: "UNKNOWN", reasons: ["source.unknownTier"] };
  if (!TIERS.includes(source.tier)) return { decision: "HOLD", reasons: ["source.invalidTier"] };
  if (source.tier === "COMMUNITY" && !policy.allowCommunity) reasons.push("source.communityDisabled");
  const age = sourceAge(source, policy.asOf);
  if (age === null) reasons.push("source.missingDate");
  else if (age < 0) reasons.push("source.futureDate");
  else if (age > policy.maximumAgeDays) reasons.push("source.stale");
  if (source.claim === "UNKNOWN") return { decision: "UNKNOWN", reasons: ["source.unknownClaim", ...reasons] };
  if (source.claim === "UNSUPPORTED") reasons.push("source.unsupported");
  return { decision: reasons.length ? "HOLD" : "READY", reasons };
}

export function cacheDecision(cache, policy) {
  if (!plainObject(cache)) return { decision: "HOLD", reasons: ["cache.missing"] };
  if (cache.state === "UNKNOWN") return { decision: "UNKNOWN", reasons: ["cache.unknownState"] };
  if (cache.state === "ABSENT") return { decision: "HOLD", reasons: ["cache.absent"] };
  const reasons = [];
  if (cache.state !== "PRESENT") reasons.push("cache.invalidState");
  if (!localCachePath(cache.path)) reasons.push("cache.invalidPath");
  const age = cacheAge(cache, policy.asOf);
  if (age === null) reasons.push("cache.missingDate");
  else if (age < 0) reasons.push("cache.futureDate");
  else if (age > policy.maximumCaptureAgeDays) reasons.push("cache.stale");
  if (!Number.isSafeInteger(cache.bytes) || cache.bytes < 1) reasons.push("cache.invalidBytes");
  else if (cache.bytes > policy.maximumBytes) reasons.push("cache.tooLarge");
  return { decision: reasons.length ? "HOLD" : "READY", reasons };
}

function combineDecisions(decisions) {
  if (decisions.some((result) => result.decision === "HOLD")) return "HOLD";
  if (decisions.some((result) => result.decision === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

export function recordReadiness(record, inputPolicy = {}) {
  const policy = policyOptions(inputPolicy);
  const diagnostics = findRecordIssues(record, "record", { asOf: policy.asOf });
  if (diagnostics.length) {
    return { decision: "HOLD", reasons: diagnostics.map((item) => item.code), diagnostics };
  }
  if (record.state === "UNKNOWN") {
    return { decision: "UNKNOWN", reasons: ["record.unknown"], diagnostics: [] };
  }
  if (record.state === "UNSUPPORTED") {
    return { decision: "HOLD", reasons: ["record.unsupported"], diagnostics: [] };
  }
  const sourceDecisions = record.sources.map((source) => sourceDecision(source, policy));
  const cache = cacheDecision(record.cache, policy);
  const decision = combineDecisions([...sourceDecisions, cache]);
  const reasons = [...sourceDecisions.flatMap((source) => source.reasons), ...cache.reasons];
  return { decision, reasons: [...new Set(reasons)].sort(), diagnostics: [] };
}

export function pairedReadiness(records, inputPolicy = {}) {
  const policy = policyOptions(inputPolicy);
  const audit = auditCollection(records, { asOf: policy.asOf, requireBothLanguages: true });
  const results = [];
  if (!Array.isArray(records)) {
    return { decision: "HOLD", findings: audit.findings, records: results, totals: { READY: 0, HOLD: 0, UNKNOWN: 0 } };
  }
  const pairs = new Map();
  for (const record of records) {
    if (!plainObject(record) || !canonicalIdentifier(record.translationKey)) continue;
    const list = pairs.get(record.translationKey) ?? [];
    list.push(record);
    pairs.set(record.translationKey, list);
  }
  for (const [key, pair] of pairs) {
    const decisions = pair.map((record) => recordReadiness(record, policy));
    const languages = new Set(pair.map((record) => record.language));
    const missing = LANGUAGES.filter((language) => !languages.has(language));
    const decision = missing.length ? "HOLD" : combineDecisions(decisions);
    const reasons = [...new Set([...decisions.flatMap((result) => result.reasons), ...missing.map((language) => `pair.missing.${language}`)])].sort();
    results.push({ translationKey: key, decision, reasons });
  }
  results.sort((a, b) => a.translationKey.localeCompare(b.translationKey, "en"));
  const totals = { READY: 0, HOLD: 0, UNKNOWN: 0 };
  for (const result of results) totals[result.decision] += 1;
  const decision = audit.findings.length ? "HOLD" : combineDecisions(results);
  return { decision, findings: audit.findings, records: results, totals };
}

export function readinessSummary(result) {
  return {
    decision: result.decision,
    pairs: result.records.length,
    ready: result.totals.READY,
    held: result.totals.HOLD,
    unknown: result.totals.UNKNOWN,
    findings: result.findings.length,
  };
}

export function candidateQueues(result) {
  const queues = { READY: [], HOLD: [], UNKNOWN: [] };
  for (const item of result.records) queues[item.decision].push(item.translationKey);
  return queues;
}

export function inspectPublicationWindow(records, dates, options = {}) {
  if (!Array.isArray(dates) || dates.length > 366) throw new TypeError("Invalid date series");
  const window = [];
  let previous = null;
  for (const date of dates) {
    const day = calendarOrdinal(date);
    if (day === null || (previous !== null && day <= previous)) throw new TypeError("Dates must increase");
    previous = day;
    const result = pairedReadiness(records, { ...options, asOf: date });
    window.push({ date, ...readinessSummary(result) });
  }
  return window;
}

export function transitionSignals(window) {
  const signals = [];
  for (let index = 1; index < window.length; index += 1) {
    const before = window[index - 1];
    const after = window[index];
    if (before.decision !== after.decision) signals.push({ date: after.date, code: "overall.decisionChanged" });
    if (before.ready > after.ready) signals.push({ date: after.date, code: "ready.decreased" });
    if (before.held < after.held) signals.push({ date: after.date, code: "held.increased" });
    if (before.unknown < after.unknown) signals.push({ date: after.date, code: "unknown.increased" });
  }
  return signals;
}

export function evidenceCoverage(records) {
  if (!Array.isArray(records)) return { sources: 0, knownTier: 0, unknownTier: 0, missingDates: 0 };
  let sources = 0;
  let knownTier = 0;
  let unknownTier = 0;
  let missingDates = 0;
  for (const record of records) {
    if (!Array.isArray(record?.sources)) continue;
    for (const source of record.sources) {
      sources += 1;
      if (source?.tier === "UNKNOWN") unknownTier += 1;
      else if (TIERS.includes(source?.tier)) knownTier += 1;
      if (calendarOrdinal(source?.collectedOn) === null) missingDates += 1;
    }
  }
  return { sources, knownTier, unknownTier, missingDates };
}

export function readinessIssues(records, policy = {}) {
  const result = pairedReadiness(records, policy);
  const findings = [...result.findings];
  result.records.forEach((pair) => {
    if (pair.decision === "READY") return;
    for (const code of pair.reasons) findings.push(diagnostic(`readiness.${code}`, `translations.${pair.translationKey}`, "warning"));
  });
  return sortDiagnostics(findings);
}
