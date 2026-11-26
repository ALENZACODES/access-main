import { expect, test, type Page } from "@playwright/test";
import { downloadPack, fetchManifest } from "../../../src/offline/download.ts";
import type { StoredPack } from "@access/shared";
import { comparisonRows, downloadText, listRegion, selectPlace, storeDevicePack } from "./browser.ts";
import { readContactCards } from "./contact-cards.ts";
import { readWaypointFile } from "./waypoints.ts";

async function readPublishedPack(page: Page) {
  const fetcher = async (path: string) => {
    const result = await page.request.get(path);
    const bytes = await result.body();
    return new Response(new Uint8Array(bytes), { status: result.status() });
  };
  const manifest = await fetchManifest(fetcher);
  return downloadPack(manifest, { fetcher, nowIso: new Date().toISOString() });
}

/** Choose by source properties so an updated published pack need not keep an
 * arbitrary landmark at index zero. Name uniqueness lets the journey operate
 * the same named buttons a keyboard or screen-reader user would encounter.
 */
function selectFromSource(pack: StoredPack) {
  const places = pack.content.places;
  const counts = new Map<string, number>();
  for (const place of places) counts.set(place.name, (counts.get(place.name) ?? 0) + 1);
  const candidates = places.filter((place) =>
    place.name !== "UNKNOWN" && counts.get(place.name) === 1 && Boolean(place.provenance.source_url));
  const reported = candidates.find((place) => place.wheelchair === "yes" || place.wheelchair === "limited");
  const unrecorded = candidates.find((place) => place.wheelchair === "UNKNOWN");
  if (!reported || !unrecorded) {
    throw new Error("This journey needs one named place with a reported tag and one with an unknown tag in the shipped Toronto pack");
  }
  return [unrecorded, reported] as const;
}

test("exported records from the shipped pack retain source URLs, precision and uncertainty", async ({ page }) => {
  const pack = await readPublishedPack(page);
  expect(pack.content.places.length).toBe(pack.manifest.counts.places);
  const selected = selectFromSource(pack);
  await page.goto("/");
  await storeDevicePack(page, pack);
  await page.goto("/places");
  for (const place of selected) await selectPlace(page, place);
  await expect(comparisonRows(page)).toHaveText(selected.map((place) => place.name));
  const group = listRegion(page).getByRole("group", { name: "Take the list along" });
  const contacts = readContactCards(await downloadText(page, group.getByRole("button", { name: /\.vcf/ }), "places.vcf"));
  const gpx = await downloadText(page, group.getByRole("button", { name: /GPX/ }), "places.gpx");
  const waypoints = await page.evaluate(readWaypointFile, gpx);
  expect(contacts).toHaveLength(selected.length);
  expect(waypoints.points).toHaveLength(selected.length);

  for (const [index, source] of selected.entries()) {
    const contact = contacts[index];
    const point = waypoints.points[index];
    if (!contact || !point) throw new Error("Missing exported record for " + source.id);
    const lat = Number(source.lat.toFixed(5));
    const lon = Number(source.lon.toFixed(5));
    expect(contact.name).toBe(source.name);
    expect(point.name).toBe(source.name);
    expect(contact.coordinate).toEqual({ lat, lon });
    expect(point.latitude).toBe(lat);
    expect(point.longitude).toBe(lon);
    expect(point.source).toBe(source.provenance.source_name);
    expect(point.link).toBe(source.provenance.source_url);
    expect(contact.url).toBe(point.link);
    expect(contact.category).toBe(source.category);
    expect(point.category).toBe(contact.category);
    expect(point.description).toBe(contact.note);
    expect(contact.note).toContain(source.provenance.source_name);
    expect(contact.note).toContain("not a check of the place");
  }
  expect(contacts[0]?.note).toContain("UNKNOWN");
  expect(contacts[1]?.note).not.toContain("tag: UNKNOWN");
  expect(contacts[0]?.uid).not.toBe(contacts[1]?.uid);
});
