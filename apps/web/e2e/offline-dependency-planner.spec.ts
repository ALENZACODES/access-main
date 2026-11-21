import { expect, test } from "@playwright/test";

const labels = {
  en: {
    open: "Open dependency planner", planner: "Offline dependency planner", title: "Checkpoint name", cell: "Offline cell ID",
    add: "Add checkpoint", edit: "Edit checkpoint", save: "Save changes", filter: /^Show\b/,
    physicalAccess: "Physical accessibility: UNKNOWN", reason: "Region listing unavailable",
    empty: "No checkpoints match the selection.", checkpoint: "Entrance information",
    updated: "Side entrance information", colon: ": ",
  },
  fr: {
    open: "Ouvrir le planificateur de dépendances", planner: "Planificateur de dépendances hors ligne", title: "Nom du point", cell: "Identifiant de cellule hors ligne",
    add: "Ajouter un point à examiner", edit: "Modifier le point", save: "Enregistrer les modifications", filter: /^Afficher\b/,
    physicalAccess: "Accessibilité physique\u00a0: UNKNOWN", reason: "Liste régionale indisponible",
    empty: "Aucun point ne correspond à la sélection.", checkpoint: "Renseignements sur l’entrée",
    updated: "Renseignements sur l’entrée latérale", colon: "\u00a0: ",
  },
} as const;

for (const language of ["en", "fr"] as const) {
  test.describe(language, () => {
    test.use({ locale: `${language}-CA`, serviceWorkers: "allow" });

    test("can add, edit and filter checkpoints on the first offline visit", async ({ page, context }) => {
      const copy = labels[language];
      await page.goto("/");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await context.setOffline(true);
      await page.close();

      const offline = await context.newPage();
      const response = await offline.goto("/offline");
      expect(response?.fromServiceWorker()).toBe(true);
      expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
      await offline.getByRole("button", { name: copy.open, exact: true }).click();
      const planner = offline.getByRole("region", { name: copy.planner, exact: true });
      const title = planner.getByRole("textbox", { name: copy.title, exact: true });
      const cell = planner.getByRole("textbox", { name: copy.cell, exact: true });
      const row = planner.getByRole("listitem");
      await title.fill(copy.checkpoint);
      await cell.fill("unlisted-cell");
      await planner.getByRole("button", { name: copy.add, exact: true }).click();
      await expect(row.getByRole("heading", { name: copy.checkpoint, exact: true })).toBeVisible();
      await expect(row).toContainText(copy.reason);
      await expect(row).toContainText(copy.physicalAccess);
      await row.getByRole("button", { name: copy.edit + copy.colon + copy.checkpoint }).click();
      await expect(title).toBeFocused();
      await expect(cell).toHaveValue("unlisted-cell");
      await title.fill(copy.updated);
      await planner.getByRole("button", { name: copy.save, exact: true }).click();

      const filter = planner.getByRole("combobox", { name: copy.filter });
      await filter.selectOption("saved");
      await expect(row).toHaveText(copy.empty);
      await filter.selectOption("UNKNOWN");
      await expect(row.getByRole("heading", { name: copy.updated, exact: true })).toBeVisible();
      await expect(row).toContainText(copy.physicalAccess);
    });
  });
}
