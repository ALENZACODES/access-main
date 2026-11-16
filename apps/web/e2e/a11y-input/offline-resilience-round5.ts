import { expect, type BrowserContext, type Page } from "@playwright/test";

export interface OfflineFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface OfflineSnapshot {
  readonly title: string;
  readonly language: string;
  readonly mainCount: number;
  readonly headingCount: number;
  readonly focusableCount: number;
  readonly status: string;
}

/** Snapshot basic accessibility state without requiring application-specific strings. */
export async function snapshotOfflineShell(page: Page): Promise<OfflineSnapshot> {
  return page.evaluate(() => {
    const displayed = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" &&
        element.getBoundingClientRect().width > 0;
    };
    return {
      title: document.title.trim(),
      language: document.documentElement.lang.trim(),
      mainCount: Array.from(document.querySelectorAll("main,[role='main']")).filter(displayed).length,
      headingCount: Array.from(document.querySelectorAll("h1,[role='heading'][aria-level='1']")).filter(displayed).length,
      focusableCount: Array.from(document.querySelectorAll(
        "a[href],button,input:not([type='hidden']),select,textarea,[tabindex='0']",
      )).filter(displayed).length,
      status: Array.from(document.querySelectorAll("[data-accessibility-status]"))
        .map((element) => element.getAttribute("data-accessibility-status") || "")
        .join("|"),
    };
  });
}

/**
 * Configuration is opt-in because an app's shell may not cache every document.
 * Route tests only assert offline availability for explicitly designated paths.
 */
export function configuredResilienceRoutes(): readonly string[] {
  const raw = process.env.A11Y_RESILIENCE_ROUTES?.trim();
  if (!raw) return [];
  const paths = raw.split(",").map((path) => path.trim());
  for (const path of paths) {
    if (!path || !path.startsWith("/") || path.startsWith("//") ||
        /[?#\\]/.test(path) || path.includes("..")) {
      throw new Error("A11Y_RESILIENCE_ROUTES accepts only local paths without query strings");
    }
  }
  return [...new Set(paths)];
}

/** Simulate disconnection without loading external resources or modifying storage. */
export async function auditOfflineRecovery(
  page: Page,
  context: BrowserContext,
  url: string,
): Promise<OfflineFinding[]> {
  const issues: OfflineFinding[] = [];
  const originalURL = new URL(url);
  if (page.url() !== originalURL.toString()) {
    const response = await page.goto(originalURL.toString(), { waitUntil: "domcontentloaded" });
    if (!response?.ok()) {
      return [{ code: "offline-warmup", target: originalURL.pathname, detail: String(response?.status()) }];
    }
  }
  const before = await snapshotOfflineShell(page);
  try {
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 7000 });
    } catch {
      issues.push({ code: "offline-document-unavailable", target: originalURL.pathname, detail: "Document not served offline" });
      return issues;
    }
    const after = await snapshotOfflineShell(page);
    if (!after.title) issues.push({ code: "offline-title", target: originalURL.pathname, detail: "No title" });
    if (!/^(en|fr)(?:-|$)/i.test(after.language)) {
      issues.push({ code: "offline-language", target: originalURL.pathname, detail: after.language });
    }
    if (after.mainCount !== 1) {
      issues.push({ code: "offline-main", target: originalURL.pathname, detail: String(after.mainCount) });
    }
    if (after.headingCount !== 1) {
      issues.push({ code: "offline-heading", target: originalURL.pathname, detail: String(after.headingCount) });
    }
    if (after.focusableCount === 0) {
      issues.push({ code: "offline-input", target: originalURL.pathname, detail: "No keyboard control" });
    }
    if (before.status.includes("UNKNOWN") && !after.status.includes("UNKNOWN") &&
        (await page.locator("[data-accessibility-status]").count()) > 0) {
      issues.push({ code: "offline-unknown-changed", target: originalURL.pathname, detail: after.status });
    }
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => document.activeElement !== document.body);
    if (!focus) issues.push({ code: "offline-focus", target: originalURL.pathname, detail: "Tab cannot enter UI" });
  } finally {
    await context.setOffline(false);
    await page.goto(originalURL.toString(), { waitUntil: "domcontentloaded" });
  }
  return issues;
}

export async function assertOfflineRecovery(
  page: Page,
  context: BrowserContext,
  url: string,
): Promise<void> {
  expect(await auditOfflineRecovery(page, context, url), "Offline access and keyboard recovery").toEqual([]);
}
