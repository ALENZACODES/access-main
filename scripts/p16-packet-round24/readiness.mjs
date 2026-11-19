import { ACCESS, DECISIONS, LOCALES, add, auditCollection, day, object, policy, sorted } from "./core.mjs";
import { auditRecordTypography, statusCopy } from "./locale.mjs";

/** Interpret observations conservatively; READY means cache publication only. */
/** @param {unknown} record @param {unknown} [options] */
export function assessPacketRecord(record, options = {}) {
  const rules = policy(options);
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  if (!object(record)) {
    add(findings, "record.object", "record");
    return { status: "HOLD", reasons: ["record.object"], findings };
  }
  const audited = auditCollection([record], options);
  findings.push(...audited.findings);
  findings.push(...auditRecordTypography(record, "records[0]"));
  if (findings.some((item) => item.severity === "error")) {
    return { status: "HOLD", reasons: [...new Set(findings.map((item) => item.code))], findings: sorted(findings) };
  }
  if (record.access === "unknown" || record.tier === "unknown" || record.cache.state === "unknown") {
    return { status: "UNKNOWN", reasons: ["evidence.unknown"], findings: sorted(findings) };
  }
  if (record.cache.state !== "stored") {
    return { status: "HOLD", reasons: ["cache.missing"], findings: sorted(findings) };
  }
  if (findings.some((finding) => finding.severity === "review")) {
    return { status: "HOLD", reasons: [...new Set(findings.filter((item) => item.severity === "review").map((item) => item.code))], findings: sorted(findings) };
  }
  return { status: "READY", reasons: [], findings: [] };
}

/** @param {unknown} records @param {unknown} [options] */
export function assessPacket(records, options = {}) {
  if (!Array.isArray(records)) return { status: "HOLD", decisions: [], findings: [{ code: "collection.array", path: "records", severity: "error" }] };
  const validation = auditCollection(records, options);
  const decisions = records.map((record, index) => {
    const evaluation = assessPacketRecord(record, options);
    const prefix = `records[${index}]`;
    return {
      index,
      status: evaluation.status,
      reasons: evaluation.reasons,
      findings: evaluation.findings.map((finding) => ({ ...finding, path: finding.path.replace("records[0]", prefix) })),
    };
  });
  const findings = sorted([...validation.findings, ...decisions.flatMap((item) => item.findings)]);
  if (findings.some((finding) => finding.severity === "error")) {
    return { status: "HOLD", decisions, findings };
  }
  const statuses = decisions.map((item) => item.status);
  const status = statuses.includes("HOLD") ? "HOLD" : statuses.includes("UNKNOWN") ? "UNKNOWN" : "READY";
  return { status, decisions, findings };
}

/** @param {ReturnType<typeof assessPacket>} packet */
export function readinessSummary(packet) {
  const counts = { READY: 0, HOLD: 0, UNKNOWN: 0 };
  for (const entry of packet.decisions) {
    if (DECISIONS.includes(entry.status)) counts[entry.status] += 1;
  }
  return { status: packet.status, counts, issueCount: packet.findings.length };
}

/** @param {unknown} record @param {unknown} options */
export function cacheLifetime(record, options = {}) {
  const rules = policy(options);
  if (!object(record) || !object(record.cache)) return { ageDays: null, expiresInDays: null, expired: null };
  if (record.cache.state !== "stored") return { ageDays: null, expiresInDays: null, expired: null };
  const saved = day(record.cache.savedOn);
  if (saved === null || saved > rules.today) return { ageDays: null, expiresInDays: null, expired: null };
  const ageDays = rules.today - saved;
  return { ageDays, expiresInDays: Math.max(0, rules.cacheMaxDays - ageDays), expired: ageDays > rules.cacheMaxDays };
}

/** @param {unknown} record @param {unknown} options */
export function sourceLifetime(record, options = {}) {
  const rules = policy(options);
  if (!object(record) || !object(record.source)) return { ageDays: null, status: "UNKNOWN" };
  const collected = day(record.source.collectedOn);
  if (collected === null || collected > rules.today) return { ageDays: null, status: "UNKNOWN" };
  const ageDays = rules.today - collected;
  return { ageDays, status: ageDays > rules.sourceMaxDays ? "HOLD" : "READY" };
}

/** @param {unknown} records @param {unknown} [options] */
export function publicationMatrix(records, options = {}) {
  const result = assessPacket(records, options);
  return result.decisions.map((decision) => {
    const record = Array.isArray(records) ? records[decision.index] : null;
    return {
      index: decision.index,
      recordId: object(record) && typeof record.id === "string" ? record.id : null,
      decision: decision.status,
      reasonCount: decision.reasons.length,
      cache: cacheLifetime(record, options),
      source: sourceLifetime(record, options),
    };
  });
}

/** @param {string} status */
export function confidenceBand(status) {
  if (status === "READY") return "available-copy";
  if (status === "HOLD") return "requires-review";
  return "UNKNOWN";
}

/** @param {string} status */
export function bilingualStatus(status) {
  return Object.freeze({ en: statusCopy(status, "en"), fr: statusCopy(status, "fr") });
}

/** @param {unknown} records @param {unknown} [options] */
export function publicationCounts(records, options = {}) {
  const result = assessPacket(records, options);
  const summary = readinessSummary(result);
  return { ...summary, total: result.decisions.length, bilingual: bilingualStatus(result.status), languages: [...LOCALES] };
}

/** @param {unknown} record */
export function supportedAccess(record) {
  if (!object(record)) return "UNKNOWN";
  if (!ACCESS.includes(record.access) || record.access === "unknown") return "UNKNOWN";
  return record.access;
}
