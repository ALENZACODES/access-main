import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { type Draft } from "../../../../packages/contribute/src/schema";

function form(page: Page) {
  const section = page.getByRole("region", { name: "Recorded fields" });
  const button = (name: string) => section.getByRole("button", { name, exact: true });
  const field = section.getByRole("textbox", { name: "Field name", exact: true });
  const value = section.getByRole("textbox", { name: "Observed value", exact: true });
  const unit = section.getByRole("textbox", { name: "Unit (optional)", exact: true });
  const add = button("Add or update field");
  return {
    field, value, unit, add, button,
    apply: button("Apply field changes"),
    cancel: button("Cancel field edit"),
    unknown: section.getByRole("checkbox"),
    row: (key: string) => section.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Edit " + key, exact: true }) }),
    save: page.getByRole("button", { name: "Save on this device", exact: true }),
    export: page.getByRole("button", { name: "Export JSON", exact: true }),
    async record(key: string, observed: string, measurement?: string) {
      await field.fill(key);
      await value.fill(observed);
      if (measurement) await unit.fill(measurement);
      await add.click();
    },
  };
}

async function exportJson(page: Page): Promise<Draft> {
  const downloaded = page.waitForEvent("download");
  await form(page).export.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("contribution.json");
  const path = await file.path();
  if (!path) throw new Error("Missing JSON download");
  return JSON.parse(await readFile(path, "utf8")) as Draft;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/contribute");
  await expect(page.getByRole("heading", { name: "Contribute a place" })).toBeVisible();
});

test("repairs each invalid input in place and exports only the corrected observation", async ({ page }) => {
  const ui = form(page);
  await ui.field.fill("Health_card");
  await ui.add.click();
  await expect(ui.field).toBeFocused();
  await expect(ui.field).toHaveAttribute("aria-invalid", "true");
  await expect(ui.field).toHaveAccessibleDescription(/Personal and private information/);
  await ui.field.fill("landing_width");
  await ui.add.click();
  await expect(ui.value).toBeFocused();
  await expect(ui.value).toHaveAccessibleDescription(/Enter what you observed/);
  await ui.value.fill("82.50");
  await ui.unit.fill("x".repeat(41));
  await ui.add.click();
  await expect(ui.unit).toBeFocused();
  await expect(ui.unit).toHaveAccessibleDescription(/40 characters/);
  await ui.unit.fill("cm");
  await ui.add.focus();
  await page.keyboard.press("Enter");
  await expect(ui.field).toBeFocused();
  await expect(ui.row("landing_width")).toContainText("82.5 cm");
  expect((await exportJson(page)).changes).toEqual({ landing_width: { value: 82.5, unit: "cm" } });
});

test("rejects a rename collision, then keeps the corrected key after saving and reopening", async ({ page }) => {
  const ui = form(page);
  await ui.record("door", "automatic");
  await ui.record("width", "84", "cm");
  await ui.button("Edit width").click();
  await expect(ui.field).toBeFocused();
  await expect(ui.unit).toHaveValue("cm");
  await ui.field.fill("door");
  await ui.apply.click();
  await expect(ui.field).toHaveAccessibleDescription(/already exists/);
  await expect(ui.row("door")).toContainText("automatic");
  await expect(ui.row("width")).toContainText("84 cm");
  await expect(ui.export).toBeDisabled();
  await ui.field.fill("clear_width");
  await ui.value.fill("87");
  await ui.apply.click();
  await ui.save.click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  await page.reload();
  const saved = page.getByRole("region", { name: "Local drafts" });
  await saved.getByRole("button", { name: /^Edit: draft 1/ }).click();
  await expect(ui.row("width")).toHaveCount(0);
  await expect(ui.row("clear_width")).toContainText("87 cm");
  expect((await exportJson(page)).changes).toEqual({ door: { value: "automatic" }, clear_width: { value: 87, unit: "cm" } });
});

test("cancel restores the saved observation and unlocks exports without losing precision", async ({ page }) => {
  const ui = form(page);
  await ui.record("door_code", "0012");
  await ui.record("counter", "9007199254740993");
  await ui.button("Edit door_code").click();
  await ui.value.fill("0100");
  await expect(ui.export).toBeDisabled();
  await expect(ui.save).toBeDisabled();
  await expect(ui.button("Edit counter")).toBeDisabled();
  await ui.cancel.click();
  await expect(ui.field).toBeFocused();
  await expect(ui.button("Edit counter")).toBeEnabled();
  await expect(ui.row("door_code")).toContainText("0012");
  expect((await exportJson(page)).changes).toEqual({
    door_code: { value: "0012" },
    counter: { value: "9007199254740993" },
  });
});

test("removing the field being edited clears that entry and recovers keyboard focus", async ({ page }) => {
  const ui = form(page);
  await ui.record("width", "81", "cm");
  await ui.button("Edit width").click();
  await ui.unknown.check();
  await expect(ui.value).toBeDisabled();
  await ui.button("Delete width").focus();
  await page.keyboard.press("Space");
  await expect(ui.field).toBeFocused();
  await expect(ui.field).toHaveValue("");
  await expect(ui.value).toBeEnabled();
  await expect(ui.unit).toHaveValue("");
  await expect(ui.save).toBeDisabled();
  await ui.field.fill("lift_width");
  await ui.unknown.check();
  await ui.unit.fill("cm");
  await ui.add.click();
  expect((await exportJson(page)).changes).toEqual({ lift_width: { value: "UNKNOWN", unit: "cm" } });
});

test("French field labels lead from a blank value to a recorded unknown and back to a measurement", async ({ page }) => {
  await page.getByRole("button", { name: "Français" }).click();
  const fields = page.getByRole("region", { name: "Champs enregistrés" });
  const name = fields.getByLabel("Nom du champ", { exact: true });
  const observed = fields.getByLabel("Valeur observée", { exact: true });
  await name.fill("largeur");
  await fields.getByRole("button", { name: "Ajouter ou modifier un champ" }).click();
  await expect(observed).toBeFocused();
  await expect(observed).toHaveAccessibleDescription(/Entrez la valeur observée/);
  await fields.getByRole("checkbox").check();
  await fields.getByRole("button", { name: "Ajouter ou modifier un champ" }).click();
  await fields.getByRole("button", { name: "Modifier largeur" }).click();
  await expect(observed).toBeDisabled();
  await fields.getByRole("checkbox").uncheck();
  await observed.fill("0");
  await fields.getByRole("button", { name: "Appliquer les modifications au champ" }).click();
  await expect(name).toBeFocused();
  await expect(fields.getByRole("listitem")).toContainText("largeur: 0");
  await expect(page.getByRole("button", { name: "Enregistrer sur cet appareil" })).toBeEnabled();
});

test("long identifiers stay readable at a 320 pixel viewport during a field edit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const ui = form(page);
  const key = "surface_" + "a".repeat(72);
  const marker = "Station🦽".repeat(100);
  await ui.record(key, marker);
  await expect(ui.row(key)).toBeVisible();
  const overflows = () => page.getByRole("region", { name: "Recorded fields" }).evaluate(section => ({
    content: section.scrollWidth,
    available: section.clientWidth,
    right: section.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
  }));
  const readout = await overflows();
  expect(readout.content).toBeLessThanOrEqual(readout.available + 1);
  expect(readout.right).toBeLessThanOrEqual(readout.viewport + 1);
  const edit = ui.button("Edit " + key);
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(ui.field).toBeFocused();
  await expect(ui.field).toHaveValue(key);
  await expect(ui.value).toHaveValue(marker);
  const editing = await overflows();
  expect(editing.content).toBeLessThanOrEqual(editing.available + 1);
});
