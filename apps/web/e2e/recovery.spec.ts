import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { offlineCatalog } from "../src/offline/catalog.ts";

// P17 wiring: the recovery notice is shown on the live pack download (/offline)
// and preferences export (/profile) failure paths. The fixture pack is test
// data served through page.route, not accessibility facts.
test.use({ serviceWorkers: "block" });

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, `${label} ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

async function servePack(page: Page) {
  const cell = "n43.5_w079.5";
  const record = { id: "test:0", tranche: "venue", region: "toronto", fields: { name: { value: "Test venue", source_id: "osm-test", licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 1 } } };
  const venue = gzipSync(`${JSON.stringify(record)}\n`);
  const hits = gzipSync(JSON.stringify([{ id: record.id, tranche: "venue", name: "Test venue", nameNorm: "test venue", lat: 43.7, lon: -79.7 }]));
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const files = new Map([[`venues/osm-test/${cell}.ndjson.gz`, venue], [`pack/v1/search/${cell}.json.gz`, hits]]);
  const manifest = {
    version: 1, builtAt: "2026-11-15T12:00:00Z", sourceCommit: "e2e",
    sources: [{ sourceId: "osm-test", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true }],
    regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79.5, 44], cells: [cell] }],
    tranches: { venue: { cells: { [cell]: { bbox: [-80, 43.5, -79.5, 44], parts: [{ path: `venues/osm-test/${cell}.ndjson.gz`, bytes: venue.byteLength, sha256: sha(venue), count: 1, sourceId: "osm-test" }] } } } },
    search: { [cell]: { path: `pack/v1/search/${cell}.json.gz`, bytes: hits.byteLength, sha256: sha(hits), count: 1 } },
    tiles: {}, counts: { records: 1, byTranche: { venue: 1 }, bySource: { "osm-test": 1 } },
  };
  let corrupt = true;
  await page.route("**/data/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, "");
    if (path === "pack/v1/manifest.json") return route.fulfill({ json: manifest });
    const body = files.get(path);
    if (!body) return route.fulfill({ status: 404, body: "" });
    // Same length, different bytes: the digest check fails.
    return route.fulfill({ body: corrupt ? Buffer.alloc(body.byteLength, 1) : body, contentType: "application/octet-stream" });
  });
  return { repair() { corrupt = false; } };
}

const copy = {
  en: { title: "Download failed its checks", retry: "Try again", dismiss: "Dismiss", download: "Download" },
  fr: { title: "Échec des contrôles du téléchargement", retry: "Réessayer", dismiss: "Fermer", download: "Télécharger" },
} as const;

for (const language of ["en", "fr"] as const) {
  test(`pack download failure shows the recovery notice and retry works (${language})`, async ({ page }) => {
    const c = copy[language];
    const pack = await servePack(page);
    await page.goto("/offline");
    if (language === "fr") await page.getByRole("button", { name: "Français" }).click();
    await page.getByRole("button", { name: c.download, exact: true }).click();

    const notice = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: c.title }) });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("lang", language);
    await expect(notice).not.toContainText(/verif|vérif|sha256|bytes/i);
    for (const name of [c.retry, c.dismiss]) {
      const box = await notice.getByRole("button", { name }).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await axeClean(page, `${language} download failure`);

    pack.repair();
    await notice.getByRole("button", { name: c.retry }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(offlineCatalog[language].complete)).toBeVisible();
    await expect(page.getByRole("heading", { name: c.title })).toHaveCount(0);
  });
}

test("preferences export failure shows the recovery notice and retry saves the file", async ({ page }) => {
  await page.goto("/profile");
  const consent = page.getByRole("checkbox", { name: "Store these preferences on this device only" });
  await consent.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();

  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    (window as typeof window & { restoreExport?: () => void }).restoreExport = () => { URL.createObjectURL = original; };
    URL.createObjectURL = () => { const error = new Error("internal detail 42"); error.name = "NotAllowedError"; throw error; };
  });
  await page.getByRole("button", { name: "Export preferences as text" }).click();
  const notice = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: "Export blocked" }) });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("The export could not be saved. Check file access permissions.");
  await expect(notice).not.toContainText("internal detail 42");
  await axeClean(page, "export failure");

  await page.evaluate(() => (window as typeof window & { restoreExport?: () => void }).restoreExport?.());
  const download = page.waitForEvent("download");
  await notice.getByRole("button", { name: "Try again" }).click();
  expect((await download).suggestedFilename()).toBe("the-app-preferences.txt");
  await expect(page.getByRole("heading", { name: "Export blocked" })).toHaveCount(0);
});
