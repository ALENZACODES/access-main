import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { offlineCatalog } from "../src/offline/catalog.ts";

// Fixture pack served through page.route, so the live /offline page runs the
// robust cell-by-cell download against real gzip parts, digests and counts.
// The records are test data, not accessibility facts.
test.use({ serviceWorkers: "block" });

const cells = ["n43.5_w079.5", "n44.0_w079.5"] as const;

function gz(text: string) {
  const bytes = gzipSync(text);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function build(builtAt: string, label: string) {
  const files = new Map<string, Buffer>();
  const tranche: Record<string, { bbox: [number, number, number, number]; parts: object[] }> = {};
  const search: Record<string, object> = {};
  cells.forEach((cell, index) => {
    // Only the first cell changes between builds; the second keeps its bytes.
    const name = index === 0 ? `Test venue ${label}` : "Test venue steady";
    const record = { id: `test:${index}`, tranche: "venue", region: "toronto", fields: { name: { value: name, source_id: "osm-test", licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 1 } } };
    const venue = gz(`${JSON.stringify(record)}\n`);
    const venuePath = `venues/osm-test/${cell}-${index === 0 ? label : "steady"}.ndjson.gz`;
    files.set(venuePath, venue.bytes);
    tranche[cell] = { bbox: [-80, 43.5 + index / 2, -79.5, 44 + index / 2], parts: [{ path: venuePath, bytes: venue.bytes.byteLength, sha256: venue.sha256, count: 1, sourceId: "osm-test" }] };
    const hits = gz(JSON.stringify([{ id: record.id, tranche: "venue", name, nameNorm: name.toLowerCase(), lat: 43.7 + index / 2, lon: -79.7 }]));
    const searchPath = `pack/v1/search/${cell}-${index === 0 ? label : "steady"}.json.gz`;
    files.set(searchPath, hits.bytes);
    search[cell] = { path: searchPath, bytes: hits.bytes.byteLength, sha256: hits.sha256, count: 1 };
  });
  const manifest = {
    version: 1, builtAt, sourceCommit: "e2e",
    sources: [{ sourceId: "osm-test", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true }],
    regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79.5, 44.5], cells: [...cells] }],
    tranches: { venue: { cells: tranche } }, search, tiles: {},
    counts: { records: 2, byTranche: { venue: 2 }, bySource: { "osm-test": 2 } },
  };
  return { manifest, files };
}

type ServedPack = { manifest: object; files: Map<string, Buffer> };

async function serve(page: Page, initial: ServedPack) {
  let pack = initial;
  let failing = "";
  await page.route("**/data/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, "");
    if (path === "pack/v1/manifest.json") return route.fulfill({ json: pack.manifest });
    const body = pack.files.get(path);
    if (!body || path === failing) return route.fulfill({ status: 503, body: "" });
    return route.fulfill({ body, contentType: "application/octet-stream" });
  });
  return {
    use(next: ServedPack) { pack = next; },
    fail(path: string) { failing = path; },
  };
}

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, `${label} ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

const text = {
  en: {
    download: "Download", resume: "Resume download", update: "Download the current data", complete: offlineCatalog.en.complete,
    partial: "Only part of this region is available offline.",
    partialResult: "Only part of this region is available offline. 1 of 2 cells available offline, 1 not downloaded. Download stopped. Saved cells remain available.",
    available: "Available offline. Data from 2026-10-01.",
    missing: "Not downloaded. Not available offline.",
    stale: "Out of date. Saved copy from 2026-10-01; current data is from 2026-11-15. Download it again to use it offline.",
    current: "Available offline. Data from 2026-11-15.",
    staleRegion: "Some cells are out of date. Their saved copies are not used offline until the current data is downloaded.",
  },
  fr: {
    download: "Télécharger", resume: "Reprendre le téléchargement", update: "Télécharger les données actuelles", complete: offlineCatalog.fr.complete,
    partial: "Seule une partie de cette région est disponible hors ligne.",
    partialResult: "Seule une partie de cette région est disponible hors ligne. 1 cellule sur 2 disponible hors ligne, 1 non téléchargée. Téléchargement arrêté. Les cellules enregistrées restent disponibles.",
    available: "Disponible hors ligne. Données du 2026-10-01.",
    missing: "Non téléchargée. Pas disponible hors ligne.",
    stale: "Périmée. Copie enregistrée le 2026-10-01, données actuelles du 2026-11-15. Téléchargez-la de nouveau pour l’utiliser hors ligne.",
    current: "Disponible hors ligne. Données du 2026-11-15.",
    staleRegion: "Certaines cellules sont périmées. Leurs copies enregistrées ne servent pas hors ligne tant que les données actuelles ne sont pas téléchargées.",
  },
} as const;

for (const language of ["en", "fr"] as const) {
  test(`offline regions: partial, resumed and stale cells are labelled honestly (${language})`, async ({ page }) => {
    const t = text[language];
    const v1 = build("2026-10-01T12:00:00Z", "v1");
    const server = await serve(page, v1);
    const secondSearch = (v1.manifest.search[cells[1]] as { path: string }).path;
    server.fail(secondSearch);

    await page.goto("/offline");
    if (language === "fr") await page.getByRole("button", { name: "Français" }).click();
    const region = page.locator(".record-list > li").filter({ has: page.getByRole("heading", { name: "Toronto" }) });
    await expect(region.getByRole("button", { name: t.download, exact: true })).toBeVisible();

    // A cell that fails is reported missing; the cell before it stays available.
    await region.getByRole("button", { name: t.download, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(t.partialResult);
    await expect(region.getByTestId("region-state")).toHaveText(t.partial);
    await region.locator("summary").click();
    await expect(region.locator(`[data-cell-status="available"]`)).toContainText(t.available);
    await expect(region.locator(`[data-cell-status="missing"]`)).toContainText(t.missing);
    await axeClean(page, `${language} partial`);

    // Resume fetches only the missing cell.
    server.fail("");
    const fetched: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/data/") && !request.url().endsWith("manifest.json")) fetched.push(request.url()); });
    await region.getByRole("button", { name: t.resume }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(t.complete)).toBeVisible();
    expect(fetched.every((url) => url.includes(cells[1]))).toBe(true);

    // A newer build: the changed cell is stale with its own date, not UNKNOWN; the unchanged cell is current.
    server.use(build("2026-11-15T12:00:00Z", "v2"));
    await page.reload();
    await expect(region.getByRole("button", { name: t.update })).toBeVisible();
    await expect(region.getByTestId("region-state")).toHaveText(t.staleRegion);
    await region.locator("summary").click();
    await expect(region.locator(`[data-cell-status="stale"]`)).toHaveText(new RegExp(`${t.stale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(region.locator(`[data-cell-status="available"]`)).toContainText(t.current);
    await expect(region.locator(`[data-cell-status="unknown"]`)).toHaveCount(0);
    await axeClean(page, `${language} stale`);

    await region.getByRole("button", { name: t.update }).click();
    await expect(page.getByText(t.complete)).toBeVisible();
    await expect(region.locator(`[data-cell-status="available"]`)).toHaveCount(2);
  });
}

test("offline regions: low storage stops before a cell and names what is not downloaded", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, "estimate", { value: async () => ({ quota: 2_000_000, usage: 1_500_000 }) });
  });
  await serve(page, build("2026-11-15T12:00:00Z", "v2"));
  await page.goto("/offline");
  const region = page.locator(".record-list > li").filter({ has: page.getByRole("heading", { name: "Toronto" }) });
  await region.getByRole("button", { name: "Download", exact: true }).click();
  await expect(region.getByTestId("storage-pressure")).toHaveText(
    "Storage space is low. Free space, then retry missing cells. Saved cells: 0. Cells not downloaded: 2. Cells not downloaded are not available offline.",
  );
  await region.locator("summary").click();
  await expect(region.locator(`[data-cell-status="missing"]`)).toHaveCount(2);
  await expect(region.locator(`[data-cell-status="unknown"]`)).toHaveCount(0);
  await axeClean(page, "quota");
});

// Fail-safe states the data client reports (docs/failsafe.md): a withheld part,
// a record that fails the device check, and a cell shown from its last checked
// copy after a rebuild changes the part behind the same path. Test data only.
function buildFailsafe(builtAt: string, label: string) {
  const files = new Map<string, Buffer>();
  const tranche: Record<string, { bbox: [number, number, number, number]; parts: object[] }> = {};
  const search: Record<string, object> = {};
  const field = (value: string, licence = "ODbL-1.0") => ({ value, source_id: "osm-test", licence, retrieved_at: "2026-11-01", tier: 1 });
  cells.forEach((cell, index) => {
    const name = index === 0 ? `Test venue ${label}` : "Test venue steady";
    const good = { id: `test:${index}`, tranche: "venue", region: "toronto", fields: { name: field(name) } };
    // The first cell also carries a record with no licence: the device check drops and counts it.
    const lines = index === 0 ? [good, { id: "test:bad", tranche: "venue", region: "toronto", fields: { name: field("Test venue bad", "") } }] : [good];
    const venue = gz(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    // Same path in every build, so a rebuilt first cell is stale until it is downloaded again.
    const venuePath = `venues/osm-test/${cell}.ndjson.gz`;
    files.set(venuePath, venue.bytes);
    tranche[cell] = { bbox: [-80, 43.5 + index / 2, -79.5, 44 + index / 2], parts: [{ path: venuePath, bytes: venue.bytes.byteLength, sha256: venue.sha256, count: lines.length, sourceId: "osm-test" }] };
    const hits = gz(JSON.stringify([{ id: good.id, tranche: "venue", name, nameNorm: name.toLowerCase(), lat: 43.7 + index / 2, lon: -79.7 }]));
    const searchPath = `pack/v1/search/${cell}-${index === 0 ? label : "steady"}.json.gz`;
    files.set(searchPath, hits.bytes);
    search[cell] = { path: searchPath, bytes: hits.bytes.byteLength, sha256: hits.sha256, count: 1 };
  });
  const manifest = {
    version: 1, builtAt, sourceCommit: "e2e",
    sources: [{ sourceId: "osm-test", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true }],
    regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79.5, 44.5], cells: [...cells] }],
    tranches: { venue: { cells: tranche } }, search, tiles: {},
    counts: { records: 3, byTranche: { venue: 3 }, bySource: { "osm-test": 3 } },
    withheld: [{ path: `paths/osm-test/${cells[1]}.ndjson.gz`, sourceId: "osm-test", tranche: "path", cell: cells[1], reason: "held-for-review" }],
  };
  return { manifest, files };
}

for (const language of ["en", "fr"] as const) {
  test(`offline regions: unavailable, dropped and last-checked-copy states are shown (${language})`, async ({ page }) => {
    const c = offlineCatalog[language];
    const server = await serve(page, buildFailsafe("2026-10-01T12:00:00Z", "v1"));
    await page.goto("/offline");
    if (language === "fr") await page.getByRole("button", { name: "Français" }).click();
    const region = page.locator(".record-list > li").filter({ has: page.getByRole("heading", { name: "Toronto" }) });
    const notes = region.getByTestId("failsafe-toronto");
    await expect(notes).toHaveAttribute("role", "status");

    // Withheld before anything is downloaded: the cell reads Unavailable with the builder's reason.
    await expect(notes.locator('[data-failsafe="unavailable"]')).toHaveText(`${cells[1]} — ${c.failsafeUnavailable}. ${c.failsafeReason}held-for-review`);
    await expect(notes.locator('[data-failsafe="dropped"]')).toHaveCount(0);
    await axeClean(page, `${language} unavailable`);

    // After the download, the record that failed the device check is counted, not shown.
    await region.getByRole("button", { name: text[language].download, exact: true }).click();
    await expect(page.getByText(c.complete)).toBeVisible();
    await expect(notes.locator('[data-failsafe="dropped"]')).toHaveText(c.failsafeDroppedOne);
    await expect(page.getByText("Test venue bad")).toHaveCount(0);
    await axeClean(page, `${language} dropped`);

    // A rebuild changes the first cell behind the same path: its last checked copy stands in.
    server.use(buildFailsafe("2026-11-15T12:00:00Z", "v2"));
    await page.reload();
    await expect(notes).toContainText(c.failsafeStale);
    await expect(notes.locator('[data-failsafe="stale"]')).toHaveText([cells[0]]);
    await expect(notes.locator('[data-failsafe="unavailable"]')).toHaveCount(1);
    await axeClean(page, `${language} stale`);
  });
}
