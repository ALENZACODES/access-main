import { expect, test, type Page } from "@playwright/test";

/**
 * P6 on the live Data status page: every cached record states its age (never
 * "recent" for months-old data), shows Unknown for gaps, and names accepted
 * provider terms (Metrolinx, LTC) as terms of use, not as a problem.
 */

const DAY = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

async function seed(page: Page, records: Array<{ id: string; title: string; licence: string; retrieved_at: string | null }>) {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("access-app");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("cacheEntries", "readwrite");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        for (const row of rows) {
          tx.objectStore("cacheEntries").put({
            id: row.id,
            kind: "place",
            title: row.title,
            stored_at: new Date().toISOString(),
            provenance: {
              source_name: "Example open data",
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
  }, records);
}

const RECORDS = [
  { id: "q-old", title: "Old transit stop", licence: "Metrolinx Access and Use Agreement (accepted 2026-11-15)", retrieved_at: daysAgo(200) },
  { id: "q-new", title: "New transit stop", licence: "LTC Open Data Terms of Use", retrieved_at: daysAgo(3) },
  { id: "q-none", title: "Undated place", licence: "Open Government Licence – Toronto", retrieved_at: null },
];

test("Data status: an empty cache has an Unknown share, never 0", async ({ page }) => {
  await page.goto("/data-status");
  await expect(page.getByText("Share of cached records with no usable retrieval date", { exact: true })).toBeVisible();
  await expect(page.getByTestId("unknown-date-rate")).toHaveText("Unknown");
  await expect(page.getByTestId("unknown-date-rate")).toHaveAttribute("aria-label", "Rate: unknown");
});

test("Data status: each cached record states its age, Unknown gaps and its licence kind", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, RECORDS);
  await page.reload();
  const old = page.locator("li", { hasText: "Old transit stop" });
  await expect(old).toContainText("Retrieved 200 days ago. May be out of date.");
  await expect(old).toContainText("Used under the provider’s terms of use. Not an open licence.");
  const recent = page.locator("li", { hasText: "New transit stop" });
  await expect(recent).toContainText("Retrieved 3 days ago");
  await expect(recent).toContainText("Used under the provider’s terms of use.");
  const undated = page.locator("li", { hasText: "Undated place" });
  await expect(undated).toContainText("Retrieved: Unknown");
  await expect(undated).toContainText("Retrieval date unknown");
  await expect(page.locator("main")).not.toContainText(/recently updated/i);
  await expect(page.getByTestId("unknown-date-rate")).toHaveText("33.3%");
});

test("Data status in French: masculine « inconnu » for the rate, NBSP before colons", async ({ page }) => {
  await page.goto("/data-status");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByTestId("unknown-date-rate")).toHaveText("Inconnu");
  await expect(page.getByTestId("unknown-date-rate")).toHaveAttribute("aria-label", "Taux\u00a0: inconnu");
  await seed(page, RECORDS);
  await page.reload();
  await expect(page.getByTestId("unknown-date-rate")).toHaveText("33,3\u00a0%");
  await expect(page.locator("li", { hasText: "Old transit stop" })).toContainText("Récupéré il y a 200\u00a0jours. Possiblement périmé.");
  await expect(page.locator("li", { hasText: "Undated place" })).toContainText("Date de récupération\u00a0: Inconnue");
});
