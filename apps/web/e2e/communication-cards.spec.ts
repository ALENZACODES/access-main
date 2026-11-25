import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./support/first-install";

const labels = {
  en: {
    open: "Open communication cards", close: "Close communication cards", title: "Communication cards",
    english: "English message", french: "French message", add: "Add card", present: "Show cards",
    display: "Card display", backup: "Download JSON backup", file: "Open a JSON backup file",
    preview: "Preview backup", apply: "Restore these cards", empty: "Add your first message below.",
    printOptions: "Prepare a print copy", printable: "Download printable cards", printFace: "Messages to print",
    showEnglish: "Show in English", showFrench: "Show in French", next: "Next card", back: "Back to editor",
  },
  fr: {
    open: "Ouvrir les cartes de communication", close: "Fermer les cartes de communication", title: "Cartes de communication",
    english: "Message en anglais", french: "Message en français", add: "Ajouter la carte", present: "Afficher les cartes",
    display: "Affichage de la carte", backup: "Télécharger la sauvegarde JSON", file: "Ouvrir un fichier de sauvegarde JSON",
    preview: "Examiner la sauvegarde", apply: "Restaurer ces cartes", empty: "Ajoutez votre premier message ci-dessous.",
    printOptions: "Préparer une copie à imprimer", printable: "Télécharger les cartes à imprimer", printFace: "Messages à imprimer",
    showEnglish: "Afficher en anglais", showFrench: "Afficher en français", next: "Carte suivante", back: "Retour à l’édition",
  },
} as const;

for (const language of ["en", "fr"] as const) {
  test.describe(language, () => {
    test.use({ locale: `${language}-CA`, serviceWorkers: "allow", viewport: { width: 375, height: 800 } });

    test("writes, keeps and shows communication cards on the first offline visit", async ({ firstOfflinePage: page }) => {
      const c = labels[language];
      const english = "Could you point to the step-free entrance?";
      const french = "Pouvez-vous me montrer l’entrée de plain-pied\u202f?";
      const englishOnly = "Please write the room number.";
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      const open = page.getByRole("button", { name: c.open, exact: true });
      await open.click();
      const deck = page.getByRole("region", { name: c.title, exact: true });

      await deck.getByRole("textbox", { name: c.english, exact: true }).fill(english);
      await deck.getByRole("textbox", { name: c.french, exact: true }).fill(french);
      await deck.getByRole("button", { name: c.add, exact: true }).click();
      await deck.getByRole("textbox", { name: c.english, exact: true }).fill(englishOnly);
      await deck.getByRole("button", { name: c.add, exact: true }).click();

      await page.getByRole("button", { name: c.close, exact: true }).click();
      await expect(deck).toBeHidden();
      await open.click();
      await deck.getByRole("button", { name: c.present, exact: true }).click();
      const display = deck.getByRole("region", { name: c.display, exact: true });
      await deck.getByRole("button", { name: c.showEnglish, exact: true }).click();
      await expect(display.getByText(english, { exact: true })).toBeVisible();
      await deck.getByRole("button", { name: c.showFrench, exact: true }).click();
      await expect(display.getByText(french, { exact: true })).toBeVisible();
      await deck.getByRole("button", { name: c.next, exact: true }).click();
      await expect(display.getByText("UNKNOWN", { exact: true })).toBeVisible();
      await deck.getByRole("button", { name: c.showEnglish, exact: true }).click();
      await expect(display.getByText(englishOnly, { exact: true })).toBeVisible();

      const dimensions = await deck.getByRole("button").evaluateAll((controls) =>
        controls.map((control) => {
          const { width, height } = control.getBoundingClientRect();
          return { label: control.textContent, width, height };
        }),
      );
      expect(dimensions.filter(({ width, height }) => width < 44 || height < 44)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await deck.getByRole("button", { name: c.back, exact: true }).click();
      await expect(deck.getByRole("button", { name: c.add, exact: true })).toBeVisible();
    });

    test("prints only chosen messages and restores a downloaded backup after an offline reload", async ({ firstOfflinePage: page }) => {
      const c = labels[language];
      const open = page.getByRole("button", { name: c.open, exact: true });
      await open.click();
      const deck = page.getByRole("region", { name: c.title, exact: true });
      const english = "Please point to the lift.";
      const french = "Pouvez-vous indiquer l’ascenseur\u202f?";
      const privateNote = "For my own reference only.";
      await deck.getByRole("textbox", { name: c.english, exact: true }).fill(english);
      await deck.getByRole("textbox", { name: c.french, exact: true }).fill(french);
      await deck.getByRole("button", { name: c.add, exact: true }).click();
      await deck.getByRole("textbox", { name: c.english, exact: true }).fill(privateNote);
      await deck.getByRole("button", { name: c.add, exact: true }).click();
      const [backup] = await Promise.all([
        page.waitForEvent("download"),
        deck.getByRole("button", { name: c.backup, exact: true }).click(),
      ]);
      const backupPath = await backup.path();
      expect(backup.suggestedFilename()).toBe("communication-cards.json");
      if (!backupPath) throw new Error("Missing backup download");

      await deck.getByText(c.printOptions, { exact: true }).click();
      await deck.getByRole("checkbox", { name: new RegExp(language === "fr" ? "Carte 1" : "Card 1") }).check();
      await deck.getByRole("combobox", { name: c.printFace, exact: true }).selectOption("fr");
      const [printed] = await Promise.all([
        page.waitForEvent("download"),
        deck.getByRole("button", { name: c.printable, exact: true }).click(),
      ]);
      const printedPath = await printed.path();
      if (!printedPath) throw new Error("Missing printable download");
      const html = await readFile(printedPath, "utf8");
      expect(html).toContain(french);
      expect(html).not.toContain(privateNote);
      expect(html).not.toContain(english);

      const response = await page.reload();
      expect(response?.fromServiceWorker()).toBe(true);
      await open.click();
      await expect(deck.getByText(c.empty, { exact: true })).toBeVisible();
      await deck.getByLabel(c.file, { exact: true }).setInputFiles({
        name: backup.suggestedFilename(), mimeType: "application/json", buffer: await readFile(backupPath),
      });
      await deck.getByRole("button", { name: c.preview, exact: true }).click();
      await expect(deck.getByText(c.empty, { exact: true })).toBeVisible();
      await deck.getByRole("button", { name: c.apply, exact: true }).click();
      await deck.getByRole("button", { name: c.present, exact: true }).click();
      await deck.getByRole("button", { name: c.showEnglish, exact: true }).click();
      const display = deck.getByRole("region", { name: c.display, exact: true });
      await expect(display.getByText(english, { exact: true })).toBeVisible();
      await deck.getByRole("button", { name: c.next, exact: true }).click();
      await expect(display.getByText(privateNote, { exact: true })).toBeVisible();
    });
  });
}
