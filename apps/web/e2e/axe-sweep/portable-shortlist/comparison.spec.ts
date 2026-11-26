import { expect, test, type Page } from "@playwright/test";
import {
  comparisonRows, denyClipboardWrites, listRegion, openWithPack, replacePack,
  samplePlaces, selectPlace, storedList,
} from "./browser.ts";
import { comparisonDifferences, readComparisonCsv, readComparisonTable } from "./comparison.ts";

function actions(page: Page) {
  return listRegion(page).getByRole("group", { name: /^(List actions|Actions sur la liste)$/ });
}

function copyCsv(page: Page) {
  return actions(page).getByRole("button", { name: /^(Copy the list as CSV|Copier la liste en CSV)$/ });
}

function comparisonTable(page: Page) {
  return listRegion(page).getByRole("region", { name: /^(Comparison table|Tableau de comparaison)$/ }).getByRole("table");
}

function manualCsv(page: Page) {
  return listRegion(page).getByRole("textbox", { name: /^(The list as CSV|La liste en CSV)$/ });
}

async function pressCopy(page: Page) {
  const trigger = copyCsv(page);
  await trigger.focus();
  await trigger.press("Enter");
}

async function fallbackCsv(page: Page) {
  await pressCopy(page);
  const area = manualCsv(page);
  await expect(area).toBeFocused();
  await expect(area).toHaveAttribute("readonly", "");
  const source = await area.inputValue();
  const selection = await area.evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected a selectable CSV textarea");
    return element.value.slice(element.selectionStart, element.selectionEnd);
  });
  expect(selection).toBe(source);
  return readComparisonCsv(source);
}

async function sortByName(page: Page) {
  const order = listRegion(page).getByRole("radiogroup", { name: /Order of the places|Ordre des lieux/ });
  const added = order.getByRole("radio", { name: /^(As added|Selon l’ajout)$/ });
  await added.focus();
  await added.press("ArrowRight");
  const alphabetical = order.getByRole("radio", { name: /^(By name|Par nom)$/ });
  await expect(alphabetical).toBeFocused();
  await expect(alphabetical).toBeChecked();
}

for (const language of ["en", "fr"] as const) {
  test.describe(`Portable comparison • ${language}`, () => {
    test("CSV on the clipboard and visible table agree on identity, unknowns and provenance", async ({ page, context, baseURL }) => {
      if (!baseURL) throw new Error("The comparison journey requires a built application origin");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseURL).origin });
      const [studio, room, north] = samplePlaces();
      await openWithPack(page, [studio, room, north], language);
      await selectPlace(page, room);
      await selectPlace(page, studio);
      const table = await readComparisonTable(comparisonTable(page));
      expect(table.headers[0]).toBe(language === "en" ? "Place" : "Lieu");
      expect(table.headers.at(-1)).toBe(language === "en" ? "Remove" : "Retirer");
      expect(table.caption).toContain("(2)");
      expect(table.rows[0]?.values[0]).toBe(language === "en" ? "UNKNOWN" : "INCONNUE");
      expect(table.rows[1]?.values[0]).toBe(language === "en" ? "Limited" : "Limité");
      await pressCopy(page);
      await expect(listRegion(page).getByText(language === "en" ? "Copied as CSV." : "Copié en CSV.", { exact: true })).toBeVisible();
      const source = await page.evaluate(() => navigator.clipboard.readText());
      const records = readComparisonCsv(source);
      expect(records.map((record) => record.place_id)).toEqual([room.id, studio.id]);
      expect(comparisonDifferences(table, records, [room.id, studio.id], language)).toEqual([]);
      expect(records[0]).toMatchObject({
        address: "UNKNOWN", latitude: "UNKNOWN", longitude: "UNKNOWN", kind: "UNKNOWN",
        wheelchair_tag: "UNKNOWN", tag_status: "unknown", tag_unknown_reason: "not-recorded",
        source: "UNKNOWN", licence: "UNKNOWN", retrieved_on: "UNKNOWN", tier: "UNKNOWN", source_url: "",
      });
      expect(records[1]).toMatchObject({
        wheelchair_tag: "limited", tag_status: "reported", tag_unknown_reason: "",
        latitude: String(studio.lat), longitude: String(studio.lon),
        retrieved_on: studio.provenance?.retrieved_at, tier: "1", source_url: studio.provenance?.source_url,
      });
      await expect(manualCsv(page)).toHaveCount(0);
      await expect(copyCsv(page)).toBeFocused();
    });

    test("keyboard sorting changes the display while selection order survives copying and reloading", async ({ page }) => {
      await denyClipboardWrites(page);
      const [studio, room, north] = samplePlaces();
      await openWithPack(page, [studio, room, north], language);
      for (const place of [room, north, studio]) await selectPlace(page, place);
      const original = await storedList(page);
      await expect(comparisonRows(page)).toHaveText([room.name, north.name, studio.name]);
      await sortByName(page);
      await expect(comparisonRows(page)).toHaveText([studio.name, north.name, room.name]);
      const records = await fallbackCsv(page);
      expect(records.map((record) => record.place_id)).toEqual([room.id, north.id, studio.id]);
      expect(comparisonDifferences(await readComparisonTable(comparisonTable(page)), records, [studio.id, north.id, room.id], language)).toEqual([]);
      const unsupported = records.find((record) => record.place_id === north.id);
      expect(unsupported).toMatchObject({ wheelchair_tag: "UNKNOWN", tag_status: "unknown", tag_unknown_reason: "missing-provenance" });
      expect(await storedList(page)).toEqual(original);
      await page.reload();
      await expect(comparisonRows(page)).toHaveText([room.name, north.name, studio.name]);
      expect(await storedList(page)).toEqual(original);
    });

    test("a changed pack exports current records and explains missing selections", async ({ page }) => {
      await denyClipboardWrites(page);
      const [studio, room, north] = samplePlaces();
      await openWithPack(page, [studio, room, north], language);
      await selectPlace(page, studio);
      await selectPlace(page, room);
      const original = await storedList(page);
      const revised = { ...studio, name: "Revised hall", address: "15 Centre" };
      await replacePack(page, [north, revised]);
      await page.reload();
      await expect(listRegion(page).getByText(/1 listed place is not in the pack|1 lieu de la liste n’est pas dans le pack/)).toBeVisible();
      await expect(comparisonRows(page)).toHaveText([revised.name]);
      const records = await fallbackCsv(page);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ place_id: studio.id, place_name: revised.name, address: revised.address });
      expect(comparisonDifferences(await readComparisonTable(comparisonTable(page)), records, [studio.id], language)).toEqual([]);
      expect(await storedList(page)).toEqual(original);
      await replacePack(page, [north]);
      await page.reload();
      await expect(listRegion(page).getByText(/2 listed places are not in the pack|2 lieux de la liste ne sont pas dans le pack/)).toBeVisible();
      await expect(comparisonTable(page)).toHaveCount(0);
      await expect(copyCsv(page)).toHaveCount(0);
      await replacePack(page, [room, studio]);
      await page.reload();
      await expect(comparisonRows(page)).toHaveText([studio.name, room.name]);
      expect((await fallbackCsv(page)).map((record) => record.place_id)).toEqual([studio.id, room.id]);
    });
  });
}

test("CSV preserves quoted cells, punctuation and guarded formulas in an actual copy fallback", async ({ page }) => {
  await denyClipboardWrites(page);
  const [sample] = samplePlaces();
  const risky = {
    ...sample,
    id: "@north",
    name: '=SUM(3,4) "Entrance"',
    category: "+Annex",
    address: '-5, rue "A"',
  };
  await openWithPack(page, [risky], "en");
  await selectPlace(page, risky);
  const records = await fallbackCsv(page);
  expect(records[0]).toMatchObject({ place_id: risky.id, place_name: risky.name, kind: risky.category, address: risky.address });
  const wire = await manualCsv(page).inputValue();
  expect(wire).toContain("'@north");
  expect(wire).toContain(`"'=SUM(3,4) ""Entrance"""`);
  expect(wire).toContain("'+Annex");
  expect(wire).toContain(`"'-5, rue ""A"""`);
  expect(wire).toContain(`'${sample.lon}`);
  expect(comparisonDifferences(await readComparisonTable(comparisonTable(page)), records, [risky.id], "en")).toEqual([]);
});

test("manual CSV selection stays attached to its disclosure when toggling between copy formats", async ({ page }) => {
  await denyClipboardWrites(page);
  const [studio] = samplePlaces();
  await openWithPack(page, [studio], "en");
  await selectPlace(page, studio);
  const toggle = actions(page).getByRole("button", { name: /^(Show|Hide) the text$/ });
  const controls = await toggle.getAttribute("aria-controls");
  if (!controls) throw new Error("Missing controls relationship on manual shortlist copy");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const region = listRegion(page);
  expect(await region.evaluate((section, id) => section.contains(document.getElementById(id)), controls)).toBe(true);
  await fallbackCsv(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(manualCsv(page)).toHaveAttribute("id", controls);
  const copyText = actions(page).getByRole("button", { name: "Copy the list as text" });
  await copyText.focus();
  await copyText.press("Space");
  const text = region.getByRole("textbox", { name: "The list as text" });
  await expect(text).toBeFocused();
  await expect(text).toHaveAttribute("id", controls);
  expect(await text.inputValue()).toContain(studio.name);
  await toggle.focus();
  await toggle.press("Enter");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(text).toHaveCount(0);
});

test("removing one of two places with the same display name keeps the other identity in the CSV", async ({ page }) => {
  await denyClipboardWrites(page);
  const [studio, annex] = samplePlaces();
  const first = { ...studio, name: "Community room", address: "10 Main" };
  const second = { ...annex, name: first.name, address: "20 Main" };
  await openWithPack(page, [first, second], "en");
  for (const place of [second, first]) {
    const card = page.locator("li.pack-place").filter({ hasText: place.address });
    const add = card.getByRole("button", { name: /^Add to list / });
    await expect(add).toHaveCount(1);
    await add.focus();
    await add.press("Space");
    await expect(add.or(card.getByRole("button", { name: /^Remove from list / }))).toHaveAttribute("aria-pressed", "true");
  }
  const before = await fallbackCsv(page);
  expect(before.map((record) => [record.place_id, record.address])).toEqual([
    [second.id, second.address], [first.id, first.address],
  ]);
  const table = comparisonTable(page);
  await expect(table.getByRole("rowheader")).toHaveText([first.name, first.name]);
  const rowToRemove = table.getByRole("row").filter({ has: page.getByRole("cell", { name: first.address, exact: true }) });
  const remove = rowToRemove.getByRole("button", { name: `Remove ${first.name} from the list` });
  await remove.focus();
  await remove.press("Enter");
  await expect(listRegion(page)).toBeFocused();
  await expect(table.getByRole("rowheader")).toHaveCount(1);
  const survivor = await fallbackCsv(page);
  expect(survivor.map((record) => record.place_id)).toEqual([second.id]);
  expect(comparisonDifferences(await readComparisonTable(table), survivor, [second.id], "en")).toEqual([]);
});
