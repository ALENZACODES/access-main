import { expect, type BrowserContext, type Page } from "@playwright/test";

export type SupportedLanguage = "en" | "fr";

export interface LocaleRoute {
  readonly language: SupportedLanguage;
  readonly path: string;
}

export interface LocaleIssue {
  readonly location: string;
  readonly reason: string;
}

export interface OfflineObservation {
  readonly beforeTitle: string;
  readonly afterTitle: string;
  readonly appShellVisible: boolean;
  readonly offlineNoticeVisible: boolean;
  readonly requestFailures: readonly string[];
}

/**
 * Locale paths are configured, not invented. If both locale routes are
 * provided, tests can exercise actual translated UI without hardcoding copy.
 */
export function configuredLocalePairs(): readonly [LocaleRoute, LocaleRoute][] {
  const value = process.env.A11Y_LOCALE_PAIRS?.trim();
  if (!value) return [];
  return value.split(",").map((pair) => {
    const segments = pair.split("|");
    if (segments.length !== 2) {
      throw new Error("Locale pairs require en-path|fr-path entries");
    }
    const [english, french] = segments;
    if (!english.startsWith("/") || !french.startsWith("/") ||
        english.startsWith("//") || french.startsWith("//") ||
        /[\\#?]/.test(english + french)) {
      throw new Error("Locale pairs must be local paths without queries or fragments");
    }
    if (english === french) {
      throw new Error("English and French paths must be distinct");
    }
    return [
      { language: "en", path: english },
      { language: "fr", path: french },
    ] as const;
  });
}

export function configuredOfflineRoutes(): string[] {
  const value = process.env.A11Y_OFFLINE_ROUTES?.trim();
  if (!value) return [];
  const paths = value.split(",").map((item) => item.trim());
  if (paths.some((path) => !path.startsWith("/") ||
      path.startsWith("//") || /[\\#?]/.test(path))) {
    throw new Error("Offline routes must be local paths");
  }
  return [...new Set(paths)];
}

/**
 * Language is a semantic assertion, not a text-translation heuristic. A page
 * needs the correct language so assistive technology can choose pronunciation.
 */
export async function assertDocumentLanguage(
  page: Page,
  language: SupportedLanguage,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(
    "lang", new RegExp(`^${language}(?:-[A-Za-z0-9]+)*$`, "i"),
  );
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect((await page.title()).trim().length).toBeGreaterThan(0);
}

/**
 * Inspect punctuation in elements opted into the project's localized-copy
 * check. Only a public opt-in attribute is read; unrelated user-generated
 * content is not assumed to be translated or reformatted.
 */
export async function inspectFrenchPunctuation(page: Page): Promise<LocaleIssue[]> {
  return page.evaluate(() => {
    const issues: { location: string; reason: string }[] = [];
    const candidates = document.querySelectorAll<HTMLElement>("[data-a11y-localized-copy]");
    for (const [index, element] of Array.from(candidates).entries()) {
      const text = element.textContent ?? "";
      const location = element.id || `localized element ${index}`;
      if (text.includes("'")) {
        issues.push({ location, reason: "Use typographic apostrophe U+2019 in French copy" });
      }
      if (/(?:^|[^\u00A0])\s:/.test(text)) {
        issues.push({ location, reason: "Use U+00A0 before French colon" });
      }
      if (/\s[;!?]/.test(text) && /[ \t][;!?]/.test(text)) {
        issues.push({ location, reason: "Use U+202F before ; ! ?" });
      }
      if (/«[^\u202F\s]/.test(text) || /[^\u202F\s]»/.test(text)) {
        issues.push({ location, reason: "Use U+202F inside French guillemets" });
      }
    }
    return issues;
  });
}

/**
 * Records the distinction between an offline shell and an offline dataset.
 * Seeing a cached page is not evidence that route data is complete or current.
 */
export async function observeOfflineShell(
  context: BrowserContext,
  page: Page,
  routeUrl: string,
): Promise<OfflineObservation> {
  const beforeTitle = await page.title();
  const failures: string[] = [];
  const listener = (request: { url(): string; failure(): { errorText: string } | null }): void => {
    const error = request.failure();
    if (error) failures.push(`${request.url()}: ${error.errorText}`);
  };
  page.on("requestfailed", listener);
  await context.setOffline(true);
  try {
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 10_000 })
      .catch(() => null);
    const afterTitle = await page.title();
    const appShellVisible = await page.getByRole("main").isVisible()
      .catch(() => false);
    // This marker is opt-in. Absence does not prove or disprove offline support.
    const offlineNoticeVisible = await page.locator(
      '[role="status"][data-offline-state], [data-a11y-offline-notice]',
    ).first().isVisible().catch(() => false);
    return {
      beforeTitle,
      afterTitle,
      appShellVisible,
      offlineNoticeVisible,
      requestFailures: failures,
    };
  } finally {
    await context.setOffline(false);
    page.off("requestfailed", listener);
  }
}

/**
 * Checks explicitly rendered accessibility facts without assuming unknown
 * entries are inaccessible. No text is rewritten or exported by these tests.
 */
export async function inspectEvidenceLabels(page: Page): Promise<LocaleIssue[]> {
  return page.evaluate(() => {
    const issues: { location: string; reason: string }[] = [];
    const cards = document.querySelectorAll<HTMLElement>("[data-a11y-evidence-record]");
    for (const [index, card] of Array.from(cards).entries()) {
      const location = card.id || `evidence record ${index}`;
      const source = card.getAttribute("data-source")?.trim();
      const licence = card.getAttribute("data-licence")?.trim();
      const date = card.getAttribute("data-observed-date")?.trim();
      if (!source) issues.push({ location, reason: "Missing source" });
      if (!licence) issues.push({ location, reason: "Missing licence" });
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        issues.push({ location, reason: "Missing or invalid source date" });
      }
      const value = card.getAttribute("data-accessibility-state");
      if (value === "UNKNOWN" && card.getAttribute("data-inferred") === "true") {
        issues.push({ location, reason: "UNKNOWN must not be inferred" });
      }
      if (value === "UNKNOWN" && card.getAttribute("data-accessibility-claim") === "true") {
        issues.push({ location, reason: "UNKNOWN must not be presented as an accessibility claim" });
      }
    }
    return issues;
  });
}

export function assertOfflineObservation(
  observation: OfflineObservation,
  requireNotice: boolean,
): void {
  expect(observation.appShellVisible,
    "Previously visited offline route should retain a readable main landmark")
    .toBe(true);
  expect(observation.afterTitle.trim(), "Offline title should remain readable")
    .not.toBe("");
  if (requireNotice) {
    expect(observation.offlineNoticeVisible,
      "Explicit offline notice should identify missing connectivity")
      .toBe(true);
  }
}
