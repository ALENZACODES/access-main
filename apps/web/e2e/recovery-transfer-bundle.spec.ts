import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { emptyGuidedDocument } from "../src/recovery/recoveryGuidedReview";
import { emptyBriefDocument } from "../src/recovery/recoverySupportBrief";
import { emptyRefreshDocument, type RefreshDocument } from "../src/recovery/recoverySourceRefresh";
import { bundleCopy, fileAction } from "../src/recovery/transferBundle/copy";

function chosen(name: string, buffer: Buffer) {
  return { name, mimeType: "application/json", buffer };
}

async function save(page: Page, control: Locator, name: string) {
  const event = page.waitForEvent("download");
  await control.press("Enter");
  const download = await event;
  expect(download.suggestedFilename()).toBe(name);
  const path = await download.path();
  if (!path) throw new Error("Browser did not produce the chosen download");
  return readFile(path);
}

const refresh: RefreshDocument = {
  ...emptyRefreshDocument(),
  subjects: [{
    id: "sample-source", packId: "fixture-pack", topic: "pack",
    title: "Exemple de récupération", startedAt: "2026-11-01T10:00:00Z",
  }],
  observations: [{
    id: "sample-observation", subjectId: "sample-source",
    observedAt: "2026-11-01T11:00:00Z", condition: "UNKNOWN",
    source: {
      name: "Synthetic fixture", licence: "CC0", retrievedOn: "2026-10-31",
      tier: "UNKNOWN", reference: "fixture-only",
    },
    note: "Essai local avec accents et espaces insécables\u00a0!",
  }],
};
const files = [
  chosen("example-origin-A.json", Buffer.from("\ufeff" + JSON.stringify(emptyGuidedDocument(), null, 2) + "\r\n")),
  chosen("example-origin-B.json", Buffer.from(JSON.stringify(emptyBriefDocument()) + "\n\n")),
  chosen("example-origin-C.json", Buffer.from(JSON.stringify(refresh, null, 4).replace(/\n/gu, "\r\n"))),
];

for (const locale of ["en", "fr"] as const) {
  test.describe("offline recovery transfer in " + locale, () => {
    test.use({ locale: locale + "-CA", serviceWorkers: "allow", viewport: { width: 320, height: 720 } });
    test("carries the three recovery exports offline and extracts precisely the sender’s bytes", async ({ page, context }) => {
      const copy = bundleCopy[locale];
      const french = locale === "fr";
      await page.goto("/");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await context.setOffline(true);
      const offline = await context.newPage();
      await page.close();
      expect((await offline.goto("/offline"))?.fromServiceWorker()).toBe(true);
      await expect(offline.locator("html")).toHaveAttribute("lang", locale);
      const transfer = offline.locator("details[data-recovery-transfer]");
      const toggle = transfer.locator(":scope > summary");
      await expect(transfer.getByRole("heading", { name: copy.title })).toHaveCount(0);
      await toggle.press("Enter");
      await expect(transfer.getByRole("heading", { name: copy.title })).toBeVisible();
      const formats = transfer.locator("summary").filter({ hasText: copy.allowed }).first();
      await formats.focus();
      await expect(formats).toBeFocused();
      await expect(formats).toHaveCSS("outline-style", "solid");
      // The transfer disclosure contains both single-bundle and multi-part pickers.
      const add = transfer.getByLabel(copy.chooseExports, { exact: true }).first();
      await add.focus();
      await expect(add).toBeFocused();
      await add.setInputFiles(files);
      await expect(transfer.getByRole("list", { name: copy.draftList }).locator(":scope > li")).toHaveCount(3);
      await toggle.press("Space");
      await expect(add).toBeHidden();
      await toggle.press("Enter");
      const bundle = await save(offline, transfer.getByRole("button", { name: copy.saveBundle, exact: true }),
        "recovery-transfer-bundle.json");
      const list = await save(offline, transfer.getByRole("button", {
        name: french ? "Enregistrer la liste de fichiers" : "Save packing list",
      }), "recovery-packing-list.json");
      const packed = JSON.parse(bundle.toString("utf8")) as { entries: { digest: string }[] };
      const inventory = JSON.parse(list.toString("utf8")) as {
        entries: { kind: string; digest: string; recordCount: number }[];
      };
      expect(inventory.entries.map(row => row.kind)).toEqual(["guided", "brief", "refresh"]);
      expect(inventory.entries.map(row => row.recordCount)).toEqual([0, 0, 2]);
      expect(inventory.entries.map(row => row.digest)).toEqual(files.map(row => createHash("sha256").update(row.buffer).digest("hex")));
      expect(list.toString("utf8")).not.toMatch(/fixture|example-origin|Essai local|payload/u);
      const open = transfer.getByLabel(copy.chooseBundle, { exact: true });
      await open.setInputFiles(chosen("bundle.json", bundle));
      const listInput = transfer.getByLabel(french ? "Choisir une liste de fichiers" : "Choose a packing list", { exact: true });
      await listInput.setInputFiles(chosen("list.json", list));
      await expect(transfer.getByText(french
        ? "Tous les fichiers correspondent à la liste et suivent l’ordre prévu."
        : "All files match the packing list in the expected order.", { exact: true })).toBeVisible();

      for (const [i, original] of files.entries()) {
        const name = "recovery-0" + (i + 1) + "-" + inventory.entries[i]!.kind + ".json";
        const extracted = await save(offline, transfer.getByRole("button", { name: fileAction(locale, "save", i + 1) }), name);
        expect(extracted.equals(original.buffer)).toBe(true);
      }
      const dimensions = await transfer.locator("input,button,summary").evaluateAll(controls =>
        controls.filter(el => el.getClientRects().length > 0).map(el => {
          const rect = el.getBoundingClientRect();
          return { name: el.getAttribute("aria-label") ?? el.textContent, width: rect.width, height: rect.height };
        }).filter(rect => rect.width < 44 || rect.height < 44));
      expect(dimensions).toEqual([]);
      expect(await offline.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page: offline })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(audit.violations).toEqual([]);

      inventory.entries.reverse();
      await listInput.setInputFiles(chosen("other-order.json", Buffer.from(JSON.stringify(inventory))));
      await expect(transfer.getByText(french ? "Le lot reçu diffère de la liste de fichiers."
        : "The received bundle differs from the packing list.")).toBeVisible();
      const matches = transfer.locator("summary").filter({ hasText: french ? "Empreintes de fichier correspondantes" : "Matching file fingerprints" });
      await matches.press("Enter");
      await expect(transfer.getByText(french ? "Ordre relatif modifié" : "Relative order changed", { exact: true })).toHaveCount(3);

      // A faulty final entry invalidates the entire new bundle and clears the previous extraction.
      packed.entries[2]!.digest = "0".repeat(64);
      await open.setInputFiles(chosen("altered.json", Buffer.from(JSON.stringify(packed))));
      await expect(open).toHaveAttribute("aria-invalid", "true");
      await expect(transfer.getByRole("status").filter({ hasText: copy.problems.integrity })).toBeVisible();
      await expect(transfer.getByRole("button", { name: fileAction(locale, "save", 1) })).toHaveCount(0);
      await expect(transfer.getByRole("list", { name: copy.draftList }).locator(":scope > li")).toHaveCount(3);
    });
  });
}

for (const locale of ["en", "fr"] as const) {
  test.describe("recovery transfer connection interruption in " + locale, () => {
    test.use({ locale: locale + "-CA", serviceWorkers: "block" });
    test("keeps other tools available and opens the transfer panel on retry", async ({ page }) => {
      const french = locale === "fr";
      let unavailable = true;
      let requests = 0;
      await page.route("**/assets/Panel-*.js", async route => {
        requests++;
        if (unavailable) await route.abort("failed");
        else await route.continue();
      });
      await page.goto("/offline");
      const transfer = page.locator("details[data-recovery-transfer]");
      const toggle = transfer.locator(":scope > summary");
      await toggle.press("Enter");
      await expect(transfer.getByRole("status")).toHaveText(french
        ? "Impossible d’ouvrir l’outil de transfert." : "The transfer tool could not open.");
      expect(requests).toBeGreaterThan(0);
      await toggle.press("Space");
      await expect(toggle).toBeFocused();
      const other = page.getByRole("button", {
        name: french ? "Contrôler les ensembles enregistrés" : "Check saved packs", exact: true,
      });
      await expect(other).toBeEnabled();
      await toggle.press("Enter");
      unavailable = false;
      await transfer.getByRole("button", { name: french ? "Réessayer" : "Try again" }).press("Enter");
      await expect(transfer.getByRole("heading", { name: bundleCopy[locale].title, exact: true })).toBeVisible();
      await expect(transfer.getByLabel(bundleCopy[locale].chooseExports)).toBeEnabled();
    });
  });
}
