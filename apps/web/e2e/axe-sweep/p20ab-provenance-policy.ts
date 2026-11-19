/**
 * Provenance and uncertainty lifecycle for records seen by the accessibility UI.
 * All observations are read-only; UNKNOWN never becomes a positive evidence claim.
 */
export type Language = "en" | "fr";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type Connection = "online" | "offline" | "UNKNOWN";
export type State = "ready" | "loading" | "empty" | "error" | "UNKNOWN";
export type Decision = "PASS" | "BLOCKED" | "UNKNOWN";
export type EvidenceField = "source" | "licence" | "date" | "tier";
export type EvidenceTier = "0" | "1" | "2" | "3" | "4" | "E" | "UNKNOWN";
export type IssueLevel = "error" | "warning" | "information";

export interface SourceRecord {
  readonly id: string;
  readonly name: Readonly<Partial<Record<Language, string>>>;
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly tier: string | null;
  readonly sourceUrl: string | null;
  readonly observedAt: string | null;
  readonly localOnly: boolean;
  readonly demonstration: boolean;
}
export interface EvidenceView {
  readonly route: string;
  readonly language: Language;
  readonly connection: Connection;
  readonly state: State;
  readonly records: readonly SourceRecord[];
  readonly statusMessage: string;
  readonly errors: readonly string[];
  readonly asOf: string | null;
  readonly savedOnDevice: boolean | null;
}
export interface EvidenceTransition {
  readonly kind: "language" | "offline" | "online" | "navigate" | "refresh" | "retry" | "filter";
  readonly before: EvidenceView;
  readonly after: EvidenceView;
  readonly expectedLanguage?: Language;
  readonly expectedRoute?: string;
  readonly changedRecordsAllowed?: boolean;
}
export interface Issue {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
  readonly level: IssueLevel;
}
export interface Inspection {
  readonly decision: Decision;
  readonly observed: number;
  readonly known: number;
  readonly unknown: number;
  readonly issues: readonly Issue[];
}

const unknownNames = new Set([
  "", "unknown", "inconnu", "inconnue", "non fourni", "non fournie",
  "not provided", "not known", "not available", "n/a", "—", "–", "-", "s.o.",
]);
const knownTiers = new Set(["0", "1", "2", "3", "4", "E"]);
const sourceSchemes = new Set(["https:", "http:"]);
const issue = (code: string, path: string, detail: string, level: IssueLevel = "error"): Issue => ({ code, path, detail, level });
const clean = (text: string): string => text.normalize("NFC").replace(/\s+/g, " ").trim();
const normalized = (text: string): string => clean(text).toLocaleLowerCase();

export function evidenceUnknown(value: string | null | undefined): boolean {
  return value == null || unknownNames.has(normalized(value));
}
export function evidenceTier(value: string | null | undefined): EvidenceTier {
  if (evidenceUnknown(value)) return "UNKNOWN";
  return value && knownTiers.has(value.trim().toUpperCase()) ? value.trim().toUpperCase() as EvidenceTier : "UNKNOWN";
}
export function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (monthDays[month - 1] ?? 0);
}
export function safeSourceLink(value: string | null): boolean | null {
  if (evidenceUnknown(value)) return null;
  try {
    const url = new URL(value!);
    return sourceSchemes.has(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
export function licenceKind(value: string | null): "open" | "restricted" | "UNKNOWN" {
  if (evidenceUnknown(value)) return "UNKNOWN";
  if (/\b(cc0|cc-by|odbl|open government licence|licence du gouvernement ouvert|og[lL])\b/i.test(value!)) return "open";
  if (/\b(all rights reserved|proprietary|exclusive licence|restricted)\b/i.test(value!)) return "restricted";
  return "UNKNOWN";
}
export function nameInLanguage(record: SourceRecord, language: Language): string | null {
  const value = record.name[language];
  return value && !evidenceUnknown(value) ? clean(value) : null;
}
export function recordIdentity(record: SourceRecord): string | null {
  return record.id.trim() || null;
}
export function metadataKnowledge(record: SourceRecord): Knowledge {
  if (!recordIdentity(record)) return "UNKNOWN";
  if (evidenceUnknown(record.source) || evidenceUnknown(record.licence) || evidenceUnknown(record.date) || evidenceUnknown(record.tier)) return "UNKNOWN";
  if (!validDate(record.date) || evidenceTier(record.tier) === "UNKNOWN") return "UNKNOWN";
  if (licenceKind(record.licence) !== "open") return "UNKNOWN";
  if (safeSourceLink(record.sourceUrl) !== true) return "UNKNOWN";
  return "KNOWN";
}
export function recordIssues(record: SourceRecord, language: Language, path: string): Issue[] {
  const problems: Issue[] = [];
  if (!recordIdentity(record)) problems.push(issue("record-id", path, "Record identifier missing"));
  if (!nameInLanguage(record, language)) problems.push(issue("record-name", path, `${record.id}: ${language}`));
  if (evidenceUnknown(record.source)) problems.push(issue("source-unknown", path, record.id, "information"));
  if (evidenceUnknown(record.licence)) problems.push(issue("licence-unknown", path, record.id, "information"));
  else if (licenceKind(record.licence) === "restricted") problems.push(issue("licence-restricted", path, record.id, "warning"));
  else if (licenceKind(record.licence) === "UNKNOWN") problems.push(issue("licence-unclassified", path, record.id, "information"));
  if (evidenceUnknown(record.date)) problems.push(issue("source-date-unknown", path, record.id, "information"));
  else if (!validDate(record.date)) problems.push(issue("source-date-invalid", path, record.id));
  if (evidenceTier(record.tier) === "UNKNOWN") problems.push(issue("source-tier-unknown", path, record.id, "information"));
  const link = safeSourceLink(record.sourceUrl);
  if (link === false) problems.push(issue("source-link-unsafe", path, record.id));
  if (link === null) problems.push(issue("source-link-unknown", path, record.id, "information"));
  if (record.observedAt !== null && !validDate(record.observedAt)) problems.push(issue("observation-date-invalid", path, record.id));
  if (record.localOnly && record.sourceUrl) problems.push(issue("local-record-external-link", path, record.id, "warning"));
  if (record.demonstration && evidenceTier(record.tier) === "4") problems.push(issue("demonstration-live-claim", path, record.id));
  return problems;
}
export function evidenceViewIssues(view: EvidenceView): Issue[] {
  const problems: Issue[] = [];
  const seen = new Set<string>();
  if (view.route.length === 0 || !view.route.startsWith("/")) problems.push(issue("view-route", view.route, "Invalid route"));
  if (!validDate(view.asOf) && !evidenceUnknown(view.asOf)) problems.push(issue("view-asof-invalid", view.route, view.asOf!));
  if (view.state === "UNKNOWN") problems.push(issue("view-state-unknown", view.route, "UNKNOWN", "information"));
  if (view.connection === "UNKNOWN") problems.push(issue("connection-unknown", view.route, "UNKNOWN", "information"));
  if (view.state === "empty" && view.records.length > 0) problems.push(issue("empty-with-records", view.route, String(view.records.length)));
  if (view.state === "ready" && view.records.length === 0) problems.push(issue("ready-without-records", view.route, "No records", "warning"));
  if (view.state === "error" && view.errors.length === 0) problems.push(issue("silent-error", view.route, "No error feedback"));
  if (view.state === "loading" && !/load|chargement/i.test(view.statusMessage)) problems.push(issue("silent-loading", view.route, "No loading feedback"));
  if (view.connection === "offline" && !view.savedOnDevice && view.state === "ready" && view.records.length > 0) {
    problems.push(issue("offline-data-origin-unknown", view.route, "Ready data without a stored pack", "warning"));
  }
  for (const record of view.records) {
    if (seen.has(record.id)) problems.push(issue("duplicate-record", view.route, record.id));
    seen.add(record.id);
    problems.push(...recordIssues(record, view.language, view.route));
  }
  return problems;
}
export function inspectEvidence(view: EvidenceView): Inspection {
  const issues = evidenceViewIssues(view);
  const known = view.records.filter((record) => metadataKnowledge(record) === "KNOWN").length;
  const unknown = view.records.length - known;
  return {
    decision: issues.some((entry) => entry.level === "error") ? "BLOCKED" : unknown > 0 || view.connection === "UNKNOWN" ? "UNKNOWN" : "PASS",
    observed: view.records.length,
    known,
    unknown,
    issues,
  };
}
export function diffEvidence(before: EvidenceView, after: EvidenceView): Issue[] {
  const problems: Issue[] = [];
  const baseline = new Map(before.records.map((record) => [record.id, record]));
  for (const current of after.records) {
    const previous = baseline.get(current.id);
    if (!previous) continue;
    for (const key of ["source", "licence", "date", "tier", "sourceUrl"] as const) {
      const oldValue = previous[key];
      const newValue = current[key];
      if (oldValue === newValue) continue;
      if (!evidenceUnknown(oldValue) && evidenceUnknown(newValue)) problems.push(issue("evidence-lost", after.route, `${current.id}: ${key}`));
      if (evidenceUnknown(oldValue) && !evidenceUnknown(newValue)) problems.push(issue("evidence-added", after.route, `${current.id}: ${key}`, "information"));
      if (!evidenceUnknown(oldValue) && !evidenceUnknown(newValue) && oldValue !== newValue) {
        problems.push(issue("evidence-changed", after.route, `${current.id}: ${key}`, "warning"));
      }
    }
  }
  return problems;
}
export function evidenceTransitionIssues(transition: EvidenceTransition): Issue[] {
  const { before, after, kind } = transition;
  const problems = evidenceViewIssues(after);
  if (kind !== "navigate" && before.route !== after.route) problems.push(issue("route-changed", after.route, kind));
  if (kind === "navigate" && transition.expectedRoute && transition.expectedRoute !== after.route) {
    problems.push(issue("destination-mismatch", after.route, transition.expectedRoute));
  }
  if (kind === "language") {
    if (!transition.expectedLanguage) problems.push(issue("language-unknown", after.route, "UNKNOWN", "information"));
    else if (after.language !== transition.expectedLanguage) problems.push(issue("language-mismatch", after.route, transition.expectedLanguage));
  } else if (before.language !== after.language) problems.push(issue("unexpected-locale", after.route, kind));
  if (kind === "offline" && after.connection !== "offline") problems.push(issue("offline-not-applied", after.route, String(after.connection)));
  if (kind === "online" && after.connection !== "online") problems.push(issue("online-not-applied", after.route, String(after.connection)));
  if (kind === "retry" && after.state === "error" && before.state === "error") problems.push(issue("retry-still-error", after.route, "Error persists", "warning"));
  if ((kind === "language" || kind === "offline" || kind === "online") && !transition.changedRecordsAllowed) {
    problems.push(...diffEvidence(before, after).filter((entry) => entry.code !== "evidence-added"));
  }
  if (kind === "filter" && after.records.some((record) => !before.records.some((old) => old.id === record.id))) {
    problems.push(issue("filter-added-record", after.route, "Filter cannot invent records"));
  }
  return problems;
}
export function inspectTransitions(transitions: readonly EvidenceTransition[]): Inspection {
  const issues = transitions.flatMap(evidenceTransitionIssues);
  const last = transitions.at(-1)?.after;
  if (!last) return { decision: "UNKNOWN", observed: 0, known: 0, unknown: 0, issues: [issue("no-transitions", "/", "No observations", "information")] };
  const report = inspectEvidence(last);
  return {
    decision: issues.some((entry) => entry.level === "error") ? "BLOCKED" : report.decision === "PASS" && issues.length === 0 ? "PASS" : "UNKNOWN",
    observed: report.observed, known: report.known, unknown: report.unknown, issues,
  };
}
export function countsByTier(records: readonly SourceRecord[]): Readonly<Record<EvidenceTier, number>> {
  const result: Record<EvidenceTier, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, E: 0, UNKNOWN: 0 };
  for (const record of records) result[evidenceTier(record.tier)] += 1;
  return result;
}
export function recordsByKnowledge(records: readonly SourceRecord[]): { known: readonly SourceRecord[]; unknown: readonly SourceRecord[] } {
  return { known: records.filter((record) => metadataKnowledge(record) === "KNOWN"), unknown: records.filter((record) => metadataKnowledge(record) === "UNKNOWN") };
}
export function recordSetIdentity(records: readonly SourceRecord[]): string {
  return [...records.map((record) => record.id)].sort().join("|");
}
export function missingTranslations(records: readonly SourceRecord[]): readonly string[] {
  return records.filter((record) => !nameInLanguage(record, "en") || !nameInLanguage(record, "fr")).map((record) => record.id);
}
export function unsafeSourceRecords(records: readonly SourceRecord[]): readonly string[] {
  return records.filter((record) => safeSourceLink(record.sourceUrl) === false).map((record) => record.id);
}
export function issueSummary(issues: readonly Issue[]): Readonly<Record<IssueLevel, number>> {
  return { error: issues.filter((entry) => entry.level === "error").length,
    warning: issues.filter((entry) => entry.level === "warning").length,
    information: issues.filter((entry) => entry.level === "information").length };
}
export function formatEvidenceIssues(issues: readonly Issue[], limit = 50): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const lines = [...new Set(issues.map((entry) => `${entry.level} ${entry.code} ${entry.path}: ${entry.detail}`))];
  return [...lines.slice(0, limit), ...(lines.length > limit ? [`${lines.length - limit} additional findings`] : [])].join("\n");
}
