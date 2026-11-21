import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const labels = {
  en: {
    open: "Open packing list", close: "Close packing list", list: "Packing list",
    bagName: "Bag name", addBag: "Add bag", addItem: "Add item", itemName: "Item name",
    planned: "Quantity to bring", packed: "Quantity packed", returned: "Quantity returned",
    note: "Item note", saveItem: "Save item", start: "Start packing check", back: "Start return check",
    count: "Count for this item", record: "Record and continue", done: "Back to checks",
    text: "Save checklist (text)", backup: "Save backup (JSON)", file: "Choose a packing backup",
    replace: "Replace current list", privateNote: "Ask Pat where the spares are stored.",
    bag: "Side pocket", item: "Luggage tags", empty: "Add your first bag, then list what goes inside.",
  },
  fr: {
    open: "Ouvrir la liste de bagages", close: "Fermer la liste de bagages", list: "Liste de bagages",
    bagName: "Nom du sac", addBag: "Ajouter un sac", addItem: "Ajouter un article", itemName: "Nom de l’article",
    planned: "Quantité à emporter", packed: "Quantité emballée", returned: "Quantité rapportée",
    note: "Note sur l’article", saveItem: "Enregistrer l’article", start: "Commencer le décompte au départ",
    back: "Commencer le décompte au retour", count: "Quantité pour cet article", record: "Enregistrer et continuer",
    done: "Revenir aux décomptes", text: "Enregistrer la liste (texte)", backup: "Enregistrer une copie (JSON)",
    file: "Choisir une copie de la liste", replace: "Remplacer la liste actuelle",
    privateNote: "Demander à Pat où ranger les étiquettes de rechange.", bag: "Poche latérale",
    item: "Étiquettes à bagages", empty: "Ajoutez votre premier sac, puis indiquez ce qu’il contient.",
  },
} as const;

function button(scope: Locator | Page, name: string) {
  return scope.getByRole("button", { name, exact: true });
}

async function downloadContents(page: Page, trigger: Locator, name: string) {
  const pending = page.waitForEvent("download");
  await trigger.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe(name);
  const path = await file.path();
  if (!path) throw new Error("Browser did not supply a downloaded file");
  return readFile(path);
}

async function expectTarget(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
}

async function expectCount(group: Locator, name: string, value: string) {
  const term = group.getByText(name, { exact: true }).locator("..");
  await expect(term.locator("dd")).toHaveText(value);
}

for (const language of ["en", "fr"] as const) {
  test.describe(language, () => {
    test.use({ locale: language + "-CA", serviceWorkers: "allow", viewport: { width: 320, height: 800 } });

    test("packs, counts returns and restores a backup on a first offline installation", async ({ page, context }) => {
      const c = labels[language];
      await page.goto("/");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      const installed = await page.evaluate(async () => {
        const names = (await caches.keys()).filter(name => name.includes("precache"));
        const files = await Promise.all(names.map(async name => (await caches.open(name)).keys()));
        return files.flat().map(request => new URL(request.url).pathname);
      });
      await context.setOffline(true);
      const offline = await context.newPage();
      const scripts = new Set<string>();
      offline.on("request", req => {
        if (req.resourceType() === "script") scripts.add(new URL(req.url()).pathname);
      });
      await page.close();
      const response = await offline.goto("/offline");
      expect(response?.fromServiceWorker()).toBe(true);
      expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
      await expect(offline.locator("html")).toHaveAttribute("lang", language);
      const launcher = button(offline, c.open);
      await expectTarget(launcher);
      await launcher.click();
      const panel = offline.getByRole("region", { name: c.list, exact: true });
      await expect(panel.getByText(c.empty, { exact: true })).toBeVisible();
      await panel.getByLabel(c.bagName, { exact: true }).fill(c.bag);
      await button(panel, c.addBag).click();
      await button(panel, c.addItem).click();
      await panel.getByLabel(c.itemName, { exact: true }).fill(c.item);
      await panel.getByLabel(c.planned, { exact: true }).fill("3");
      await panel.getByLabel(c.note, { exact: true }).fill(c.privateNote);
      await button(panel, c.saveItem).click();
      const item = panel.getByRole("group", { name: c.item, exact: true });
      await expectCount(item, c.packed, "UNKNOWN");
      await expectCount(item, c.returned, "UNKNOWN");

      for (const [stage, count] of [[c.start, "2"], [c.back, "0"]] as const) {
        await button(panel, stage).click();
        const quantity = panel.getByRole("spinbutton", { name: c.count, exact: true });
        await expectTarget(quantity);
        await quantity.fill(count);
        const record = button(panel, c.record);
        await expectTarget(record);
        await record.click();
        await button(panel, c.done).click();
      }
      await button(offline, c.close).click();
      await expect(panel).toBeHidden();
      await launcher.click();
      await expectCount(item, c.packed, "2");
      await expectCount(item, c.returned, "0");
      const bounds = await panel.evaluate(el => ({
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: document.documentElement.clientWidth,
        scroll: el.scrollWidth,
        client: el.clientWidth,
      }));
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);

      const checklist = await downloadContents(offline, button(panel, c.text), "packing-list.txt");
      expect(checklist.toString("utf8")).toContain(c.item);
      expect(checklist.toString("utf8")).not.toContain(c.privateNote);
      const backup = await downloadContents(offline, button(panel, c.backup), "packing-list.json");
      const snapshot = JSON.parse(backup.toString("utf8"));
      expect(snapshot.bags).toEqual([expect.objectContaining({
        name: c.bag, items: [expect.objectContaining({ name: c.item, packed: 2, quantity: 3, returned: 0, note: c.privateNote })],
      })]);

      await offline.reload();
      await button(offline, c.open).click();
      await expect(panel.getByText(c.empty, { exact: true })).toBeVisible();
      await expect(item).toHaveCount(0);
      await panel.getByLabel(c.file, { exact: true }).setInputFiles({
        name: "packing-list.json", mimeType: "application/json", buffer: backup,
      });
      const replace = button(panel, c.replace);
      await expect(replace).toBeVisible();
      await expect(item).toHaveCount(0);
      await replace.click();
      await expectCount(item, c.packed, "2");
      await expectCount(item, c.returned, "0");
      await expect(item.getByText(c.privateNote, { exact: true })).toBeVisible();
      expect(scripts.size).toBeGreaterThan(0);
      expect([...scripts].filter(path => !installed.includes(path))).toEqual([]);
    });
  });
}
