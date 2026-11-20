/**
 * Pure audit for accessibility announcements, live regions and offline status.
 * An announcement is a record of an observed action, not an accessibility claim.
 */
import { objectRecord, safeCopy, safeIdentifier, hasControlCode } from "./switch-model.mjs";
export const LIVE_ROLES = Object.freeze(["status", "alert", "log", "timer", "marquee"]);
export const LIVE_POLICIES = Object.freeze(["polite", "assertive", "off"]);
export const OFFLINE_STATUSES = Object.freeze(["CACHED", "MISSING", "STALE", "UNKNOWN"]);
export const EVIDENCE_TIERS = Object.freeze(["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
export const ACCESS_STATES = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_EVENTS = 1000;

/** @param {unknown} value */
export function dayNumber(value) {
  if (typeof value !== "string") return null;
  const result = ISO_DAY.exec(value);
  if (!result) return null;
  const year = Number(result[1]);
  const month = Number(result[2]);
  const day = Number(result[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

/** @param {unknown} copy @param {unknown} language */
export function bilingualMessage(copy, language) {
  if (!objectRecord(copy) || !safeCopy(copy.en, 600) || !safeCopy(copy.fr, 600)) return "UNKNOWN";
  if (language === "en") return copy.en;
  if (language === "fr") return copy.fr;
  return "UNKNOWN";
}

/** @param {unknown} value */
export function auditMessage(value) {
  const findings = [];
  if (!objectRecord(value)) return [{ code: "message.object", path: "message" }];
  if (!safeIdentifier(value.id)) findings.push({ code: "message.id", path: "message.id" });
  if (!LIVE_ROLES.includes(value.role)) findings.push({ code: "message.role", path: "message.role" });
  if (!LIVE_POLICIES.includes(value.live)) findings.push({ code: "message.live", path: "message.live" });
  if (typeof value.atomic !== "boolean") findings.push({ code: "message.atomic", path: "message.atomic" });
  if (typeof value.relevant !== "string" || !["additions", "text", "all", "removals"].includes(value.relevant)) {
    findings.push({ code: "message.relevant", path: "message.relevant" });
  }
  if (!safeCopy(value.copy?.en, 600)) findings.push({ code: "message.en", path: "message.copy.en" });
  if (!safeCopy(value.copy?.fr, 600)) findings.push({ code: "message.fr", path: "message.copy.fr" });
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) findings.push({ code: "message.sequence", path: "message.sequence" });
  if (value.role === "alert" && value.live === "off") findings.push({ code: "message.silent-alert", path: "message.live" });
  if (value.role === "status" && value.live === "assertive") findings.push({ code: "message.interrupting-status", path: "message.live" });
  if (value.hidden === true || value.inert === true) findings.push({ code: "message.hidden", path: "message" });
  return findings;
}

/** @param {unknown} events */
export function auditMessageEvents(events) {
  const findings = [];
  if (!Array.isArray(events)) return [{ code: "events.array", path: "events" }];
  if (events.length > MAX_EVENTS) findings.push({ code: "events.limit", path: "events" });
  let previous = -1;
  const ids = new Set();
  events.forEach((event, index) => {
    const path = `events[${index}]`;
    const result = auditMessage(event);
    for (const issue of result) findings.push({ code: issue.code, path: `${path}.${issue.path}` });
    if (!objectRecord(event)) return;
    if (safeIdentifier(event.id) && ids.has(event.id)) findings.push({ code: "events.duplicate", path: `${path}.id` });
    if (safeIdentifier(event.id)) ids.add(event.id);
    if (Number.isSafeInteger(event.sequence)) {
      if (event.sequence <= previous) findings.push({ code: "events.order", path: `${path}.sequence` });
      previous = event.sequence;
    }
    if (event.action === "CANCEL" && event.live === "assertive") {
      findings.push({ code: "events.cancel-interrupt", path: `${path}.live` });
    }
  });
  return findings;
}

/** @param {unknown} before @param {unknown} after */
export function compareLiveText(before, after) {
  if (typeof before !== "string" || typeof after !== "string") return { changed: false, status: "UNKNOWN" };
  if (hasControlCode(before) || hasControlCode(after)) return { changed: false, status: "UNKNOWN" };
  return { changed: before !== after, status: before === after ? "UNCHANGED" : "CHANGED" };
}

/** @param {unknown} evidence */
export function auditOfflineEvidence(evidence) {
  const findings = [];
  if (!objectRecord(evidence)) return [{ code: "evidence.object", path: "evidence" }];
  if (!safeIdentifier(evidence.id)) findings.push({ code: "evidence.id", path: "evidence.id" });
  if (!OFFLINE_STATUSES.includes(evidence.cache)) findings.push({ code: "evidence.cache", path: "evidence.cache" });
  if (!EVIDENCE_TIERS.includes(evidence.tier)) findings.push({ code: "evidence.tier", path: "evidence.tier" });
  if (!ACCESS_STATES.includes(evidence.access)) findings.push({ code: "evidence.access", path: "evidence.access" });
  if (!safeCopy(evidence.publisher, 240)) findings.push({ code: "evidence.publisher", path: "evidence.publisher" });
  if (!safeCopy(evidence.licence, 120)) findings.push({ code: "evidence.licence", path: "evidence.licence" });
  if (dayNumber(evidence.collectedOn) === null) findings.push({ code: "evidence.date", path: "evidence.collectedOn" });
  if (evidence.access === "UNKNOWN" && evidence.tier !== "UNKNOWN") {
    findings.push({ code: "evidence.unknown-tier", path: "evidence.tier" });
  }
  if (evidence.cache === "CACHED" && !safeIdentifier(evidence.cacheId)) {
    findings.push({ code: "evidence.cache-id", path: "evidence.cacheId" });
  }
  if (evidence.cache !== "CACHED" && evidence.cacheId !== null) {
    findings.push({ code: "evidence.unexpected-cache-id", path: "evidence.cacheId" });
  }
  return findings;
}

/** @param {unknown} evidence */
export function offlineDecision(evidence) {
  const issues = auditOfflineEvidence(evidence);
  if (issues.length) return { decision: "HOLD", reasons: issues.map((item) => item.code) };
  if (evidence.cache === "UNKNOWN" || evidence.access === "UNKNOWN" || evidence.tier === "UNKNOWN") {
    return { decision: "UNKNOWN", reasons: ["evidence.unknown"] };
  }
  if (evidence.cache !== "CACHED") return { decision: "HOLD", reasons: ["evidence.not-cached"] };
  if (evidence.access !== "SUPPORTED") return { decision: "HOLD", reasons: ["evidence.unsupported"] };
  return { decision: "READY", reasons: [] };
}

/** @param {unknown} evidence @param {unknown} language */
export function offlineAnnouncement(evidence, language) {
  if (language !== "en" && language !== "fr") return "UNKNOWN";
  const result = offlineDecision(evidence);
  if (result.decision === "UNKNOWN") return "UNKNOWN";
  if (result.decision === "READY") return language === "en" ? "Offline copy available" : "Copie hors ligne disponible";
  return language === "en" ? "Offline copy unavailable" : "Copie hors ligne indisponible";
}

/** @param {unknown} events */
export function announcementSummary(events) {
  const issues = auditMessageEvents(events);
  if (!Array.isArray(events)) return { decision: "UNKNOWN", events: 0, issues: issues.length };
  return { decision: issues.length ? "HOLD" : "READY", events: events.length, issues: issues.length };
}

/** @param {unknown} events */
export function announcementInventory(events) {
  if (!Array.isArray(events)) return [];
  return events.filter(objectRecord).map((event) => ({
    id: safeIdentifier(event.id) ? event.id : null,
    role: LIVE_ROLES.includes(event.role) ? event.role : "UNKNOWN",
    live: LIVE_POLICIES.includes(event.live) ? event.live : "UNKNOWN",
    atomic: event.atomic === true,
    sequence: Number.isSafeInteger(event.sequence) ? event.sequence : null,
    bilingual: safeCopy(event.copy?.en, 600) && safeCopy(event.copy?.fr, 600),
  }));
}

/** @param {unknown} snapshots */
export function detectAnnouncementStorm(snapshots) {
  if (!Array.isArray(snapshots)) return [{ code: "storm.array", path: "snapshots" }];
  const issues = [];
  let consecutive = 0;
  let previous = "";
  snapshots.forEach((value, index) => {
    if (!safeCopy(value, 600)) return;
    if (value === previous) consecutive += 1;
    else consecutive = 1;
    if (consecutive >= 4) issues.push({ code: "storm.repeated", path: `snapshots[${index}]` });
    previous = value;
  });
  return issues;
}

/** @param {unknown} before @param {unknown} after */
export function eventDelta(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return { status: "UNKNOWN", added: [], removed: [] };
  const old = new Set(before.filter((item) => safeIdentifier(item?.id)).map((item) => item.id));
  const current = new Set(after.filter((item) => safeIdentifier(item?.id)).map((item) => item.id));
  return {
    status: "READY",
    added: [...current].filter((id) => !old.has(id)).sort(),
    removed: [...old].filter((id) => !current.has(id)).sort(),
  };
}

/** @param {unknown} events */
export function replayAnnouncements(events) {
  if (!Array.isArray(events)) return { status: "UNKNOWN", latest: null, count: 0 };
  if (auditMessageEvents(events).length) return { status: "HOLD", latest: null, count: events.length };
  const latest = events.at(-1) ?? null;
  return { status: "READY", latest: latest?.id ?? null, count: events.length };
}
