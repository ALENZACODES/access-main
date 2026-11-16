import type { BrowserContext, Page } from "@playwright/test";
import {
  canonicalUrl,
  languageOf,
  logicalRoute,
  finding,
  type Finding,
  type Language,
  type LocaleRoute,
  type NetworkAttempt,
} from "./p20d-contracts";
import { findLocalLinks, snapshotDocument, type DocumentSnapshot } from "./p20d-page-audit";

export interface RouteScan {
  readonly pages: readonly DocumentSnapshot[];
  readonly routes: readonly LocaleRoute[];
  readonly findings: readonly Finding[];
  readonly blocked: readonly string[];
  readonly attempts: readonly NetworkAttempt[];
  readonly exceeded: boolean;
}

export interface VisitSettings {
  readonly baseURL: string;
  readonly enURL?: string;
  readonly frURL?: string;
  readonly limit: number;
  readonly timeoutMs: number;
}

/** Probe conventional entries and explicit overrides without assuming their existence. */
export function startingPoints(settings: VisitSettings): string[] {
  const base = new URL(settings.baseURL);
  const candidates = [
    settings.enURL,
    settings.frURL,
    new URL("/", base).href,
    new URL("/en", base).href,
    new URL("/fr", base).href,
    new URL("/?lang=en", base).href,
    new URL("/?lang=fr", base).href,
  ];
  return [...new Set(candidates.filter((v): v is string => Boolean(v)).map((v) =>
    canonicalUrl(v, settings.baseURL, base.origin),
  ).filter((v): v is string => v !== null))];
}

export interface ResponseInfo {
  readonly status: number | null;
  readonly finalURL: string;
  readonly isDocument: boolean;
}

export function responseFindings(info: ResponseInfo, requested: string): Finding[] {
  if (info.status === null) return [finding("navigation-no-response", requested, info.finalURL)];
  if (info.status >= 500) return [finding("navigation-server-error", requested, String(info.status))];
  if (info.status >= 400 && info.status !== 404) {
    return [finding("navigation-http-error", requested, String(info.status))];
  }
  if (!info.isDocument && info.status !== 404) {
    return [finding("navigation-not-html", requested, info.finalURL)];
  }
  return [];
}

/**
 * Crawl with a hard cap. Reaching the cap reports an error instead of
 * quietly omitting links. The browser visits public same-origin documents.
 */
export async function scanRoutes(page: Page, settings: VisitSettings): Promise<RouteScan> {
  const origin = new URL(settings.baseURL).origin;
  const queue = [...startingPoints(settings)];
  const queued = new Set(queue);
  const seen = new Set<string>();
  const pages: DocumentSnapshot[] = [];
  const routes: LocaleRoute[] = [];
  const findings: Finding[] = [];
  const blocked: string[] = [];
  const attempts: NetworkAttempt[] = [];
  let exceeded = false;
  const onRequest = (request: { url(): string; method(): string; resourceType(): string }): void => {
    attempts.push({ url: request.url(), method: request.method(), type: request.resourceType() });
  };
  page.on("request", onRequest);
  try {
    while (queue.length) {
      if (seen.size >= settings.limit) {
        exceeded = true;
        break;
      }
      const next = queue.shift();
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      let response;
      try {
        response = await page.goto(next, { waitUntil: "domcontentloaded", timeout: settings.timeoutMs });
      } catch (error) {
        findings.push(finding("navigation-exception", next, String(error)));
        blocked.push(next);
        continue;
      }
      const status = response?.status() ?? null;
      const type = response?.headers()["content-type"] ?? "";
      findings.push(...responseFindings({
        status,
        finalURL: page.url(),
        isDocument: type.includes("text/html") || type === "",
      }, next));
      if (status === 404) {
        blocked.push(next);
        continue;
      }
      if (status === null || status >= 400) continue;
      const snapshot = await snapshotDocument(page);
      pages.push(snapshot);
      const language = languageOf(snapshot.language);
      if (language) {
        routes.push({ url: snapshot.url, language, key: logicalRoute(snapshot.url) });
      }
      for (const href of findLocalLinks(snapshot, settings.baseURL)) {
        const normalized = canonicalUrl(href, snapshot.url, origin);
        if (!normalized || queued.has(normalized)) continue;
        queued.add(normalized);
        queue.push(normalized);
      }
    }
  } finally {
    page.off("request", onRequest);
  }
  if (queue.length > 0) exceeded = true;
  if (exceeded) {
    findings.push(finding("crawl-coverage-cap", settings.baseURL,
      `${settings.limit} routes scanned; ${queue.length} queued routes remain`));
  }
  const locales = new Set(routes.map((route) => route.language));
  for (const language of ["en", "fr"] as const) {
    if (!locales.has(language)) findings.push(finding("missing-locale", settings.baseURL, language));
  }
  return { pages, routes, findings, blocked, attempts, exceeded };
}

export interface LinkCheck {
  readonly source: string;
  readonly href: string;
  readonly target: string | null;
  readonly reason: string | null;
}

export function evaluateLinks(
  source: string,
  links: readonly string[],
  origin: string,
): LinkCheck[] {
  return links.map((href) => {
    try {
      const parsed = new URL(href, source);
      if (["mailto:", "tel:"].includes(parsed.protocol)) {
        return { source, href, target: null, reason: null };
      }
      if (/^javascript:/i.test(href)) {
        return { source, href, target: null, reason: "script-link" };
      }
      if (!["https:", "http:"].includes(parsed.protocol)) {
        return { source, href, target: null, reason: "invalid-protocol" };
      }
      if (parsed.origin !== origin) {
        return { source, href, target: null, reason: null };
      }
      if (parsed.hash && parsed.pathname === new URL(source).pathname) {
        return { source, href, target: parsed.href, reason: null };
      }
      return { source, href, target: canonicalUrl(parsed.href, source, origin), reason: null };
    } catch {
      return { source, href, target: null, reason: "bad-url" };
    }
  });
}

export function linkFindings(checks: readonly LinkCheck[]): Finding[] {
  return checks.filter((check) => check.reason !== null)
    .map((check) => finding("invalid-link", check.source, `${check.href}: ${check.reason}`));
}

export function routeDuplicates(routes: readonly LocaleRoute[]): Finding[] {
  const seen = new Map<string, string>();
  const issues: Finding[] = [];
  for (const route of routes) {
    const key = `${route.language}|${route.key}`;
    const previous = seen.get(key);
    if (previous && previous !== route.url) {
      issues.push(finding("duplicate-locale-route", route.url, `${key} also at ${previous}`));
    }
    seen.set(key, route.url);
  }
  return issues;
}

/**
 * Check a language switch by following its actual link and reading the
 * destination language. A href alone is not proof of a translation.
 */
export async function followLanguageAlternate(
  page: Page,
  sourceURL: string,
  targetURL: string,
  expected: Language,
): Promise<Finding[]> {
  const issues: Finding[] = [];
  try {
    const response = await page.goto(targetURL, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) {
      issues.push(finding("language-target-http", sourceURL,
        `${targetURL}: ${response?.status() ?? "no response"}`));
      return issues;
    }
    const actual = languageOf(await page.locator("html").getAttribute("lang"));
    if (actual !== expected) {
      issues.push(finding("language-switch-mismatch", sourceURL,
        `${targetURL}: expected ${expected}, got ${actual ?? "UNKNOWN"}`));
    }
    if (logicalRoute(page.url()) !== logicalRoute(sourceURL)) {
      issues.push(finding("language-switch-destination", sourceURL, page.url()));
    }
  } catch (error) {
    issues.push(finding("language-switch-navigation", sourceURL, String(error)));
  }
  return issues;
}

export function localOnlyContext(context: BrowserContext, origin: string): Promise<void> {
  return context.route("**/*", (route) => {
    const url = route.request().url();
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol) && parsed.origin !== origin &&
        /(?:tile|tiles|mapbox|cartocdn|thunderforest|stadia)/i.test(parsed.hostname)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

export function scanSettings(baseURL: string): VisitSettings {
  return {
    baseURL,
    ...(process.env.AXE_SWEEP_EN_URL ? { enURL: process.env.AXE_SWEEP_EN_URL } : {}),
    ...(process.env.AXE_SWEEP_FR_URL ? { frURL: process.env.AXE_SWEEP_FR_URL } : {}),
    limit: 100,
    timeoutMs: 20_000,
  };
}
