import { expect, test, type Page } from "@playwright/test";

/**
 * Round 9: the review workload and age-band sections, the spoken list changes, and the Markdown and checksum
 * downloads, all mounted on the live data status panel. Records are seeded on the device; nothing is fetched.
 */

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function seed(page: Page, rows: Array<{ id: string; kind: string; title: string; retrieved_at: string | null; tier?: number | string | null }>) {
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
            provenance: { source_name: `Source of ${row.title}`, source_url: null, licence: "OGL-Ontario", licence_url: null, source_date: "2026-01-01", retrieved_at: row.retrieved_at, tier: row.tier === undefined ? 0 : row.tier, prototype_label: "SEEDED-OPEN-DATA", freshness: "unknown" },
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

test("Data status: records are counted by tier, gaps are listed, and the facts file can be saved, in both languages", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, [
    { id: "p-zero", kind: "place", title: "Zero place", retrieved_at: daysAgo(3) },
    { id: "p-desk", kind: "place", title: "Desk place", retrieved_at: daysAgo(4), tier: "E" },
    { id: "j-none", kind: "journey", title: "No tier journey", retrieved_at: null, tier: null },
  ]);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  await expect(panel.getByRole("heading", { name: "Tier of each record" })).toBeVisible();
  const tiers = panel.getByRole("table", { name: "Records by tier", exact: true });
  await expect(tiers.getByRole("row", { name: /^Tier 0 .* 1 List these sources/ })).toBeVisible();
  await expect(tiers.getByRole("row", { name: /^Tier E .* 1 List these sources/ })).toBeVisible();
  await expect(tiers.getByRole("row", { name: /^Unknown .* 1 List these sources/ })).toBeVisible();
  await expect(panel).toContainText("Records that state a tier: 2 of 3.");
  await expect(panel).toContainText("Records that carry all four: 2 of 3.");
  const gaps = panel.getByRole("table", { name: "Records with a missing source, licence, date or tier" });
  await expect(gaps.getByRole("row")).toHaveCount(2);
  await expect(gaps.getByRole("row").nth(1)).toContainText("Recorded");
  await expect(panel.getByRole("navigation", { name: "On this panel" }).getByRole("link", { name: "Tier of each record" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Words used on this panel" })).toBeVisible();

  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download source, licence, date and tier for each record (CSV)" }).click();
  expect((await download).suggestedFilename()).toBe("record-facts.csv");
  const summary = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download a short summary (text)" }).click();
  expect((await summary).suggestedFilename()).toBe("data-status-summary.txt");

  await page.getByRole("button", { name: "Français" }).click();
  const fr = page.getByRole("region", { name: "Panneau de l’état des données" });
  await expect(fr.getByRole("heading", { name: "Niveau de chaque enregistrement", exact: true })).toBeVisible();
  await expect(fr.getByRole("table", { name: "Enregistrements selon le niveau", exact: true }).getByRole("row", { name: /^Niveau E .* 1 Afficher ces sources/ })).toBeVisible();
  await expect(fr).toContainText("Enregistrements qui indiquent un niveau\u00a0: 2 sur 3.");
});

test("Data status: the source list shows each tier and can be filtered by tier", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, [
    { id: "p-zero", kind: "place", title: "Zero place", retrieved_at: daysAgo(3) },
    { id: "p-desk", kind: "place", title: "Desk place", retrieved_at: daysAgo(4), tier: "E" },
    { id: "j-none", kind: "journey", title: "No tier journey", retrieved_at: null, tier: null },
  ]);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  const status = panel.locator('[data-region="announce"]');
  const tier = panel.getByLabel("Tier", { exact: true });
  await tier.selectOption("E");
  await expect(status).toHaveText("1 source shown. Filters: tier E.");
  await expect(panel.locator('[data-region="sources"]').getByRole("row")).toHaveCount(2);
  await expect(panel.locator('[data-region="sources"]').getByRole("row").nth(1)).toContainText("Desk place");
  await tier.selectOption("unknown");
  await expect(status).toHaveText("1 source shown. Filters: tier unknown.");
  await expect(panel.locator('[data-region="sources"]').getByRole("row").nth(1)).toContainText("No tier journey");
  await tier.selectOption("any");
  await expect(panel.locator('[data-region="sources"]').getByRole("row")).toHaveCount(4);

  await panel.getByRole("button", { name: "Tier: Unknown (1)" }).click();
  await expect(panel.getByRole("button", { name: "Tier: Unknown (1)" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByLabel("Tier", { exact: true })).toHaveValue("unknown");
  await expect(panel.locator('[data-region="sources"]').getByRole("row")).toHaveCount(2);
  await expect(panel.getByRole("table", { name: "Records by tier and status" }).getByRole("row", { name: /^All tiers/ })).toContainText("3");
});

test("Data status: filters in force are listed above the list and can be removed one at a time", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, [
    { id: "p-zero", kind: "place", title: "Zero place", retrieved_at: daysAgo(3) },
    { id: "p-desk", kind: "place", title: "Desk place", retrieved_at: daysAgo(4), tier: "E" },
    { id: "j-none", kind: "journey", title: "No tier journey", retrieved_at: daysAgo(5), tier: null },
  ]);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  const list = panel.locator('[data-region="sources"]');
  await panel.getByLabel("Licence type").selectOption("open");
  await expect(list).toContainText("1 filter in force");
  await expect(list.getByRole("row")).toHaveCount(4);
  await panel.getByLabel("Dataset", { exact: true }).selectOption({ label: "Places" });
  await expect(list).toContainText("2 filters in force");
  await expect(list.getByRole("row")).toHaveCount(3);
  await panel.getByLabel("Licence type").selectOption("unknown");
  await expect(list).toContainText("No sources match");
  await expect(list).toContainText("Removing one filter would bring sources back.");
  await expect(list.getByRole("button", { name: "Remove filter. Licence type: Unknown (shows 2 sources)" })).toBeVisible();

  await list.getByRole("button", { name: "Remove filter. Licence type: Unknown", exact: true }).click();
  await expect(list).toContainText("1 filter in force");
  await expect(panel.getByLabel("Licence type")).toHaveValue("any");
  await expect(panel.getByLabel("Dataset", { exact: true })).not.toHaveValue("any");
  await expect(list.getByRole("row")).toHaveCount(3);
  await list.getByRole("button", { name: "Remove filter. Dataset: Places" }).click();
  await expect(list.getByRole("row")).toHaveCount(4);
  await expect(list.getByText("filter in force")).toHaveCount(0);
});

test("Data status: a view can be saved for this page, shown again and deleted, and the list is summarised", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, [
    { id: "p-zero", kind: "place", title: "Zero place", retrieved_at: daysAgo(3) },
    { id: "p-old", kind: "place", title: "Old place", retrieved_at: daysAgo(400), tier: "E" },
    { id: "j-none", kind: "journey", title: "No tier journey", retrieved_at: null, tier: null },
  ]);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  const list = panel.locator('[data-region="sources"]');
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
  await expect(list).toContainText("In this list: 1 possibly out of date, 1 with no usable date, 1 with no tier.");
  await expect(panel).toContainText("Choose at least one filter to save a view.");

  await panel.getByLabel("Tier", { exact: true }).selectOption("E");
  await expect(list).toContainText("In this list: 1 possibly out of date.");
  await panel.getByLabel("Name for the view (optional)").fill("Desk checks");
  await panel.getByRole("button", { name: "Save the current filters as a view" }).click();
  await expect(panel.locator('[data-region="announce"]')).toHaveText("View saved.");
  await expect(panel).toContainText("Lists 1 source now.");
  const show = panel.getByRole("button", { name: "Show view. Desk checks (Tier: E)" });
  await expect(show).toHaveAttribute("aria-pressed", "true");

  await list.getByRole("button", { name: "Remove filter. Tier: E", exact: true }).click();
  await expect(list.getByRole("row")).toHaveCount(4);
  await show.click();
  await expect(panel.getByLabel("Tier", { exact: true })).toHaveValue("E");
  await expect(list.getByRole("row")).toHaveCount(2);

  await panel.getByRole("button", { name: "Delete view. Desk checks (Tier: E)" }).click();
  await expect(panel).toContainText("No view is saved yet.");
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(keysBefore);
});

test("Data status: a long list is drawn in steps and can be sorted without reloading", async ({ page }) => {
  await page.goto("/data-status");
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: `p-${String(i).padStart(2, "0")}`,
    kind: "place",
    title: `Place ${String(i).padStart(2, "0")}`,
    retrieved_at: daysAgo(i + 1),
    tier: i === 59 ? ("E" as const) : 0,
  }));
  await seed(page, rows);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  const list = panel.locator('[data-region="sources"]');
  await expect(list.getByRole("row")).toHaveCount(51);
  await expect(list).toContainText("Showing 50 of 60 listed sources.");

  await panel.getByLabel("Sort by").selectOption("tier:desc");
  await expect(panel.locator('[data-region="announce"]')).toContainText("Sorted by tier, descending.");
  await expect(list.getByRole("row").nth(1)).toContainText("Place 59");
  await expect(list.getByRole("columnheader", { name: "Tier" })).toHaveAttribute("aria-sort", "descending");

  await list.getByRole("button", { name: "Show 10 more sources" }).click();
  await expect(list.getByRole("row")).toHaveCount(61);
  await expect(list.getByRole("button", { name: /^Show \d+ more/ })).toHaveCount(0);
  await expect(panel.locator('[data-region="announce"]')).toHaveText("All 60 listed sources are shown.");
});

test("Data status: a count in the tier or dataset table can list its sources", async ({ page }) => {
  await page.goto("/data-status");
  await seed(page, [
    { id: "p-zero", kind: "place", title: "Zero place", retrieved_at: daysAgo(3) },
    { id: "p-desk", kind: "place", title: "Desk place", retrieved_at: daysAgo(4), tier: "E" },
    { id: "j-none", kind: "journey", title: "No tier journey", retrieved_at: daysAgo(5), tier: null },
  ]);
  await page.reload();
  const panel = page.getByRole("region", { name: "Data status panel" });
  const list = panel.locator('[data-region="sources"]');
  await panel.getByRole("button", { name: "List these sources. Tier: E" }).click();
  await expect(panel.getByLabel("Tier", { exact: true })).toHaveValue("E");
  await expect(panel.getByRole("button", { name: "List these sources. Tier: E" })).toBeFocused();
  await expect(list.getByRole("row")).toHaveCount(2);
  await expect(list).toContainText("Desk place");
  await panel.getByRole("button", { name: "List these sources. Dataset: Journeys" }).click();
  await expect(panel.getByLabel("Tier", { exact: true })).toHaveValue("any");
  await expect(list.getByRole("row")).toHaveCount(2);
  await expect(list).toContainText("No tier journey");
  await panel.getByRole("button", { name: "List these sources. Licence type: Open licence" }).click();
  await expect(list.getByRole("row")).toHaveCount(4);

  await panel.getByRole("button", { name: "List these sources. Unknown: Tier" }).click();
  await expect(panel.getByLabel("Unknown fact")).toHaveValue("tier");
  await expect(list.getByRole("row")).toHaveCount(2);
  await expect(list).toContainText("No tier journey");
  await list.getByRole("button", { name: "Remove filter. Unknown: Tier", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Clear filters" })).toBeFocused();

  await page.getByRole("button", { name: "Français" }).click();
  const fr = page.getByRole("region", { name: "Panneau de l’état des données" });
  await expect(fr.getByRole("button", { name: "Afficher ces sources. Niveau\u00a0: E" })).toBeVisible();
});

