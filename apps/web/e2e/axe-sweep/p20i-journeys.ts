import type { Context, Issue, Knowledge, Locale } from "./p20i-contracts";
import { issue } from "./p20i-contracts";

/** Search and navigation are evaluated from actual browser outcomes. */
export interface SearchOutcome {
  readonly route: string;
  readonly enabled: boolean;
  readonly submitted: boolean;
  readonly query: string;
  readonly priorStatus: string;
  readonly nextStatus: string;
  readonly pending: boolean;
  readonly resultCount: number | null;
  readonly error: string | null;
}
export interface DetailOutcome {
  readonly parentRoute: "/places" | "/help";
  readonly href: string;
  readonly requestedId: string;
  readonly path: string;
  readonly heading: string;
  readonly mainText: string;
  readonly recordVisible: boolean;
  readonly emptyState: boolean;
  readonly linkedFromList: boolean;
  readonly loading: boolean;
  readonly source: string | null;
  readonly licence: string | null;
  readonly sourceDate: string | null;
  readonly accessibility: Knowledge;
}
export interface OfflineOutcome {
  readonly requestedRoute: string;
  readonly locale: Locale;
  readonly documentLoaded: boolean;
  readonly networkFailure: boolean;
  readonly mainCount: number;
  readonly title: string;
  readonly message: string;
  readonly claimedCurrent: boolean;
  readonly hadCachedContent: boolean;
  readonly cacheDate: string | null;
}
export interface HistoryOutcome {
  readonly before: string;
  readonly after: string;
  readonly back: string;
  readonly langBefore: Locale;
  readonly langAfter: Locale;
  readonly focusReturned: boolean;
  readonly navigationSucceeded: boolean;
}
export interface SavedPreferenceOutcome {
  readonly selectedLanguage: Locale;
  readonly reloadedLanguage: string;
  readonly reloadedPath: string;
  readonly expectedPath: string;
  readonly storageEnabled: boolean;
}

const DETAIL = /^\/(places|help)\/([^/?#]+)\/?$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERMITTED_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0"]);

export function detailIdFromHref(raw: string, origin: string): string | null {
  let url: URL;
  try { url = new URL(raw, origin); } catch { return null; }
  if (url.origin !== origin || url.search || url.hash) return null;
  const match = DETAIL.exec(url.pathname);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2] ?? "");
    return id.trim() && !id.includes("/") && id !== "." && id !== ".." ? id : null;
  } catch { return null; }
}

export function searchOutcomeIssues(value: SearchOutcome, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (value.route !== context.route) issues.push(issue("search-route", context, value.route));
  if (!value.enabled) return issues;
  if (!value.submitted) issues.push(issue("search-submit", context, "Enabled search was not submitted"));
  if (!value.query.trim() && value.submitted) issues.push(issue("search-query", context, "Empty submitted query"));
  if (value.pending) issues.push(issue("search-pending", context, "Search did not settle"));
  if (!value.nextStatus.trim()) issues.push(issue("search-status", context, "Missing result status"));
  if (value.submitted && value.priorStatus === value.nextStatus && !value.error) issues.push(issue("search-stale-status", context, "Result status did not change"));
  if (value.resultCount !== null && (!Number.isSafeInteger(value.resultCount) || value.resultCount < 0)) issues.push(issue("search-count", context, String(value.resultCount)));
  if (value.error && !value.nextStatus.toLocaleLowerCase().includes(value.error.toLocaleLowerCase())) issues.push(issue("search-error-announcement", context, value.error));
  return issues;
}

export function detailOutcomeIssues(value: DetailOutcome, context: Context, origin: string): Issue[] {
  const issues: Issue[] = [];
  const sourceId = detailIdFromHref(value.href, origin);
  if (!value.linkedFromList) issues.push(issue("detail-navigation", context, "Detail was not reached from an actual list"));
  if (sourceId === null) issues.push(issue("detail-link", context, value.href));
  if (sourceId !== null && sourceId !== value.requestedId) issues.push(issue("detail-id", context, value.requestedId));
  if (value.path !== `/${value.parentRoute.slice(1)}/${encodeURIComponent(value.requestedId)}` &&
      value.path !== `/${value.parentRoute.slice(1)}/${value.requestedId}`) issues.push(issue("detail-path", context, value.path));
  if (!value.heading.trim()) issues.push(issue("detail-heading", context, "Missing heading"));
  if (!value.mainText.trim()) issues.push(issue("detail-content", context, "Missing main content"));
  if (value.loading) issues.push(issue("detail-loading", context, "Detail is not settled"));
  if (!value.recordVisible && !value.emptyState) issues.push(issue("detail-record", context, "Neither sourced record nor honest empty state"));
  if (value.recordVisible) {
    if (!value.source?.trim()) issues.push(issue("detail-source", context, value.requestedId));
    if (!value.licence || !PERMITTED_LICENCES.has(value.licence)) issues.push(issue("detail-licence", context, value.requestedId));
    if (!value.sourceDate || !VALID_DATE.test(value.sourceDate)) issues.push(issue("detail-date", context, value.requestedId));
  }
  return issues;
}

export function offlineOutcomeIssues(value: OfflineOutcome, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (value.requestedRoute !== context.route) issues.push(issue("offline-route", context, value.requestedRoute));
  if (value.locale !== context.locale) issues.push(issue("offline-locale", context, value.locale));
  if (!value.documentLoaded) {
    if (!value.networkFailure) issues.push(issue("offline-unexplained", context, "No document and no network error"));
    return issues;
  }
  if (value.mainCount !== 1) issues.push(issue("offline-main", context, String(value.mainCount)));
  if (!value.title.trim()) issues.push(issue("offline-title", context, "Missing title"));
  if (!value.message.trim()) issues.push(issue("offline-message", context, "No app state message"));
  if (value.claimedCurrent) issues.push(issue("offline-freshness", context, "Stored information presented as current"));
  if (value.hadCachedContent && !value.cacheDate) issues.push(issue("offline-cache-date", context, "Cached content has no date"));
  if (value.cacheDate && !VALID_DATE.test(value.cacheDate)) issues.push(issue("offline-cache-date", context, value.cacheDate));
  return issues;
}

export function historyOutcomeIssues(value: HistoryOutcome, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (value.before === value.after) issues.push(issue("navigation-noop", context, value.after));
  if (value.back !== value.before) issues.push(issue("navigation-back", context, value.back));
  if (value.langBefore !== value.langAfter) issues.push(issue("navigation-language", context, value.langAfter));
  if (!value.focusReturned) issues.push(issue("navigation-focus", context, "Focus was not restored"));
  if (!value.navigationSucceeded) issues.push(issue("navigation-result", context, "Navigation failed"));
  return issues;
}

export function preferenceOutcomeIssues(value: SavedPreferenceOutcome, context: Context): Issue[] {
  const issues: Issue[] = [];
  if (value.storageEnabled && value.reloadedLanguage !== value.selectedLanguage) issues.push(issue("language-persistence", context, value.reloadedLanguage));
  if (!value.storageEnabled && value.reloadedLanguage !== value.selectedLanguage) issues.push(issue("language-session", context, value.reloadedLanguage));
  if (value.reloadedPath !== value.expectedPath) issues.push(issue("language-route", context, value.reloadedPath));
  return issues;
}

export function routeIdentityIssues(paths: readonly string[], expected: readonly string[], context: Context): Issue[] {
  const actual = new Set(paths);
  const wanted = new Set(expected);
  const issues: Issue[] = [];
  for (const route of wanted) if (!actual.has(route)) issues.push(issue("missing-route", context, route));
  for (const route of actual) if (!wanted.has(route)) issues.push(issue("unexpected-route", context, route));
  if (paths.length !== actual.size) issues.push(issue("duplicate-route", context, "Route inventory contains duplicates"));
  return issues;
}

export function resultStatusFromText(text: string, locale: Locale): "COUNT" | "ERROR" | "PENDING" | "UNKNOWN" {
  const normalized = text.trim().toLocaleLowerCase(locale === "fr" ? "fr-CA" : "en-CA");
  if (!normalized) return "UNKNOWN";
  if (locale === "en" && /^\d+ results?$/.test(normalized)) return "COUNT";
  if (locale === "fr" && /^\d+ résultats?$/.test(normalized)) return "COUNT";
  if (/loading|chargement|please wait|veuillez patienter/.test(normalized)) return "PENDING";
  if (/error|failed|erreur|échec|indisponible|unavailable/.test(normalized)) return "ERROR";
  return "UNKNOWN";
}

export function containsUnfoundedClaim(text: string): boolean {
  return /\b(always accessible|fully accessible|guaranteed accessible|up-to-the-second)\b|\b(entièrement accessible|accessibilité garantie)\b/i.test(text);
}
