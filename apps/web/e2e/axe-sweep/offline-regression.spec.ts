import { expect, test } from "@playwright/test";
import { inspectOfflinePage } from "./browser-audits";
import { localeFromLang, seedRoutes } from "./sweep-contracts";

/**
 * Offline behaviour is tested through the actual browser context.
 * A network failure must not be mistaken for an app-provided offline page.
 * The suite intentionally never requests third-party services.
 */
test.describe("P20C: offline locale resilience", () => {
  test("cached entry points retain understandable EN and FR offline states", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL, "Set Playwright use.baseURL to a locally hosted build").toBeTruthy();
    test.setTimeout(180_000);
    const seeds = seedRoutes(baseURL!, {
      ...(process.env.AXE_SWEEP_EN_URL ? { en: process.env.AXE_SWEEP_EN_URL } : {}),
      ...(process.env.AXE_SWEEP_FR_URL ? { fr: process.env.AXE_SWEEP_FR_URL } : {}),
    });
    const tested = new Set<string>();
    const outcomes: string[] = [];

    for (const entry of seeds) {
      if (tested.size === 2) break;
      const context = await browser.newContext({ baseURL, serviceWorkers: "allow" });
      try {
        const page = await context.newPage();
        const response = await page.goto(entry, { waitUntil: "domcontentloaded" });
        if (!response?.ok()) continue;
        const locale = localeFromLang(await page.locator("html").getAttribute("lang"));
        if (!locale || tested.has(locale)) continue;
        tested.add(locale);

        // Give a controlling service worker a chance to activate after an
        // initial online page load, without waiting indefinitely.
        await page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return;
          await Promise.race([
            navigator.serviceWorker.ready.catch(() => undefined),
            new Promise<void>((resolve) => setTimeout(resolve, 2500)),
          ]);
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        const online = await inspectOfflinePage(page);
        if (!online.serviceWorkerControlled) {
          outcomes.push(`${locale}: no controlling service worker after warm load`);
          continue;
        }

        await context.setOffline(true);
        let loaded = false;
        try {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
          loaded = true;
        } catch {
          outcomes.push(`${locale}: offline reload returned a browser network error`);
        }
        if (!loaded) continue;
        const offline = await inspectOfflinePage(page);
        if (offline.locale !== locale) {
          outcomes.push(`${locale}: document language changed or disappeared offline`);
        }
        if (!offline.appShellPresent && !offline.offlineMessagePresent) {
          outcomes.push(`${locale}: no app shell or informative offline state`);
        }
        if (!offline.title.trim()) {
          outcomes.push(`${locale}: missing offline document title`);
        }
      } finally {
        await context.close();
      }
    }

    expect(tested.has("en"), "No English entry page found").toBe(true);
    expect(tested.has("fr"), "No French entry page found").toBe(true);
    expect(outcomes, outcomes.join("\n")).toEqual([]);
  });
});
