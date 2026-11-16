import { expect, test, type Page } from "@playwright/test";

/**
 * Round 9: the review workload and age-band sections, the spoken list changes, and the Markdown and checksum
 * downloads, all mounted on the live data status panel. Records are seeded on the device; nothing is fetched.
 */

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function seed(page: Page, rows: Array<{ id: string; kind: string; title: string; retrieved_at: string | null }>) {
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
            id: row.id, kind: row.kind, title: row.title, stored_at: new Date().toISOString(),
            provenance: { source_name: `Source of ${row.title}`, source_url: null, licence: "OGL-Ontario", licence_url: null, source_date: "2026-01-01", retrieved_at: row.retrieved_at, tier: 0, prototype_label: "SEEDED-OPEN-DATA", freshness: "unknown" },
            contains_live_status: false, payload: {},
          });
        }
      };
    });
  }, rows);
}

const ROWS = [
  { id: "p-old", kind: "place", title: "Old place", retrieved_at: daysAgo(400) },
  { id: "p-soon", kind: "place", title: "Soon place", retrieved_at: daysAgo(175) },
  { id: "p-new", kind: "place", title: "New place", retrieved_at: daysAgo(3) },
  { id: "j-none", kind: "journey", title: "Undated journey", retrieved_at: null },
];

test("Data status: the workload and age views read the saved records", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  const views = page.getByRole("region", { name: "Data status panel" });
  await expect(views).toBeVisible();
  await expect(views.getByRole("heading", { name: "Review workload" })).toBeVisible();
  const weeks = views.getByRole("table", { name: "Sources to review, by week" });
  await expect(weeks.getByRole("row")).toHaveCount(2); // header plus the one week with work
  await expect(views).toContainText("1 source is past its review date.");
  await expect(views).toContainText("1 source is not scheduled because its retrieved date is unknown.");
  const ages = views.getByRole("table", { name: "Sources by age of retrieved date" });
  await expect(ages.getByRole("row", { name: /^0 to 30 days 1/ })).toBeVisible();
  await expect(ages.getByRole("row", { name: /^91 to 180 days 1/ })).toBeVisible();
  await expect(ages.getByRole("row", { name: /^More than 365 days 1/ })).toBeVisible();
  await expect(ages.getByRole("row", { name: /^Unknown date 1/ })).toBeVisible();
});

test("Data status: the views and buttons switch to French with the real characters", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  await page.getByRole("button", { name: "Français" }).click();
  const views = page.getByRole("region", { name: "Panneau de l’état des données" });
  await expect(views.getByRole("heading", { name: "Charge de révision" })).toBeVisible();
  const text = (await views.evaluate((el) => el.textContent)) ?? "";
  expect(text).toContain("n’est pas planifiée");
  expect(text).not.toContain("'");
  expect(text).not.toMatch(/ :(?!\/\/)/);
  await expect(page.getByRole("button", { name: "Télécharger le rapport d’audit (Markdown)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Télécharger la liste des sommes de contrôle (texte)" })).toBeVisible();
});

test("Data status: the Markdown report and checksum list download from the saved records", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  const read = async (name: string) => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
  };
  const md = await read("Download the audit report (Markdown)");
  expect(md.name).toBe("data-status.md");
  expect(md.text.startsWith("# Data status\n")).toBe(true);
  expect(md.text).toContain("| Sources | 4 |");
  const sums = await read("Download the checksum list (text)");
  expect(sums.name).toBe("checksums.txt");
  const lines = sums.text.trimEnd().split("\n");
  expect(lines).toHaveLength(5);
  for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64} {2}\S+$/);
});

test("Data status: a filter change is spoken as one short sentence, and the table is not a live region", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  await expect(panel).toBeVisible();
  const status = panel.locator('[data-region="announce"]');
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveText("");
  await expect(panel.locator('[data-region="sources"]')).not.toHaveAttribute("aria-live", /.*/);
  await panel.getByLabel("Search by name").fill("old place");
  await expect(status).toHaveText("1 source shown. Filters: name contains “old place”.");
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(status).toHaveText("4 sources shown. Filters cleared.");
});

test("Data status: the summary, next steps and licence table read the saved records, in both languages", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, ROWS);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  await expect(panel.getByRole("heading", { name: "At a glance" })).toBeVisible();
  await expect(panel).toContainText("4 sources saved on this device, in 2 datasets.");
  await expect(panel.getByRole("heading", { name: "What to do next" })).toBeVisible();
  await expect(panel.getByRole("listitem").filter({ hasText: "Possibly out of date (1 item)" })).toBeVisible();
  const licences = panel.getByRole("table", { name: "Sources by licence" });
  await expect(licences.getByRole("row", { name: /^Open Government Licence – Ontario Open licence 4/ })).toBeVisible();
  await page.getByRole("button", { name: "Français" }).click();
  const fr = page.getByRole("region", { name: "Panneau de l’état des données" });
  await expect(fr.getByRole("heading", { name: "En bref" })).toBeVisible();
  await expect(fr.getByRole("heading", { name: "Prochaines étapes" })).toBeVisible();
  await expect(fr.getByRole("table", { name: "Sources selon la licence" })).toBeVisible();
  const text = (await fr.evaluate((el) => el.textContent)) ?? "";
  expect(text).toContain("Par exemple : ");
  expect(text).not.toMatch(/[A-Za-zÀ-ÿ]:(?!\/\/)/);
});
