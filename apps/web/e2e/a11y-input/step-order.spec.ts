import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { LANGUAGES } from "./helpers.ts";
import {
  finish, keyboardActivate, pause, rehearsal, review, secondReview, tabTo,
} from "./step-order-driver.ts";

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();
  const findings = violations.map(rule => ({
    rule: rule.id,
    impact: rule.impact,
    targets: rule.nodes.map(node => ({ target: node.target, reason: node.failureSummary })),
  }));
  expect(findings).toEqual([]);
}

async function targetGeometry(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  return control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      width: box.width,
      height: box.height,
      left: box.left,
      right: box.right,
      viewport: document.documentElement.clientWidth,
      receivesPointer: Boolean(center && element.contains(center)),
    };
  });
}

for (const language of LANGUAGES) {
  test.describe(`Rehearsal step order in ${language}`, () => {
    test.use({ locale: `${language}-CA` });

    test("a keyboard user can create steps, change the first step, then rehearse that sequence", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels, copy } = ui;
      await ui.visit();
      await ui.addWithKeyboard(review);
      await ui.addWithKeyboard(pause);
      await ui.expectPublished(review, pause);

      await keyboardActivate(page, ui.opener);
      const moving = ui.modal.getByRole("combobox", { name: labels.moving, exact: true });
      await expect(moving).toBeFocused();
      await page.keyboard.press("End");
      await expect(moving.locator("option:checked")).toHaveText(pause.name[language]);

      await keyboardActivate(page, ui.action(labels.start), "Space");
      await ui.expectDraft(pause.name[language], review.name[language]);
      await expect(ui.action(labels.start)).toBeDisabled();
      await expect(ui.action(labels.earlier)).toBeDisabled();
      await keyboardActivate(page, ui.action(labels.apply));
      await ui.expectClosed();
      await ui.expectPublished(pause, review);

      const next = ui.scanner.getByRole("button", { name: copy.next, exact: true });
      await keyboardActivate(page, next);
      const current = ui.scanner.getByRole("status");
      await expect(current).toContainText(pause.name[language]);
      await page.keyboard.press("Space");
      await expect(current).toContainText(review.name[language]);
      await page.keyboard.press("Enter");
      await expect(current).toContainText(pause.name[language]);
    });

    test("button-only input disambiguates matching names through moves relative to another step", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      for (const step of [review, pause, secondReview, finish]) await ui.add(step);
      await ui.open();

      const firstReview = labels.duplicate(review.name[language], 1);
      const lastReview = labels.duplicate(secondReview.name[language], 3);
      const breakName = pause.name[language];
      const last = finish.name[language];
      const moving = ui.modal.getByRole("combobox", { name: labels.moving });
      for (const name of [firstReview, lastReview]) {
        await expect(moving.getByRole("option", { name, exact: true })).toHaveCount(1);
      }
      const status = ui.modal.getByRole("status");
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toHaveAttribute("aria-atomic", "true");
      await ui.action(labels.pick(lastReview)).click();
      await expect(ui.action(labels.pick(lastReview))).toHaveAttribute("aria-pressed", "true");
      const reference = ui.modal.getByRole("combobox", { name: labels.reference, exact: true });
      await expect(reference.getByRole("option", { name: lastReview, exact: true })).toHaveCount(0);
      await ui.action(labels.anchor(firstReview)).click();
      await expect(reference.locator("option:checked")).toHaveText(firstReview);
      await ui.action(labels.before).click();
      await ui.expectDraft(lastReview, firstReview, breakName, last);
      await expect(status).toContainText(lastReview);
      await expect(status).toContainText(language === "en" ? "position 1 of 4" : "position 1 sur 4");

      await ui.action(labels.anchor(breakName)).click();
      await ui.action(labels.after).click();
      await ui.expectDraft(firstReview, breakName, lastReview, last);
      await ui.action(labels.anchor(last)).click();
      await ui.action(labels.after).click();
      await ui.expectDraft(firstReview, breakName, last, lastReview);

      await ui.action(labels.undo).click();
      await ui.expectDraft(firstReview, breakName, lastReview, last);
      await ui.action(labels.undo).click();
      await ui.expectDraft(lastReview, firstReview, breakName, last);
      await ui.action(labels.redo).click();
      await ui.action(labels.redo).click();
      await ui.expectDraft(firstReview, breakName, last, lastReview);
      await expect(ui.action(labels.redo)).toBeDisabled();
      await ui.action(labels.apply).click();
      await ui.expectClosed();
      await ui.expectPublished(review, pause, finish, secondReview);
    });

    test("cancel and Escape discard pending order and return keyboard focus to the launcher", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      for (const step of [review, pause, finish]) await ui.add(step);

      for (const dismissal of ["cancel", "escape"] as const) {
        await ui.open();
        await expect(ui.action(labels.undo)).toBeDisabled();
        await expect(ui.action(labels.redo)).toBeDisabled();
        await ui.action(labels.pick(review.name[language])).click();
        await ui.action(labels.end).click();
        await ui.expectDraft(pause.name[language], finish.name[language], review.name[language]);
        await expect(ui.action(labels.end)).toBeDisabled();
        await expect(ui.action(labels.later)).toBeDisabled();
        if (dismissal === "cancel") {
          await keyboardActivate(page, ui.action(labels.cancel));
        } else {
          await page.keyboard.press("Escape");
        }
        await ui.expectClosed();
        await ui.expectPublished(review, pause, finish);
      }

      await page.keyboard.press("Enter");
      await ui.expectDraft(review.name[language], pause.name[language], finish.name[language]);
      await expect(ui.action(labels.undo)).toBeDisabled();
      await page.keyboard.press("Escape");
      await ui.expectClosed();
    });

    test("a new move after Undo replaces the abandoned redo branch", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      for (const step of [review, pause, finish]) await ui.add(step);
      await ui.open();
      const [a, b, c] = [review.name[language], pause.name[language], finish.name[language]] as const;
      await ui.action(labels.pick(b)).click();
      await ui.action(labels.earlier).click();
      await ui.expectDraft(b, a, c);
      await ui.action(labels.undo).click();
      await ui.expectDraft(a, b, c);
      await expect(ui.action(labels.redo)).toBeEnabled();

      await ui.action(labels.pick(b)).click();
      await ui.action(labels.later).click();
      await ui.expectDraft(a, c, b);
      await expect(ui.action(labels.redo)).toBeDisabled();

      await ui.action(labels.apply).click();
      await ui.expectClosed();
      await ui.expectPublished(review, finish, pause);
      await ui.open();
      await ui.expectDraft(a, c, b);
      await expect(ui.action(labels.undo)).toBeDisabled();
    });

    test("committing order preserves journey notes, unsaved edits, and the identity of the edited row", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels, copy } = ui;
      await ui.visit();
      await ui.add(review);
      await ui.add(pause);
      const notes = page.getByLabel(copy.plainText, { exact: true });
      const journal = language === "en" ? "Compare the two drafts tomorrow." : "Comparer les deux versions demain.";
      await notes.fill(journal);
      const editedRow = ui.journey.getByRole("listitem").filter({ hasText: review.detail[language] });
      await editedRow.getByRole("button", { name: language === "en" ? /^Edit step / : /^Modifier l’étape / }).click();
      const detail = ui.journey.getByLabel(copy.detailEn, { exact: true });
      await expect(detail).toHaveValue(review.detail.en);
      const changed = "Read the introduction again.";
      await detail.fill(changed);

      await ui.open();
      await ui.action(labels.pick(review.name[language])).click();
      await ui.action(labels.end).click();
      await ui.action(labels.apply).click();

      await ui.expectClosed();
      await expect(detail).toHaveValue(changed);
      await expect(notes).toHaveValue(journal);
      const draftSource = ui.journey.getByLabel(copy.tier, { exact: true });
      await expect(draftSource).toHaveValue("UNKNOWN");
      await ui.journey.getByRole("button", { name: copy.update, exact: true }).click();
      const revised = { ...review, detail: { ...review.detail, en: changed } };
      await ui.expectPublished(pause, revised);
      const editAtNewPosition = ui.journey.getByRole("listitem").nth(1).getByRole("button", {
        name: language === "en" ? /^Edit step 2 / : /^Modifier l’étape 2 /,
      });
      await expect(editAtNewPosition).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(ui.journey.getByLabel(copy.stepEn, { exact: true })).toBeFocused();
      await expect(detail).toHaveValue(changed);
      await expect(ui.journey.getByLabel(copy.detailFr, { exact: true })).toHaveValue(review.detail.fr);
      await expect(ui.journey.getByLabel(copy.access, { exact: true })).toHaveValue("unknown");
      await detail.fill("Discard this unsaved replacement.");
      await ui.journey.getByRole("button", { name: copy.cancel, exact: true }).click();
      await expect(editAtNewPosition).toBeFocused();
      await ui.expectPublished(pause, revised);
      await page.keyboard.press("Enter");
      await expect(detail).toHaveValue(changed);
      await expect(notes).toHaveValue(journal);
    });

    test("the modal is operable at 320 CSS pixels with enlarged text, including the lowest controls", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await page.setViewportSize({ width: 320, height: 560 });
      await ui.visit();
      await ui.add(review);
      await ui.add(pause);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await ui.open();
      const overflow = await ui.modal.evaluate(node => node.scrollWidth - node.clientWidth);
      expect(overflow, "Dialog content must reflow within the available width").toBeLessThanOrEqual(1);

      const controls = ui.modal.getByRole("combobox").or(ui.modal.getByRole("button"));
      for (const control of await controls.all()) {
        const name = await control.getAttribute("aria-label") ?? await control.innerText();
        const box = await targetGeometry(control);
        expect(box.width, name).toBeGreaterThanOrEqual(44);
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.left, name).toBeGreaterThanOrEqual(0);
        expect(box.right, name).toBeLessThanOrEqual(box.viewport + 1);
        if (await control.isEnabled()) expect(box.receivesPointer, name).toBe(true);
      }
      await ui.action(labels.pick(review.name[language])).click();
      await ui.action(labels.end).click();
      await ui.action(labels.apply).click();
      await ui.expectClosed();
      await ui.expectPublished(pause, review);
    });

    test("an empty or one-step rehearsal opens safely and never offers a committable order", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      await ui.opener.click();
      const close = ui.action(labels.cancel);
      await expect(close).toBeFocused();
      await expect(ui.modal.getByRole("combobox")).toHaveCount(0);
      await expect(ui.action(labels.apply)).toBeDisabled();
      await expect(ui.modal.getByRole("status")).toHaveText(language === "en"
        ? "Add two steps to change their order." : "Ajoutez deux étapes pour changer leur ordre.");
      await page.keyboard.press("Escape");
      await ui.expectClosed();

      await ui.add(review);
      await ui.open();
      await ui.expectDraft(review.name[language]);
      await expect(ui.modal.getByRole("combobox", { name: labels.reference })).toHaveCount(0);
      for (const name of [labels.start, labels.end, labels.earlier, labels.later, labels.apply]) {
        await expect(ui.action(name)).toBeDisabled();
      }
      await expect(ui.modal.getByRole("status")).toHaveText(language === "en"
        ? "Add another step to change the order." : "Ajoutez une autre étape pour changer l’ordre.");
      await keyboardActivate(page, close);
      await ui.expectClosed();
      await ui.expectPublished(review);
    });

    test("visual viewport magnification preserves the focused step and the draft", async ({ page, context }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      await ui.add(review);
      await ui.add(finish);
      await ui.open();
      const moving = ui.modal.getByRole("combobox", { name: labels.moving });
      const cdp = await context.newCDPSession(page);
      try {
        const width = await page.evaluate(() => window.visualViewport!.width);
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
        await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeCloseTo(2);
        expect(await page.evaluate(() => window.visualViewport!.width)).toBeCloseTo(width / 2, 0);
        await expect(moving).toBeFocused();
        await keyboardActivate(page, ui.action(labels.end));
        await ui.expectDraft(finish.name[language], review.name[language]);

        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
        await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(1);
        await expect(moving.locator("option:checked")).toHaveText(review.name[language]);
        await keyboardActivate(page, ui.action(labels.apply));
        await ui.expectClosed();
        await ui.expectPublished(finish, review);
      } finally {
        await cdp.detach();
      }
    });

    test("forced colours retain keyboard focus and both modal states expose accessible semantics", async ({ page }) => {
      const ui = rehearsal(page, language);
      const { labels } = ui;
      await ui.visit();
      await ui.add(review);
      await ui.add(finish);
      await ui.open();
      await expectAxeClean(page);
      await page.emulateMedia({ forcedColors: "active" });
      await tabTo(page, ui.action(labels.end));
      const indicator = await ui.action(labels.end).evaluate(button => {
        const style = getComputedStyle(button);
        return {
          keyboard: button.matches(":focus-visible"),
          system: matchMedia("(forced-colors: active)").matches,
          outline: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      expect(indicator.system).toBe(true);
      expect(indicator.keyboard).toBe(true);
      expect(indicator.outline).not.toBe("none");
      expect(indicator.width).toBeGreaterThan(0);
      await page.keyboard.press("Space");
      await ui.expectDraft(finish.name[language], review.name[language]);
      await expectAxeClean(page);
      await page.keyboard.press("Escape");
      await ui.expectClosed();
      await ui.expectPublished(review, finish);
    });
  });
}

test("a user-entered name that resembles a position suffix still identifies a separate step", async ({ page }) => {
  const ui = rehearsal(page, "en");
  const literal = {
    name: { en: "Review (step 1)", fr: "Relire (étape 1)" },
    detail: { en: "Read the literal title.", fr: "Lire le titre tel quel." },
  };
  await ui.visit();
  for (const step of [review, literal, secondReview]) await ui.add(step);
  await ui.open();
  const moving = ui.modal.getByRole("combobox", { name: ui.labels.moving });
  const optionNames = await moving.getByRole("option").allTextContents();
  expect(new Set(optionNames).size).toBe(3);
  const [first, middle, last] = optionNames;
  if (!first || !middle || !last) throw new Error("All three steps need a non-empty name");
  await ui.expectDraft(first, middle, last);

  await moving.selectOption({ label: last });
  const reference = ui.modal.getByRole("combobox", { name: ui.labels.reference });
  await reference.selectOption({ label: first });
  await ui.action(ui.labels.before).click();
  await ui.expectDraft(last, first, middle);
  await ui.action(ui.labels.apply).click();
  await ui.expectClosed();
  await ui.expectPublished(secondReview, review, literal);
});
