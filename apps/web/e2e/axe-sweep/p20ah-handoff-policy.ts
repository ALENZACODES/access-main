/** P20AH: fail-closed, read-only offline handoff policy. No facts are inferred. */
export type Locale = "en" | "fr";
export type Tri = "yes" | "no" | "UNKNOWN";
export type LinkState = "online" | "offline" | "UNKNOWN";
export type AuditSeverity = "block" | "warning" | "information";
export type SourceTier = "A" | "B" | "C" | "D" | "E" | "UNKNOWN";
export interface Provenance {
  readonly source: string | null;
  readonly licence: string | null;
  readonly retrievedOn: string | null;
  readonly tier: SourceTier;
}
export interface EvidenceItem {
  readonly id: string;
  readonly label: string | null;
  readonly value: string | null;
  readonly state: "KNOWN" | "UNKNOWN";
  readonly provenance: Provenance;
}
export interface Handoff {
  readonly id: string;
  readonly schema: number;
  readonly locale: Locale;
  readonly originRoute: string;
  readonly createdOn: string | null;
  readonly connection: LinkState;
  readonly sourceOfCopy: "screen" | "saved" | "UNKNOWN";
  readonly records: readonly EvidenceItem[];
  readonly purpose: "take-along" | "review" | "UNKNOWN";
  readonly redacted: boolean;
}
export interface Diagnostic {
  readonly code: string;
  readonly severity: AuditSeverity;
  readonly field: string;
  readonly detail: string;
}
export interface Snapshot {
  readonly route: string;
  readonly locale: Locale;
  readonly connection: LinkState;
  readonly activeId: string | null;
  readonly heading: string | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error" | "UNKNOWN";
  readonly records: readonly EvidenceItem[];
}
export interface Transfer {
  readonly kind: "export" | "import" | "navigate" | "locale" | "disconnect" | "reconnect" | "retry" | "back" | "forward";
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly handoff: Handoff | null;
  readonly focusShouldRemain: boolean;
  readonly recordsShouldRemain: boolean;
}

const UNKNOWN_WORDS = new Set(["", "unknown", "inconnu", "inconnue", "n/a", "none", "null", "undefined", "—", "-"]);
export function canonical(value: string | null | undefined): string {
  if (value == null) return "UNKNOWN";
  const normalized = value.trim().replace(/\s+/g, " ");
  return UNKNOWN_WORDS.has(normalized.toLowerCase()) ? "UNKNOWN" : normalized;
}
export function dateIsValid(value: string | null): boolean {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const values = value.split("-").map(Number);
  const y = values[0]; const m = values[1]; const d = values[2];
  if (y === undefined || m === undefined || d === undefined || y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}
export function routeIsSafe(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || /[?#\\*:]/.test(route)) return false;
  if (route.split("/").some((p) => p === "." || p === "..")) return false;
  for (const char of route) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  return true;
}
export function provenanceComplete(p: Provenance): boolean {
  return canonical(p.source) !== "UNKNOWN" && canonical(p.licence) !== "UNKNOWN" &&
    dateIsValid(p.retrievedOn) && p.tier !== "UNKNOWN";
}
export function valueKnown(item: EvidenceItem): boolean {
  return item.state === "KNOWN" && item.id.trim().length > 0 && canonical(item.label) !== "UNKNOWN" &&
    canonical(item.value) !== "UNKNOWN" && provenanceComplete(item.provenance);
}
export function provenanceKey(item: EvidenceItem): string {
  const p = item.provenance;
  return JSON.stringify([item.id, canonical(p.source), canonical(p.licence), p.retrievedOn ?? "UNKNOWN", p.tier]);
}
export function stableValueKey(item: EvidenceItem): string {
  return JSON.stringify([item.id, canonical(item.value), item.state, provenanceKey(item)]);
}
function problem(code: string, severity: AuditSeverity, field: string, detail: string): Diagnostic {
  return { code, severity, field, detail };
}
export function evidenceDiagnostics(item: EvidenceItem): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (!item.id.trim()) errors.push(problem("evidence-id-empty", "block", "id", "Identifier absent"));
  if (canonical(item.label) === "UNKNOWN") errors.push(problem("evidence-label-unknown", "information", item.id, "Label UNKNOWN"));
  if (canonical(item.value) === "UNKNOWN" && item.state === "KNOWN") {
    errors.push(problem("evidence-known-without-value", "block", item.id, "KNOWN requires evidence value"));
  }
  if (item.state === "KNOWN" && !provenanceComplete(item.provenance)) {
    errors.push(problem("evidence-known-without-provenance", "block", item.id, "Missing source metadata"));
  }
  if (canonical(item.provenance.source) === "UNKNOWN") errors.push(problem("evidence-source-unknown", "information", item.id, "Source UNKNOWN"));
  if (canonical(item.provenance.licence) === "UNKNOWN") errors.push(problem("evidence-licence-unknown", "information", item.id, "Licence UNKNOWN"));
  if (!dateIsValid(item.provenance.retrievedOn)) errors.push(problem("evidence-date-unknown", "information", item.id, "Date UNKNOWN"));
  if (item.provenance.tier === "UNKNOWN") errors.push(problem("evidence-tier-unknown", "information", item.id, "Tier UNKNOWN"));
  return errors;
}
export function handoffDiagnostics(packet: Handoff): Diagnostic[] {
  const issues: Diagnostic[] = [];
  if (!packet.id.trim()) issues.push(problem("handoff-id-empty", "block", "id", "Packet identifier missing"));
  if (packet.schema !== 1) issues.push(problem("handoff-schema", "block", "schema", String(packet.schema)));
  if (!routeIsSafe(packet.originRoute)) issues.push(problem("handoff-route", "block", "originRoute", packet.originRoute));
  if (!dateIsValid(packet.createdOn)) issues.push(problem("handoff-created-unknown", "information", "createdOn", "UNKNOWN"));
  if (packet.sourceOfCopy === "UNKNOWN") issues.push(problem("handoff-origin-unknown", "information", "sourceOfCopy", "UNKNOWN"));
  if (packet.purpose === "UNKNOWN") issues.push(problem("handoff-purpose-unknown", "information", "purpose", "UNKNOWN"));
  if (!packet.redacted) issues.push(problem("handoff-redaction-unconfirmed", "warning", "redacted", "No redaction attestation"));
  if (packet.records.length === 0) issues.push(problem("handoff-empty", "information", "records", "No records supplied"));
  const seen = new Set<string>();
  for (const item of packet.records) {
    issues.push(...evidenceDiagnostics(item));
    if (seen.has(item.id)) issues.push(problem("handoff-duplicate-record", "block", item.id, "Repeated identifier"));
    seen.add(item.id);
  }
  return issues;
}
export function screenDiagnostics(snapshot: Snapshot): Diagnostic[] {
  const issues: Diagnostic[] = [];
  if (!routeIsSafe(snapshot.route)) issues.push(problem("screen-route-unsafe", "block", "route", snapshot.route));
  if (canonical(snapshot.heading) === "UNKNOWN") issues.push(problem("screen-heading-missing", "block", "heading", "No exposed heading"));
  if (snapshot.status === "loading" && snapshot.connection === "offline") {
    issues.push(problem("screen-loading-offline", "warning", "status", "Loading while disconnected"));
  }
  if (snapshot.status === "ready" && snapshot.records.length === 0) {
    issues.push(problem("screen-ready-without-records", "information", "records", "An empty ready state needs review"));
  }
  const seen = new Set<string>();
  for (const item of snapshot.records) {
    if (seen.has(item.id)) issues.push(problem("screen-duplicate-evidence", "block", item.id, "Duplicate record"));
    seen.add(item.id);
    issues.push(...evidenceDiagnostics(item));
  }
  return issues;
}
export function transferDiagnostics(transition: Transfer): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const { before, after } = transition;
  if (transition.kind === "locale") {
    if (before.locale === after.locale) issues.push(problem("locale-did-not-change", "block", "locale", before.locale));
    if (before.route !== after.route) issues.push(problem("locale-lost-route", "block", "route", after.route));
  } else if (before.locale !== after.locale) issues.push(problem("locale-changed-unexpectedly", "block", "locale", after.locale));
  if (["disconnect", "reconnect", "retry", "export", "import"].includes(transition.kind) && before.route !== after.route) {
    issues.push(problem("route-changed-unexpectedly", "block", "route", after.route));
  }
  if (transition.kind === "disconnect" && after.connection !== "offline") {
    issues.push(problem("disconnect-not-observed", "block", "connection", after.connection));
  }
  if (transition.kind === "reconnect" && after.connection !== "online") {
    issues.push(problem("reconnect-not-observed", "block", "connection", after.connection));
  }
  if (transition.kind === "retry" && before.status !== "error") {
    issues.push(problem("retry-without-error", "warning", "status", before.status));
  }
  if (transition.focusShouldRemain && before.activeId !== after.activeId) {
    issues.push(problem("focus-not-preserved", "block", "activeId", `${before.activeId ?? "UNKNOWN"} → ${after.activeId ?? "UNKNOWN"}`));
  }
  if (transition.recordsShouldRemain) {
    const records = new Map(after.records.map((item) => [item.id, item]));
    for (const original of before.records) {
      const retained = records.get(original.id);
      if (!retained) issues.push(problem("record-lost", "block", original.id, "Record absent after transition"));
      else if (provenanceKey(original) !== provenanceKey(retained)) {
        issues.push(problem("record-source-drift", "block", original.id, "Source metadata changed"));
      } else if (stableValueKey(original) !== stableValueKey(retained)) {
        issues.push(problem("record-value-drift", "warning", original.id, "Observed value changed"));
      }
    }
  }
  if (transition.kind === "export") {
    if (!transition.handoff) issues.push(problem("export-missing-packet", "block", "handoff", "No packet"));
    else {
      issues.push(...handoffDiagnostics(transition.handoff).filter((finding) => finding.severity === "block"));
      if (transition.handoff.locale !== before.locale) issues.push(problem("export-locale-mismatch", "block", "locale", transition.handoff.locale));
      if (transition.handoff.originRoute !== before.route) issues.push(problem("export-route-mismatch", "block", "originRoute", transition.handoff.originRoute));
    }
  }
  return issues;
}
export function traceDiagnostics(initial: Snapshot, transitions: readonly Transfer[]): Diagnostic[] {
  const issues = screenDiagnostics(initial);
  let cursor = initial;
  for (const [index, step] of transitions.entries()) {
    if (JSON.stringify(cursor) !== JSON.stringify(step.before)) {
      issues.push(problem("trace-disconnected", "block", String(index), "Before snapshot does not match previous after"));
    }
    issues.push(...transferDiagnostics(step));
    issues.push(...screenDiagnostics(step.after));
    cursor = step.after;
  }
  return issues;
}
export function blockingDiagnostics(issues: readonly Diagnostic[]): Diagnostic[] {
  return issues.filter((issue) => issue.severity === "block");
}
export function summarizeDiagnostics(issues: readonly Diagnostic[], maximum = 30): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive integer");
  const distinct = [...new Set(issues.map((entry) => `${entry.severity} ${entry.code} ${entry.field}: ${entry.detail}`))];
  const more = Math.max(0, distinct.length - maximum);
  return [...distinct.slice(0, maximum), ...(more > 0 ? [`${more} additional findings`] : [])].join("\n");
}
