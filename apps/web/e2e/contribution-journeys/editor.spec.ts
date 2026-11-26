import { expect, test, type Page } from "@playwright/test";

const words = {
  en: {
    kind: "Contribution type",
    target: "Place record ID",
    notes: "Notes (optional)",
    field: "Field name",
    value: "Observed value",
    unit: "Unit (optional)",
    unknown: "I could not check (Unknown)",
    add: "Add or update field",
    event: "Mapping-day event (optional)",
    licence: "Photo licence",
    save: "Save on this device",
    saved: "Draft saved locally",
    fresh: "New draft",
    records: "Local drafts",
    edit: /^Edit:/,
    remove: /^Delete:/,
  },
  fr: {
    kind: "Type de contribution",
    target: "Identifiant du lieu",
    notes: "Notes (facultatives)",
    field: "Nom du champ",
    value: "Valeur observée",
    unit: "Unité (facultatif)",
    unknown: "Je n’ai pas pu vérifier (Inconnu)",
    add: "Ajouter ou modifier un champ",
    event: "Journée de cartographie (facultatif)",
    licence: "Licence photo",
    save: "Enregistrer sur cet appareil",
    saved: "Brouillon enregistré localement",
    fresh: "Nouveau brouillon",
    records: "Brouillons locaux",
    edit: /^Modifier\s:/,
    remove: /^Supprimer\s:/,
  },
} as const;

function controls(page: Page, language: keyof typeof words = "en") {
  const t = words[language];
  const byLabel = (name: string) => page.getByLabel(name, { exact: true });
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const list = page.getByRole("region", { name: t.records, exact: true });
  const row = (target: string) => list.getByRole("listitem").filter({ hasText: target });
  return {
    kind: page.getByRole("combobox", { name: t.kind, exact: true }),
    target: byLabel(t.target),
    notes: page.getByRole("textbox", { name: t.notes, exact: true }),
    field: byLabel(t.field),
    value: byLabel(t.value),
    unit: byLabel(t.unit),
    unknown: byLabel(t.unknown),
    event: byLabel(t.event),
    licence: page.getByRole("combobox", { name: t.licence, exact: true }),
    add: button(t.add),
    fresh: button(t.fresh),
    save: button(t.save),
    saved: page.getByRole("status").filter({ hasText: t.saved }),
    dialog: page.getByRole("alertdialog"),
    list,
    row,
    edit: (target: string) => row(target).getByRole("button", { name: t.edit }),
    remove: (target: string) => row(target).getByRole("button", { name: t.remove }),
  };
}

type Editor = ReturnType<typeof controls>;

async function saveVisit(editor: Editor, target: string, width: string) {
  await editor.kind.selectOption("audit");
  await editor.target.fill(target);
  await editor.field.fill("door_width");
  await editor.value.fill(width);
  await editor.unit.fill("cm");
  await editor.add.click();
  await editor.notes.fill(`Measured at ${target}`);
  await editor.save.click();
  await expect(editor.saved).toBeVisible();
  await expect(editor.row(target)).toHaveCount(1);
}

async function expectFresh(editor: Editor) {
  await expect(editor.kind).toHaveValue("new-place");
  await expect(editor.notes).toHaveValue("");
  await expect(editor.field).toHaveValue("");
  await expect(editor.value).toHaveValue("");
  await expect(editor.unit).toHaveValue("");
  await expect(editor.unknown).not.toBeChecked();
  await expect(editor.save).toBeDisabled();
}

test("Escape and Keep editing restore the New trigger and preserve the unfinished observation", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await ui.field.fill("landing");
  await ui.value.fill("132");
  await ui.unit.fill("cm");
  await ui.unknown.check();
  await ui.fresh.focus();
  await page.keyboard.press("Enter");

  await expect(ui.dialog).toHaveAccessibleName("Discard unsaved changes?");
  await expect(ui.dialog).toHaveAccessibleDescription(/unfinished field/);
  const keep = ui.dialog.getByRole("button", { name: "Keep editing" });
  await expect(keep).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ui.dialog.getByRole("button", { name: "Discard and start new draft" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(ui.dialog).toHaveCount(0);
  await expect(ui.fresh).toBeFocused();
  await expect(ui.field).toHaveValue("landing");
  await expect(ui.value).toHaveValue("132");
  await expect(ui.value).toBeDisabled();
  await expect(ui.unit).toHaveValue("cm");
  await expect(ui.unknown).toBeChecked();
  await ui.fresh.press("Space");
  await expect(keep).toBeFocused();
  await keep.press("Enter");
  await expect(ui.fresh).toBeFocused();
  await expect(ui.field).toHaveValue("landing");
  await expect(ui.list.getByRole("listitem")).toHaveCount(0);
});

test("discarding a new visit clears all editor buffers and returns keyboard focus to its first control", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await ui.kind.selectOption("correction");
  await ui.target.fill("North entrance");
  await ui.notes.fill("Handle was removed.");
  await ui.event.fill("Autumn audit");
  await ui.field.fill("door_force");
  await ui.value.fill("18");
  await ui.unit.fill("N");
  await ui.unknown.check();
  await ui.licence.selectOption("CC BY-SA 4.0");
  await ui.fresh.click();
  await ui.dialog.getByRole("button", { name: "Discard and start new draft" }).press("Enter");

  await expectFresh(ui);
  await expect(ui.kind).toBeFocused();
  await expect(ui.event).toHaveValue("");
  await expect(ui.value).toBeEnabled();
  await expect(ui.target).toHaveCount(0);
  await expect(ui.licence).toHaveValue("CC BY 4.0");
  await ui.fresh.click();
  await expect(ui.kind).toBeFocused();
  await expect(ui.dialog).toHaveCount(0);
});

test("switching between saved visits can be canceled and discarded without writing over either record", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await saveVisit(ui, "Library", "92");
  await ui.fresh.click();
  await saveVisit(ui, "Gallery", "84");
  await ui.notes.fill("Unsaved gallery inspection");
  await ui.field.fill("slope");
  await ui.value.fill("2.5");
  const openLibrary = ui.edit("Library");
  await openLibrary.click();

  await expect(ui.dialog).toHaveAccessibleDescription(/Opening Library/);
  await ui.dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(openLibrary).toBeFocused();
  await expect(ui.target).toHaveValue("Gallery");
  await expect(ui.notes).toHaveValue("Unsaved gallery inspection");
  await expect(ui.field).toHaveValue("slope");
  await expect(ui.value).toHaveValue("2.5");
  await openLibrary.press("Enter");
  await ui.dialog.getByRole("button", { name: "Discard and open draft" }).click();

  await expect(ui.kind).toBeFocused();
  await expect(ui.target).toHaveValue("Library");
  await expect(ui.notes).toHaveValue("Measured at Library");
  await expect(ui.field).toHaveValue("");
  await expect(ui.value).toHaveValue("");
  await page.reload();
  await ui.edit("Gallery").click();
  await expect(ui.notes).toHaveValue("Measured at Gallery");
  await expect(ui.list.getByRole("listitem")).toHaveCount(2);
});

test("opening the active row restores its last successful save and clears a stale field entry", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await saveVisit(ui, "Sports centre", "88");
  await ui.notes.fill("Second verified measurement");
  await ui.save.click();
  await expect(ui.fresh).toBeEnabled();
  await ui.notes.fill("Unconfirmed third measurement");
  await ui.field.fill("third_width");
  await ui.unit.fill("cm");
  await ui.edit("Sports centre").click();
  await expect(ui.dialog).toHaveAccessibleDescription(/restore its saved version/);
  await ui.dialog.getByRole("button", { name: "Discard and open draft" }).click();
  await expect(ui.notes).toHaveValue("Second verified measurement");
  await expect(ui.unit).toHaveValue("");
  await expect(ui.field).toHaveValue("");

  await ui.notes.fill("Temporary comment");
  await ui.notes.fill("Second verified measurement");
  await ui.fresh.click();
  await expect(ui.dialog).toHaveCount(0);
  await expectFresh(ui);
});

test("deleting the active row explicitly discards its unsaved work and never resurrects its saved ID", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await saveVisit(ui, "Market", "87");
  await ui.notes.fill("Another observation");
  await ui.field.fill("landing");
  const remove = ui.remove("Market");
  await remove.click();
  await expect(ui.dialog).toHaveAccessibleName("Delete local draft?");
  await expect(ui.dialog).toHaveAccessibleDescription(/Market.*photos.*unsaved edits/);
  await expect(ui.dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  await expect(ui.notes).toHaveValue("Another observation");
  await expect(ui.field).toHaveValue("landing");

  await remove.press("Space");
  await ui.dialog.getByRole("button", { name: "Delete draft", exact: true }).press("Enter");
  await expect(ui.row("Market")).toHaveCount(0);
  await expectFresh(ui);
  await expect(ui.kind).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Draft deleted from this device" })).toBeVisible();
  await page.reload();
  await expect(ui.list.getByRole("listitem")).toHaveCount(0);
  await expectFresh(ui);
});

test("deleting a sibling preserves the active editor, pending input and its ability to save", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await saveVisit(ui, "East gate", "83");
  await ui.fresh.click();
  await saveVisit(ui, "West gate", "79");
  await ui.notes.fill("Only the west gate has a ramp");
  await ui.field.fill("ramp");
  await ui.value.fill("yes");
  await ui.remove("East gate").click();
  await expect(ui.dialog).toHaveAccessibleDescription(/East gate/);
  await expect(ui.dialog).not.toHaveAccessibleDescription(/unsaved edits/);
  await ui.dialog.getByRole("button", { name: "Delete draft", exact: true }).click();

  await expect(ui.row("East gate")).toHaveCount(0);
  await expect(ui.list.getByRole("heading", { name: "Local drafts" })).toBeFocused();
  await expect(ui.target).toHaveValue("West gate");
  await expect(ui.field).toHaveValue("ramp");
  await expect(ui.value).toHaveValue("yes");
  await expect(ui.notes).toHaveValue("Only the west gate has a ramp");
  await ui.add.click();
  await ui.save.click();
  await expect(ui.saved).toBeVisible();
  await page.reload();
  await ui.edit("West gate").click();
  await expect(ui.notes).toHaveValue("Only the west gate has a ramp");
  await expect(page.getByRole("region", { name: "Recorded fields" })).toContainText("ramp");
  await expect(ui.list.getByRole("listitem")).toHaveCount(1);
});

test("French keyboard users can cancel a deletion and confirm abandoning a new observation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goto("/contribute");
  const ui = controls(page, "fr");
  await saveVisit(ui, "Bibliothèque", "90");
  await ui.unknown.check();
  await ui.remove("Bibliothèque").focus();
  await page.keyboard.press("Enter");
  await expect(ui.dialog).toHaveAccessibleName(/Supprimer le brouillon local/);
  await expect(ui.dialog).toHaveAccessibleDescription(/Bibliothèque.*photos.*non enregistrées/);
  const cancel = ui.dialog.getByRole("button", { name: "Annuler" });
  await expect(cancel).toBeFocused();
  await cancel.press("Space");
  await expect(ui.remove("Bibliothèque")).toBeFocused();
  await expect(ui.unknown).toBeChecked();

  await ui.fresh.press("Enter");
  await expect(ui.dialog).toHaveAccessibleName(/Abandonner les modifications/);
  await expect(ui.dialog.getByRole("button", { name: "Continuer la saisie" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ui.dialog.getByRole("button", { name: "Abandonner et créer un brouillon" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ui.kind).toBeFocused();
  await expectFresh(ui);
  await expect(ui.row("Bibliothèque")).toHaveCount(1);
});

test("the Mapping day link keeps its destination and lets a keyboard user decide when to leave", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  await saveVisit(ui, "Town hall", "98");
  await ui.notes.fill("An unfinished observation");
  const mapping = page.getByRole("link", { name: "Mapping day", exact: true });
  await expect(mapping).toHaveAttribute("href", /\/contribute\/event$/);
  await mapping.focus();
  await page.keyboard.press("Enter");
  await expect(ui.dialog).toHaveAccessibleDescription(/Leaving for Mapping day/);
  await expect(ui.dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mapping).toBeFocused();
  await expect(ui.notes).toHaveValue("An unfinished observation");
  await mapping.press("Enter");
  await ui.dialog.getByRole("button", { name: "Discard and open Mapping day" }).click();
  await expect(page).toHaveURL(/\/contribute\/event\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mapping day" })).toBeVisible();

  await page.goBack();
  await ui.edit("Town hall").click();
  await expect(ui.notes).toHaveValue("Measured at Town hall");
  await mapping.click();
  await expect(page).toHaveURL(/\/contribute\/event\/?$/);
});

test("a same-ID batch import can be canceled, retried and adopted as the clean saved baseline", async ({ page }) => {
  await page.goto("/contribute");
  const ui = controls(page);
  const input = page.getByLabel("Import JSON or GeoJSON", { exact: true });
  const original = {
    id: "editor-import-fixture",
    version: 1,
    kind: "audit",
    target: "Station",
    observed: "2024-02-29",
    note: "Platform 2",
    tier: "community-reported (tier 1, unreviewed)",
    changes: { platform_height: { value: 47, unit: "cm" } },
    photos: [],
  };
  const upload = (records: unknown) => input.setInputFiles({
    name: "visits.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(records)),
  });
  await upload(original);
  await ui.edit("Station").click();
  await expect(ui.notes).toHaveValue("Platform 2");
  await ui.field.fill("tactile_paving");
  await ui.unknown.check();

  const revised = { ...original, note: "Platform 4" };
  const sibling = { ...original, id: "second-import-fixture", target: "Bus stop" };
  await upload([revised, sibling]);
  await expect(ui.dialog).toHaveAccessibleDescription(/file includes the draft you are editing/);
  await ui.dialog.getByRole("button", { name: "Keep editing" }).press("Enter");
  await expect(input).toBeFocused();
  await expect(ui.field).toHaveValue("tactile_paving");
  await expect(ui.notes).toHaveValue("Platform 2");
  await expect(ui.row("Bus stop")).toHaveCount(0);

  await upload([revised, sibling]);
  await ui.dialog.getByRole("button", { name: "Discard and import" }).click();
  await expect(ui.notes).toHaveValue("Platform 4");
  await expect(ui.field).toHaveValue("");
  await expect(ui.unknown).not.toBeChecked();
  await expect(ui.row("Bus stop")).toHaveCount(1);
  await expect(ui.kind).toBeFocused();

  await upload({ ...revised, note: "Platform 5" });
  await expect(ui.notes).toHaveValue("Platform 5");
  await expect(ui.dialog).toHaveCount(0);
  await ui.fresh.click();
  await expectFresh(ui);
  await ui.field.fill("scratch_note");
  await upload({ ...sibling, note: "Shelter repaired" });
  await expect(page.getByRole("status").filter({ hasText: "Drafts imported locally" })).toBeVisible();
  await expect(ui.field).toHaveValue("scratch_note");
  await expect(ui.dialog).toHaveCount(0);
  await page.reload();
  await ui.edit("Station").click();
  await expect(ui.notes).toHaveValue("Platform 5");
  await ui.edit("Bus stop").click();
  await expect(ui.notes).toHaveValue("Shelter repaired");
});
