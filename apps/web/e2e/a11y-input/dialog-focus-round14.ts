import { expect, type Locator, type Page } from "@playwright/test";

export interface DialogIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface DialogRecord {
  readonly selector: string;
  readonly role: string;
  readonly name: string;
  readonly open: boolean;
  readonly modal: boolean;
  readonly focusInside: boolean;
}
export async function inspectDialogFocus(page: Page): Promise<{ dialogs: DialogRecord[]; issues: DialogIssue[] }> {
  return page.evaluate(() => {
    const issues: DialogIssue[] = [];
    const elements = Array.from(document.querySelectorAll<HTMLElement>("dialog,[role='dialog'],[role='alertdialog']"));
    const dialogs = elements.map((node, index): DialogRecord => {
      const selector = node.id ? `#${CSS.escape(node.id)}` : `dialog[${index}]`;
      const role = node.getAttribute("role") ?? "dialog";
      const refs = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const refName = refs.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
      const name = node.getAttribute("aria-label")?.trim() || refName || node.querySelector("h1,h2,h3,h4")?.textContent?.trim() || "";
      const open = node instanceof HTMLDialogElement ? node.open :
        !node.hidden && getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden";
      const modal = node instanceof HTMLDialogElement ? node.matches(":modal") : node.getAttribute("aria-modal") === "true";
      const focusInside = node.contains(document.activeElement);
      if (open && !name) issues.push({ code: "dialog-name-empty", selector, detail: "Open dialog has no accessible name" });
      if (open && role === "dialog" && !modal) issues.push({ code: "dialog-not-modal", selector, detail: "Open dialog does not expose modal state" });
      if (open && !focusInside) issues.push({ code: "dialog-focus-outside", selector, detail: "Focus is outside the open dialog" });
      return { selector, role, name, open, modal, focusInside };
    });
    const openDialogs = dialogs.filter((dialog) => dialog.open);
    if (openDialogs.length > 1) issues.push({ code: "dialog-multiple-open", selector: "document", detail: "More than one modal surface is open" });
    const triggers = Array.from(document.querySelectorAll<HTMLElement>("[aria-haspopup='dialog']"));
    triggers.forEach((trigger, index) => {
      const selector = trigger.id ? `#${CSS.escape(trigger.id)}` : `trigger[${index}]`;
      const name = trigger.getAttribute("aria-label")?.trim() || trigger.textContent?.trim() || "";
      const target = trigger.getAttribute("aria-controls");
      if (!name) issues.push({ code: "dialog-trigger-name", selector, detail: "Dialog trigger has no accessible name" });
      if (!target || !document.getElementById(target)) issues.push({ code: "dialog-trigger-target", selector, detail: "Dialog trigger has no existing aria-controls target" });
    });
    return { dialogs, issues };
  });
}
export async function assertDialogFocus(page: Page): Promise<void> {
  const result = await inspectDialogFocus(page);
  expect(result.issues, "Dialog focus contract").toEqual([]);
}
export async function exerciseEscapeAndRestore(page: Page, trigger: Locator): Promise<void> {
  await expect(trigger).toBeVisible();
  const id = await trigger.getAttribute("aria-controls");
  if (!id) throw new Error("Dialog trigger must provide aria-controls");
  const dialog = page.locator(await page.evaluate((target) => `#${CSS.escape(target)}`, id));
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

/** Browser chrome may receive one Tab stop at the boundary of a native modal. */
export async function tabAroundModal(page: Page, key: "Tab" | "Shift+Tab", target: Locator): Promise<void> {
  await page.keyboard.press(key);
  if (await page.evaluate(() => document.activeElement === document.body)) {
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}
