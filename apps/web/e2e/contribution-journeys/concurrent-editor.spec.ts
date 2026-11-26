import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Draft } from "../../../../packages/contribute/src/schema";

function editor(page: Page) {
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const list = page.getByRole("region", { name: "Local drafts" });
  return {
    editSaved: list.getByRole("button", { name: /^Edit: draft 1,/ }),
    deleteSaved: list.getByRole("button", { name: /^Delete: draft 1,/ }),
    notes: page.getByRole("textbox", { name: "Notes (optional)", exact: true }),
    save: button("Save on this device"),
    saved: page.getByRole("status").filter({ hasText: "Draft saved locally" }),
    list,
  };
}

async function createSavedVisit(page: Page) {
  await page.goto("/contribute");
  await page.getByLabel("Field name", { exact: true }).fill("surface");
  await page.getByLabel("Observed value", { exact: true }).fill("paved");
  await page.getByRole("button", { name: "Add or update field" }).click();
  const local = editor(page);
  await local.notes.fill("Entrance observed at noon");
  await local.save.click();
  await expect(local.saved).toBeVisible();
  await expect(local.editSaved).toBeVisible();
}

async function openExisting(page: Page) {
  await page.goto("/contribute");
  const local = editor(page);
  await local.editSaved.click();
  await expect(local.notes).toHaveValue("Entrance observed at noon");
  return local;
}

async function downloadDraft(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const result = await download;
  const path = await result.path();
  if (!path) throw new Error("Missing contribution JSON");
  return JSON.parse(await readFile(path, "utf8")) as Draft;
}

test("a stale editor can export its own notes while the newer saved version survives", async ({ page, context }) => {
  await createSavedVisit(page);
  const second = await context.newPage();
  const other = await openExisting(second);
  const local = editor(page);
  await local.notes.fill("My unsaved east entrance observation");
  await other.notes.fill("West entrance observed at 14:00");
  await other.save.click();
  await expect(other.saved).toBeVisible();
  await local.save.click();
  await expect(page.getByRole("status").filter({ hasText: /changed|newer|another tab/i })).toBeVisible();
  await expect(local.notes).toHaveValue("My unsaved east entrance observation");
  const unsaved = await downloadDraft(page);
  expect(unsaved.note).toBe("My unsaved east entrance observation");
  await second.reload();
  await editor(second).editSaved.click();
  expect((await downloadDraft(second)).note).toBe("West entrance observed at 14:00");
  await local.editSaved.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Discard and open draft" }).click();
  await expect(local.notes).toHaveValue("West entrance observed at 14:00");
  await local.notes.fill("Added after reviewing both observations");
  await local.save.click();
  await expect(local.saved).toBeVisible();
});

test("saving in a stale tab cannot resurrect a deleted visit", async ({ page, context }) => {
  await createSavedVisit(page);
  const second = await context.newPage();
  const other = await openExisting(second);
  const local = editor(page);
  await local.notes.fill("Unsaved observations from this tab");
  await other.deleteSaved.click();
  await second.getByRole("alertdialog").getByRole("button", { name: "Delete draft" }).click();
  await expect(other.editSaved).toHaveCount(0);
  await local.save.click();
  await expect(page.getByRole("status").filter({ hasText: /deleted|changed|another tab/i })).toBeVisible();
  await expect(local.notes).toHaveValue("Unsaved observations from this tab");
  await expect(local.editSaved).toHaveCount(0);
  await second.reload();
  await expect(other.list.getByText("No drafts yet")).toBeVisible();
  expect((await downloadDraft(page)).note).toBe("Unsaved observations from this tab");
});

test("a change made while Delete is open must be reviewed before the new version can be deleted", async ({ page, context }) => {
  await createSavedVisit(page);
  const second = await context.newPage();
  const other = await openExisting(second);
  const local = editor(page);
  await local.deleteSaved.click();
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Delete draft" });
  await expect(confirm).toBeVisible();
  await other.notes.fill("Updated while the confirmation was open");
  await other.save.click();
  await expect(other.saved).toBeVisible();
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Review the updated list" })).toBeVisible();
  await expect(local.list.getByRole("heading")).toBeFocused();
  await local.editSaved.click();
  await expect(local.notes).toHaveValue("Updated while the confirmation was open");
  await local.deleteSaved.click();
  await confirm.click();
  await expect(local.editSaved).toHaveCount(0);
});
