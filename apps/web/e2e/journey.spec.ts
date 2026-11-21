import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { LANE_STRINGS } from "../src/modules/strings.ts";

// A fixture pack served through page.route, so /journey runs the mounted
// planner over a downloaded region. Every record is test data, not a real
// place or an accessibility fact; the coordinates only give the planner
// something to measure.
test.use({ serviceWorkers: "block" });

const cell = "n43.5_w079.5";
const field = (value: unknown) => ({ value, source_id: "osm-test", licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 1 });
const venues = [
  { id: "test:a", tranche: "venue", region: "toronto", fields: { name: field("Test place A"), lat: field(43.65), lon: field(-79.38) } },
  { id: "test:b", tranche: "venue", region: "toronto", fields: { name: field("Test place B"), lat: field(43.651), lon: field(-79.38) } },
  { id: "test:nopos", tranche: "venue", region: "toronto", fields: { name: field("Test place without position") } },
];
const paths = [
  { id: "test:path", tranche: "path", region: "toronto", fields: { geometry: field([[-79.38, 43.65], [-79.38, 43.6505], [-79.38, 43.651]]), highway: field("footway"), surface: field("asphalt"), kerb: field("flush") } },
];

function gz(text: string) {
  const bytes = gzipSync(text);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function pack() {
  const files = new Map<string, Buffer>();
  const part = (file: string, lines: object[]) => {
    const body = gz(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    files.set(file, body.bytes);
    return { path: file, bytes: body.bytes.byteLength, sha256: body.sha256, count: lines.length, sourceId: "osm-test" };
  };
  const bbox = [-79.5, 43.5, -79, 44];
  // The search index gives the place without a position a coordinate, as an index may; the planner must not use it.
  const hits = venues.map((venue) => ({ id: venue.id, tranche: "venue", name: venue.fields.name.value, nameNorm: String(venue.fields.name.value).toLowerCase(), lat: 43.65, lon: -79.38 }));
  const search = gz(JSON.stringify(hits));
  files.set(`pack/v1/search/${cell}.json.gz`, search.bytes);
  const manifest = {
    version: 1, builtAt: "2026-11-01T12:00:00Z", sourceCommit: "e2e",
    sources: [{ sourceId: "osm-test", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true }],
    regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79, 44], cells: [cell] }],
    tranches: {
      venue: { cells: { [cell]: { bbox, parts: [part(`venues/osm-test/${cell}.ndjson.gz`, venues)] } } },
      path: { cells: { [cell]: { bbox, parts: [part(`paths/osm-test/${cell}.ndjson.gz`, paths)] } } },
    },
    search: { [cell]: { path: `pack/v1/search/${cell}.json.gz`, bytes: search.bytes.byteLength, sha256: search.sha256, count: hits.length } },
    tiles: {},
    counts: { records: 4, byTranche: { venue: 3, path: 1 }, bySource: { "osm-test": 4 } },
  };
  return { manifest, files };
}

async function serve(page: Page) {
  const { manifest, files } = pack();
  await page.route("**/data/**", async (route) => {
    const file = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, "");
    if (file === "pack/v1/manifest.json") return route.fulfill({ json: manifest });
    const body = files.get(file);
    return body ? route.fulfill({ body, contentType: "application/octet-stream" }) : route.fulfill({ status: 404, body: "" });
  });
}

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, `${label} ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

const words = {
  en: { download: "Download", complete: "Download integrity checked", from: "From", to: "To", roll: /^Rolling route: 111 m\./ },
  fr: { download: "Télécharger", complete: "Intégrité du téléchargement contrôlée", from: "Départ", to: "Arrivée", roll: /^Parcours en fauteuil\s:\s111\s?m\./ },
} as const;

/** Page text is matched with its U+00A0 spaces as ordinary spaces. */
const plain = (value: string) => value.replace(/\u00a0/g, " ");

for (const language of ["en", "fr"] as const) {
  test(`journey: choose places from the search by keyboard and see what the planner returned (${language})`, async ({ page }) => {
    const w = words[language];
    const copy = LANE_STRINGS[language].journey;
    await serve(page);
    await page.goto("/offline");
    if (language === "fr") await page.getByRole("button", { name: "Français" }).click();
    await page.locator(".record-list > li").getByRole("button", { name: w.download, exact: true }).click();
    await expect(page.getByText(w.complete)).toBeVisible();

    await page.goto("/journey");
    await expect(page.getByText(plain(copy.awaiting))).toBeVisible();
    const from = page.getByRole("textbox", { name: w.from });
    await from.fill("Test place A");
    await page.keyboard.press("Tab");
    const find = page.getByRole("button", { name: copy.find.replace("{{field}}", w.from) });
    await expect(find).toBeFocused();
    await page.keyboard.press("Enter");
    const list = page.getByRole("region", { name: copy.matchesFor.replace("{{field}}", w.from) });
    const use = list.getByRole("button", { name: plain(copy.useName.replace("{{name}}", "Test place A")) });
    await expect(use).toBeVisible();
    await axeClean(page, `${language} matches`);
    await use.focus();
    await page.keyboard.press("Enter");
    await expect(from).toBeFocused();
    await expect(page.getByText(plain(copy.chosen.replace("{{name}}", "Test place A")))).toBeVisible();

    // The destination is typed, not chosen: it is resolved by its exact name.
    const to = page.getByRole("textbox", { name: w.to });
    await to.fill("Test place B");
    await to.press("Enter");
    await expect(page.getByText(plain(copy.planned))).toBeVisible();
    await expect(page.locator(".result-name")).toHaveText(w.roll);
    await expect(page.locator(".result-name")).toContainText(plain(copy.stepFree));
    await expect(page.getByTestId("journey-plan")).toContainText("Test place A");
    await expect(page.getByTestId("journey-plan").getByRole("heading", { name: copy.notices })).toBeVisible();
    await axeClean(page, `${language} planned`);

    // A place with no recorded position: the search index's coordinate is not used.
    await to.fill("Test place without position");
    await to.press("Enter");
    await expect(page.getByText(plain(copy.noCoordinates))).toBeVisible();
    await expect(page.locator(".result-name")).toHaveCount(0);
    await axeClean(page, `${language} no position`);
  });
}
