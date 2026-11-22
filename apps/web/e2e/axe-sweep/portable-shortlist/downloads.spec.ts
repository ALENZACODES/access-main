import { expect, test, type Page } from "@playwright/test";
import {
  comparisonRows,
  downloadText,
  listRegion,
  openWithPack,
  replacePack,
  samplePlaces,
  selectPlace,
  storedList,
} from "./browser.ts";
import { readContactCards } from "./contact-cards.ts";
import { readWaypointFile } from "./waypoints.ts";

function takeAlong(page: Page) {
  return listRegion(page).getByRole("group", { name: /^(Take the list along|Emporter la liste)$/ });
}

function contactsButton(page: Page) {
  return takeAlong(page).getByRole("button", { name: /\(\.vcf\)$/ });
}

function waypointsButton(page: Page) {
  return takeAlong(page).getByRole("button", { name: /GPX/ });
}

for (const language of ["en", "fr"] as const) {
  test("contact cards and GPS waypoints retain selected place identities (" + language + ")", async ({ page }) => {
    const places = samplePlaces();
    const [studio, annex, hall] = places;
    await openWithPack(page, places, language);
    for (const place of [hall, annex, studio]) await selectPlace(page, place);
    await expect(comparisonRows(page)).toHaveText([hall.name, annex.name, studio.name]);
    const idsBefore = await storedList(page);

    const contacts = await downloadText(page, contactsButton(page), language === "en" ? "places.vcf" : "lieux.vcf");
    const cards = readContactCards(contacts);
    expect(cards.map((card) => card.name)).toEqual([hall.name, annex.name, studio.name]);
    expect(new Set(cards.map((card) => card.uid)).size).toBe(3);
    expect(cards[1]).toMatchObject({
      address: null,
      category: "UNKNOWN",
      coordinate: null,
      url: null,
    });
    expect(cards[1]?.note).toContain("UNKNOWN");
    expect(cards[2]).toMatchObject({
      address: studio.address,
      category: studio.category,
      url: studio.provenance?.source_url,
      coordinate: { lat: 43.65432, lon: -79.38124 },
    });

    const gpx = await downloadText(page, waypointsButton(page), language === "en" ? "places.gpx" : "lieux.gpx");
    const file = await page.evaluate(readWaypointFile, gpx);
    expect(file.title).toBe(language === "en" ? "Saved places" : "Lieux enregistrés");
    expect(file.description).toContain(language === "en" ? "2 of 3" : "2 lieux sur 3");
    expect(file.description).toContain("UNKNOWN");
    expect(file.description).toContain("OpenStreetMap");
    expect(file.points.map((p) => p.name)).toEqual([hall.name, studio.name]);
    const locatedCards = cards.filter((card) => card.coordinate !== null);
    for (const [index, point] of file.points.entries()) {
      const card = locatedCards[index];
      expect(point).toMatchObject({
        name: card?.name,
        latitude: card?.coordinate?.lat,
        longitude: card?.coordinate?.lon,
        description: card?.note,
        link: card?.url,
        category: card?.category,
      });
    }
    expect(file.points[0]?.source).toBeNull();
    expect(file.points[0]?.description).toContain("UNKNOWN");
    expect(file.points[1]?.source).toBe(studio.provenance?.source_name);
    expect(file.points[1]?.description).toContain("ODbL");
    expect(await storedList(page)).toEqual(idsBefore);
    await expect(waypointsButton(page)).toBeFocused();
  });

  test("a selected place without a position still exports one contact (" + language + ")", async ({ page }) => {
    const places = samplePlaces();
    const [, annex] = places;
    await openWithPack(page, places, language);
    await selectPlace(page, annex);
    await expect(waypointsButton(page)).toHaveCount(0);
    await expect(takeAlong(page)).toContainText(language === "en" ? "no waypoints to save" : "aucun point de passage");
    const filename = language === "en" ? "places.vcf" : "lieux.vcf";
    const cards = readContactCards(await downloadText(page, contactsButton(page), filename));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.coordinate).toBeNull();
    await expect(takeAlong(page).locator("[aria-live=polite]")).toContainText(filename);
  });
}

test("a pack revision changes the exported facts and retains the contact identity", async ({ page }) => {
  const places = samplePlaces();
  const [studio, annex] = places;
  await openWithPack(page, places, "en");
  await selectPlace(page, studio);
  await selectPlace(page, annex);
  const before = readContactCards(await downloadText(page, contactsButton(page), "places.vcf"));
  const revised = { ...studio, name: "Renamed studio", address: "Updated test address" };
  delete revised.lat;
  delete revised.lon;
  await replacePack(page, [revised]);
  await page.reload();
  await expect(comparisonRows(page)).toHaveText([revised.name]);
  await expect(listRegion(page)).toContainText("1 listed place is not in the pack");
  await expect(waypointsButton(page)).toHaveCount(0);
  const after = readContactCards(await downloadText(page, contactsButton(page), "places.vcf"));
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({
    uid: before[0]?.uid,
    name: revised.name,
    address: revised.address,
    coordinate: null,
  });
  expect(after[0]?.uid).not.toBe(before[1]?.uid);
});

test("a returning device exports its chosen places after a genuine offline reload", async ({ page, context }) => {
  const places = samplePlaces();
  const [studio, annex] = places;
  await openWithPack(page, places, "fr");
  await selectPlace(page, annex);
  await selectPlace(page, studio);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(comparisonRows(page)).toHaveText([annex.name, studio.name]);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    const cards = readContactCards(await downloadText(page, contactsButton(page), "lieux.vcf"));
    const waypoints = await downloadText(page, waypointsButton(page), "lieux.gpx");
    const file = await page.evaluate(readWaypointFile, waypoints);
    expect(cards.map((card) => card.name)).toEqual([annex.name, studio.name]);
    expect(file.points.map((point) => point.name)).toEqual([studio.name]);
    expect(file.description).toContain("UNKNOWN");
  } finally {
    await context.setOffline(false);
  }
});
