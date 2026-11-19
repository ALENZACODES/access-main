/** Consistency gates for evidence metadata across route, locale and offline states. */
export type Locale = "en" | "fr";
export type Connectivity = "online" | "offline";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type Field = "source" | "licence" | "date" | "tier";
export type EvidenceKind = "observation" | "official-page" | "demonstration" | "unspecified";
export interface EvidenceValue { readonly state: Knowledge; readonly value: string | null; }
export interface EvidenceItem {
  readonly id: string;
  readonly title: string;
  readonly locale: Locale;
  readonly kind: EvidenceKind;
  readonly source: EvidenceValue;
  readonly licence: EvidenceValue;
  readonly date: EvidenceValue;
  readonly tier: EvidenceValue;
  readonly links: readonly string[];
  readonly isDemonstration: boolean;
  readonly observedAt: string | null;
  readonly retrievedAt: string | null;
  readonly localOnly: boolean;
}
export interface EvidenceFrame {
  readonly route: string;
  readonly locale: Locale;
  readonly connectivity: Connectivity;
  readonly asOf: string;
  readonly records: readonly EvidenceItem[];
  readonly pending: boolean;
  readonly sourceStatus: string;
  readonly visibleCount: number | null;
}
export interface EvidenceTransition {
  readonly action: "navigate" | "language" | "disconnect" | "reconnect" | "refresh" | "filter" | "reset";
  readonly from: EvidenceFrame;
  readonly to: EvidenceFrame;
  readonly expectedRoute?: string;
  readonly expectedLocale?: Locale;
  readonly removedIds?: readonly string[];
}
export interface Finding { readonly rule: string; readonly owner: string; readonly detail: string; }
const fields = ["source", "licence", "date", "tier"] as const;
const finding = (rule: string, owner: string, detail: string): Finding => ({ rule, owner, detail });
const normal = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
const unknownLabels = new Set(["unknown", "inconnu", "inconnue", "not provided", "non fourni", "non fournie", "n/a", "—", "-"]);

export function isUnknownLabel(value: string | null): boolean {
  return value === null || !normal(value) || unknownLabels.has(normal(value).toLocaleLowerCase());
}
export function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d || m > 12) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= ([31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0);
}
export function openLicense(value: string | null): boolean {
  if (!value) return false;
  return /(?:^|\b)(?:cc0(?:-1\.0)?|cc[- ]by(?:-4\.0)?|odbl(?:-1\.0)?|open government licence|licence du gouvernement ouvert|ogl[- ](?:ontario|canada))(?:\b|$)/i.test(value);
}
export function evidenceValueFindings(field: Field, value: EvidenceValue, owner: string): Finding[] {
  const problems: Finding[] = [];
  if (value.state === "UNKNOWN") {
    if (value.value !== null && !isUnknownLabel(value.value)) problems.push(finding("unknown-with-fact", owner, `${field}: ${value.value}`));
    return problems;
  }
  if (isUnknownLabel(value.value)) {
    problems.push(finding("known-without-fact", owner, field));
    return problems;
  }
  if (field === "date" && !validDate(value.value)) problems.push(finding("malformed-date", owner, value.value ?? ""));
  if (field === "licence" && !openLicense(value.value)) problems.push(finding("unsupported-licence", owner, value.value ?? ""));
  if (field === "tier" && !/^(?:0|1|2|3|4|E)$/i.test(normal(value.value ?? ""))) problems.push(finding("unsupported-tier", owner, value.value ?? ""));
  return problems;
}
export function evidenceItemFindings(item: EvidenceItem, asOf: string): Finding[] {
  const problems: Finding[] = [];
  const owner = item.id || "unidentified";
  if (!normal(item.id)) problems.push(finding("missing-id", owner, "Record identifier absent"));
  if (!normal(item.title)) problems.push(finding("missing-title", owner, "Record title absent"));
  for (const field of fields) problems.push(...evidenceValueFindings(field, item[field], owner));
  if (item.kind === "demonstration" && !item.isDemonstration) problems.push(finding("demo-unmarked", owner, "Demonstration lacks label"));
  if (item.isDemonstration && item.kind === "official-page") problems.push(finding("demo-official-conflict", owner, "Sample cannot be an official page"));
  if (item.kind === "unspecified" && fields.every((field) => item[field].state === "KNOWN")) {
    problems.push(finding("unspecified-origin", owner, "Origin not identified"));
  }
  if (item.observedAt !== null && !validDate(item.observedAt)) problems.push(finding("invalid-observation-date", owner, item.observedAt));
  if (item.retrievedAt !== null && !validDate(item.retrievedAt)) problems.push(finding("invalid-retrieval-date", owner, item.retrievedAt));
  if (item.retrievedAt && validDate(item.retrievedAt) && validDate(asOf) && item.retrievedAt > asOf) {
    problems.push(finding("future-retrieval", owner, item.retrievedAt));
  }
  if (item.observedAt && validDate(item.observedAt) && validDate(asOf) && item.observedAt > asOf) {
    problems.push(finding("future-observation", owner, item.observedAt));
  }
  if (item.observedAt && item.retrievedAt && validDate(item.observedAt) && validDate(item.retrievedAt) && item.observedAt > item.retrievedAt) {
    problems.push(finding("observation-after-retrieval", owner, `${item.observedAt} > ${item.retrievedAt}`));
  }
  const links = new Set<string>();
  for (const link of item.links) {
    if (links.has(link)) problems.push(finding("duplicate-link", owner, link));
    links.add(link);
    if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(link)) problems.push(finding("unsafe-source-link", owner, link));
  }
  if (item.source.state === "KNOWN" && item.links.length === 0 && item.kind !== "observation") {
    problems.push(finding("source-without-link", owner, "Source is not actionable"));
  }
  if (!item.localOnly && item.kind === "demonstration") problems.push(finding("demonstration-not-local", owner, "Sample must not be uploaded"));
  return problems;
}
export function frameFindings(frame: EvidenceFrame): Finding[] {
  const problems: Finding[] = [];
  if (!frame.route.startsWith("/") || frame.route.startsWith("//") || /[?#\\]/.test(frame.route)) problems.push(finding("invalid-route", frame.route, "Route is not a local static path"));
  if (!validDate(frame.asOf)) problems.push(finding("invalid-as-of", frame.route, frame.asOf));
  if (frame.visibleCount !== null && frame.visibleCount !== frame.records.length && !frame.pending) problems.push(finding("count-disagreement", frame.route, `${frame.visibleCount} vs ${frame.records.length}`));
  const seen = new Set<string>();
  for (const record of frame.records) {
    if (seen.has(record.id)) problems.push(finding("duplicate-record", frame.route, record.id));
    seen.add(record.id);
    if (record.locale !== frame.locale) problems.push(finding("record-locale-mismatch", record.id, `${record.locale} vs ${frame.locale}`));
    problems.push(...evidenceItemFindings(record, frame.asOf));
  }
  if (frame.connectivity === "offline" && frame.pending && /live|current|real.time/i.test(frame.sourceStatus)) {
    problems.push(finding("offline-live-claim", frame.route, frame.sourceStatus));
  }
  return problems;
}
export function evidenceConflict(before: EvidenceItem, after: EvidenceItem): Finding[] {
  const problems: Finding[] = [];
  for (const field of fields) {
    const initial = before[field];
    const next = after[field];
    if (initial.state === "UNKNOWN" && next.state === "KNOWN" && isUnknownLabel(next.value)) {
      problems.push(finding("invented-evidence", after.id, field));
    }
    if (initial.state === "KNOWN" && next.state === "KNOWN" && normal(initial.value ?? "") !== normal(next.value ?? "")) {
      problems.push(finding("changed-evidence", after.id, `${field} changed without a new record`));
    }
  }
  if (before.kind !== after.kind) problems.push(finding("changed-kind", after.id, `${before.kind} to ${after.kind}`));
  if (before.isDemonstration !== after.isDemonstration) problems.push(finding("changed-demo-status", after.id, "Demonstration label changed"));
  if (before.localOnly && !after.localOnly) problems.push(finding("local-data-escaped", after.id, "Local record is now shareable"));
  return problems;
}
export function transitionFindings(change: EvidenceTransition): Finding[] {
  const problems = [...frameFindings(change.to)];
  const { from, to } = change;
  if (change.action !== "navigate" && from.route !== to.route) problems.push(finding("unexpected-navigation", to.route, from.route));
  if (change.expectedRoute && change.expectedRoute !== to.route) problems.push(finding("wrong-route", to.route, change.expectedRoute));
  if (change.action === "language") {
    if (change.expectedLocale && change.expectedLocale !== to.locale) problems.push(finding("language-mismatch", to.route, change.expectedLocale));
  } else if (from.locale !== to.locale) problems.push(finding("language-drift", to.route, `${from.locale} to ${to.locale}`));
  if (change.action === "disconnect" && to.connectivity !== "offline") problems.push(finding("offline-not-applied", to.route, to.connectivity));
  if (change.action === "reconnect" && to.connectivity !== "online") problems.push(finding("online-not-applied", to.route, to.connectivity));
  const previous = new Map(from.records.map((record) => [record.id, record]));
  const current = new Map(to.records.map((record) => [record.id, record]));
  for (const [id, record] of current) {
    const old = previous.get(id);
    if (!old) continue;
    if (change.action === "language" || change.action === "navigate" || change.action === "disconnect" || change.action === "reconnect") {
      problems.push(...evidenceConflict(old, record));
    }
  }
  if ((change.action === "language" || change.action === "disconnect" || change.action === "reconnect") && !to.pending) {
    for (const id of previous.keys()) if (!current.has(id) && !change.removedIds?.includes(id)) {
      problems.push(finding("record-disappeared", to.route, id));
    }
  }
  if (change.action === "filter" && change.removedIds) {
    for (const id of change.removedIds) if (current.has(id)) problems.push(finding("filter-did-not-remove", to.route, id));
  }
  if (change.action === "reset" && change.removedIds?.length) {
    for (const id of change.removedIds) if (!current.has(id)) problems.push(finding("reset-did-not-restore", to.route, id));
  }
  return problems;
}
export interface EvidenceJourney { readonly steps: readonly EvidenceTransition[]; readonly expectedLocales: readonly Locale[]; readonly mustRemainLocal: boolean; }
export function journeyFindings(journey: EvidenceJourney): Finding[] {
  const problems: Finding[] = [];
  for (const [index, step] of journey.steps.entries()) {
    problems.push(...transitionFindings(step));
    if (index > 0 && journey.steps[index - 1]?.to.asOf !== step.from.asOf) problems.push(finding("journey-gap", step.from.route, String(index)));
    if (!journey.expectedLocales.includes(step.to.locale)) problems.push(finding("journey-locale", step.to.route, step.to.locale));
    if (journey.mustRemainLocal) for (const record of step.to.records) {
      if (!record.localOnly) problems.push(finding("journey-remote-record", step.to.route, record.id));
    }
  }
  return problems;
}
export function findingCodes(items: readonly Finding[]): string[] { return items.map((item) => item.rule); }
export function displayFindings(items: readonly Finding[], limit = 30): string {
  const unique = [...new Set(items.map((item) => `${item.rule} ${item.owner}: ${item.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} more findings`] : [])].join("\n");
}
