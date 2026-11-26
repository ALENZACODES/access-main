import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  comparisonRows,
  denyClipboardWrites,
  listRegion,
  openTransfer,
  openWithPack,
  placeToggle,
  samplePlaces,
  selectPlace,
  storedList,
  type FixturePlace,
} from "./browser.ts";

function pasteBox(panel: Locator) {
  return panel.getByRole("textbox", { name: /^(Paste a list code here|Collez un code de liste ici)$/ });
}

function confirmAdd(panel: Locator) {
  return panel.getByRole("button", { name: /^(Add \d+ to your list|Ajouter \d+ à votre liste)$/ });
}

async function manualCopy(page: Page) {
  const transfer = await openTransfer(page);
  const copy = transfer.getByRole("button", { name: /^(Copy a code for your|Copier un code pour)/ });
  await copy.focus();
  await copy.press("Enter");
  const fallback = transfer.getByRole("textbox", { name: /^(List code|Code de liste)$/ });
  await expect(fallback).toHaveAttribute("readonly", "");
  await fallback.focus();
  const selected = await fallback.evaluate((box: HTMLTextAreaElement) =>
    box.value.slice(box.selectionStart, box.selectionEnd));
  expect(selected).toBe(await fallback.inputValue());
  return selected;
}

async function contextOrigin(page: Page) {
  return new URL(page.url()).origin;
}

test("a code crosses device and language boundaries without transferring stale place facts", async ({ page, browser }) => {
  const [studio, annex, hall] = samplePlaces();
  const tricky = { ...studio, id: "sample|east", name: "Source's studio name" };
  const prefix = { id: "sample", name: "Different place with the prefix" };
  await denyClipboardWrites(page);
  await openWithPack(page, [tricky, annex, hall, prefix], "en");
  for (const place of [tricky, annex, hall]) await selectPlace(page, place);
  const exported = await manualCopy(page);
  expect(exported.split("\n")[0]).toBe("LIST v1");
  expect(exported).not.toContain(studio.address);
  expect(exported).not.toContain(studio.wheelchair_description);
  const origin = await contextOrigin(page);
  const receiver = await browser.newContext({ baseURL: origin });
  try {
    const target = await receiver.newPage();
    const renamed = { ...tricky, name: "Nom dans le pack destinataire" };
    await openWithPack(target, [renamed, hall, prefix], "fr");
    await selectPlace(target, hall);
    const panel = await openTransfer(target);
    const input = pasteBox(panel);
    await input.fill(exported);
    const preview = panel.locator("[data-list-transfer-plan]");
    await expect(preview.getByRole("listitem")).toHaveText([renamed.name]);
    await expect(preview).toContainText("1 est déjà dans votre liste");
    await expect(preview).toContainText("1 n’est pas dans le pack");
    await expect(comparisonRows(target)).toHaveText([hall.name]);
    await expect(placeToggle(target, prefix.name)).toHaveAttribute("aria-pressed", "false");
    await confirmAdd(panel).press("Enter");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await expect(panel.locator("[aria-live=polite]")).toHaveText("1 lieu ajouté à votre liste.");
    await expect(comparisonRows(target)).toHaveText([hall.name, renamed.name]);
    await target.reload();
    await expect(comparisonRows(target)).toHaveText([hall.name, renamed.name]);
    await expect(placeToggle(target, prefix.name)).toHaveAttribute("aria-pressed", "false");
    // Independent contexts also guard against mistakenly updating the sender.
    await expect(comparisonRows(page)).toHaveText([tricky.name, annex.name, hall.name]);
  } finally {
    await receiver.close();
  }
});

test("a legacy code with a literal separator cannot select its shorter neighbour", async ({ page }) => {
  const first = { id: "wing", name: "Shorter id" };
  const second = { id: "wing|west", name: "Full id" };
  await openWithPack(page, [first, second], "en");
  const panel = await openTransfer(page);
  await pasteBox(panel).fill("LIST v1\r\n- wing|west | Old name in sender pack\r\n");
  await expect(panel.getByRole("listitem")).toHaveText([second.name]);
  await confirmAdd(panel).press("Enter");
  await expect(comparisonRows(page)).toHaveText([second.name]);
  await expect(placeToggle(page, first.name)).toHaveAttribute("aria-pressed", "false");
});

test("previewing and dismissing a transfer leaves an empty shortlist untouched", async ({ page }) => {
  const places = samplePlaces();
  await openWithPack(page, places, "en");
  const panel = await openTransfer(page);
  await pasteBox(panel).fill("- " + places[0].id + " | copied name");
  await expect(confirmAdd(panel)).toBeEnabled();
  await expect(panel.getByRole("listitem")).toHaveText([places[0].name]);
  await expect(listRegion(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Hide moving your list" }).press("Enter");
  await expect(panel).toBeHidden();
  expect(await storedList(page)).toEqual([]);
  await page.reload();
  const reopened = await openTransfer(page);
  await expect(pasteBox(reopened)).toHaveValue("");
  await expect(reopened.getByRole("button", { name: /Copy a code/ })).toHaveCount(0);
});

test("a second tab can change the transfer plan before confirmation", async ({ page, context }) => {
  const [studio, annex] = samplePlaces();
  await openWithPack(page, [studio, annex], "en");
  const panel = await openTransfer(page);
  await pasteBox(panel).fill("- " + annex.id + " | Annex\n- " + studio.id + " | Studio");
  await expect(confirmAdd(panel)).toHaveText("Add 2 to your list");

  const other = await context.newPage();
  await other.goto("/places");
  await selectPlace(other, studio);
  await expect(confirmAdd(panel)).toHaveText("Add 1 to your list");
  await expect(panel.getByRole("listitem")).toHaveText([annex.name]);
  await expect(comparisonRows(page)).toHaveText([studio.name]);
  await confirmAdd(panel).press("Enter");
  await expect(comparisonRows(other)).toHaveText([studio.name, annex.name]);
  await other.getByRole("button", { name: "Empty the list", exact: true }).click();
  await expect(listRegion(page)).toHaveCount(0);
  await expect(placeToggle(page, annex.name)).toHaveAttribute("aria-pressed", "false");
});

test("the list cap applies to new ids after duplicate and missing entries are removed", async ({ page }) => {
  // Generate candidates at the actual boundary, without counting fixture rows as code.
  const places: FixturePlace[] = Array.from({ length: 14 }, (_, index) => ({
    id: "slot-" + index,
    name: "Place " + index,
  }));
  await openWithPack(page, places, "en");
  const panel = await openTransfer(page);
  const input = pasteBox(panel);
  const code = places.map((p) => "- " + p.id + " | " + p.name);
  await input.fill(["LIST v1", code[0], "- absent | absent", ...code, "unrecognised"].join("\n"));
  await expect(confirmAdd(panel)).toHaveText("Add 12 to your list");
  await expect(panel.getByRole("listitem")).toHaveText(places.slice(0, 12).map((p) => p.name));
  await expect(panel).toContainText("2 do not fit");
  await expect(panel).toContainText("1 line was not understood");
  await confirmAdd(panel).press("Enter");
  await expect(comparisonRows(page)).toHaveCount(12);

  await input.fill(code.slice(11).join("\n"));
  await expect(confirmAdd(panel)).toBeDisabled();
  await expect(panel.getByRole("listitem")).toHaveCount(0);
  await expect(panel).toContainText("1 is already on your list");
  await listRegion(page).getByRole("button", { name: "Remove Place 0 from the list", exact: true }).click();
  await expect(confirmAdd(panel)).toHaveText("Add 1 to your list");
  await expect(panel.getByRole("listitem")).toHaveText(["Place 12"]);
  await confirmAdd(panel).press("Enter");
  await expect(comparisonRows(page)).toHaveText(places.slice(1, 13).map((p) => p.name));
});

test("successful clipboard export can be read outside the source page", async ({ page, context }) => {
  const [studio, annex] = samplePlaces();
  await openWithPack(page, [studio, annex], "en");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: await contextOrigin(page) });
  await selectPlace(page, annex);
  await selectPlace(page, studio);
  const panel = await openTransfer(page);
  const button = panel.getByRole("button", { name: "Copy a code for your 2 places" });
  await button.press("Enter");
  await expect(panel.locator("[aria-live=polite]")).toHaveText("List code copied.");
  await expect(panel.getByRole("textbox", { name: "List code", exact: true })).toHaveCount(0);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.trimEnd().split(/\r?\n/)).toEqual([
    "LIST v1",
    "- " + annex.id + " | " + annex.name,
    "- " + studio.id + " | " + studio.name,
  ]);
});


test("the manually shown code follows current selections in another tab", async ({ page, context }) => {
  const [studio, annex] = samplePlaces();
  await denyClipboardWrites(page);
  await openWithPack(page, [studio, annex], "en");
  await selectPlace(page, studio);
  const first = await manualCopy(page);
  expect(first).toContain(studio.id);
  const other = await context.newPage();
  await other.goto("/places");
  await selectPlace(other, annex);
  const visibleCode = page.getByRole("textbox", { name: "List code", exact: true });
  await expect(visibleCode).toHaveValue(/sample-41/);
  await placeToggle(other, studio.name).press("Space");
  await expect(visibleCode).toHaveValue("LIST v1\n- " + annex.id + " | " + annex.name + "\n");
  await other.getByRole("button", { name: "Empty the list" }).press("Enter");
  await expect(visibleCode).toHaveCount(0);
  await expect(page.getByText("Your list is empty, so there is no code to copy.")).toBeVisible();
});

test("a refused storage write keeps the visible plan usable for this session", async ({ page }) => {
  const places = samplePlaces();
  const [studio, annex] = places;
  await denyClipboardWrites(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "app.pack-shortlist.v1") {
        throw new DOMException("Test device is full", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await openWithPack(page, places, "en");
  const panel = await openTransfer(page);
  const input = pasteBox(panel);
  await input.fill("- " + studio.id + " | Studio\n- " + annex.id + " | Annex");
  await confirmAdd(panel).press("Enter");
  await expect(listRegion(page)).toContainText("could not be saved on this device");
  await expect(comparisonRows(page)).toHaveText([studio.name, annex.name]);
  expect(await storedList(page)).toEqual([]);
  await panel.getByRole("button", { name: "Copy a code for your 2 places" }).press("Enter");
  const fallback = panel.getByRole("textbox", { name: "List code", exact: true });
  await expect(fallback).toHaveValue(/sample\/41.*\n- sample-41/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Move your list to another device" })).toBeVisible();
  await expect(listRegion(page)).toHaveCount(0);
  await expect(placeToggle(page, annex.name)).toHaveAttribute("aria-pressed", "false");
});
