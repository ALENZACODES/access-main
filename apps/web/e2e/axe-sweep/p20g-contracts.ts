/**
 * P20G: deterministic failure policies for additional browser accessibility
 * probes. These functions never turn missing information into positive facts.
 */
export type Language = "en" | "fr";
export type EvidenceState = "PASS" | "BLOCKED" | "UNKNOWN";

export interface Finding {
  readonly rule: string;
  readonly route: string;
  readonly detail: string;
}
export interface Context {
  readonly route: string;
  readonly language: Language;
  readonly viewport: number;
}
export function finding(context: Context, rule: string, detail: string): Finding {
  return { route: `${context.route} [${context.language}, ${context.viewport}px]`, rule, detail };
}
export function report(findings: readonly Finding[]): string {
  return findings.map(({ route, rule, detail }) => `${rule} @ ${route}: ${detail}`).join("\n");
}
export function assertCompleteMatrix(
  routes: readonly string[],
  languages: readonly Language[],
  viewports: readonly number[],
  examined: readonly string[],
): Finding[] {
  const errors: Finding[] = [];
  const uniqueRoutes = new Set(routes);
  const uniqueLanguages = new Set(languages);
  const uniqueWidths = new Set(viewports);
  if (!uniqueRoutes.has("/") || !uniqueRoutes.has("/places") || !uniqueRoutes.has("/help")) {
    errors.push({ rule: "inventory-required", route: "/", detail: "Required application routes are absent" });
  }
  if (uniqueRoutes.size !== routes.length) {
    errors.push({ rule: "inventory-duplicate", route: "/", detail: "Duplicate route paths" });
  }
  if (uniqueLanguages.size !== 2 || !uniqueLanguages.has("en") || !uniqueLanguages.has("fr")) {
    errors.push({ rule: "inventory-languages", route: "/", detail: "English and French are required" });
  }
  if (uniqueWidths.size !== 2 || !uniqueWidths.has(320) || !uniqueWidths.has(1280)) {
    errors.push({ rule: "inventory-widths", route: "/", detail: "320px and 1280px are required" });
  }
  const actual = new Map<string, number>();
  for (const item of examined) actual.set(item, (actual.get(item) ?? 0) + 1);
  for (const route of uniqueRoutes) {
    if (!route.startsWith("/") || route.startsWith("//") || route.includes("?") || route.includes("#")) {
      errors.push({ rule: "inventory-path", route, detail: "Not a plain same-origin path" });
    }
    for (const language of uniqueLanguages) {
      for (const width of uniqueWidths) {
        const key = matrixKey(route, language, width);
        if ((actual.get(key) ?? 0) !== 1) {
          errors.push({ rule: "matrix-coverage", route, detail: `${key}: expected one run; received ${actual.get(key) ?? 0}` });
        }
      }
    }
  }
  for (const [key] of actual) {
    const allowed = routes.some((route) => languages.some((language) => viewports.some((width) => key === matrixKey(route, language, width))));
    if (!allowed) errors.push({ rule: "matrix-extraneous", route: "/", detail: key });
  }
  return errors;
}
export function matrixKey(route: string, language: Language, viewport: number): string {
  return JSON.stringify([route, language, viewport]);
}

export interface ControlGeometry {
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly role: string;
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inViewport: boolean;
  readonly boundingSource: "self" | "label";
  readonly sourceIsInteractive: boolean;
}
export function controlFindings(controls: readonly ControlGeometry[], context: Context): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const item of controls) {
    if (seen.has(item.id)) findings.push(finding(context, "control-duplicate", item.id));
    seen.add(item.id);
    if (!item.connected) findings.push(finding(context, "control-detached", item.id));
    if (!item.visible || item.disabled) continue;
    if (!item.name.trim()) findings.push(finding(context, "control-unnamed", `${item.tag} ${item.id}`));
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width < 44 || item.height < 44) {
      findings.push(finding(context, "control-44", `${item.id}: ${item.width} x ${item.height} CSS px`));
    }
    if (item.boundingSource === "label" && !item.sourceIsInteractive) {
      findings.push(finding(context, "control-label-hit", `${item.id}: label is not an actual hit area`));
    }
  }
  return findings;
}

export interface LandmarkSnapshot {
  readonly title: string;
  readonly documentLanguage: string;
  readonly mainCount: number;
  readonly h1: readonly string[];
  readonly skipLinks: readonly { href: string; text: string; targetExists: boolean }[];
  readonly pageText: string;
  readonly horizontalOverflow: number;
  readonly loading: boolean;
  readonly fatalError: boolean;
}
export function landmarkFindings(page: LandmarkSnapshot, context: Context): Finding[] {
  const failures: Finding[] = [];
  if (!page.title.trim()) failures.push(finding(context, "document-title", "Missing document title"));
  if (page.documentLanguage.toLowerCase().split("-")[0] !== context.language) {
    failures.push(finding(context, "document-language", `Expected ${context.language}; got ${page.documentLanguage}`));
  }
  if (page.mainCount !== 1) failures.push(finding(context, "main-count", String(page.mainCount)));
  if (page.h1.length !== 1 || !page.h1[0]?.trim()) {
    failures.push(finding(context, "h1-count", `Visible headings: ${page.h1.length}`));
  }
  if (!page.pageText.trim()) failures.push(finding(context, "page-empty", "Main content contains no text"));
  if (page.loading) failures.push(finding(context, "page-loading", "Page is still loading"));
  if (page.fatalError) failures.push(finding(context, "page-fatal", "Application error is visible"));
  if (context.viewport === 320 && page.horizontalOverflow > 1) {
    failures.push(finding(context, "reflow", `Document overflows horizontally by ${page.horizontalOverflow}px`));
  }
  for (const skip of page.skipLinks) {
    if (!skip.text.trim()) failures.push(finding(context, "skip-name", skip.href));
    if (!skip.href.startsWith("#") || !skip.targetExists) failures.push(finding(context, "skip-destination", skip.href));
  }
  if (!page.skipLinks.length) failures.push(finding(context, "skip-absent", "Missing skip link"));
  return failures;
}

export interface FieldSnapshot {
  readonly id: string;
  readonly tag: string;
  readonly type: string;
  readonly label: string;
  readonly accessibleName: string;
  readonly placeholder: string;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly descriptionIds: readonly string[];
  readonly brokenDescriptions: readonly string[];
  readonly autocomplete: string;
  readonly invalid: boolean;
  readonly errorIds: readonly string[];
  readonly visible: boolean;
}
function normalizeName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
export function fieldFindings(fields: readonly FieldSnapshot[], context: Context): Finding[] {
  const failures: Finding[] = [];
  for (const field of fields) {
    if (!field.visible || field.type === "hidden") continue;
    if (!field.accessibleName.trim()) failures.push(finding(context, "field-name", field.id));
    if (!field.label.trim() && field.placeholder.trim() && !field.accessibleName.trim()) {
      failures.push(finding(context, "field-placeholder", `${field.id}: placeholder alone is not a label`));
    }
    if (field.label.trim() && field.accessibleName.trim() && !normalizeName(field.accessibleName).includes(normalizeName(field.label))) {
      failures.push(finding(context, "field-label-in-name", field.id));
    }
    for (const id of field.brokenDescriptions) failures.push(finding(context, "field-description", `${field.id} references missing ${id}`));
    if (field.invalid && field.errorIds.length === 0) {
      failures.push(finding(context, "field-error-association", field.id));
    }
    if (field.required && field.disabled && field.invalid) failures.push(finding(context, "field-disabled-error", field.id));
  }
  return failures;
}

export interface FocusSnapshot {
  readonly firstTab: string | null;
  readonly secondTab: string | null;
  readonly returnedTab: string | null;
  readonly firstVisible: boolean;
  readonly secondVisible: boolean;
  readonly forwardCount: number;
  readonly visitedMain: boolean;
  /** Focusable, enabled, visible controls inside main when the walk started. Absent means not measured. */
  readonly mainTargets?: number;
  readonly endedOnBody: boolean;
  readonly traps: readonly string[];
}
export function focusFindings(focus: FocusSnapshot, context: Context): Finding[] {
  const issues: Finding[] = [];
  if (!focus.firstTab) issues.push(finding(context, "focus-first", "No initial keyboard target"));
  if (focus.firstTab && !focus.firstVisible) issues.push(finding(context, "focus-hidden", focus.firstTab));
  if (focus.secondTab && !focus.secondVisible) issues.push(finding(context, "focus-next-hidden", focus.secondTab));
  if (focus.firstTab && focus.secondTab === focus.firstTab) issues.push(finding(context, "focus-stalled", focus.firstTab));
  if (focus.firstTab && focus.secondTab && focus.returnedTab !== focus.firstTab) {
    issues.push(finding(context, "focus-reverse", `Expected ${focus.firstTab}; received ${focus.returnedTab ?? "none"}`));
  }
  if (!focus.forwardCount) issues.push(finding(context, "focus-no-walk", "No keyboard sequence observed"));
  // Only a finding when main holds something that can take focus and the walk never got there.
  if (!focus.visitedMain && focus.mainTargets !== 0) issues.push(finding(context, "focus-main", "No keyboard target within main"));
  for (const trap of focus.traps) issues.push(finding(context, "focus-trap", trap));
  return issues;
}

export interface LiveRegionSnapshot {
  readonly id: string;
  readonly role: string;
  readonly live: string;
  readonly atomic: string;
  readonly text: string;
  readonly hidden: boolean;
  readonly busy: boolean;
}
export function liveRegionFindings(regions: readonly LiveRegionSnapshot[], context: Context): Finding[] {
  const failures: Finding[] = [];
  const ids = new Set<string>();
  for (const region of regions) {
    if (region.id && ids.has(region.id)) failures.push(finding(context, "live-duplicate", region.id));
    ids.add(region.id);
    if (!region.hidden && region.busy && region.role === "alert") {
      failures.push(finding(context, "live-busy-alert", region.id || "alert"));
    }
    if (region.live === "off" && (region.role === "status" || region.role === "alert")) {
      failures.push(finding(context, "live-muted", region.id || region.role));
    }
  }
  return failures;
}

export interface LanguageTransition {
  readonly before: Language;
  readonly after: string;
  readonly buttonUsed: boolean;
  readonly hrefBefore: string;
  readonly hrefAfter: string;
  readonly headingBefore: string;
  readonly headingAfter: string;
  readonly buttonLabelAfter: string;
}
export function languageTransitionFindings(state: LanguageTransition, context: Context): Finding[] {
  const failures: Finding[] = [];
  if (!state.buttonUsed) failures.push(finding(context, "language-button", "Language control was not used"));
  if (state.after.toLowerCase().split("-")[0] !== "fr") failures.push(finding(context, "language-result", state.after));
  if (state.hrefAfter !== state.hrefBefore) failures.push(finding(context, "language-navigation", "Language button navigated away"));
  if (!state.headingAfter.trim()) failures.push(finding(context, "language-heading", "French heading missing"));
  if (!state.buttonLabelAfter.trim()) failures.push(finding(context, "language-control-name", "Language control lost its name"));
  return failures;
}

export interface EvidenceSnapshot {
  readonly id: string;
  readonly status: EvidenceState;
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly tier: string | null;
  readonly link: string | null;
}
const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0",
]);
export function validCalendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
export function evidenceFindings(items: readonly EvidenceSnapshot[], context: Context): Finding[] {
  const issues: Finding[] = [];
  const keys = new Set<string>();
  for (const item of items) {
    if (keys.has(item.id)) issues.push(finding(context, "evidence-duplicate", item.id));
    keys.add(item.id);
    if (item.status === "UNKNOWN") continue;
    if (!item.source?.trim()) issues.push(finding(context, "evidence-source", item.id));
    if (!item.licence?.trim() || !OPEN_LICENCES.has(item.licence)) issues.push(finding(context, "evidence-licence", item.id));
    if (!validCalendarDate(item.date)) issues.push(finding(context, "evidence-date", item.id));
    if (!item.tier?.trim()) issues.push(finding(context, "evidence-tier", item.id));
    if (item.link) {
      try {
        const url = new URL(item.link);
        if (url.protocol !== "https:" && url.protocol !== "http:") issues.push(finding(context, "evidence-link", item.id));
      } catch {
        issues.push(finding(context, "evidence-link", item.id));
      }
    }
  }
  return issues;
}
export interface DetailSnapshot {
  readonly requestedId: string;
  readonly activePath: string;
  readonly heading: string;
  readonly mainText: string;
  readonly visibleRecord: boolean;
  readonly emptyState: boolean;
  readonly errorState: boolean;
  readonly loading: boolean;
  readonly linkedFromList: boolean;
}
export function detailFindings(detail: DetailSnapshot, kind: "places" | "help", context: Context): Finding[] {
  const issues: Finding[] = [];
  const expected = `/${kind}/${encodeURIComponent(detail.requestedId)}`;
  if (!detail.requestedId.trim()) issues.push(finding(context, "detail-id", "Missing route parameter"));
  if (!detail.activePath.includes(`/${kind}/`)) issues.push(finding(context, "detail-route", `Expected ${expected}`));
  if (!detail.heading.trim()) issues.push(finding(context, "detail-heading", expected));
  if (!detail.mainText.trim()) issues.push(finding(context, "detail-content", expected));
  if (detail.loading) issues.push(finding(context, "detail-loading", expected));
  if (detail.errorState) issues.push(finding(context, "detail-error", expected));
  if (!detail.visibleRecord) issues.push(finding(context, "detail-no-record", `${expected}: record or article content is required`));
  if (!detail.linkedFromList) issues.push(finding(context, "detail-unlinked", expected));
  return issues;
}

export interface LinkSnapshot {
  readonly href: string;
  readonly text: string;
  readonly target: string;
  readonly rel: string;
  readonly download: boolean;
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
}
export function linkFindings(links: readonly LinkSnapshot[], context: Context, origin: string): Finding[] {
  const issues: Finding[] = [];
  for (const item of links) {
    if (!item.visible) continue;
    if (!item.text.trim()) issues.push(finding(context, "link-name", item.href));
    if (item.width < 44 || item.height < 44) issues.push(finding(context, "link-44", `${item.href}: ${item.width}x${item.height}`));
    try {
      const parsed = new URL(item.href, origin);
      // tel: and mailto: are ordinary contact links; script and data schemes are not.
      if (!["http:", "https:", "tel:", "mailto:"].includes(parsed.protocol) && !item.href.startsWith("#")) {
        issues.push(finding(context, "link-scheme", item.href));
      }
      if (item.target === "_blank" && !item.rel.split(/\s+/).includes("noopener")) {
        issues.push(finding(context, "link-opener", item.href));
      }
    } catch {
      issues.push(finding(context, "link-malformed", item.href));
    }
  }
  return issues;
}

export interface DialogSnapshot {
  readonly count: number;
  readonly accessibleName: string;
  readonly focusInside: boolean;
  readonly backgroundInert: boolean;
  readonly dismissible: boolean;
  readonly escapeClosed: boolean;
  readonly focusRestored: boolean;
}
export function dialogFindings(dialog: DialogSnapshot | null, context: Context): Finding[] {
  if (!dialog) return [];
  const issues: Finding[] = [];
  if (dialog.count !== 1) issues.push(finding(context, "dialog-count", String(dialog.count)));
  if (!dialog.accessibleName.trim()) issues.push(finding(context, "dialog-name", "Unnamed modal"));
  if (!dialog.focusInside) issues.push(finding(context, "dialog-focus", "Focus escaped modal"));
  if (!dialog.backgroundInert) issues.push(finding(context, "dialog-background", "Background is not inert"));
  if (dialog.dismissible && !dialog.escapeClosed) issues.push(finding(context, "dialog-escape", "Escape did not dismiss"));
  if (dialog.dismissible && dialog.escapeClosed && !dialog.focusRestored) {
    issues.push(finding(context, "dialog-restore", "Focus did not return to trigger"));
  }
  return issues;
}

export interface NavigationSnapshot {
  readonly from: string;
  readonly to: string;
  readonly titleBefore: string;
  readonly titleAfter: string;
  readonly headingAfter: string;
  readonly languageBefore: string;
  readonly languageAfter: string;
  readonly historyReturned: boolean;
}
export function navigationFindings(change: NavigationSnapshot, context: Context): Finding[] {
  const issues: Finding[] = [];
  if (change.from === change.to) issues.push(finding(context, "route-stationary", change.to));
  if (!change.titleAfter.trim()) issues.push(finding(context, "route-title", change.to));
  if (!change.headingAfter.trim()) issues.push(finding(context, "route-h1", change.to));
  if (change.languageAfter.split("-")[0] !== change.languageBefore.split("-")[0]) {
    issues.push(finding(context, "route-language", change.to));
  }
  if (!change.historyReturned) issues.push(finding(context, "route-back", change.from));
  return issues;
}

export interface SearchSnapshot {
  readonly query: string;
  readonly enabled: boolean;
  readonly entered: boolean;
  readonly submitted: boolean;
  readonly statusBefore: string;
  readonly statusAfter: string;
  readonly resultsBefore: number;
  readonly resultsAfter: number;
  readonly busyAfter: boolean;
  readonly errorVisible: boolean;
}
export function searchFindings(search: SearchSnapshot, context: Context): Finding[] {
  const issues: Finding[] = [];
  if (!search.enabled) return issues;
  if (!search.entered) issues.push(finding(context, "search-entry", "Search field could not receive text"));
  if (!search.submitted) issues.push(finding(context, "search-submit", "Form could not be submitted"));
  if (search.busyAfter) issues.push(finding(context, "search-busy", "Results remain busy"));
  if (search.errorVisible) issues.push(finding(context, "search-error", "Search produced an app error"));
  if (!search.statusAfter.trim()) issues.push(finding(context, "search-status", "Missing result status"));
  return issues;
}

export interface OfflineSnapshot {
  readonly documentLoaded: boolean;
  readonly language: string;
  readonly title: string;
  readonly mainCount: number;
  readonly statusText: string;
  readonly networkError: boolean;
  readonly claimedFresh: boolean;
}
export function offlineFindings(state: OfflineSnapshot, context: Context): Finding[] {
  const issues: Finding[] = [];
  if (!state.documentLoaded || state.networkError) issues.push(finding(context, "offline-document", "Offline document unavailable"));
  if (state.language.split("-")[0] !== context.language) issues.push(finding(context, "offline-language", state.language));
  if (!state.title.trim()) issues.push(finding(context, "offline-title", "No document title"));
  if (state.mainCount !== 1) issues.push(finding(context, "offline-main", String(state.mainCount)));
  if (!state.statusText.trim()) issues.push(finding(context, "offline-status", "No meaningful offline content"));
  if (state.claimedFresh) issues.push(finding(context, "offline-freshness", "Offline information is presented as current"));
  return issues;
}

/** Non-text media and table semantics that a route-level axe run may miss. */
export interface MediaSnapshot {
  readonly kind: "image" | "video" | "audio" | "canvas" | "svg";
  readonly id: string;
  readonly visible: boolean;
  readonly decorative: boolean;
  readonly alternative: string | null;
  readonly captions: boolean;
  readonly controls: boolean;
}
export function mediaFindings(media: readonly MediaSnapshot[], context: Context): Finding[] {
  const issues: Finding[] = [];
  for (const item of media) {
    if (!item.visible || item.decorative) continue;
    if (item.kind === "image" || item.kind === "canvas" || item.kind === "svg") {
      if (item.alternative === null || !item.alternative.trim()) {
        issues.push(finding(context, "media-alternative", `${item.kind}: ${item.id}`));
      }
    }
    if (item.kind === "video") {
      if (!item.captions) issues.push(finding(context, "video-captions", item.id));
      if (!item.controls) issues.push(finding(context, "video-controls", item.id));
    }
    if (item.kind === "audio" && !item.controls) {
      issues.push(finding(context, "audio-controls", item.id));
    }
  }
  return issues;
}

export interface TableSnapshot {
  readonly id: string;
  readonly rowCount: number;
  readonly headerCount: number;
  readonly caption: string;
  readonly isLayout: boolean;
  readonly hasHeaderAssociations: boolean;
}
export function tableFindings(tables: readonly TableSnapshot[], context: Context): Finding[] {
  const issues: Finding[] = [];
  for (const table of tables) {
    if (table.isLayout) continue;
    if (table.rowCount > 1 && table.headerCount === 0) {
      issues.push(finding(context, "table-headers", table.id));
    }
    if (!table.caption.trim()) issues.push(finding(context, "table-caption", table.id));
    if (!table.hasHeaderAssociations && table.headerCount > 0) {
      issues.push(finding(context, "table-associations", table.id));
    }
  }
  return issues;
}
