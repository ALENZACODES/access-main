import type { Page } from "@playwright/test";

/**
 * Browser-facing, read-only accessibility probes for explicit fixtures.
 * These observations cannot establish the speech produced by a screen reader
 * or timings of a physical scanning switch. No network or storage is touched.
 */
export interface BrowserNode {
  id: string | null;
  root: string;
  tag: string;
  role: string;
  name: string;
  hidden: boolean;
  inert: boolean;
  disabled: boolean;
  ariaHidden: boolean;
  interactive: boolean;
  focusable: boolean;
  tabindex: number;
  live: string;
  expanded: string | null;
  checked: string | null;
  selected: string | null;
  references: Record<string, string[]>;
}

export interface BrowserSnapshot {
  language: string;
  nodes: BrowserNode[];
  url: string;
  title: string;
}

export interface FocusObservation {
  id: string;
  step: number;
  key: "Tab" | "Shift+Tab";
  visible: boolean;
  inside: boolean;
}

export interface BrowserRegion {
  id: string;
  role: string;
  live: string;
  atomic: string;
  relevant: string;
  hidden: boolean;
  busy: boolean;
  text: string;
  lang: string | null;
}

export interface GeometryObservation {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  viewportWidth: number;
  occluded: boolean;
  clipped: boolean;
  focusIndicator: boolean;
  inlineException: boolean;
}

const REFS = [
  "aria-labelledby", "aria-describedby", "aria-controls",
  "aria-owns", "aria-activedescendant",
];

/** Only user-authored fixtures: DOM inspection never activates app controls. */
export async function inspectBrowserSemantics(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate((references) => {
    const nodes: BrowserNode[] = [];
    const interactiveSelector = [
      "button", "input:not([type='hidden'])", "select", "textarea", "a[href]",
      "summary", "[role='button']", "[role='switch']", "[role='checkbox']",
      "[role='tab']", "[role='option']", "[role='radio']", "[role='menuitem']",
      "[role='treeitem']",
    ].join(",");
    const nameFor = (node: HTMLElement, root: Document | ShadowRoot): string => {
      const explicit = node.getAttribute("aria-label")?.trim();
      if (explicit) return explicit;
      const labelled = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      if (labelled.length) {
        const text = labelled.map((id) => root.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean).join(" ");
        if (text) return text;
      }
      if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) && node.labels?.length) {
        const text = Array.from(node.labels).map((label) => label.textContent?.trim() ?? "")
          .filter(Boolean).join(" ");
        if (text) return text;
      }
      return node.getAttribute("alt") ?? node.getAttribute("title") ?? node.textContent?.trim().slice(0, 400) ?? "";
    };
    const roleFor = (node: HTMLElement): string => {
      const role = node.getAttribute("role");
      if (role) return role.toLowerCase();
      const tag = node.tagName.toLowerCase();
      if (tag === "main") return "main";
      if (tag === "nav") return "navigation";
      if (tag === "header") return "banner";
      if (tag === "footer") return "contentinfo";
      if (/^h[1-6]$/.test(tag)) return "heading";
      if (tag === "button") return "button";
      if (tag === "img") return "img";
      if (tag === "a" && node.hasAttribute("href")) return "link";
      if (tag === "input") return node.getAttribute("type") === "checkbox" ? "checkbox" : "textbox";
      if (tag === "dialog") return "dialog";
      return tag;
    };
    const collect = (root: Document | ShadowRoot, rootName: string): void => {
      const all = root.querySelectorAll<HTMLElement>("*");
      for (const element of all) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const hidden = style.display === "none" || style.visibility === "hidden" ||
          element.closest("[hidden]") !== null || box.width === 0 && box.height === 0;
        const inert = element.closest("[inert]") !== null;
        const ariaHidden = element.closest("[aria-hidden='true']") !== null;
        const disabled = element.matches(":disabled,[aria-disabled='true']");
        const interactive = element.matches(interactiveSelector);
        const tabindex = element.tabIndex;
        const focusable = tabindex >= 0 && !disabled;
        const referencesByName: Record<string, string[]> = {};
        for (const attribute of references) {
          if (element.hasAttribute(attribute)) {
            referencesByName[attribute] = element.getAttribute(attribute)?.trim().split(/\s+/).filter(Boolean) ?? [];
          }
        }
        nodes.push({
          id: element.id || null,
          root: rootName,
          tag: element.tagName.toLowerCase(),
          role: roleFor(element),
          name: nameFor(element, root),
          hidden, inert, disabled, ariaHidden, interactive, focusable, tabindex,
          live: element.getAttribute("aria-live") ?? (element.getAttribute("role") === "status" ? "polite" : "off"),
          expanded: element.getAttribute("aria-expanded"),
          checked: element.getAttribute("aria-checked"),
          selected: element.getAttribute("aria-selected"),
          references: referencesByName,
        });
        if (element.shadowRoot) collect(element.shadowRoot, `${rootName}/shadow:${element.id || nodes.length}`);
      }
    };
    collect(document, "document");
    return {
      language: document.documentElement.lang.split("-")[0] || "",
      nodes,
      url: location.href,
      title: document.title,
    };
  }, REFS);
}

/** Capture state of live regions without claiming that speech occurred. */
export async function inspectLiveRegions(page: Page): Promise<BrowserRegion[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(
    "[aria-live],[role='status'],[role='alert'],[role='log'],[role='timer'],[role='progressbar']",
  )).map((element, index) => {
    const style = getComputedStyle(element);
    const hidden = style.display === "none" || style.visibility === "hidden" ||
      element.closest("[hidden],[inert],[aria-hidden='true']") !== null;
    const role = element.getAttribute("role") || "generic";
    return {
      id: element.id || `anonymous-${index}`,
      role,
      live: element.getAttribute("aria-live") ?? (role === "alert" ? "assertive" : role === "status" ? "polite" : "off"),
      atomic: element.getAttribute("aria-atomic") ?? "false",
      relevant: element.getAttribute("aria-relevant") ?? "additions text",
      hidden,
      busy: element.getAttribute("aria-busy") === "true",
      text: element.textContent?.trim() ?? "",
      lang: element.getAttribute("lang")?.split("-")[0] ?? null,
    };
  }));
}

/** Reset only fixture focus, without clicking a control or issuing navigation. */
export async function resetFixtureFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.body;
    const previous = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    if (previous === null) body.removeAttribute("tabindex");
    else body.setAttribute("tabindex", previous);
  });
}

export async function observeActiveFocus(page: Page, step: number, key: "Tab" | "Shift+Tab", scope = "main"): Promise<FocusObservation | null> {
  return page.evaluate(({ step, key, scope }) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body || active === document.documentElement) return null;
    const box = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    const elements = Array.from(document.querySelectorAll("*"));
    const index = elements.indexOf(active);
    const container = document.querySelector(scope);
    return {
      id: active.id || `${active.localName}-${index}`,
      step, key,
      visible: box.width > 0 && box.height > 0 && style.visibility !== "hidden" &&
        box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth,
      inside: container?.contains(active) ?? false,
    };
  }, { step, key, scope });
}

/** Count bounded focus steps, stopping before browser-chrome traversal. */
export async function walkFixtureTabOrder(page: Page, maximum = 50, scope = "main"): Promise<FocusObservation[]> {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 200) throw new TypeError("Invalid maximum");
  await resetFixtureFocus(page);
  const seen = new Set<string>();
  const observations: FocusObservation[] = [];
  for (let index = 0; index < maximum; index += 1) {
    await page.keyboard.press("Tab");
    const current = await observeActiveFocus(page, index, "Tab", scope);
    if (!current || seen.has(current.id)) break;
    observations.push(current);
    seen.add(current.id);
  }
  return observations;
}

export async function reverseFixtureTabOrder(page: Page, forward: readonly FocusObservation[], scope = "main"): Promise<FocusObservation[]> {
  const observations: FocusObservation[] = [];
  const last = forward[forward.length - 1];
  if (last) {
    await page.evaluate((id) => document.getElementById(id)?.focus({ preventScroll: true }), last.id);
  }
  for (let index = 1; index < forward.length; index += 1) {
    await page.keyboard.press("Shift+Tab");
    const current = await observeActiveFocus(page, index, "Shift+Tab", scope);
    if (!current) break;
    observations.push(current);
  }
  return observations;
}

export async function inspectActiveGeometry(page: Page): Promise<GeometryObservation | null> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body) return null;
    const rect = focused.getBoundingClientRect();
    const style = getComputedStyle(focused);
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const cover = document.elementFromPoint(x, y);
    const occluded = cover !== null && !focused.contains(cover) && !cover.contains(focused);
    const outline = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    const shadow = style.boxShadow !== "none";
    const focusIndicator = outline || shadow || style.textDecorationLine.includes("underline");
    const parent = focused.parentElement;
    const inlineException = focused.localName === "a" && style.display === "inline" &&
      Boolean(parent && parent.textContent && parent.textContent.trim().length > (focused.textContent?.trim().length ?? 0) + 10);
    return {
      width: rect.width, height: rect.height, left: rect.left, top: rect.top, right: rect.right,
      viewportWidth: innerWidth, occluded,
      clipped: rect.bottom > innerHeight || rect.right > innerWidth,
      focusIndicator, inlineException,
    };
  });
}

export async function inspectComposite(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const element = root as HTMLElement;
    const role = element.getAttribute("role") ?? "";
    const items = Array.from(element.querySelectorAll<HTMLElement>(
      "[role='tab'],[role='option'],[role='treeitem'],[role='menuitem'],[role='radio']",
    ));
    return {
      role, model: element.hasAttribute("aria-activedescendant") ? "active-descendant" : "roving",
      ownerFocusable: element.tabIndex >= 0,
      activeId: element.getAttribute("aria-activedescendant"),
      orientation: element.getAttribute("aria-orientation") ?? undefined,
      items: items.map((item) => ({
        id: item.id, label: item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "",
        tabindex: item.tabIndex, disabled: item.getAttribute("aria-disabled") === "true",
        hidden: item.hasAttribute("hidden"), selected: item.getAttribute("aria-selected") === "true" || item.getAttribute("aria-checked") === "true",
        level: item.hasAttribute("aria-level") ? Number(item.getAttribute("aria-level")) : undefined,
        posinset: item.hasAttribute("aria-posinset") ? Number(item.getAttribute("aria-posinset")) : undefined,
      })),
    };
  });
}

export async function inspectSwitchAlternatives(page: Page, selector = "main") {
  return page.locator(selector).evaluate((main) => {
    const controls = Array.from(main.querySelectorAll<HTMLElement>(
      "button,a[href],input:not([type='hidden']),select,textarea,[role='button'],[role='switch']",
    ));
    return {
      stops: controls.map((element, index) => ({
        id: element.id || `control-${index}`,
        label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
        disabled: element.matches(":disabled,[aria-disabled='true']"),
        hidden: element.hasAttribute("hidden") || element.closest("[inert]") !== null,
        requiresDrag: element.hasAttribute("data-a11y-drag-required"),
        requiresMotion: element.hasAttribute("data-a11y-motion-required"),
        requiresMultiPointer: element.hasAttribute("data-a11y-multipointer-required"),
        alternative: element.hasAttribute("data-a11y-alternative"),
        action: element.tagName.toLowerCase() === "a" || element.tagName.toLowerCase() === "button" ? "activate" : "none",
        interactive: true, timeoutOnly: element.hasAttribute("data-a11y-timeout-only"),
      })),
    };
  });
}
