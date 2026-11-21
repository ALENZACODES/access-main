import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";

// Demonstration data, not assertions about real-world accessibility.
const demonstration = [
  { id: "demo-washroom", name: "Demonstration washroom", layer: "washroom", lon: -79.382, lat: 43.652, wheelchair: "yes", step_free_entrance: "yes" },
  { id: "demo-venue", name: "Demonstration venue", layer: "venue", lon: -79.375, lat: 43.655, wheelchair: "no", step_free_entrance: "no" },
  { id: "demo-transit", name: "Demonstration transit stop", layer: "transit", lon: -79.370, lat: 43.658, wheelchair: "UNKNOWN", step_free_entrance: "UNKNOWN" },
] as const;

function varint(n: number): number[] {
  const result: number[] = [];
  while (n > 127) { result.push((n & 127) | 128); n = Math.floor(n / 128); }
  result.push(n);
  return result;
}
function field(tag: number, data: number[]): number[] {
  return [...varint((tag << 3) | 2), ...varint(data.length), ...data];
}
function text(value: string): number[] { return Array.from(new TextEncoder().encode(value)); }
function stringField(tag: number, value: string): number[] { return field(tag, text(value)); }
function numberField(tag: number, n: number): number[] { return [...varint(tag << 3), ...varint(n)]; }

function vectorTile(): Uint8Array {
  const layers = ["washroom", "venue", "transit"].map((layerName) => {
    const example = demonstration.find((place) => place.layer === layerName)!;
    const keys = ["id", "name", "tranche", "wheelchair", "step_free_entrance", "source_id", "licence", "retrieved_at", "tier"];
    const values = [example.id, example.name, layerName, example.wheelchair, example.step_free_entrance,
      "demonstration-source", "ODbL-1.0", "2026-11-15", "demonstration"];
    const tags = keys.flatMap((_, index) => [index, index]);
    const zoom = 11;
    const tiles = 2 ** zoom;
    const tileX = 572;
    const tileY = 747;
    const worldX = ((example.lon + 180) / 360) * tiles;
    const phi = example.lat * Math.PI / 180;
    const worldY = (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 * tiles;
    const x = Math.round((worldX - tileX) * 4096);
    const y = Math.round((worldY - tileY) * 4096);
    const feature = [numberField(1, 1), field(2, tags.flatMap(varint)), numberField(3, 1),
      field(4, [9, ...varint(x * 2), ...varint(y * 2)])].flat();
    return field(3, [numberField(15, 2), stringField(1, layerName), field(2, feature),
      ...keys.map((k) => stringField(3, k)), ...values.map((v) => field(4, stringField(1, v))), numberField(5, 4096)].flat());
  });
  return new Uint8Array(layers.flat());
}

function fixturePMTiles(): Uint8Array {
  const tile = vectorTile();
  const metadata = text(JSON.stringify({ vector_layers: ["washroom", "venue", "transit"].map((id) => ({ id, fields: {} })) }));
  // One z11 tile covering Toronto (572, 747) → PMTiles tile id 1945716.
  const directory = new Uint8Array([1, ...varint(1945716), 1, ...varint(tile.byteLength), 1]);
  const rootOffset = 127;
  const metadataOffset = rootOffset + directory.byteLength;
  const dataOffset = metadataOffset + metadata.length;
  const bytes = new Uint8Array(dataOffset + tile.length);
  const view = new DataView(bytes.buffer);
  bytes.set(text("PMTiles"), 0);
  view.setUint8(7, 3);
  const u64 = (at: number, value: number) => view.setBigUint64(at, BigInt(value), true);
  u64(8, rootOffset); u64(16, directory.length);
  u64(24, metadataOffset); u64(32, metadata.length);
  u64(40, dataOffset); u64(48, 0);
  u64(56, dataOffset); u64(64, tile.length);
  u64(72, 1); u64(80, 1); u64(88, 1);
  view.setUint8(96, 1); view.setUint8(97, 1); view.setUint8(98, 1); view.setUint8(99, 1);
  view.setUint8(100, 11); view.setUint8(101, 11);
  view.setInt32(102, -793820000, true); view.setInt32(106, 436520000, true);
  view.setInt32(110, -793700000, true); view.setInt32(114, 436580000, true);
  view.setUint8(118, 11); view.setInt32(119, -793800000, true); view.setInt32(123, 436550000, true);
  bytes.set(directory, rootOffset); bytes.set(metadata, metadataOffset); bytes.set(tile, dataOffset);
  return bytes;
}

const ODBL_PATH = "tiles/odbl/places-n43.pmtiles";
const OPEN_PATH = "tiles/open/places.pmtiles";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fixtureBbox = [-79.382, 43.652, -79.37, 43.658];

/**
 * The pack manifest lists the tile files; the map loads the ones covering the
 * view. With `brokenOpen`, a second file is listed whose served bytes do not
 * match its SHA-256, so that file is unavailable and the other still loads.
 */
async function installFixture(page: Page, options: { brokenOpen?: boolean } = {}) {
  const bytes = fixturePMTiles();
  const tiles: Record<string, object> = {
    "odbl/n43": { path: ODBL_PATH, bytes: bytes.length, sha256: sha256(bytes), licence: "ODbL-1.0", bbox: fixtureBbox },
  };
  const tampered = bytes.slice();
  tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) % 256;
  if (options.brokenOpen) tiles.open = { path: OPEN_PATH, bytes: bytes.length, sha256: sha256(bytes), licence: "OGL-Ontario", bbox: fixtureBbox };
  const requests: Record<string, number> = { [ODBL_PATH]: 0, [OPEN_PATH]: 0 };
  await page.route("**/data/pack/v1/manifest.json", (route) => route.fulfill({ json: {
    version: 1, builtAt: "2026-11-15T00:00:00Z", sourceCommit: "e2e", sources: [], regions: [], tranches: {}, search: {}, tiles,
    counts: { records: 0, byTranche: {}, bySource: {} },
  } }));
  await page.route(/\/data\/tiles\/(odbl|open)\/places(-n43)?\.pmtiles$/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, "");
    requests[path] = (requests[path] ?? 0) + 1;
    const body = path === OPEN_PATH ? tampered : bytes;
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from(body) });
  });
  return requests;
}

async function openMap(page: Page, lang: "en" | "fr" = "en", options: { brokenOpen?: boolean } = {}) {
  await page.addInitScript((language) => {
    localStorage.setItem("access.language", language);
    localStorage.setItem("access.language.set", "1");
    // The PWA service worker can intercept PMTiles range requests and return the
    // shell document. Tests use the same-origin Cache API in tileCache instead.
    const worker = navigator.serviceWorker;
    if (worker) {
      worker.register = async () => ({ uninstall: true, unregister: async () => true }) as ServiceWorkerRegistration;
      worker.getRegistrations = async () => [];
    }
  }, lang);
  const requests = await installFixture(page, options);
  await page.goto("./map");
  await expect(page.getByText("Demonstration washroom").first()).toBeVisible();
  return requests;
}

test("demonstration PMTiles list, keyboard navigation, provenance and filters", async ({ page }) => {
  await openMap(page);
  const list = page.locator("#map-place-list");
  await expect(list.getByRole("button")).toHaveCount(3);
  await list.getByRole("button").first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Place details" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("ODbL-1.0").first()).toBeVisible();
  await expect(page.getByRole("complementary").getByText("2026-11-15").first()).toBeVisible();
  await expect(page.getByRole("complementary").getByText("demonstration").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open place details" })).toHaveAttribute("href", /\/places\/demo-/);
  await page.getByLabel("Step-free entrance", { exact: true }).check();
  await expect(list.getByRole("button")).toHaveCount(2); // Known no filtered; Unknown retained.
  await expect(list.getByText("Demonstration transit stop")).toBeVisible();
  await page.getByLabel("Washrooms", { exact: true }).uncheck();
  await expect(list.getByRole("button")).toHaveCount(1);
});

for (const language of ["en", "fr"] as const) {
  for (const width of [320, 1280]) {
    test(`axe ${language} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openMap(page, language);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations).toEqual([]);
    });
  }
}

test("offline reload reads the checked tile file and the tile list saved on the device", async ({ page }) => {
  await openMap(page);
  await expect(page.locator("#map-place-list").getByRole("button")).toHaveCount(3);
  await page.waitForFunction(async () => (await caches.open("map-tiles-v2")).keys().then((keys) => keys.length > 0));
  await page.unrouteAll({ behavior: "ignoreErrors" });
  // Aborting the data URLs simulates a later offline session without blocking reload of the shell.
  await page.route("**/data/**", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#map-place-list").getByRole("button")).toHaveCount(3);
  await expect(page.getByTestId("map-tile-status")).toHaveText("");
});

const unavailable = {
  en: "Map data for other open data places is unavailable: its file did not pass the integrity check. Other map data still loads.",
  fr: "Les données cartographiques pour lieux d’autres données ouvertes sont indisponibles : leur fichier n’a pas réussi le contrôle d’intégrité. Les autres données de la carte se chargent toujours.",
} as const;

for (const language of ["en", "fr"] as const) {
  test(`a tile file that fails its SHA-256 twice is unavailable and the other file still loads (${language})`, async ({ page }) => {
    const requests = await openMap(page, language, { brokenOpen: true });
    await expect(page.locator("#map-place-list").getByRole("button")).toHaveCount(3);
    const status = page.getByTestId("map-tile-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status.locator('[data-tile-key="open"]')).toHaveText(unavailable[language]);
    await expect(status.locator('[data-tile-key="odbl/n43"]')).toHaveCount(0);
    // Fetched once, then once more without the HTTP cache; never stored.
    expect(requests[OPEN_PATH]).toBe(2);
    expect(requests[ODBL_PATH]).toBe(1);
    expect(await page.evaluate(async () => (await (await caches.open("map-tiles-v2")).keys()).map((key) => new URL(key.url).pathname))).toEqual(["/data/tiles/odbl/places-n43.pmtiles"]);
    await expect(page.locator(".map-attribution")).toContainText("© OpenStreetMap contributors");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
}
