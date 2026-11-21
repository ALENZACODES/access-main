import type { Page } from "@playwright/test";

export type RouteContinuityCode =
  | "unnamed-link"
  | "empty-href"
  | "placeholder-link"
  | "missing-fragment"
  | "duplicate-fragment"
  | "hidden-fragment"
  | "download-without-name"
  | "download-empty-filename"
  | "invalid-current"
  | "multiple-current-pages"
  | "current-outside-navigation"
  | "unnamed-multiple-navigation"
  | "duplicate-navigation-name"
  | "skip-without-fragment"
  | "skip-missing-target"
  | "skip-hidden-target"
  | "skip-target-not-focusable"
  | "skip-not-first"
  | "unexpected-nested-link"
  | "external-target-without-rel"
  | "invalid-hreflang"
  | "conflicting-link-disabled"
  | "invalid-accesskey"
  | "link-in-inert"
  | "anchor-role-conflict";

export interface RouteContinuityFinding {
  readonly code: RouteContinuityCode;
  readonly path: string;
  readonly detail: string;
}
export interface RouteContinuityReport {
  readonly inspectedLinks: number;
  readonly navigationRegions: number;
  readonly inspectedSkipLinks: number;
  readonly findings: readonly RouteContinuityFinding[];
}

/** DOM-only audit; does not activate links or navigate. */
export async function auditRouteContinuityRound11(page: Page): Promise<RouteContinuityReport> {
  return page.evaluate(() => {
    type Code = RouteContinuityCode;
    const findings: RouteContinuityFinding[] = [];
    const report = (code: Code, element: Element, detail: string): void => {
      const path = element.id ? `#${CSS.escape(element.id)}` : (() => {
        const parts: string[] = [];
        let cursor: Element | null = element;
        while (cursor && parts.length < 5) {
          const parent: Element | null = cursor.parentElement;
          const siblings = parent ? Array.from(parent.children).filter((child) => child.localName === cursor!.localName) : [cursor];
          parts.unshift(`${cursor.localName}:nth-of-type(${siblings.indexOf(cursor) + 1})`);
          cursor = parent;
        }
        return parts.join(" > ");
      })();
      findings.push({ code, path, detail });
    };
    const isRendered = (node: Element): boolean => {
      if (node.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
    };
    const visibleText = (node: Element): string => {
      const label = node.getAttribute("aria-label")?.trim();
      if (label) return label;
      const labelledBy = node.getAttribute("aria-labelledby")?.trim();
      if (labelledBy) {
        const joined = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
        if (joined) return joined;
      }
      const title = node.getAttribute("title")?.trim();
      if (title) return title;
      const contents = Array.from(node.querySelectorAll("img[alt],svg[aria-label]"))
        .map((item) => item.getAttribute("alt") ?? item.getAttribute("aria-label") ?? "").join(" ").trim();
      return `${node.textContent?.trim() ?? ""} ${contents}`.trim();
    };
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href],area[href]"));
    const navigations = Array.from(document.querySelectorAll<HTMLElement>("nav,[role='navigation']")).filter(isRendered);
    const navigationsByName = new Map<string, HTMLElement[]>();
    for (const nav of navigations) {
      const name = visibleText(nav) || nav.getAttribute("aria-labelledby") || "";
      const explicit = nav.getAttribute("aria-label")?.trim() || nav.getAttribute("aria-labelledby")?.trim() || "";
      if (navigations.length > 1 && !explicit) report("unnamed-multiple-navigation", nav, "Multiple navigation landmarks require distinct names");
      if (name && explicit) {
        const matches = navigationsByName.get(name) ?? [];
        matches.push(nav);
        navigationsByName.set(name, matches);
      }
      const currentPages = Array.from(nav.querySelectorAll("[aria-current='page']")).filter(isRendered);
      if (currentPages.length > 1) report("multiple-current-pages", nav, `${currentPages.length} current pages`);
    }
    for (const [name, matches] of navigationsByName) {
      if (matches.length > 1) for (const nav of matches.slice(1)) report("duplicate-navigation-name", nav, name);
    }
    let skipCount = 0;
    for (const link of links) {
      if (link.closest("[inert]")) report("link-in-inert", link, "Interactive link inside inert subtree");
      if (!isRendered(link)) continue;
      const href = link.getAttribute("href") ?? "";
      const name = visibleText(link);
      if (!name) report("unnamed-link", link, "Link has no accessible name");
      if (!href.trim()) report("empty-href", link, "Link has empty destination");
      if (href === "#") report("placeholder-link", link, "Placeholder fragment does not identify content");
      if (link.closest("a[href] a[href],a[href] area[href]")) report("unexpected-nested-link", link, "Nested links cannot be operated separately");
      if (link.getAttribute("aria-disabled") === "true" && link.tabIndex >= 0) report("conflicting-link-disabled", link, "Disabled link remains in sequential focus");
      const role = link.getAttribute("role")?.trim();
      if (role && !["link", "button", "menuitem", "tab", "treeitem", "none", "presentation"].includes(role)) {
        report("anchor-role-conflict", link, role);
      }
      const current = link.getAttribute("aria-current");
      if (current !== null && !["page", "step", "location", "date", "time", "true", "false"].includes(current)) report("invalid-current", link, current);
      if (current === "page" && !link.closest("nav,[role='navigation']") && !link.hasAttribute("data-a11y-allow-current-outside-nav")) {
        report("current-outside-navigation", link, "Current page should be in a named navigation context");
      }
      const accessKey = link.getAttribute("accesskey");
      if (accessKey !== null && accessKey.trim().length !== 1) report("invalid-accesskey", link, accessKey);
      const hrefLang = link.getAttribute("hreflang");
      if (hrefLang !== null && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(hrefLang)) report("invalid-hreflang", link, hrefLang);
      if (link.getAttribute("target") === "_blank") {
        const url = (() => { try { return new URL(href, location.href); } catch { return null; } })();
        const external = url && url.origin !== location.origin;
        const rel = new Set((link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/));
        if (external && !(rel.has("noopener") || rel.has("noreferrer"))) report("external-target-without-rel", link, href);
      }
      const download = link.hasAttribute("download");
      if (download && !name) report("download-without-name", link, "Download must identify its content");
      if (download && !href.trim()) report("download-empty-filename", link, "Download has no resource");
      const isSkip = link.matches("[data-a11y-skip-link],.a11y-skip-link");
      if (isSkip) skipCount += 1;
      if (href.startsWith("#") && href.length > 1) {
        let fragment = "";
        try { fragment = decodeURIComponent(href.slice(1)); } catch { fragment = href.slice(1); }
        const targets = Array.from(document.querySelectorAll<HTMLElement>("[id]")).filter((item) => item.id === fragment);
        if (!targets.length) report(isSkip ? "skip-missing-target" : "missing-fragment", link, fragment);
        if (targets.length > 1) report("duplicate-fragment", link, fragment);
        if (targets.length === 1 && !isRendered(targets[0]!)) report(isSkip ? "skip-hidden-target" : "hidden-fragment", link, fragment);
        if (isSkip && targets.length === 1) {
          const target = targets[0]!;
          const focusable = target.tabIndex >= 0 || target.hasAttribute("tabindex") || target.matches("main,h1,h2,h3,a,button,input,select,textarea");
          if (!focusable) report("skip-target-not-focusable", link, fragment);
        }
      }
      if (isSkip) {
        if (!href.startsWith("#") || href.length < 2) report("skip-without-fragment", link, href);
        const first = document.querySelector("a[href],button,input:not([type='hidden']),select,textarea,[tabindex]:not([tabindex='-1'])");
        if (first !== link) report("skip-not-first", link, "Skip control should precede application controls");
      }
    }
    return { inspectedLinks: links.length, navigationRegions: navigations.length, inspectedSkipLinks: skipCount, findings };
  });
}
