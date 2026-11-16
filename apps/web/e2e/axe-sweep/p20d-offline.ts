import type { BrowserContext, Page } from "@playwright/test";
import { finding, languageOf, type Finding, type Language } from "./p20d-contracts";

export interface OfflineSnapshot {
  readonly location: string;
  readonly language: Language | null;
  readonly title: string;
  readonly visibleText: string;
  readonly mainCount: number;
  readonly hasControls: boolean;
  readonly controlled: boolean;
  readonly online: boolean;
}

export interface OfflineTrial {
  readonly before: OfflineSnapshot;
  readonly after: OfflineSnapshot | null;
  readonly error: string | null;
}

export function offlineFindings(trial: OfflineTrial): Finding[] {
  const issues: Finding[] = [];
  const url = trial.before.location;
  if (!trial.before.controlled) {
    issues.push(finding("offline-service-worker-not-controlling", url,
      "A controlling service worker is required for offline navigation"));
  }
  if (trial.error) issues.push(finding("offline-navigation-failed", url, trial.error));
  if (!trial.after) {
    issues.push(finding("offline-no-document", url, "Offline navigation produced no document"));
    return issues;
  }
  if (trial.after.online) issues.push(finding("offline-not-disconnected", url, "navigator.onLine is true"));
  if (trial.after.language !== trial.before.language) {
    issues.push(finding("offline-language-changed", url,
      `${trial.before.language ?? "UNKNOWN"} => ${trial.after.language ?? "UNKNOWN"}`));
  }
  if (!trial.after.title.trim()) issues.push(finding("offline-title", url, "No document title"));
  if (trial.after.mainCount !== 1) {
    issues.push(finding("offline-main", url, String(trial.after.mainCount)));
  }
  if (!trial.after.visibleText.trim()) {
    issues.push(finding("offline-empty-content", url, "No readable offline content"));
  }
  if (!trial.after.hasControls) {
    issues.push(finding("offline-no-recovery-controls", url,
      "Offline page needs a keyboard-operable recovery action"));
  }
  return issues;
}

export async function readOfflineSnapshot(page: Page): Promise<OfflineSnapshot> {
  return page.evaluate(() => {
    const main = [...document.querySelectorAll("main, [role='main']")].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const controls = [...document.querySelectorAll("a[href], button")].filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width >= 44 && rect.height >= 44 &&
        style.display !== "none" && style.visibility !== "hidden";
    });
    const lang = document.documentElement.getAttribute("lang")?.toLowerCase().split("-")[0];
    return {
      location: location.href,
      language: lang === "en" || lang === "fr" ? lang : null,
      title: document.title,
      visibleText: (main[0]?.textContent ?? document.body?.textContent ?? "").trim().slice(0, 4000),
      mainCount: main.length,
      hasControls: controls.length > 0,
      controlled: Boolean(navigator.serviceWorker?.controller),
      online: navigator.onLine,
    };
  });
}

/** Navigates once online to warm caches, then performs a real offline reload. */
export async function runOfflineTrial(
  context: BrowserContext,
  page: Page,
  url: string,
): Promise<OfflineTrial> {
  await context.setOffline(false);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) {
    return {
      before: {
        location: url,
        language: null,
        title: "",
        visibleText: "",
        mainCount: 0,
        hasControls: false,
        controlled: false,
        online: true,
      },
      after: null,
      error: `Warm navigation returned ${response?.status() ?? "no response"}`,
    };
  }
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
  });
  const before = await readOfflineSnapshot(page);
  let after: OfflineSnapshot | null = null;
  let error: string | null = null;
  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    after = await readOfflineSnapshot(page);
  } catch (reason) {
    error = String(reason);
  } finally {
    await context.setOffline(false);
  }
  return { before, after, error };
}

export interface OfflineKnowledge {
  readonly state: "PASS" | "BLOCKED" | "UNKNOWN";
  readonly source: string | null;
  readonly licence: string | null;
  readonly observed: string | null;
}

export function offlineKnowledgeFindings(
  items: readonly OfflineKnowledge[],
  url: string,
): Finding[] {
  const issues: Finding[] = [];
  for (const item of items) {
    if (item.state !== "UNKNOWN" && (!item.source?.trim() || !item.licence?.trim() || !item.observed?.trim())) {
      issues.push(finding("offline-knowledge-without-evidence", url, item.state));
    }
  }
  return issues;
}

export async function offlineEvidenceSnapshot(page: Page): Promise<OfflineKnowledge[]> {
  return page.locator("[data-accessibility-evidence]").evaluateAll((elements) =>
    elements.map((element) => ({
      state: (element.getAttribute("data-accessibility-status") === "PASS" ||
        element.getAttribute("data-accessibility-status") === "BLOCKED") ?
        element.getAttribute("data-accessibility-status") as "PASS" | "BLOCKED" : "UNKNOWN" as const,
      source: element.getAttribute("data-source"),
      licence: element.getAttribute("data-licence"),
      observed: element.getAttribute("data-observed-at"),
    })),
  );
}

export async function checkOfflineEvidence(page: Page): Promise<Finding[]> {
  const locale = languageOf(await page.locator("html").getAttribute("lang"));
  const issues = offlineKnowledgeFindings(await offlineEvidenceSnapshot(page), page.url());
  if (!locale) issues.push(finding("offline-evidence-language", page.url(), "Unknown language"));
  return issues;
}
