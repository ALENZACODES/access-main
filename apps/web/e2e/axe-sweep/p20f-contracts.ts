/**
 * P20F: state-transition audit contracts. This module is intentionally pure:
 * browser capture and policy interpretation are separate so each boundary can
 * be exercised by deterministic tests and live Playwright journeys.
 */
export type Locale = "en" | "fr";
export type State = "PASS" | "BLOCKED" | "UNKNOWN";
export type Severity = "error" | "warning";
export type AuditArea =
  | "search"
  | "filters"
  | "map"
  | "navigation"
  | "announcements"
  | "errors"
  | "offline"
  | "language"
  | "provenance"
  | "controls"
  | "state";

export interface Issue {
  readonly area: AuditArea;
  readonly code: string;
  readonly location: string;
  readonly detail: string;
  readonly severity: Severity;
}

export interface Provenance {
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
}

export interface StatusEvidence {
  readonly id: string;
  readonly state: State;
  readonly provenance: Provenance | null;
}

export interface LanguageEvidence {
  readonly expected: Locale;
  readonly actual: string | null;
  readonly title: string | null;
  readonly mainName: string | null;
  readonly selectors: readonly string[];
  readonly fallbackVisible: boolean;
}

export interface FieldEvidence {
  readonly key: string;
  readonly type: string;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly describedBy: readonly string[];
  readonly hasError: boolean;
  readonly invalid: boolean;
  readonly message: string;
  readonly visible: boolean;
}

export interface ActionEvidence {
  readonly key: string;
  readonly role: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly focusable: boolean;
  readonly keyboard: boolean;
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly hiddenText: boolean;
}

export interface LiveRegionEvidence {
  readonly key: string;
  readonly role: string;
  readonly live: string | null;
  readonly atomic: boolean;
  readonly text: string;
}

export interface RouteEvidence {
  readonly url: string;
  readonly locale: Locale;
  readonly title: string;
  readonly headings: readonly string[];
  readonly links: readonly string[];
  readonly mainCount: number;
  readonly focusKey: string | null;
  readonly scrollX: number;
  readonly scrollY: number;
}

export interface TransitionEvidence {
  readonly before: RouteEvidence;
  readonly after: RouteEvidence;
  readonly actionKey: string;
  readonly changedUrl: boolean;
  readonly changedContent: boolean;
  readonly focusAfter: string | null;
  readonly announced: boolean;
}

export interface MapEvidence {
  readonly key: string;
  readonly kind: "canvas" | "svg" | "image" | "region";
  readonly accessibleName: string;
  readonly hasTextAlternative: boolean;
  readonly controls: readonly ActionEvidence[];
  readonly externalTiles: readonly string[];
  readonly attribution: string;
  readonly attributionVisible: boolean;
}

export interface SearchEvidence {
  readonly beforeCount: number | null;
  readonly afterCount: number | null;
  readonly beforeText: string;
  readonly afterText: string;
  readonly query: string;
  readonly inputName: string;
  readonly stateAnnounced: boolean;
  readonly changed: boolean;
  readonly emptyState: boolean;
}

export interface FilterEvidence {
  readonly key: string;
  readonly label: string;
  readonly kind: string;
  readonly selectedBefore: boolean;
  readonly selectedAfter: boolean;
  readonly resultChanged: boolean;
  readonly resultAnnounced: boolean;
  readonly unknownHidden: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SPDX_OPEN = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "PDDL-1.0",
  "OGL-Canada-2.0", "OGL-ON-1.0", "MIT", "Apache-2.0",
]);
const CLOSED_WORDS = /\b(?:proprietary|all rights reserved|private licence|unlicensed)\b/i;
const FORBIDDEN_OVERCLAIMS = /(?<![\p{L}\p{N}])(?:verified|verify|vérifié|real[ -]time|partnership|guarantee)(?![\p{L}\p{N}])/iu;
const MEDICAL_ADVICE = /\b(?:diagnos(?:e|is)|prescri(?:be|ption)|treatment plan|medical advice|avis médical|diagnostic médical)\b/i;
const UNKNOWN_WORDS = /^(?:unknown|inconnu|inconnue|non connu|non connue|non renseigné|non renseignée|indéterminé|indéterminée|not known|non disponible)$/i;

export function issue(
  area: AuditArea,
  code: string,
  location: string,
  detail: string,
  severity: Severity = "error",
): Issue {
  return { area, code, location, detail, severity };
}

export function parseDate(value: string | null): number | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > (days[month - 1] ?? 0)) return null;
  return year * 10000 + month * 100 + day;
}

export function inspectProvenance(
  record: Provenance | null,
  location: string,
): Issue[] {
  const problems: Issue[] = [];
  if (!record) {
    problems.push(issue("provenance", "missing", location, "Evidence requires source, licence and date"));
    return problems;
  }
  if (!record.source?.trim()) {
    problems.push(issue("provenance", "source", location, "Source is missing"));
  }
  if (!record.licence?.trim()) {
    problems.push(issue("provenance", "licence", location, "Licence is missing"));
  } else if (CLOSED_WORDS.test(record.licence) || !SPDX_OPEN.has(record.licence)) {
    problems.push(issue("provenance", "licence-unsupported", location, `Licence is not in the approved open list: ${record.licence}`));
  }
  if (parseDate(record.date) === null) {
    problems.push(issue("provenance", "date", location, "Date must be a valid YYYY-MM-DD calendar date"));
  }
  return problems;
}

export function inspectStatus(
  record: StatusEvidence,
  sourceRequired = true,
): Issue[] {
  const problems: Issue[] = [];
  if (!["PASS", "BLOCKED", "UNKNOWN"].includes(record.state)) {
    problems.push(issue("state", "invalid", record.id, "Unexpected status enum"));
    return problems;
  }
  if (record.state !== "UNKNOWN" && sourceRequired) {
    problems.push(...inspectProvenance(record.provenance, record.id));
  }
  return problems;
}

export function combineStates(states: readonly State[]): State {
  if (states.length === 0) return "UNKNOWN";
  if (states.includes("BLOCKED")) return "BLOCKED";
  if (states.includes("UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function transitionStatus(
  before: State,
  after: State,
  newEvidence: Provenance | null,
): Issue[] {
  const problems: Issue[] = [];
  if (before === "UNKNOWN" && after === "PASS" && !newEvidence) {
    problems.push(issue("state", "unknown-promoted", "transition", "An unknown state became positive without evidence"));
  }
  if (before === "UNKNOWN" && after === "BLOCKED" && !newEvidence) {
    problems.push(issue("state", "unknown-barrier", "transition", "An unknown state became a barrier without evidence"));
  }
  if (before !== after && after !== "UNKNOWN" && newEvidence) {
    problems.push(...inspectProvenance(newEvidence, "transition"));
  }
  return problems;
}

export function inspectLanguage(data: LanguageEvidence): Issue[] {
  const problems: Issue[] = [];
  const actual = data.actual?.trim().toLowerCase() ?? "";
  if (!(actual === data.expected || actual.startsWith(`${data.expected}-`))) {
    problems.push(issue("language", "document-lang", data.expected, `Document language is ${actual || "missing"}`));
  }
  if (!data.title?.trim()) {
    problems.push(issue("language", "title", data.expected, "Document title is empty"));
  }
  if (!data.mainName?.trim()) {
    problems.push(issue("language", "main-heading", data.expected, "Main content has no discoverable heading"));
  }
  if (!data.selectors.includes("en") || !data.selectors.includes("fr")) {
    problems.push(issue("language", "switch", data.expected, "Both language choices must be reachable"));
  }
  if (data.fallbackVisible) {
    problems.push(issue("language", "fallback", data.expected, "Untranslated fallback content is visible"));
  }
  return problems;
}

export function inspectFields(fields: readonly FieldEvidence[], location: string): Issue[] {
  const problems: Issue[] = [];
  for (const field of fields) {
    if (!field.visible || field.disabled) continue;
    if (!field.label.trim()) {
      problems.push(issue("controls", "field-label", `${location}:${field.key}`, "Field has no accessible name"));
    }
    if (field.required && !field.describedBy.length && !field.label.includes("*")) {
      problems.push(issue("controls", "required-hint", `${location}:${field.key}`, "Required input has no discoverable hint"));
    }
    if (field.invalid && !field.hasError) {
      problems.push(issue("errors", "invalid-message", `${location}:${field.key}`, "Invalid input lacks an associated error"));
    }
    if (field.invalid && !field.message.trim()) {
      problems.push(issue("errors", "invalid-text", `${location}:${field.key}`, "Invalid input has no error text"));
    }
  }
  return problems;
}

export function inspectActions(
  actions: readonly ActionEvidence[],
  location: string,
  minimum = 44,
): Issue[] {
  const problems: Issue[] = [];
  for (const action of actions) {
    if (!action.visible || action.disabled) continue;
    const key = `${location}:${action.key}`;
    if (!action.name.trim()) problems.push(issue("controls", "name", key, "Interactive control lacks an accessible name"));
    if (!action.focusable) problems.push(issue("controls", "focus", key, "Interactive control cannot receive keyboard focus"));
    if (!action.keyboard) problems.push(issue("controls", "keyboard", key, "Interactive control lacks keyboard activation"));
    if (action.width < minimum || action.height < minimum) {
      problems.push(issue("controls", "target-size", key, `Target ${action.width}×${action.height} is below ${minimum}×${minimum}`));
    }
    if (action.hiddenText && !action.name.trim()) {
      problems.push(issue("controls", "icon-name", key, "Icon-only control requires a name"));
    }
  }
  return problems;
}

export function inspectLiveRegions(regions: readonly LiveRegionEvidence[], location: string): Issue[] {
  const problems: Issue[] = [];
  for (const region of regions) {
    if (!region.text.trim()) continue;
    if (region.role !== "status" && region.role !== "alert" && !["polite", "assertive"].includes(region.live ?? "")) {
      problems.push(issue("announcements", "silent-region", `${location}:${region.key}`, "Status text has no live announcement semantics"));
    }
    if (region.live === "off") {
      problems.push(issue("announcements", "disabled-region", `${location}:${region.key}`, "Status region explicitly disables announcements"));
    }
  }
  return problems;
}

export function inspectTransition(transition: TransitionEvidence): Issue[] {
  const problems: Issue[] = [];
  const location = transition.after.url;
  if (transition.changedUrl || transition.changedContent) {
    if (!transition.focusAfter && !transition.announced) {
      problems.push(issue("navigation", "silent-transition", location, `Action ${transition.actionKey} changed content without focus or announcement`));
    }
    if (transition.after.mainCount !== 1) {
      problems.push(issue("navigation", "main-count", location, "Transition must end with one main landmark"));
    }
    if (!transition.after.title.trim()) {
      problems.push(issue("navigation", "title", location, "Transition has no document title"));
    }
  }
  return problems;
}

export function inspectMap(map: MapEvidence, origin: string): Issue[] {
  const problems: Issue[] = [];
  if (!map.accessibleName.trim()) {
    problems.push(issue("map", "name", map.key, "Map needs an accessible name"));
  }
  if (!map.hasTextAlternative) {
    problems.push(issue("map", "text-alternative", map.key, "Map requires a text route or results alternative"));
  }
  for (const tile of map.externalTiles) {
    try {
      const url = new URL(tile, origin);
      if (url.origin !== new URL(origin).origin) {
        problems.push(issue("map", "external-tile", map.key, `External map resource: ${url.origin}`));
      }
    } catch {
      problems.push(issue("map", "tile-url", map.key, "Malformed map resource URL"));
    }
  }
  if (!map.attribution.trim() || !map.attributionVisible) {
    problems.push(issue("map", "attribution", map.key, "Visible source and licence attribution is required"));
  }
  problems.push(...inspectActions(map.controls, map.key));
  return problems;
}

export function inspectSearch(result: SearchEvidence, location: string): Issue[] {
  const problems: Issue[] = [];
  if (!result.inputName.trim()) {
    problems.push(issue("search", "name", location, "Search input has no accessible name"));
  }
  if (result.query.trim() && result.changed && !result.stateAnnounced) {
    problems.push(issue("search", "announcement", location, "Search results changed without an announcement"));
  }
  if (result.query.trim() && result.afterCount === 0 && !result.emptyState) {
    problems.push(issue("search", "empty", location, "Empty result set needs visible explanatory text"));
  }
  if (result.beforeCount !== null && result.afterCount !== null && result.afterCount < 0) {
    problems.push(issue("search", "count", location, "Result count cannot be negative"));
  }
  return problems;
}

export function inspectFilters(filters: readonly FilterEvidence[], location: string): Issue[] {
  const problems: Issue[] = [];
  for (const filter of filters) {
    const key = `${location}:${filter.key}`;
    if (!filter.label.trim()) {
      problems.push(issue("filters", "name", key, "Filter needs a name"));
    }
    if (filter.selectedBefore !== filter.selectedAfter && filter.resultChanged && !filter.resultAnnounced) {
      problems.push(issue("filters", "announcement", key, "Changed results were not announced"));
    }
    if (filter.unknownHidden) {
      problems.push(issue("filters", "unknown-hidden", key, "Unknown results must not be presented as positive matches"));
    }
  }
  return problems;
}

export function inspectCopy(text: string, location: string): Issue[] {
  const problems: Issue[] = [];
  if (FORBIDDEN_OVERCLAIMS.test(text)) {
    problems.push(issue("state", "overclaim", location, "Unsupported certainty claim in visible copy"));
  }
  if (MEDICAL_ADVICE.test(text)) {
    problems.push(issue("state", "medical", location, "Medical advisory wording requires removal"));
  }
  return problems;
}

export function isUnknownLabel(value: string): boolean {
  return UNKNOWN_WORDS.test(value.trim());
}

export function uniqueIssues(issues: readonly Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.area}|${item.code}|${item.location}|${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatIssues(issues: readonly Issue[]): string {
  if (!issues.length) return "No findings";
  return uniqueIssues(issues)
    .map((item, index) => `${index + 1}. [${item.area}/${item.code}] ${item.location}: ${item.detail}`)
    .join("\n");
}
