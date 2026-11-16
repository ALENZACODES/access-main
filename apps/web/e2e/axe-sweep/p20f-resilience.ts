/**
 * Offline and network-degradation contracts for an accessibility journey.
 * A failed fetch cannot turn missing information into a known access result.
 */
import type { Page } from "@playwright/test";
import { issue, type Issue, type Locale, type State } from "./p20f-contracts";

export interface NetworkTrial {
  readonly locale: Locale;
  readonly url: string;
  readonly wasLoadedOnline: boolean;
  readonly wasReadableOffline: boolean;
  readonly documentLanguage: string | null;
  readonly accessibleRetry: boolean;
  readonly retryTargetSize: { readonly width: number; readonly height: number } | null;
  readonly offlineMessage: string;
  readonly showedUnsupportedSuccess: boolean;
  readonly staleLabel: boolean;
  readonly routeSurvived: boolean;
  readonly outboundRequests: readonly string[];
}

export interface FailureState {
  readonly requested: State;
  readonly responseOk: boolean;
  readonly responseStatus: number | null;
  readonly recordSource: string | null;
  readonly fallback: State;
}

export interface PersistenceTrial {
  readonly key: string;
  readonly locale: Locale;
  readonly before: string;
  readonly afterReload: string;
  readonly explicitSaved: boolean;
  readonly hadWarning: boolean;
}

export interface FocusTrial {
  readonly starting: string | null;
  readonly after: string | null;
  readonly contentChanged: boolean;
  readonly focusedInHiddenTree: boolean;
  readonly activeName: string;
  readonly announcement: string;
}

const OFFLINE_MESSAGES: Readonly<Record<Locale, RegExp>> = {
  en: /\b(?:offline|no connection|unavailable|connection lost|try again|cached|saved)\b/i,
  fr: /\b(?:hors ligne|connexion|indisponible|réessayer|enregistré|enregistrée|sauvegardé)\b/i,
};

const UNSUPPORTED_SUCCESS = /\b(?:all places accessible|everything accessible|tous les lieux accessibles|aucun obstacle)\b/i;

export function inspectNetworkTrial(trial: NetworkTrial): Issue[] {
  const problems: Issue[] = [];
  if (!trial.wasLoadedOnline) {
    problems.push(issue("offline", "baseline", trial.url, "Online baseline was not loaded"));
    return problems;
  }
  if (!trial.wasReadableOffline) {
    problems.push(issue("offline", "unreadable", trial.url, "Offline page has no readable content"));
  }
  if (!trial.routeSurvived) {
    problems.push(issue("offline", "route", trial.url, "Offline route lost its document shell"));
  }
  if (!trial.documentLanguage || !trial.documentLanguage.toLowerCase().startsWith(trial.locale)) {
    problems.push(issue("offline", "language", trial.url, "Offline document lost locale metadata"));
  }
  if (!OFFLINE_MESSAGES[trial.locale].test(trial.offlineMessage)) {
    problems.push(issue("offline", "message", trial.url, "Offline limitations are not explained in the route language"));
  }
  if (!trial.accessibleRetry) {
    problems.push(issue("offline", "retry", trial.url, "Offline retry is not keyboard accessible"));
  } else if (trial.retryTargetSize && (trial.retryTargetSize.width < 44 || trial.retryTargetSize.height < 44)) {
    problems.push(issue("offline", "retry-size", trial.url, "Retry target is smaller than 44×44px"));
  }
  if (trial.showedUnsupportedSuccess || UNSUPPORTED_SUCCESS.test(trial.offlineMessage)) {
    problems.push(issue("offline", "unsupported-success", trial.url, "Offline failure must not imply positive access evidence"));
  }
  if (trial.staleLabel === false) {
    problems.push(issue("offline", "stale", trial.url, "Cached information must identify its offline limitations"));
  }
  const origin = new URL(trial.url).origin;
  for (const request of trial.outboundRequests) {
    try {
      if (new URL(request, origin).origin !== origin) {
        problems.push(issue("offline", "remote-request", trial.url, "Offline view attempted a remote request"));
      }
    } catch {
      problems.push(issue("offline", "request-url", trial.url, "Malformed request URL"));
    }
  }
  return problems;
}

export function inspectFailureState(trial: FailureState): Issue[] {
  const problems: Issue[] = [];
  if (!trial.responseOk && trial.fallback === "PASS") {
    problems.push(issue("state", "failed-request-pass", "network", "Network failure cannot establish a positive result"));
  }
  if (!trial.responseOk && trial.fallback === "BLOCKED" && !trial.recordSource) {
    problems.push(issue("state", "failed-request-blocked", "network", "Network failure cannot establish a new barrier without evidence"));
  }
  if (trial.responseStatus !== null && trial.responseStatus >= 500 && trial.fallback === "PASS") {
    problems.push(issue("errors", "server-pass", "network", "Server errors must not be reported as positive access"));
  }
  return problems;
}

export function inspectPersistence(trial: PersistenceTrial): Issue[] {
  const problems: Issue[] = [];
  if (trial.explicitSaved && trial.before !== trial.afterReload) {
    problems.push(issue("navigation", "lost-preference", trial.key, "Explicitly saved setting was lost after reload"));
  }
  if (!trial.explicitSaved && trial.before !== trial.afterReload && !trial.hadWarning) {
    problems.push(issue("navigation", "silent-reset", trial.key, "Setting reset without a warning"));
  }
  return problems;
}

export function inspectFocusTrial(trial: FocusTrial, url: string): Issue[] {
  const problems: Issue[] = [];
  if (trial.focusedInHiddenTree) {
    problems.push(issue("navigation", "hidden-focus", url, "Focus moved into an inaccessible hidden region"));
  }
  if (trial.contentChanged && !trial.after && !trial.announcement.trim()) {
    problems.push(issue("navigation", "lost-focus", url, "Content changed with no focus or announcement"));
  }
  if (trial.after && !trial.activeName.trim()) {
    problems.push(issue("navigation", "unnamed-focus", url, "Focused control has no accessible name"));
  }
  return problems;
}

/**
 * Exercise offline state only for routes that actually expose an offline
 * message or cached content. The surrounding test decides which routes are
 * required to be offline capable; this collector never claims that a
 * successful navigation means the data was refreshed.
 */
export async function runNetworkTrial(page: Page, url: string, locale: Locale): Promise<NetworkTrial> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const wasLoadedOnline = !!response?.ok();
  const requests: string[] = [];
  const onRequest = (request: { url(): string }): void => { requests.push(request.url()); };
  await page.context().setOffline(true);
  page.on("request", onRequest);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 8_000 }).catch(() => null);
    const snapshot = await page.evaluate(() => {
      const body = document.body;
      const main = document.querySelector("main,[role=main]");
      const text = (main?.textContent || body?.textContent || "").trim();
      const controls = Array.from(document.querySelectorAll<HTMLElement>("button,a[href],[role=button]"));
      const retry = controls.find((element) => /(?:retry|try again|réessayer|recharger)/i.test(
        (element.getAttribute("aria-label") || element.textContent || "").trim(),
      ));
      const rect = retry?.getBoundingClientRect();
      const offlineMessage = text.match(/(?:offline|no connection|try again|cached|saved|hors ligne|connexion|indisponible|réessayer|enregistré)[^.!?\n]{0,130}/i)?.[0] ?? "";
      return {
        wasReadableOffline: text.length > 20,
        documentLanguage: document.documentElement.lang || null,
        accessibleRetry: !!retry && retry.tabIndex >= 0,
        retryTargetSize: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        offlineMessage,
        showedUnsupportedSuccess: /(?:all places accessible|everything accessible|tous les lieux accessibles)/i.test(text),
        staleLabel: /(?:offline|cached|saved|hors ligne|enregistré|ancienne version)/i.test(text),
        routeSurvived: !!main && !!document.title,
      };
    }).catch(() => ({
      wasReadableOffline: false, documentLanguage: null, accessibleRetry: false,
      retryTargetSize: null, offlineMessage: "", showedUnsupportedSuccess: false,
      staleLabel: false, routeSurvived: false,
    }));
    return { locale, url, wasLoadedOnline, ...snapshot, outboundRequests: requests };
  } finally {
    page.off("request", onRequest);
    await page.context().setOffline(false);
  }
}
