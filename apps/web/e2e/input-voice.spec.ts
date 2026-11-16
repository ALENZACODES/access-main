import { expect, test } from "@playwright/test";

/**
 * P3: residual voice-control and screen-reader gaps on live routes.
 * The Contribute draft list used to give every row the same "Edit" and
 * "Delete" names. Each now starts with the visible label (WCAG 2.5.3) and
 * names its row, so "click Edit draft 2" reaches one button.
 */

const COPY = {
  en: { field: "Field name", value: "Observed value", add: "Add or update field", save: "Save on this device", fresh: "New draft" },
  fr: { field: "Nom du champ", value: "Valeur observée", add: "Ajouter ou modifier un champ", save: "Enregistrer sur cet appareil", fresh: "Nouveau brouillon" },
} as const;

/** Saves two local drafts, each with one recorded field, using only the visible labels. */
async function twoDrafts(page: import("@playwright/test").Page, language: "en" | "fr") {
  const copy = COPY[language];
  await page.goto("/contribute");
  for (const width of ["90", "81"]) {
    await page.getByLabel(copy.field, { exact: true }).fill("entrance_width_cm");
    await page.getByLabel(copy.value, { exact: true }).fill(width);
    await page.getByRole("button", { name: copy.add, exact: true }).click();
    await page.getByRole("button", { name: copy.save, exact: true }).click();
    if (width === "90") await page.getByRole("button", { name: copy.fresh, exact: true }).click();
  }
}

test("Contribute: each draft's Edit and Delete is named for its row, in English", async ({ page }) => {
  await twoDrafts(page, "en");
  const list = page.locator("section ol").last();
  await expect(list.locator("li")).toHaveCount(2);
  for (const n of [1, 2]) {
    const edit = list.getByRole("button", { name: new RegExp(`^Edit: draft ${n}, new place, \\d{4}-\\d{2}-\\d{2}$`) });
    await expect(edit).toHaveCount(1);
    await expect(edit).toHaveText("Edit");
    await expect(list.getByRole("button", { name: new RegExp(`^Delete: draft ${n}, `) })).toHaveText("Delete");
  }
  // A voice command for the visible label plus the row reaches exactly one control.
  await expect(page.getByRole("button", { name: "Edit: draft 2", exact: false })).toHaveCount(1);
});

test("Contribute: row names in French keep the visible label first, with French typography (Chrome reads the no-break space as a space)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await twoDrafts(page, "fr");
  const list = page.locator("section ol").last();
  const edit = list.getByRole("button", { name: /^Modifier\s: brouillon 1, / });
  await expect(edit).toHaveCount(1);
  await expect(edit).toHaveText("Modifier");
  expect(await edit.getAttribute("aria-label")).toMatch(/^Modifier\u00a0: brouillon 1, /);
  await expect(list.getByRole("button", { name: /^Supprimer\s: brouillon 2, / })).toHaveText("Supprimer");
});

test("the language buttons carry their own language, so speech reads Français in French", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Français" })).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("lang", "en");
});
