/** Read-only semantic DOM contracts. Browser collection lives in semantic-integrity-browser.ts. */
export type Locale = "en" | "fr";

export interface Issue {
  readonly rule: string;
  readonly location: string;
  readonly detail: string;
}

export interface ElementId {
  readonly id: string;
  readonly tag: string;
  readonly visible: boolean;
}

export interface Reference {
  readonly owner: string;
  readonly attribute: string;
  readonly token: string;
  readonly targetCount: number;
}

export interface HashLink {
  readonly href: string;
  readonly visible: boolean;
  readonly targetCount: number;
}

export interface LangFragment {
  readonly language: string;
  readonly parentLanguage: string;
  readonly text: string;
  readonly visible: boolean;
  /** False only for a visible text-bearing element inheriting its language. */
  readonly explicit?: boolean;
  readonly tag?: string;
}

export interface FocusNode {
  readonly selector: string;
  readonly name: string;
  readonly visible: boolean;
  readonly connected: boolean;
  readonly disabled: boolean;
}

export interface RouteSnapshot {
  readonly route: string;
  readonly documentLanguage: string;
  readonly title: string;
  readonly mainCount: number;
  readonly headings: readonly string[];
  readonly ids: readonly ElementId[];
  readonly references: readonly Reference[];
  readonly hashes: readonly HashLink[];
  readonly fragments: readonly LangFragment[];
  readonly focusables: readonly FocusNode[];
  readonly horizontalOverflow: number;
}

export function issue(rule: string, location: string, detail: string): Issue {
  return { rule, location, detail };
}

export function localePart(input: string): Locale | null {
  const match = /^(en|fr)(?:-|$)/i.exec(input.trim());
  return (match?.[1]?.toLowerCase() as Locale | undefined) ?? null;
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function hasValidRoute(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") &&
    !/[?#\\]/.test(path) && !path.split("/").includes("..") &&
    !path.split("/").includes(".");
}

export function routeInventoryIssues(
  routes: readonly string[],
  required: readonly string[],
): Issue[] {
  const problems: Issue[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    if (!hasValidRoute(route)) problems.push(issue("route-shape", route, "Invalid route path"));
    if (seen.has(route)) problems.push(issue("route-duplicate", route, "Route repeats"));
    seen.add(route);
  }
  for (const route of required) {
    if (!seen.has(route)) problems.push(issue("route-missing", route, "Required route missing"));
  }
  if (routes.length === 0) problems.push(issue("route-empty", "/", "No routes registered"));
  return problems;
}

/** Duplicate IDs break label and ARIA associations even when both elements are hidden. */
export function idIssues(ids: readonly ElementId[], route: string): Issue[] {
  const counts = new Map<string, number>();
  for (const element of ids) counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
  const problems: Issue[] = [];
  for (const [id, count] of counts) {
    if (id.trim() === "") problems.push(issue("empty-id", route, "Blank id attribute"));
    if (count > 1) problems.push(issue("duplicate-id", route, `${id}: ${count} occurrences`));
  }
  return problems;
}

/** IDREF attributes cannot refer to zero or multiple matching elements. */
export function referenceIssues(refs: readonly Reference[], route: string): Issue[] {
  return refs.flatMap((ref) => {
    const problems: Issue[] = [];
    if (!ref.token.trim()) problems.push(issue("aria-empty-reference", route, `${ref.owner} ${ref.attribute}`));
    else if (ref.targetCount === 0) problems.push(issue("aria-missing-reference", route, `${ref.owner} ${ref.attribute}=${ref.token}`));
    else if (ref.targetCount > 1) problems.push(issue("aria-ambiguous-reference", route, `${ref.owner} ${ref.attribute}=${ref.token}`));
    return problems;
  });
}

export function hashIssues(hashes: readonly HashLink[], route: string): Issue[] {
  return hashes.flatMap((link) => {
    if (!link.visible) return [];
    if (link.targetCount === 1) return [];
    return [issue("hash-destination", route, `${link.href}: ${link.targetCount} destinations`)];
  });
}

/**
 * A deliberately bounded, high-confidence detector for English UI copy under
 * an inherited French language. This is not a language classifier: unknown
 * wording stays unclassified instead of being assigned a language.
 *
 * A language-labelled quotation or brand name is not tested here. The
 * browser collector supplies only the element's own unlabelled text nodes,
 * so an explicitly marked English child does not contaminate its parent.
 */
export function unmarkedEnglishUi(text: string, tag = "", route = ""): boolean {
  const normalized = normalizeText(text).toLocaleLowerCase("en");
  if (!normalized || normalized.length > 800) return false;
  if (tag === "h1") {
    const knownHeading: Readonly<Record<string, RegExp>> = {
      "/more/housing": /^(?:housing|housing finder|housing access finder)\b/,
      "/more/diary": /^(?:coverage diary|coverage notes)\b/,
      "/more/auditors": /^(?:auditor capture|audit capture|auditor)\b/,
    };
    if (knownHeading[route]?.test(normalized)) return true;
  }
  // Multiple distinctive words are required. Proper nouns, numbers, names,
  // and lone English words in Canadian place names remain unclassified.
  const phrases = [
    /\bplease (?:choose|select|enter|provide|review)\b/,
    /\b(?:choose|select|enter) (?:a|the|your)\b/,
    /\b(?:search|show|clear|save|delete) (?:results|all|changes|entries|records)\b/,
    /\bno (?:results|records|entries|matches) (?:found|available|yet)\b/,
    /\b(?:this|that) (?:page|tool|record|information|result)\b/,
    /\byour (?:search|results|data|records|settings|language)\b/,
    /\bback to more\b/,
    /\b(?:coverage diary|housing finder|auditor capture)\b/,
    /\b(?:source|licence|date) (?:is|was|not)\b/,
  ];
  return phrases.some((pattern) => pattern.test(normalized));
}

export function languageIssues(
  actual: string,
  requested: Locale,
  fragments: readonly LangFragment[],
  route: string,
): Issue[] {
  const problems: Issue[] = [];
  if (localePart(actual) !== requested) {
    problems.push(issue("document-language", route, `${requested} expected; received ${actual || "missing"}`));
  }
  for (const fragment of fragments) {
    if (!fragment.visible || !normalizeText(fragment.text)) continue;
    if (!fragment.language.trim()) {
      problems.push(issue("fragment-language-empty", route, normalizeText(fragment.text).slice(0, 60)));
      continue;
    }
    // Unknown or unsupported language tags are not silently rewritten to English.
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(fragment.language)) {
      problems.push(issue("fragment-language-invalid", route, fragment.language));
      continue;
    }
    if (
      requested === "fr" && fragment.explicit === false &&
      localePart(fragment.parentLanguage) === "fr" &&
      unmarkedEnglishUi(fragment.text, fragment.tag, route)
    ) {
      problems.push(issue("unmarked-english", route, normalizeText(fragment.text).slice(0, 100)));
    }
  }
  return problems;
}

export function focusNodeIssues(nodes: readonly FocusNode[], route: string): Issue[] {
  const problems: Issue[] = [];
  for (const node of nodes) {
    if (!node.connected) problems.push(issue("focus-disconnected", route, node.selector));
    if (!node.visible) problems.push(issue("focus-hidden", route, node.selector));
    if (node.disabled) problems.push(issue("focus-disabled", route, node.selector));
    if (!normalizeText(node.name)) problems.push(issue("focus-unnamed", route, node.selector));
  }
  return problems;
}

export function snapshotIssues(snapshot: RouteSnapshot, locale: Locale, width: number): Issue[] {
  const problems = [
    ...idIssues(snapshot.ids, snapshot.route),
    ...referenceIssues(snapshot.references, snapshot.route),
    ...hashIssues(snapshot.hashes, snapshot.route),
    ...languageIssues(snapshot.documentLanguage, locale, snapshot.fragments, snapshot.route),
    ...focusNodeIssues(snapshot.focusables, snapshot.route),
  ];
  if (!normalizeText(snapshot.title)) problems.push(issue("document-title", snapshot.route, "No title"));
  if (snapshot.mainCount !== 1) problems.push(issue("main-count", snapshot.route, String(snapshot.mainCount)));
  if (snapshot.headings.length !== 1 || !normalizeText(snapshot.headings[0] ?? "")) {
    problems.push(issue("heading-one", snapshot.route, `${snapshot.headings.length} first-level headings`));
  }
  if (width <= 320 && snapshot.horizontalOverflow > 1) {
    problems.push(issue("reflow", snapshot.route, `${snapshot.horizontalOverflow}px horizontal overflow`));
  }
  return problems;
}

export function reportIssues(problems: readonly Issue[], limit = 40): string {
  const lines = [...new Set(problems.map((entry) => `${entry.rule} ${entry.location}: ${entry.detail}`))];
  return [...lines.slice(0, limit), ...(lines.length > limit ? [`${lines.length - limit} additional findings`] : [])].join("\n");
}

export function assertUniqueMatrix(
  routes: readonly string[], locales: readonly Locale[], widths: readonly number[],
  scheduled: readonly string[],
): Issue[] {
  const expected = routes.flatMap((route) => locales.flatMap((locale) => widths.map((width) => `${route}|${locale}|${width}`)));
  const actual = new Set(scheduled);
  const problems: Issue[] = [];
  for (const entry of expected) if (!actual.has(entry)) problems.push(issue("matrix-missing", entry, "Route dimension absent"));
  for (const entry of scheduled) if (!expected.includes(entry)) problems.push(issue("matrix-unexpected", entry, "Unknown route dimension"));
  if (actual.size !== scheduled.length) problems.push(issue("matrix-duplicate", "matrix", "Duplicate test dimensions"));
  return problems;
}
