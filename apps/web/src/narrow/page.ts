import { auditBoxes, REFLOW_WIDTH_PX, type Box, type NarrowReport } from './audit.ts';

export const INTERACTIVE_SELECTOR =
  'a[href],button,input:not([type="hidden"]),select,textarea,summary,' +
  '[role="button"],[role="link"],[role="checkbox"],[role="tab"],[role="menuitem"],' +
  '[tabindex]:not([tabindex="-1"])';

export interface Measured {
  readonly boxes: Box[];
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

/** Minimal slice of a Playwright Page, so this module needs no browser dependency. */
export interface PageLike {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}

/**
 * Runs inside the page (serialised by evaluate), so it must not use anything
 * from the enclosing module. Reads layout only; it never changes the page.
 */
export function measureInPage(selector: string): Measured {
  interface El {
    id: string;
    tagName: string;
    textContent: string | null;
    getAttribute(name: string): string | null;
    closest(selector: string): El | null;
    parentElement: El | null;
    getBoundingClientRect(): { left: number; right: number; width: number; height: number };
  }
  const doc = (
    globalThis as unknown as {
      document: {
        querySelectorAll(s: string): ArrayLike<El>;
        documentElement: { scrollWidth: number; clientWidth: number };
      };
      getComputedStyle(el: El): { display: string; visibility: string };
    }
  );
  const els = doc.document.querySelectorAll(selector);
  const boxes: Box[] = [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el) continue;
    let hidden = false;
    let node: El | null = el;
    while (node) {
      const style = doc.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") hidden = true;
      if (node.getAttribute("aria-hidden") === "true") hidden = true;
      node = node.parentElement;
    }
    if (hidden) continue;
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const tag = el.tagName.toLowerCase();
    const hit: El =
      (tag === "input" && (type === "checkbox" || type === "radio") && el.closest("label")) || el;
    const r = hit.getBoundingClientRect();
    const href = el.getAttribute("href") ?? "";
    const name = (el.getAttribute("aria-label") ?? el.getAttribute("name") ?? "").trim();
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48);
    const label = href || name || text || String(i);
    boxes.push({
      id: `${tag}${el.id ? "#" + el.id : ""}[${label}]`,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    });
  }
  return {
    boxes,
    scrollWidth: doc.document.documentElement.scrollWidth,
    clientWidth: doc.document.documentElement.clientWidth,
  };
}

/** Visits each route at 320px wide and reports reflow and target-size findings. */
export async function auditRoutes(
  page: PageLike,
  baseUrl: string,
  routes: readonly string[],
): Promise<NarrowReport[]> {
  await page.setViewportSize({ width: REFLOW_WIDTH_PX, height: 800 });
  const reports: NarrowReport[] = [];
  for (const route of routes) {
    await page.goto(baseUrl.replace(/\/+$/, "") + (route.startsWith("/") ? route : "/" + route));
    const m = await page.evaluate(measureInPage, INTERACTIVE_SELECTOR);
    reports.push(auditBoxes(route, m.boxes, m.scrollWidth, m.clientWidth));
  }
  return reports;
}
