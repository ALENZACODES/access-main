/** Read-only navigation, keyboard, and announcement-boundary contracts for P20Y. */
export type Language = "en" | "fr";
export type DestinationKind = "internal" | "fragment" | "external" | "telephone" | "email" | "unsafe" | "unknown";
export type NavigationCause = "link" | "button" | "history" | "language" | "restore";

export interface NavigationIssue {
  readonly code: string;
  readonly location: string;
  readonly detail: string;
}

export interface LinkObservation {
  readonly id: string;
  readonly href: string | null;
  readonly accessibleName: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly opensNewWindow: boolean;
  readonly windowWarning: string | null;
  readonly declaredLanguage: string | null;
}

export interface RegionObservation {
  readonly id: string;
  readonly role: string;
  readonly visible: boolean;
  readonly focusable: boolean;
}

export interface FocusObservation {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly withinDialog: boolean;
  readonly withinInertRegion: boolean;
  readonly order: number;
}

export interface NavigationFrame {
  readonly route: string;
  readonly language: string;
  readonly documentTitle: string;
  readonly mainCount: number;
  readonly firstHeadings: readonly string[];
  readonly activeId: string | null;
  readonly focusedRole: string | null;
  readonly links: readonly LinkObservation[];
  readonly regions: readonly RegionObservation[];
  readonly focusables: readonly FocusObservation[];
}

export interface NavigationTransition {
  readonly cause: NavigationCause;
  readonly before: NavigationFrame;
  readonly after: NavigationFrame;
  readonly expectedRoute: string;
  readonly expectedLanguage: Language;
  readonly shouldChangeRoute: boolean;
  readonly shouldRestoreFocus: boolean;
  readonly expectedFocusId: string | null;
}

export interface SkipLinkObservation {
  readonly sourceId: string;
  readonly href: string;
  readonly targetId: string | null;
  readonly destinationCount: number;
  readonly targetFocusable: boolean;
  readonly activeAfterActivation: string | null;
  readonly visibleOnFocus: boolean;
}

const SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const LANGUAGE = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i;

export function navigationIssue(code: string, location: string, detail: string): NavigationIssue {
  return { code, location, detail };
}

export function collapseNavigationText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function navigationLanguage(value: string): Language | null {
  const match = LANGUAGE.exec(value.trim());
  return (match?.[1]?.toLowerCase() as Language | undefined) ?? null;
}

export function classifyDestination(href: string | null): DestinationKind {
  if (href === null) return "unknown";
  const trimmed = href.trim();
  if (!trimmed) return "unknown";
  if (trimmed.startsWith("#")) return trimmed.length > 1 ? "fragment" : "unknown";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return "internal";
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) return "internal";
  if (trimmed.startsWith("//")) return "external";
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) return "internal";
  if (!SCHEMES.has(scheme)) return "unsafe";
  if (scheme === "tel:") return "telephone";
  if (scheme === "mailto:") return "email";
  return "external";
}

export function routeFromHref(href: string, origin = "https://example.test"): string | null {
  const kind = classifyDestination(href);
  if (kind !== "internal" && kind !== "fragment") return null;
  try {
    const destination = new URL(href, origin + "/");
    if (destination.origin !== new URL(origin).origin) return null;
    const route = destination.pathname;
    if (!route.startsWith("/") || route.startsWith("//")) return null;
    return route;
  } catch {
    return null;
  }
}

export function linkIssues(links: readonly LinkObservation[], route: string): NavigationIssue[] {
  const issues: NavigationIssue[] = [];
  const ids = new Set<string>();
  for (const link of links) {
    if (!link.visible || link.disabled) continue;
    const location = `${route}#${link.id || "link"}`;
    if (link.id && ids.has(link.id)) issues.push(navigationIssue("link-id-duplicate", location, "Repeated link identifier"));
    if (link.id) ids.add(link.id);
    const name = collapseNavigationText(link.accessibleName);
    if (!name) issues.push(navigationIssue("link-unnamed", location, "No accessible name"));
    const kind = classifyDestination(link.href);
    if (kind === "unknown") issues.push(navigationIssue("link-no-destination", location, "No usable destination"));
    if (kind === "unsafe") issues.push(navigationIssue("link-unsafe-scheme", location, "Unsafe URL scheme"));
    if (link.opensNewWindow && !collapseNavigationText(link.windowWarning ?? "")) {
      issues.push(navigationIssue("link-window-warning", location, "New-window behaviour is not described"));
    }
    const declared = link.declaredLanguage;
    if (declared !== null && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(declared)) {
      issues.push(navigationIssue("link-language-invalid", location, declared));
    }
  }
  return issues;
}

export function landmarkIssues(frame: NavigationFrame): NavigationIssue[] {
  const issues: NavigationIssue[] = [];
  if (frame.mainCount !== 1) issues.push(navigationIssue("main-count", frame.route, `${frame.mainCount} main regions`));
  if (frame.firstHeadings.length !== 1 || !collapseNavigationText(frame.firstHeadings[0] ?? "")) {
    issues.push(navigationIssue("heading-one", frame.route, `${frame.firstHeadings.length} top-level headings`));
  }
  if (!collapseNavigationText(frame.documentTitle)) {
    issues.push(navigationIssue("document-title", frame.route, "Document title absent"));
  }
  if (navigationLanguage(frame.language) === null) {
    issues.push(navigationIssue("document-language", frame.route, "English or French language not declared"));
  }
  const landmarks = frame.regions.filter((region) => region.visible && region.role === "main");
  if (landmarks.length > 1) issues.push(navigationIssue("main-role-duplicate", frame.route, `${landmarks.length} main roles`));
  const regionIds = new Set<string>();
  for (const region of frame.regions) {
    if (!region.id) continue;
    if (regionIds.has(region.id)) issues.push(navigationIssue("landmark-id-duplicate", frame.route, region.id));
    regionIds.add(region.id);
  }
  return issues;
}

export function focusOrderIssues(nodes: readonly FocusObservation[], route: string): NavigationIssue[] {
  const issues: NavigationIssue[] = [];
  const entries = nodes.filter((node) => node.visible && !node.disabled && !node.withinInertRegion);
  const order = new Set<number>();
  const identities = new Set<string>();
  for (const node of entries) {
    const location = `${route}#${node.id || node.role}`;
    if (!collapseNavigationText(node.name)) issues.push(navigationIssue("focus-unnamed", location, "Focus target has no name"));
    if (!Number.isInteger(node.order) || node.order < 0) issues.push(navigationIssue("focus-order-invalid", location, String(node.order)));
    if (order.has(node.order)) issues.push(navigationIssue("focus-order-duplicate", location, String(node.order)));
    order.add(node.order);
    if (node.id && identities.has(node.id)) issues.push(navigationIssue("focus-id-duplicate", location, node.id));
    if (node.id) identities.add(node.id);
  }
  for (const node of nodes) {
    if (node.withinInertRegion && node.visible && node.order >= 0) {
      issues.push(navigationIssue("inert-focusable", `${route}#${node.id}`, "Inert content is in the keyboard order"));
    }
  }
  return issues;
}

export function skipLinkIssues(items: readonly SkipLinkObservation[], route: string): NavigationIssue[] {
  const issues: NavigationIssue[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const location = `${route}#${item.sourceId || "skip"}`;
    if (seen.has(item.href)) issues.push(navigationIssue("skip-duplicate", location, item.href));
    seen.add(item.href);
    if (!item.href.startsWith("#") || item.href.length < 2) {
      issues.push(navigationIssue("skip-invalid-href", location, item.href));
      continue;
    }
    if (item.destinationCount !== 1) issues.push(navigationIssue("skip-destination", location, String(item.destinationCount)));
    if (!item.targetId) issues.push(navigationIssue("skip-target-missing", location, item.href));
    if (!item.targetFocusable) issues.push(navigationIssue("skip-target-unfocusable", location, item.href));
    if (item.targetId && item.activeAfterActivation !== item.targetId) {
      issues.push(navigationIssue("skip-focus-lost", location, item.activeAfterActivation ?? "UNKNOWN"));
    }
    if (!item.visibleOnFocus) issues.push(navigationIssue("skip-invisible", location, item.href));
  }
  return issues;
}

export function transitionIssues(event: NavigationTransition): NavigationIssue[] {
  const issues = landmarkIssues(event.after);
  const { before, after } = event;
  if (after.route !== event.expectedRoute) issues.push(navigationIssue("route-transition", after.route, event.expectedRoute));
  if (navigationLanguage(after.language) !== event.expectedLanguage) {
    issues.push(navigationIssue("language-transition", after.route, event.expectedLanguage));
  }
  if (event.shouldChangeRoute && before.route === after.route) {
    issues.push(navigationIssue("route-not-changed", after.route, event.cause));
  }
  if (!event.shouldChangeRoute && before.route !== after.route) {
    issues.push(navigationIssue("route-changed-unexpectedly", after.route, event.cause));
  }
  if (event.shouldRestoreFocus && event.expectedFocusId && after.activeId !== event.expectedFocusId) {
    issues.push(navigationIssue("focus-not-restored", after.route, after.activeId ?? "UNKNOWN"));
  }
  if (event.cause === "language" && before.route !== after.route) {
    issues.push(navigationIssue("language-navigation-reset", after.route, "Language switch navigated away"));
  }
  return issues;
}

export function frameIssues(frame: NavigationFrame): NavigationIssue[] {
  return [...landmarkIssues(frame), ...linkIssues(frame.links, frame.route), ...focusOrderIssues(frame.focusables, frame.route)];
}

export function summarizeNavigationIssues(issues: readonly NavigationIssue[], limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const unique = [...new Set(issues.map((item) => `${item.code} ${item.location}: ${item.detail}`))];
  const extra = unique.length - Math.min(unique.length, limit);
  return [...unique.slice(0, limit), ...(extra > 0 ? [`${extra} more findings`] : [])].join("\n");
}

export function navigationMatrix(routes: readonly string[]): readonly { route: string; language: Language; width: number }[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((language) =>
    ([320, 1280] as const).map((width) => ({ route, language, width }))));
}

export function missingNavigationMatrixCells(
  routes: readonly string[],
  actual: readonly { route: string; language: Language; width: number }[],
): NavigationIssue[] {
  const keys = new Set(actual.map((item) => `${item.route}|${item.language}|${item.width}`));
  const issues: NavigationIssue[] = [];
  for (const item of navigationMatrix(routes)) {
    if (!keys.has(`${item.route}|${item.language}|${item.width}`)) {
      issues.push(navigationIssue("matrix-cell-missing", item.route, `${item.language} ${item.width}`));
    }
  }
  return issues;
}
