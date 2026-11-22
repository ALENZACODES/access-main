import { expect, type Locator, type Page } from "@playwright/test";
import { rehearsalCopy } from "../../src/input/rehearsal/copy.ts";
import type { Language } from "./helpers.ts";

const editorLabels = {
  en: {
    title: "Edit step order", draft: "Draft order", moving: "Step to move", reference: "Reference step",
    earlier: "Move earlier", later: "Move later", start: "Move to start", end: "Move to end",
    before: "Place before", after: "Place after", undo: "Undo", redo: "Redo",
    apply: "Apply order", cancel: "Cancel",
    pick: (name: string) => `Select ${name}`,
    anchor: (name: string) => `Use ${name} as reference`,
    duplicate: (name: string, ordinal: number) => `${name} (step ${ordinal})`,
  },
  fr: {
    title: "Modifier l’ordre des étapes", draft: "Ordre proposé", moving: "Étape à déplacer", reference: "Étape de référence",
    earlier: "Déplacer plus tôt", later: "Déplacer plus tard", start: "Placer au début", end: "Placer à la fin",
    before: "Placer avant", after: "Placer après", undo: "Annuler le déplacement", redo: "Rétablir le déplacement",
    apply: "Appliquer l’ordre", cancel: "Fermer sans appliquer",
    pick: (name: string) => `Sélectionner ${name}`,
    anchor: (name: string) => `Prendre ${name} comme référence`,
    duplicate: (name: string, ordinal: number) => `${name} (étape ${ordinal})`,
  },
};

export interface ExampleStep {
  name: Record<Language, string>;
  detail: Record<Language, string>;
}

export const review: ExampleStep = {
  name: { en: "Review", fr: "Relire" },
  detail: { en: "Read the first draft.", fr: "Lire la première version." },
};
export const pause: ExampleStep = {
  name: { en: "Pause", fr: "Pause" },
  detail: { en: "Pause before editing.", fr: "Faire une pause avant la révision." },
};
export const secondReview: ExampleStep = {
  name: { en: "Review", fr: "Relire" },
  detail: { en: "Read the revised draft.", fr: "Lire la version révisée." },
};
export const finish: ExampleStep = {
  name: { en: "Finish", fr: "Terminer" },
  detail: { en: "Close the exercise.", fr: "Clore l’exercice." },
};

export function rehearsal(page: Page, language: Language) {
  const copy = rehearsalCopy(language);
  const labels = editorLabels[language];
  const modal = page.getByRole("dialog", { name: labels.title, exact: true });
  const journey = page.getByRole("region", { name: copy.steps, exact: true });
  const opener = page.getByRole("button", { name: labels.title, exact: true });
  const draft = modal.getByRole("list", { name: labels.draft, exact: true });
  const scanner = page.getByRole("region", { name: copy.keyboard, exact: true });

  function action(name: string) {
    return modal.getByRole("button", { name, exact: true });
  }
  async function visit() {
    const response = await page.goto("/access-rehearsal");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
  }
  async function add(step: ExampleStep) {
    await journey.getByLabel(copy.stepEn, { exact: true }).fill(step.name.en);
    await journey.getByLabel(copy.stepFr, { exact: true }).fill(step.name.fr);
    await journey.getByLabel(copy.detailEn, { exact: true }).fill(step.detail.en);
    await journey.getByLabel(copy.detailFr, { exact: true }).fill(step.detail.fr);
    await journey.getByRole("button", { name: copy.add, exact: true }).click();
    await expect(journey.getByText(step.detail[language], { exact: true })).toBeVisible();
  }
  async function addWithKeyboard(step: ExampleStep) {
    const fields: Array<[string, string]> = [
      [copy.stepEn, step.name.en], [copy.stepFr, step.name.fr],
      [copy.detailEn, step.detail.en], [copy.detailFr, step.detail.fr],
    ];
    await tabTo(page, journey.getByLabel(copy.stepEn, { exact: true }));
    for (const [index, [label, text]] of fields.entries()) {
      if (index > 0) await page.keyboard.press("Tab");
      const field = journey.getByLabel(label, { exact: true });
      await expect(field).toBeFocused();
      await page.keyboard.insertText(text);
      await expect(field).toHaveValue(text);
    }
    await keyboardActivate(page, journey.getByRole("button", { name: copy.add, exact: true }));
    await expect(journey.getByText(step.detail[language], { exact: true })).toBeVisible();
  }
  async function expectPublished(...ordered: ExampleStep[]) {
    const rows = journey.getByRole("listitem");
    await expect(rows).toHaveCount(ordered.length);
    for (const [i, step] of ordered.entries()) {
      await expect(rows.nth(i).getByText(step.name[language], { exact: true })).toBeVisible();
      await expect(rows.nth(i).getByText(step.detail[language], { exact: true })).toBeVisible();
      await expect(rows.nth(i)).toContainText("UNKNOWN");
    }
  }
  async function expectDraft(...names: string[]) {
    const rows = draft.getByRole("listitem");
    await expect(rows).toHaveCount(names.length);
    for (const [i, name] of names.entries()) {
      await expect(rows.nth(i).getByRole("button", { name: labels.pick(name), exact: true })).toBeVisible();
    }
  }
  async function open() {
    await opener.click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("combobox", { name: labels.moving, exact: true })).toBeFocused();
  }
  async function expectClosed() {
    await expect(modal).toHaveCount(0);
    await expect(opener).toBeFocused();
  }

  return { copy, labels, modal, journey, opener, draft, scanner, action, visit, add,
    addWithKeyboard, expectPublished, expectDraft, open, expectClosed };
}

/** Advance a real sequential input device. The bound includes Chromium's browser-chrome stop. */
export async function tabTo(page: Page, target: Locator, reverse = false): Promise<void> {
  await expect(target).toBeVisible();
  const scope = await page.getByRole("dialog").count() ? page.getByRole("dialog") : page.locator("body");
  const limit = await scope.locator("a[href],button,input,select,textarea,summary,[tabindex]").count() + 2;
  for (let i = 0; i <= limit; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
  }
  await expect(target, "The control must be reachable in one keyboard cycle").toBeFocused();
}

export async function keyboardActivate(page: Page, target: Locator, key: "Enter" | "Space" = "Enter") {
  await tabTo(page, target);
  await page.keyboard.press(key);
}
