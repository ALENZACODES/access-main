import { expect, test, type Page } from "@playwright/test";
import { readStoredZip } from "./exportedFiles";
import type { Draft } from "../../../../packages/contribute/src/schema";

function observation(id: string, event?: string): Draft {
  return {
    version: 1, id, target: `Entrance ${id}`, kind: "audit", observed: "2025-03-17",
    note: `Field notes for ${id}`, changes: { clear_width: { value: 89, unit: "cm" } },
    ...(event ? { event } : {}),
    photos: [], tier: "community-reported (tier 1, unreviewed)",
  };
}

async function importObservations(page: Page, rows: Draft[]) {
  await page.goto("/contribute");
  await page.getByLabel("Import JSON or GeoJSON").setInputFiles({
    name: "visits.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows)),
  });
  await expect(page.getByRole("status").filter({ hasText: "Drafts imported locally" })).toBeVisible();
}

async function enterReview(page: Page) {
  await page.getByRole("link", { name: "Mapping day", exact: true }).click();
  await expect(page).toHaveURL(/\/contribute\/event$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mapping day" })).toBeVisible();
}

test("the mapping-day deep link explains an empty device and returns to the editor", async ({ page }) => {
  await page.goto("/contribute/event/");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Mapping day");
  await expect(page).toHaveTitle(/Mapping day/);
  await expect(main.getByText(/no saved drafts with an event name/)).toBeVisible();
  await expect(main.getByRole("combobox")).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Export event/ })).toHaveCount(0);
  const back = main.getByRole("link", { name: "Back to contributions" });
  await back.focus();
  await back.press("Enter");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Contribute a place");
  await page.goBack();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Mapping day");
  await page.goForward();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Contribute a place");
});

test("a saved observation made in the editor is available after the route is opened by keyboard", async ({ page }) => {
  await page.goto("/contribute");
  await page.getByRole("combobox", { name: "Contribution type", exact: true }).selectOption("correction");
  await page.getByLabel("Place record ID").fill("South entrance");
  await page.getByLabel("Mapping-day event (optional)").fill("Saturday field visit");
  await page.getByLabel("Field name").fill("ramp");
  await page.getByLabel("I could not check (Unknown)").check();
  await page.getByRole("button", { name: "Add or update field" }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved locally" })).toBeVisible();
  const entry = page.getByRole("link", { name: "Mapping day", exact: true });
  await entry.focus();
  await entry.press("Enter");
  await expect(page.getByRole("heading", { name: "Mapping day", level: 1 })).toBeFocused();
  await page.getByLabel("Event name").selectOption("Saturday field visit");
  const select = page.getByRole("checkbox", { name: /South entrance/ });
  await expect(select).not.toBeChecked();
  await select.focus();
  await select.press("Space");
  await expect(select).toBeChecked();
  await page.getByText("Recorded observations — draft 1").press("Enter");
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("Correct a field", { exact: false })).toBeVisible();
});

test("exports exactly the checked visits and scopes select-all to the chosen event", async ({ page }) => {
  const event = "Café / Port";
  const first = observation("East", event);
  const second = observation("West", event);
  const other = observation("Neighbour", "Café / Portage");
  const differentCase = observation("Upper", "CAFÉ / PORT");
  const ungrouped = observation("Unassigned");
  await importObservations(page, [first, second, other, differentCase, ungrouped]);
  await enterReview(page);
  const menu = page.getByLabel("Event name");
  await expect(menu.getByRole("option")).toHaveCount(4);
  await menu.selectOption(event);
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(2);
  const exportButton = page.getByRole("button", { name: "Export event ZIP" });
  await expect(exportButton).toBeDisabled();
  await page.getByRole("button", { name: "Select all drafts" }).click();
  await expect(page.getByText("2 of 2 selected")).toBeVisible();
  await page.getByRole("checkbox", { name: /Entrance East/ }).uncheck();
  const download = page.waitForEvent("download");
  await exportButton.click();
  const files = await readStoredZip(await download);
  expect([...files.keys()].sort()).toEqual(["contributions.geojson", "contributions.json"]);
  expect(JSON.parse(files.get("contributions.json")!.toString())).toEqual([second]);
  const geo = JSON.parse(files.get("contributions.geojson")!.toString());
  expect(geo.features).toEqual([{ type: "Feature", geometry: null, properties: second }]);

  await menu.selectOption(other.event!);
  await expect(checkboxes).toHaveCount(1);
  await expect(checkboxes).toHaveAccessibleName(/Entrance Neighbour/);
  await expect(checkboxes).not.toBeChecked();
  await expect(exportButton).toBeDisabled();
  await menu.selectOption(event);
  await expect(page.getByText("0 of 2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Select all drafts" }).click();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(exportButton).toBeDisabled();
});

test("French language switching preserves the selected visit and narrow-screen review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const row = observation("Gare", "Relevé du quai");
  row.target = "A".repeat(170);
  row.changes = { automatic_door: { value: false }, step: { value: "UNKNOWN" }, width: { value: 0, unit: "cm" } };
  await importObservations(page, [row]);
  await enterReview(page);
  await page.getByLabel("Event name").selectOption(row.event!);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page).toHaveTitle(/Journée de cartographie/);
  await expect(page.getByLabel("Nom de l’événement")).toHaveValue(row.event!);
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByText("1 sur 1 dans la sélection")).toBeVisible();
  await page.getByText("Observations enregistrées — brouillon 1").click();
  for (const value of ["Non", "Inconnu", "0 cm"]) {
    await expect(page.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Exporter le ZIP de l’événement" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Retour aux contributions" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contribuer un lieu");
});

test("a second tab editing and reassigning drafts invalidates the reviewed selection", async ({ page, context }) => {
  const row = observation("A", "First day");
  await importObservations(page, [row]);
  await enterReview(page);
  await page.getByLabel("Event name").selectOption("First day");
  const checkbox = page.getByRole("checkbox");
  await checkbox.check();
  const editor = await context.newPage();
  await importObservations(editor, [{ ...row, note: "Revised notes" }]);
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Export event ZIP" })).toBeDisabled();
  await page.getByText("Recorded observations — draft 1").click();
  await expect(page.getByText("Revised notes")).toBeVisible();
  await checkbox.check();
  await importObservations(editor, [{ ...row, event: "Second day" }]);
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByLabel("Event name")).toHaveValue("");
  await page.getByLabel("Event name").selectOption("Second day");
  await expect(checkbox).not.toBeChecked();
  await editor.close();
});

test("a warm offline reload keeps saved visits accessible without exporting by default", async ({ page, context }) => {
  const row = observation("Station", "Harbour day");
  await importObservations(page, [row]);
  await enterReview(page);
  await page.getByLabel("Event name").selectOption(row.event!);
  await page.getByRole("checkbox").check();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Mapping day" })).toBeVisible();
    const menu = page.getByLabel("Event name");
    await expect(menu).toHaveValue("");
    await menu.selectOption(row.event!);
    await expect(page.getByRole("checkbox", { name: /Entrance Station/ })).not.toBeChecked();
    await page.getByRole("checkbox").check();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export event ZIP" }).click();
    const files = await readStoredZip(await download);
    expect(JSON.parse(files.get("contributions.json")!.toString())).toEqual([row]);
    await page.getByRole("link", { name: "Back to contributions" }).click();
    await expect(page.getByRole("region", { name: "Local drafts" }).getByRole("listitem")).toContainText(row.target);
  } finally {
    await context.setOffline(false);
  }
});

test("reading saved drafts can be retried after a storage failure", async ({ page }) => {
  const row = observation("South", "Return visit");
  await importObservations(page, [row]);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === "drafts") {
        IDBObjectStore.prototype.getAll = original;
        throw new DOMException("Temporary read error", "UnknownError");
      }
      return original.apply(this, args);
    };
  });
  await page.goto("/contribute/event");
  await expect(page.getByRole("status").filter({ hasText: "Saved drafts could not be read." })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByLabel("Event name").selectOption("Return visit");
  await expect(page.getByRole("checkbox", { name: /Entrance South/ })).toBeVisible();
});
