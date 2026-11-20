/** Deterministic journey observations: never infer a fact from missing evidence. */
export type Locale = "en" | "fr";
export type Connection = "online" | "offline" | "unknown";
export type Status = "idle" | "loading" | "ready" | "empty" | "error";
export type Finding = Readonly<{ code: string; step: number; detail: string }>;
export type Provenance = Readonly<{
  source: string | null;
  licence: string | null;
  retrievedOn: string | null;
  tier: string | null;
}>;
export type Fact = Readonly<{
  id: string;
  name: string | null;
  value: string | null;
  provenance: Provenance;
}>;
export type Focus = Readonly<{
  id: string | null;
  visible: boolean;
  width: number | null;
  height: number | null;
  trapped: boolean;
}>;
export type Message = Readonly<{
  text: string;
  locale: Locale;
  politeness: "off" | "polite" | "assertive";
  busy: boolean;
}>;
export type Snapshot = Readonly<{
  path: string;
  locale: Locale;
  connection: Connection;
  status: Status;
  mainCount: number;
  heading: string;
  title: string;
  focus: Focus;
  messages: readonly Message[];
  facts: readonly Fact[];
}>;
export type Action = Readonly<{
  kind: "navigate" | "locale" | "search" | "clear" | "disconnect" | "reconnect" | "retry" | "back" | "forward";
  before: Snapshot;
  after: Snapshot;
  target?: string;
  preserveFacts?: boolean;
  preserveFocus?: boolean;
}>;
export type Journey = Readonly<{ initial: Snapshot; actions: readonly Action[] }>;

const missing = (value: string | null): boolean => value === null ||
  ["", "unknown", "inconnu", "inconnue", "n/a", "—", "-"].includes(value.trim().toLowerCase());

export function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month > 12 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function validPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  if (/[?#*:]/.test(path)) return false;
  for (const char of path) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}

export function factIsKnown(fact: Fact): boolean {
  return !missing(fact.value) && !missing(fact.name) &&
    !missing(fact.provenance.source) && !missing(fact.provenance.licence) &&
    !missing(fact.provenance.tier) && validDate(fact.provenance.retrievedOn);
}

export function factIssues(facts: readonly Fact[], step: number): Finding[] {
  const issues: Finding[] = [];
  const ids = new Set<string>();
  for (const fact of facts) {
    if (!fact.id.trim()) issues.push({ code: "fact-id-empty", step, detail: "A fact has no identifier" });
    if (ids.has(fact.id)) issues.push({ code: "fact-id-repeated", step, detail: fact.id });
    ids.add(fact.id);
    if (!validDate(fact.provenance.retrievedOn)) issues.push({ code: "fact-date-unknown", step, detail: fact.id });
    if (missing(fact.provenance.source)) issues.push({ code: "fact-source-unknown", step, detail: fact.id });
    if (missing(fact.provenance.licence)) issues.push({ code: "fact-licence-unknown", step, detail: fact.id });
    if (missing(fact.provenance.tier)) issues.push({ code: "fact-tier-unknown", step, detail: fact.id });
  }
  return issues;
}

export function snapshotIssues(snapshot: Snapshot, step: number): Finding[] {
  const issues: Finding[] = [];
  const add = (code: string, detail: string): void => { issues.push({ code, detail, step }); };
  if (!validPath(snapshot.path)) add("path-unsafe", snapshot.path);
  if (snapshot.mainCount !== 1) add("main-count", String(snapshot.mainCount));
  if (!snapshot.heading.trim()) add("heading-missing", snapshot.path);
  if (!snapshot.title.trim()) add("title-missing", snapshot.path);
  if (snapshot.focus.id !== null && !snapshot.focus.visible) add("focus-invisible", snapshot.focus.id);
  if (snapshot.focus.id !== null && snapshot.focus.width !== null && snapshot.focus.width < 44) add("target-width", snapshot.focus.id);
  if (snapshot.focus.id !== null && snapshot.focus.height !== null && snapshot.focus.height < 44) add("target-height", snapshot.focus.id);
  if (snapshot.focus.trapped) add("focus-trapped", snapshot.path);
  if (snapshot.status === "loading" && !snapshot.messages.some((message) => message.busy)) add("loading-unannounced", snapshot.path);
  if (["error", "empty"].includes(snapshot.status) && !snapshot.messages.some((message) => message.text.trim() && message.politeness !== "off")) add("result-silent", snapshot.path);
  for (const message of snapshot.messages) {
    if (message.locale !== snapshot.locale) add("message-locale", message.text);
    if (!message.text.trim() && message.politeness !== "off") add("message-blank", snapshot.path);
  }
  issues.push(...factIssues(snapshot.facts, step));
  return issues;
}

function sameProvenance(a: Fact, b: Fact): boolean {
  return a.provenance.source === b.provenance.source &&
    a.provenance.licence === b.provenance.licence &&
    a.provenance.retrievedOn === b.provenance.retrievedOn &&
    a.provenance.tier === b.provenance.tier;
}

export function actionIssues(action: Action, step: number): Finding[] {
  const result: Finding[] = [];
  const add = (code: string, detail: string): void => { result.push({ code, detail, step }); };
  const { before, after } = action;
  if (action.kind === "locale") {
    if (before.locale === after.locale) add("locale-unchanged", before.locale);
    if (before.path !== after.path) add("locale-route-lost", after.path);
  } else if (action.kind !== "navigate" && action.kind !== "back" && action.kind !== "forward") {
    if (before.path !== after.path) add("unexpected-navigation", after.path);
    if (before.locale !== after.locale) add("unexpected-locale", after.locale);
  }
  if (action.kind === "navigate" && action.target && after.path !== action.target) add("navigation-target", after.path);
  if (action.kind === "disconnect" && after.connection !== "offline") add("disconnect-unobserved", after.connection);
  if (action.kind === "reconnect" && after.connection !== "online") add("reconnect-unobserved", after.connection);
  if (action.kind === "search" && !["loading", "ready", "empty", "error"].includes(after.status)) add("search-no-result", after.status);
  if (action.kind === "retry" && !["error", "empty"].includes(before.status)) add("retry-not-available", before.status);
  if (action.kind === "clear" && after.status === "loading") add("clear-started-search", after.status);
  if (action.preserveFocus && before.focus.id !== after.focus.id) add("focus-lost", `${before.focus.id} to ${after.focus.id}`);
  if (action.preserveFacts) {
    const afterFacts = new Map(after.facts.map((fact) => [fact.id, fact]));
    for (const fact of before.facts) {
      const current = afterFacts.get(fact.id);
      if (!current) add("fact-lost", fact.id);
      else if (!sameProvenance(fact, current)) add("fact-provenance-changed", fact.id);
      else if (!missing(fact.value) && missing(current.value)) add("fact-value-lost", fact.id);
    }
  }
  return result;
}

export function journeyIssues(journey: Journey): Finding[] {
  const result = snapshotIssues(journey.initial, 0);
  let previous = journey.initial;
  for (const [index, action] of journey.actions.entries()) {
    const step = index + 1;
    if (previous !== action.before &&
      (previous.path !== action.before.path || previous.locale !== action.before.locale ||
       previous.connection !== action.before.connection || previous.status !== action.before.status)) {
      result.push({ code: "journey-disconnected", step, detail: action.kind });
    }
    result.push(...actionIssues(action, step), ...snapshotIssues(action.after, step));
    previous = action.after;
  }
  return result;
}

export function formatFindings(findings: readonly Finding[], limit = 25): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const lines = [...new Set(findings.map((finding) => `${finding.step}: ${finding.code} ${finding.detail}`))];
  return [...lines.slice(0, limit), ...(lines.length > limit ? [`${lines.length - limit} more findings`] : [])].join("\n");
}

export function bilingualMatrix(paths: readonly string[]): ReadonlyArray<{
  path: string; locale: Locale; width: 320 | 1280;
}> {
  return paths.flatMap((path) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).map((width) => ({ path, locale, width }))));
}

export function matrixIssues(paths: readonly string[], actual: ReturnType<typeof bilingualMatrix>): Finding[] {
  const expected = bilingualMatrix(paths);
  const key = (cell: (typeof expected)[number]): string => `${cell.path}|${cell.locale}|${cell.width}`;
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const cell of actual) {
    if (seen.has(key(cell))) result.push({ code: "matrix-duplicate", step: 0, detail: key(cell) });
    seen.add(key(cell));
  }
  for (const cell of expected) {
    if (!seen.has(key(cell))) result.push({ code: "matrix-missing", step: 0, detail: key(cell) });
  }
  return result;
}
