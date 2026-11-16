import { expect, type Page } from "@playwright/test";

export interface CompositeFinding {
  readonly code: string;
  readonly element: string;
  readonly detail: string;
}

/** Static structural audit of menus, tabsets, treeviews, listboxes and disclosures. */
export async function auditCompositeSemantics(page: Page): Promise<CompositeFinding[]> {
  return page.evaluate(() => {
    const findings: CompositeFinding[] = [];
    const label = (element: Element): string => element.id || element.getAttribute("role") || element.localName;
    const report = (code: string, element: Element, detail: string): void => {
      findings.push({ code, element: label(element), detail });
    };
    const shown = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const size = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && size.width > 0 && size.height > 0;
    };
    const named = (element: Element): boolean => {
      if (element.getAttribute("aria-label")?.trim()) return true;
      const ids = (element.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
      return ids.some((id) => document.getElementById(id)?.textContent?.trim());
    };
    const selected = (element: Element, name: string): boolean => element.getAttribute(name) === "true";
    const tablists = Array.from(document.querySelectorAll<HTMLElement>("[role='tablist']"));
    for (const list of tablists) {
      if (!shown(list)) continue;
      if (!named(list)) report("tablist-name", list, "Tablist requires a name");
      const tabs = Array.from(list.querySelectorAll<HTMLElement>("[role='tab']"));
      if (!tabs.length) report("tablist-empty", list, "Tablist contains no tabs");
      const active = tabs.filter((tab) => selected(tab, "aria-selected"));
      if (active.length !== 1) report("tab-selection-count", list, `Expected one active tab; found ${active.length}`);
      const tabbable = tabs.filter((tab) => tab.tabIndex >= 0 && shown(tab));
      if (tabbable.length !== 1) report("tab-roving-focus", list, `Expected one tabbable tab; found ${tabbable.length}`);
      for (const tab of tabs) {
        if (!shown(tab)) continue;
        if (!tab.getAttribute("aria-controls")) report("tab-controls", tab, "Tab has no panel association");
        else {
          const panel = document.getElementById(tab.getAttribute("aria-controls") || "");
          if (!panel || panel.getAttribute("role") !== "tabpanel") {
            report("tab-panel", tab, "Tab association does not reference a tabpanel");
          }
          if (selected(tab, "aria-selected") && panel && !shown(panel)) {
            report("selected-tab-hidden", tab, "Selected panel is not rendered");
          }
        }
        if (!["true", "false"].includes(tab.getAttribute("aria-selected") || "")) {
          report("tab-selected-state", tab, "Tab selection requires Boolean state");
        }
      }
    }
    const lists = document.querySelectorAll<HTMLElement>("[role='listbox']");
    for (const list of Array.from(lists)) {
      if (!shown(list)) continue;
      if (!named(list)) report("listbox-name", list, "Listbox requires a name");
      const options = Array.from(list.querySelectorAll<HTMLElement>("[role='option']"));
      if (!options.length) report("listbox-options", list, "Listbox has no options");
      const multiselect = list.getAttribute("aria-multiselectable") === "true";
      if (!multiselect && options.filter((item) => selected(item, "aria-selected")).length > 1) {
        report("listbox-multiple-selection", list, "Single-selection listbox contains multiple selections");
      }
      for (const option of options) {
        if (!shown(option)) continue;
        if (!option.textContent?.trim() && !named(option)) report("option-name", option, "Option has no name");
        if (option.getAttribute("aria-selected") &&
            !["true", "false"].includes(option.getAttribute("aria-selected") || "")) {
          report("option-selection-state", option, "Invalid option selection state");
        }
      }
    }
    for (const menu of Array.from(document.querySelectorAll<HTMLElement>("[role='menu'],[role='menubar']"))) {
      if (!shown(menu)) continue;
      if (!named(menu)) report("menu-name", menu, "Menu requires a name");
      const items = Array.from(menu.querySelectorAll<HTMLElement>(
        "[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio']"));
      if (!items.length) report("menu-items", menu, "Visible menu has no items");
      if (items.filter((item) => shown(item) && item.tabIndex >= 0).length > 1) {
        report("menu-focus-order", menu, "Menu should expose a single sequential entry");
      }
      for (const item of items) {
        if (!shown(item)) continue;
        if (!item.getAttribute("aria-label")?.trim() && !item.textContent?.trim()) {
          report("menu-item-name", item, "Menu item is unnamed");
        }
        if (item.getAttribute("role") !== "menuitem" &&
            !["true", "false"].includes(item.getAttribute("aria-checked") || "")) {
          report("menu-item-check-state", item, "Checkable menu item requires a Boolean state");
        }
      }
    }
    for (const tree of Array.from(document.querySelectorAll<HTMLElement>("[role='tree']"))) {
      if (!shown(tree)) continue;
      if (!named(tree)) report("tree-name", tree, "Tree requires a name");
      const items = Array.from(tree.querySelectorAll<HTMLElement>("[role='treeitem']"));
      if (!items.length) report("tree-empty", tree, "Tree contains no nodes");
      if (items.filter((item) => shown(item) && item.tabIndex >= 0).length > 1) {
        report("tree-roving-focus", tree, "Tree has multiple sequential entries");
      }
      for (const item of items) {
        if (!shown(item)) continue;
        if (!item.getAttribute("aria-label")?.trim() && !item.textContent?.trim()) {
          report("treeitem-name", item, "Tree node is unnamed");
        }
        if (item.getAttribute("aria-expanded") &&
            !["true", "false"].includes(item.getAttribute("aria-expanded") || "")) {
          report("treeitem-state", item, "Tree expansion state is invalid");
        }
      }
    }
    for (const disclosure of Array.from(document.querySelectorAll<HTMLElement>("[aria-expanded][aria-controls]"))) {
      if (!shown(disclosure)) continue;
      const expanded = disclosure.getAttribute("aria-expanded");
      const panel = document.getElementById(disclosure.getAttribute("aria-controls") || "");
      if (!panel) {
        report("disclosure-panel", disclosure, "Expansion target does not exist");
        continue;
      }
      if (!["true", "false"].includes(expanded || "")) {
        report("disclosure-state", disclosure, "Expansion state is not Boolean");
      }
      if (expanded === "true" && !shown(panel)) {
        report("disclosure-expanded-hidden", disclosure, "Expanded panel is hidden");
      }
      if (expanded === "false" && shown(panel) && disclosure.getAttribute("data-a11y-hide-when-collapsed") === "true") {
        report("disclosure-collapsed-visible", disclosure, "Collapsed panel remains visible");
      }
    }
    return findings;
  });
}

/** Exercise only opted-in, reversible disclosures to avoid unexpected side effects. */
export async function auditSafeDisclosures(page: Page): Promise<CompositeFinding[]> {
  const issues: CompositeFinding[] = [];
  const buttons = page.locator("button[aria-expanded][aria-controls][data-a11y-reversible='true']");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    const id = (await button.getAttribute("id")) || `control-${index}`;
    const initial = await button.getAttribute("aria-expanded");
    if (initial !== "true" && initial !== "false") {
      issues.push({ code: "invalid-initial-expanded", element: id, detail: String(initial) });
      continue;
    }
    await button.focus();
    await page.keyboard.press("Enter");
    const updated = await button.getAttribute("aria-expanded");
    if (updated === initial) {
      issues.push({ code: "disclosure-enter-no-change", element: id, detail: initial });
    }
    await button.focus();
    await page.keyboard.press("Enter");
    const restored = await button.getAttribute("aria-expanded");
    if (restored !== initial) {
      issues.push({ code: "disclosure-no-restore", element: id, detail: String(restored) });
    }
  }
  return issues;
}

export async function assertCompositeSemantics(page: Page): Promise<void> {
  expect(await auditCompositeSemantics(page), "Composite ARIA patterns").toEqual([]);
  expect(await auditSafeDisclosures(page), "Opted-in reversible disclosures").toEqual([]);
}
