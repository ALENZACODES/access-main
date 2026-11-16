import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * P6 round 7: the data quality panel and the download actions on the live
 * Data status page. Records are seeded into the on-device cache; nothing is
 * fetched. Gaps must read Unknown, files must be made on the device, and the
 * page must work in English and French.
 */

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function seed(page: Page, rows: Array<{ id: string; kind: string; title: string; licence: string; retrieved_at: string | null }>) {
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("access-app");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cacheEntries", "readwrite");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        for (const row of records) {
          tx.objectStore("cacheEntries").put({
            id: row.id,
            kind: row.kind,
            title: row.title,
            stored_at: new Date().toISOString(),
            provenance: {
              source_name: `Source of ${row.title}`,
              source_url: null,
              licence: row.licence,
              licence_url: null,
              source_date: "2026-01-01",
              retrieved_at: row.retrieved_at,
              tier: 0,
              prototype_label: "SEEDED-OPEN-DATA",
              freshness: "unknown",
            },
            contains_live_status: false,
            payload: {},
          });
        }
      };
    });
  }, rows);
}

const ROWS = [
  { id: "p-old", kind: "place", title: "Old place", licence: "OGL-Ontario", retrieved_at: daysAgo(400) },
  { id: "p-new", kind: "place", title: "New place", licence: "OGL-Ontario", retrieved_at: daysAgo(3) },
  { id: "j-none", kind: "journey", title: "Undated journey", licence: "", retrieved_at: null },
];

test("Data status: the quality panel reflects the cache and shows gaps as Unknown", async ({ page }) => {
  await page.goto("/data-status");
  const panel = page.getByRole("region", { name: "Data status panel" });
  await expect(panel).toBeVisible();
  await seed(page, ROWS);
  await page.reload();
  await expect(panel).toBeVisible();
  const sources = panel.getByRole("table", { name: "Sources", exact: true });
  await expect(sources.getByRole("row")).toHaveCount(4);
  const undated = sources.getByRole("row").filter({ hasText: "Source of Undated journey" });
  await expect(undated).toContainText("Unknown");
  await expect(panel).not.toContainText(/verified|recently updated/i);
  // The older page sections are unchanged.
  await expect(page.getByTestId("unknown-date-rate")).toHaveText("33.3%");
});

test("Data status: downloads are made on this device and keep Unknown as null", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  const downloads: Array<[RegExp, string]> = [
    [/Download source list/, "data-sources.csv"],
    [/Download credits/, "credits.txt"],
    [/Download summary/, "summary.json"],
    [/Download review dates/, "review-dates.ics"],
    [/Download catalogue/, "catalogue.json"],
  ];
  for (const [label, filename] of downloads) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: label }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe(filename);
    const path = await download.path();
    const text = readFileSync(path, "utf8");
    expect(text.length).toBeGreaterThan(0);
    if (filename === "summary.json") {
      const summary = JSON.parse(text) as { sources: { sourceId: string; licence: unknown; retrieved: unknown }[] };
      expect(summary.sources.find((s) => s.sourceId === "j-none")).toMatchObject({ licence: null, retrieved: null });
    }
  }
});

test("Data status: download buttons are disabled with an empty cache", async ({ page }) => {
  await page.goto("/data-status");
  await expect(page.getByRole("button", { name: /Download credits/ })).toBeDisabled();
});

test("Data status in French: panel, downloads and typography", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("region", { name: "Panneau de l’état des données" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Télécharger les crédits|Télécharger crédits|Télécharger les crédits \(texte\)/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Télécharger" })).toBeVisible();
});

test("Data status: panel and download targets are at least 44 px", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  for (const button of await page.getByRole("button", { name: /Download|Recalculate/ }).all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
