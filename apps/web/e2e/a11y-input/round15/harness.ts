import { expect, type Page } from "@playwright/test";

export interface FocusState {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly tabIndex: number;
  readonly selected: boolean | null;
  readonly expanded: boolean | null;
  readonly checked: boolean | null;
}
export interface Issue {
  readonly code: string;
  readonly id: string;
  readonly detail: string;
}
export interface WidgetAudit {
  readonly tablists: number;
  readonly menus: number;
  readonly listboxes: number;
  readonly trees: number;
  readonly grids: number;
  readonly issues: readonly Issue[];
}
export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export async function fixture(page: Page, content: string, extraStyle = ""): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
  <title>Keyboard pattern fixture</title><style>
  *{box-sizing:border-box}body{margin:0;padding:16px;font:16px/1.5 sans-serif}
  button,[role=tab],[role=menuitem],[role=option],[role=treeitem],[role=gridcell],input,select,textarea
  {min-width:44px;min-height:44px}
  :focus-visible{outline:3px solid #164d75;outline-offset:2px}
  [hidden]{display:none!important}${extraStyle}
  </style></head><body><main><h1>Keyboard pattern fixture</h1>${content}</main></body></html>`);
}
export async function focused(page: Page): Promise<FocusState | null> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) return null;
    const role = node.getAttribute("role") ??
      (node instanceof HTMLButtonElement ? "button" :
      node instanceof HTMLAnchorElement ? "link" :
      node instanceof HTMLInputElement ? node.type : node.localName);
    const label = node.getAttribute("aria-label") ??
      (node.getAttribute("aria-labelledby") ?? "").split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ") ??
      node.textContent?.trim() ?? "";
    const selected = node.getAttribute("aria-selected");
    const expanded = node.getAttribute("aria-expanded");
    const checked = node.getAttribute("aria-checked");
    return {
      id: node.id, role, name: label.trim(), tabIndex: node.tabIndex,
      selected: selected === null ? null : selected === "true",
      expanded: expanded === null ? null : expanded === "true",
      checked: checked === null ? null : checked === "true",
    };
  });
}
export async function expectFocus(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toBeFocused();
}
export async function expectOneTabStop(page: Page, selector: string): Promise<void> {
  const count = await page.locator(selector).evaluateAll(nodes =>
    nodes.filter(node => node instanceof HTMLElement && node.tabIndex === 0).length);
  expect(count).toBe(1);
}
export async function inspectWidgets(page: Page): Promise<WidgetAudit> {
  return page.evaluate(() => {
    const issues: Issue[] = [];
    const counts = { tablists: 0, menus: 0, listboxes: 0, trees: 0, grids: 0 };
    const nameOf = (node: HTMLElement) => node.getAttribute("aria-label")?.trim() ||
      (node.getAttribute("aria-labelledby") ?? "").split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ").trim() ||
      node.textContent?.trim() || "";
    const check = (role: string, childRole: string, countKey: keyof typeof counts) => {
      const containers = Array.from(document.querySelectorAll<HTMLElement>(`[role="${role}"]`));
      counts[countKey] = containers.length;
      containers.forEach((container, index) => {
        const id = container.id || `${role}-${index}`;
        if (!nameOf(container)) issues.push({code:`${role}-name`,id,detail:`${role} needs an accessible name`});
        const children = Array.from(container.querySelectorAll<HTMLElement>(`[role="${childRole}"]`))
          .filter(child => child.closest(`[role="${role}"]`) === container);
        if (!children.length) issues.push({code:`${role}-children`,id,detail:`${role} needs ${childRole} children`});
        if (role === "tablist") {
          const selected = children.filter(child => child.getAttribute("aria-selected") === "true");
          const stops = children.filter(child => child.tabIndex === 0);
          if (selected.length !== 1) issues.push({code:"tab-selection-count",id,detail:"Exactly one tab must be selected"});
          if (stops.length !== 1) issues.push({code:"tab-roving-focus",id,detail:"Exactly one tab is a tab stop"});
          children.forEach(child => {
            const panelId = child.getAttribute("aria-controls");
            const panel = panelId ? document.getElementById(panelId) : null;
            if (!(panel instanceof HTMLElement) || panel.getAttribute("role") !== "tabpanel")
              issues.push({code:"tab-panel-reference",id:child.id || id,detail:"Tab must reference a tabpanel"});
            if (child.getAttribute("aria-selected") !== "true" && child.tabIndex !== -1)
              issues.push({code:"tab-inactive-focus",id:child.id || id,detail:"Inactive tab must use tabindex -1"});
          });
        }
        if (role === "menu") {
          if (children.filter(child => child.tabIndex === 0).length !== 1)
            issues.push({code:"menu-roving-focus",id,detail:"Open menu needs one tab stop"});
          children.forEach(child => { if (!nameOf(child)) issues.push({code:"menuitem-name",id:child.id || id,detail:"Menu item needs a name"}); });
        }
        if (role === "listbox") {
          const selected = children.filter(child => child.getAttribute("aria-selected") === "true");
          if (container.getAttribute("aria-multiselectable") !== "true" && selected.length > 1)
            issues.push({code:"listbox-selection-count",id,detail:"Single-select listbox has multiple selections"});
          children.forEach(child => {
            if (!nameOf(child)) issues.push({code:"option-name",id:child.id || id,detail:"Option needs a name"});
            if (!["true","false"].includes(child.getAttribute("aria-selected") ?? ""))
              issues.push({code:"option-selected-state",id:child.id || id,detail:"Option needs Boolean aria-selected"});
          });
        }
        if (role === "tree") {
          if (children.filter(child => child.tabIndex === 0).length !== 1)
            issues.push({code:"tree-roving-focus",id,detail:"Tree needs one tab stop"});
          children.forEach(child => {
            if (!nameOf(child)) issues.push({code:"treeitem-name",id:child.id || id,detail:"Tree item needs a name"});
            const expanded = child.getAttribute("aria-expanded");
            if (expanded !== null && !["true","false"].includes(expanded))
              issues.push({code:"treeitem-expanded-state",id:child.id || id,detail:"Expansion state must be Boolean"});
          });
        }
        if (role === "grid") {
          const rows = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
            .filter(row => row.closest('[role="grid"]') === container);
          if (!rows.length) issues.push({code:"grid-rows",id,detail:"Grid needs rows"});
          rows.forEach((row,index) => {
            if (!row.querySelector('[role="gridcell"],[role="rowheader"],[role="columnheader"]'))
              issues.push({code:"grid-row-cells",id:`${id}-${index}`,detail:"Grid row needs cells"});
          });
        }
      });
    };
    check("tablist","tab","tablists");
    check("menu","menuitem","menus");
    check("listbox","option","listboxes");
    check("tree","treeitem","trees");
    check("grid","gridcell","grids");
    return {...counts,issues};
  });
}
export async function assertWidgetSemantics(page: Page): Promise<void> {
  const result = await inspectWidgets(page);
  expect(result.issues, "Composite widget semantics").toEqual([]);
}
export async function assertTarget(page: Page, selector: string): Promise<void> {
  const size = await page.locator(selector).evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {width:rect.width,height:rect.height};
  });
  expect(size.width, `${selector} width`).toBeGreaterThanOrEqual(44);
  expect(size.height, `${selector} height`).toBeGreaterThanOrEqual(44);
}
export async function assertFocusRing(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector);
  await locator.focus();
  const visible = await locator.evaluate(node => {
    if (!(node instanceof HTMLElement)) return false;
    const style = getComputedStyle(node);
    return node.matches(":focus-visible") &&
      ((style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none");
  });
  expect(visible, `${selector} has visible focus`).toBe(true);
}
export async function assertContainedFocus(page: Page, selector: string, key: string): Promise<void> {
  const container = page.locator(selector);
  await page.keyboard.press(key);
  expect(await container.evaluate(node => node.contains(document.activeElement))).toBe(true);
}
