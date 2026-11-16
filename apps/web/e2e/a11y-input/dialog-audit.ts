import { expect, type Locator, type Page } from "@playwright/test";

export interface DialogContract {
  readonly opener: string;
  readonly dialogName: string;
  readonly closedOnEscape: boolean;
  readonly focusRestored: boolean;
  readonly outsideFocusBlocked: boolean;
  readonly initialFocusInside: boolean;
}

export interface DialogProblem {
  readonly opener: string;
  readonly reason: string;
}

/**
 * Only explicitly declared dialog triggers are exercised. Unmarked actions
 * may save data, navigate, or share information and must not be probed.
 */
export function declaredDialogOpeners(page: Page): Locator {
  return page.locator(
    '[aria-haspopup="dialog"]:visible:not([disabled]):not([aria-disabled="true"])',
  );
}

export function activeDialog(page: Page): Locator {
  return page.locator(
    'dialog[open]:visible, [role="dialog"]:visible, [role="alertdialog"]:visible',
  );
}

/**
 * Read-only structural checks run on any currently open dialog. Native
 * <dialog> receives implicit dialog role; custom implementations need a role.
 */
export async function inspectOpenDialogs(page: Page): Promise<DialogProblem[]> {
  return page.evaluate(() => {
    const problems: { opener: string; reason: string }[] = [];
    const dialogs = document.querySelectorAll<HTMLElement>(
      "dialog[open], [role='dialog'], [role='alertdialog']",
    );
    for (const [index, dialog] of Array.from(dialogs).entries()) {
      const style = getComputedStyle(dialog);
      const rect = dialog.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" ||
          rect.height === 0 || rect.width === 0) continue;
      const id = dialog.id || `dialog at index ${index}`;
      const labelledBy = (dialog.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((key) => document.getElementById(key)?.textContent?.trim() ?? "")
        .join(" ").trim();
      const name = dialog.getAttribute("aria-label")?.trim() || labelledBy;
      if (!name) {
        problems.push({ opener: id, reason: "Dialog has no accessible name" });
      }
      const describedBy = dialog.getAttribute("aria-describedby");
      if (describedBy) {
        for (const key of describedBy.split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(key)) {
            problems.push({ opener: id, reason: `Missing description reference ${key}` });
          }
        }
      }
      if (dialog.getAttribute("aria-modal") === "true" &&
          !dialog.contains(document.activeElement)) {
        problems.push({ opener: id, reason: "Modal focus is outside the dialog" });
      }
      if (dialog.matches("[aria-hidden='true'],[inert]")) {
        problems.push({ opener: id, reason: "Open dialog is hidden from assistive technology" });
      }
    }
    return problems;
  });
}

/**
 * Observe only: keyboard focus never clicks a destructive action. The opener
 * itself is allowed because it advertises aria-haspopup=dialog.
 */
export async function exerciseDialogEscape(
  page: Page,
  opener: Locator,
): Promise<DialogContract> {
  await expect(opener).toBeVisible();
  await expect(opener).toBeEnabled();
  const openerId = await opener.getAttribute("id") ??
    await opener.getAttribute("aria-label") ?? "declared dialog opener";
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = activeDialog(page).first();
  await expect(dialog, `Opener ${openerId} must open a dialog`).toBeVisible();
  const dialogName = await dialog.getAttribute("aria-label") ??
    await dialog.getAttribute("aria-labelledby") ?? "";
  await expect.poll(
    async () => dialog.evaluate((element) => element.contains(document.activeElement)),
    { message: `${openerId}: initial focus must enter dialog` },
  ).toBe(true);
  const initialFocusInside = true;

  // A modal must contain sequential focus; avoid invoking controls within it.
  const modal = await dialog.evaluate((element) =>
    element.matches("dialog:modal") || element.getAttribute("aria-modal") === "true",
  );
  let outsideFocusBlocked = true;
  if (modal) {
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("Tab");
      const leaked = await dialog.evaluate((element) => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return false;
        if (element.contains(active) || active === element) return false;
        // Playwright/Chromium can park focus on body between cycles of a
        // native modal; that is not a leak onto a page control.
        if (active === document.body || active === document.documentElement) return false;
        return true;
      });
      if (leaked) {
        outsideFocusBlocked = false;
        break;
      }
    }
  }
  await page.keyboard.press("Escape");
  const closedOnEscape = await dialog.isHidden();
  const focusRestored = await opener.evaluate((element) =>
    element === document.activeElement,
  );
  return {
    opener: openerId,
    dialogName,
    closedOnEscape,
    focusRestored,
    outsideFocusBlocked,
    initialFocusInside,
  };
}

export function assertDialogContract(contract: DialogContract): void {
  expect(contract.initialFocusInside,
    `${contract.opener}: initial focus must enter dialog`).toBe(true);
  expect(contract.outsideFocusBlocked,
    `${contract.opener}: Tab must remain in modal`).toBe(true);
  expect(contract.closedOnEscape,
    `${contract.opener}: Escape must close dialog`).toBe(true);
  expect(contract.focusRestored,
    `${contract.opener}: focus must return to opener`).toBe(true);
}

/**
 * Covers a second escape path: a nested dialog should close only the topmost
 * layer. This helper is used by deterministic fixtures and can also be used
 * with a live app route that explicitly declares nested dialogs.
 */
export async function escapeTopmostDialog(page: Page): Promise<void> {
  const all = activeDialog(page);
  const before = await all.count();
  expect(before, "An open dialog is required").toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect.poll(async () => activeDialog(page).count()).toBe(before - 1);
}

/**
 * An Escape handler that closes a nonmodal dialog is app-dependent. The
 * helper requires the caller to identify the dialog and activation action;
 * it does not silently claim that an arbitrary overlay is dismissible.
 */
export async function exerciseExplicitCloseButton(
  page: Page,
  openButton: Locator,
  closeButton: (dialog: Locator) => Locator,
): Promise<void> {
  await openButton.focus();
  await page.keyboard.press("Enter");
  const dialog = activeDialog(page).first();
  await expect(dialog).toBeVisible();
  const close = closeButton(dialog);
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Space");
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();
}

/**
 * A utility for non-destructive dialog census across configured routes.
 * The caller must visit the route first. This never opens dialogs itself.
 */
export async function declaredDialogIssues(page: Page): Promise<DialogProblem[]> {
  return page.evaluate(() => {
    const issues: { opener: string; reason: string }[] = [];
    for (const [index, button] of Array.from(document.querySelectorAll<HTMLElement>(
      '[aria-haspopup="dialog"]',
    )).entries()) {
      const style = getComputedStyle(button);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const name = button.getAttribute("aria-label") ||
        button.getAttribute("title") || button.textContent?.trim() || "";
      const id = button.id || `opener at index ${index}`;
      if (!name) issues.push({ opener: id, reason: "Dialog opener has no name" });
      if (!button.matches("button,a[href],input,[tabindex]")) {
        issues.push({ opener: id, reason: "Dialog opener cannot receive keyboard focus" });
      }
      const expanded = button.getAttribute("aria-expanded");
      if (expanded !== null && !["true", "false"].includes(expanded)) {
        issues.push({ opener: id, reason: "Invalid aria-expanded state" });
      }
      const controls = button.getAttribute("aria-controls");
      if (controls && !document.getElementById(controls)) {
        issues.push({ opener: id, reason: "Dialog opener references missing aria-controls" });
      }
    }
    return issues;
  });
}
