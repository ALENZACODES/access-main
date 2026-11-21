import type { Page } from "@playwright/test";
import type { RouteSnapshot } from "./semantic-integrity";

const REF_ATTRIBUTES = [
  "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
  "aria-flowto", "aria-details", "aria-errormessage", "for", "list",
  "headers", "form",
] as const;

/** Snapshot uses the live DOM, including hidden markup that can cause duplicate IDs. */
export async function collectSemanticSnapshot(page: Page, route: string): Promise<RouteSnapshot> {
  const snapshot = await page.evaluate((refAttributes) => {
    const visible = (element: Element): boolean => {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => ({
      id: element.id,
      tag: element.tagName.toLowerCase(),
      visible: visible(element),
    }));
    const counts = new Map<string, number>();
    for (const element of ids) counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    const references: Array<{ owner: string; attribute: string; token: string; targetCount: number }> = [];
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      for (const attribute of refAttributes) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const tokens = value.trim().split(/\s+/);
        for (const token of tokens) {
          references.push({
            owner: element.id || element.tagName.toLowerCase(),
            attribute,
            token,
            targetCount: counts.get(token) ?? 0,
          });
        }
      }
    }
    const hashes = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='#']")]
      .filter((anchor) => anchor.getAttribute("href") !== "#")
      .map((anchor) => {
        const raw = anchor.getAttribute("href") ?? "";
        let id = "";
        try { id = decodeURIComponent(raw.slice(1)); } catch { id = raw.slice(1); }
        return { href: raw, visible: visible(anchor), targetCount: counts.get(id) ?? 0 };
      });
    const fragments = [...document.querySelectorAll<HTMLElement>("[lang]")]
      .filter((element) => element !== document.documentElement)
      .map((element) => ({
        language: element.lang,
        parentLanguage: element.parentElement?.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang,
        text: element.innerText ?? element.textContent ?? "",
        visible: visible(element),
      }));
    // The previous collector only saw explicit [lang] elements. A missing
    // marker is the very case WCAG 3.1.2 checks need to observe. Collect
    // each element's OWN text nodes, not its descendants' translated or
    // explicitly language-labelled text, to avoid duplicate false positives.
    const prose = document.querySelectorAll<HTMLElement>(
      "main h1, main h2, main h3, main p, main label, main button, main a, main li, main dt, main dd, main legend, main summary, main span, main strong, main em, main th, main td, main figcaption",
    );
    for (const element of prose) {
      if (!visible(element) || element.hasAttribute("lang")) continue;
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const nearest = element.closest<HTMLElement>("[lang]");
      const inherited = nearest?.getAttribute("lang") ?? document.documentElement.lang;
      fragments.push({
        language: inherited,
        parentLanguage: inherited,
        text,
        visible: true,
        explicit: false,
        tag: element.tagName.toLowerCase(),
      });
    }
    const focusables: Array<{ selector: string; name: string; visible: boolean; connected: boolean; disabled: boolean }> = [];
    // Unlike the complete control-size sweep, this checks only tabbable elements
    // with a stable semantic label. Programmatically focusable main is excluded.
    const candidates = document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]:not([tabindex='-1'])",
    );
    for (const [index, element] of [...candidates].entries()) {
      if (!visible(element) || element.closest("[aria-hidden='true']")) continue;
      if (element.tabIndex < 0 || element.matches(":disabled")) continue;
      const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) =>
        document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim() ?? "";
      const native = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? [...(element.labels ?? [])].map((label) => label.textContent ?? "").join(" ").trim()
        : "";
      const input = element instanceof HTMLInputElement ? element : null;
      const name = element.getAttribute("aria-label") || labelled || native ||
        element.getAttribute("title") || element.textContent ||
        (input?.type === "submit" ? input.value : "") || "";
      focusables.push({
        selector: element.id || `${element.tagName.toLowerCase()}-${index}`,
        name,
        visible: visible(element),
        connected: element.isConnected,
        disabled: element.matches(":disabled, [aria-disabled='true']"),
      });
    }
    const mains = [...document.querySelectorAll<HTMLElement>("main, [role='main']")].filter(visible);
    const headings = [...document.querySelectorAll<HTMLElement>("h1")].filter(visible).map((element) => element.textContent?.trim() ?? "");
    const root = document.documentElement;
    return {
      documentLanguage: root.lang,
      title: document.title,
      mainCount: mains.length,
      headings,
      ids,
      references,
      hashes,
      fragments,
      focusables,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
    };
  }, REF_ATTRIBUTES);
  return { route, ...snapshot };
}
