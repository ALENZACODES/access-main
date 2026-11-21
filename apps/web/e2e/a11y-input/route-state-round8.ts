import { expect, type Page } from "@playwright/test";

export interface RouteFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface RouteIdentity {
  readonly path: string;
  readonly title: string;
  readonly language: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly navNames: readonly string[];
}

export interface RouteActivation {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly focusTag: string;
  readonly focusInMain: boolean;
  readonly headingVisible: boolean;
  readonly skipTargetPresent: boolean;
}

/** Preserve the current page's provenance and language without modifying it. */
export async function captureRouteIdentity(page: Page): Promise<RouteIdentity> {
  return page.evaluate(() => {
    const heading = document.querySelector("main h1");
    const navigations = Array.from(document.querySelectorAll("nav"));
    return {
      path: location.pathname,
      title: document.title.trim(),
      language: document.documentElement.lang,
      heading: heading?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      navNames: navigations.map((nav) => {
        const label = nav.getAttribute("aria-label")?.trim();
        const idrefs = (nav.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
        return label || idrefs.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" ").trim() || "";
      }),
    };
  });
}

export async function inspectRouteIdentity(page: Page): Promise<RouteFinding[]> {
  const identity = await captureRouteIdentity(page);
  const findings: RouteFinding[] = [];
  if (!identity.title) findings.push({ code: "route-title", target: identity.path,
    detail: "Document title is missing" });
  if (!/^en(?:-|$)|^fr(?:-|$)/i.test(identity.language)) {
    findings.push({ code: "route-document-language", target: identity.path,
      detail: `Unexpected document language ${identity.language}` });
  }
  if (identity.mainCount !== 1) findings.push({ code: "route-main-count", target: identity.path,
    detail: `Expected one main landmark, found ${identity.mainCount}` });
  if (!identity.heading) findings.push({ code: "route-primary-heading", target: identity.path,
    detail: "Main heading is missing or empty" });
  if (identity.navNames.length > 1 && identity.navNames.some((name) => !name)) {
    findings.push({ code: "route-navigation-label", target: identity.path,
      detail: "Multiple navigation landmarks must have distinguishing names" });
  }
  const content = await page.evaluate(() => {
    const findings: RouteFinding[] = [];
    const ids = new Set<string>();
    for (const node of document.querySelectorAll<HTMLElement>("[id]")) {
      if (ids.has(node.id)) findings.push({ code: "duplicate-document-id", target: `#${node.id}`,
        detail: "HTML IDs must be unique" });
      ids.add(node.id);
    }
    for (const [index, image] of Array.from(document.querySelectorAll<HTMLImageElement>("img")).entries()) {
      if (image.closest("[aria-hidden='true']")) continue;
      if (image.getAttribute("role") === "presentation" || image.getAttribute("role") === "none") continue;
      if (!image.hasAttribute("alt")) findings.push({ code: "route-image-alternative",
        target: image.id || `img[${index}]`, detail: "Missing alt attribute" });
    }
    for (const [index, link] of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).entries()) {
      const href = link.getAttribute("href");
      if (href === "#") findings.push({ code: "route-placeholder-anchor", target: link.id || `a[${index}]`,
        detail: "Link points only to the current document" });
      if (href?.startsWith("#") && href.length > 1 && !document.getElementById(href.slice(1))) {
        findings.push({ code: "route-missing-fragment", target: link.id || `a[${index}]`,
          detail: `Fragment ${href} has no target` });
      }
    }
    return findings;
  });
  return [...findings, ...content];
}

/**
 * Inspect explicit route and skip-link relationships. An opt-in marker avoids
 * treating unrelated fragment anchors as navigation controls.
 */
export async function inspectSkipNavigation(page: Page): Promise<RouteFinding[]> {
  return page.evaluate(() => {
    const findings: RouteFinding[] = [];
    const candidates = Array.from(document.querySelectorAll<HTMLAnchorElement>(
      "a.a11y-skip-link,a[data-a11y-skip-link]",
    ));
    for (const [index, link] of candidates.entries()) {
      const target = link.id ? `#${link.id}` : `skip[${index}]`;
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("#") || href.length < 2) {
        findings.push({ code: "skip-destination", target,
          detail: "Skip link must point to a document fragment" });
        continue;
      }
      const fragment = document.getElementById(href.slice(1));
      if (!fragment) {
        findings.push({ code: "skip-target-missing", target,
          detail: `Missing ${href}` });
        continue;
      }
      if (fragment.closest("[hidden],[inert],[aria-hidden='true']")) {
        findings.push({ code: "skip-target-hidden", target,
          detail: `${href} is hidden or inert` });
      }
      const name = link.getAttribute("aria-label")?.trim() || link.textContent?.trim() || "";
      if (!name) findings.push({ code: "skip-name", target,
        detail: "Skip navigation lacks a name" });
      if (link.getAttribute("tabindex") === "-1") {
        findings.push({ code: "skip-not-sequential", target,
          detail: "Skip navigation cannot be used by Tab" });
      }
    }
    return findings;
  });
}

/** Test the actual skip-link action, restoring the page only when asked. */
export async function activateSkipLink(page: Page): Promise<RouteActivation> {
  const skip = page.locator("a.a11y-skip-link,a[data-a11y-skip-link]").first();
  await expect(skip).toHaveCount(1);
  await skip.focus();
  await expect(skip).toBeFocused();
  const startedAt = page.url();
  await page.keyboard.press("Enter");
  const observation = await page.evaluate(() => {
    const focused = document.activeElement;
    const main = document.querySelector("main");
    const heading = main?.querySelector("h1");
    const rect = heading?.getBoundingClientRect();
    return {
      focusTag: focused?.nodeName?.toLowerCase() || "",
      focusInMain: Boolean(main && focused && (main.contains(focused) || main === focused)),
      headingVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
      skipTargetPresent: Boolean(document.getElementById("main")),
    };
  });
  return { startedAt, endedAt: page.url(), ...observation };
}

/** Validate that language switches preserve page structure and focus safety. */
export async function inspectLanguageButtons(page: Page): Promise<RouteFinding[]> {
  return page.evaluate(() => {
    const findings: RouteFinding[] = [];
    const switches = Array.from(document.querySelectorAll<HTMLButtonElement>(
      "button.lang-button,button[lang][aria-pressed]",
    ));
    for (const [index, button] of switches.entries()) {
      const target = button.id ? `#${button.id}` : `language[${index}]`;
      const lang = button.getAttribute("lang");
      if (lang !== "en" && lang !== "fr") findings.push({ code: "language-choice-code", target,
        detail: `Unexpected language option ${lang}` });
      const pressed = button.getAttribute("aria-pressed");
      if (pressed !== "true" && pressed !== "false") {
        findings.push({ code: "language-pressed-value", target,
          detail: `Invalid aria-pressed ${pressed}` });
      }
      if (!button.textContent?.trim() && !button.getAttribute("aria-label")?.trim()) {
        findings.push({ code: "language-button-name", target,
          detail: "Language selection button has no name" });
      }
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        findings.push({ code: "language-button-target", target,
          detail: `${Math.round(rect.width)} x ${Math.round(rect.height)} CSS px` });
      }
    }
    // Embedded tools can host their own language switch. Count selected
    // options per group, not across unrelated shell and embedded controls.
    const groups = new Map<Element, HTMLButtonElement[]>();
    for (const button of switches) {
      const group = button.closest("[role='group'],.language-switch") ??
        button.parentElement ?? button;
      groups.set(group, [...(groups.get(group) ?? []), button]);
    }
    for (const [group, choices] of groups) {
      const selected = choices.filter((button) => button.getAttribute("aria-pressed") === "true");
      const target = group.id ? `#${group.id}` :
        group.closest(".site-header") ? "language-switch" : "embedded-language-switch";
      if (choices.length >= 2 && selected.length !== 1) {
        findings.push({ code: "language-selection-count", target,
          detail: `Exactly one language choice must be pressed; found ${selected.length}` });
      }
      // The shell controls the document language. A standalone switch on a
      // fixture or minimal page also controls it when no shell switch exists.
      // Embedded controls must not be compared with html[lang] when the shell
      // has its own language group (they can select a local content language).
      const ownsDocumentLanguage = Boolean(group.closest(".site-header")) ||
        (groups.size === 1 && choices.length >= 2);
      if (ownsDocumentLanguage && selected.length === 1) {
        const current = document.documentElement.lang.toLowerCase().slice(0, 2);
        if (selected[0]?.lang !== current) {
          findings.push({ code: "language-selection-mismatch", target,
            detail: "Selected language does not match document language" });
        }
      }
    }
    return findings;
  });
}

/** Confirm both language buttons work through the keyboard, not pointer only. */
export async function exerciseLanguageRoundTrip(page: Page): Promise<void> {
  const original = await page.locator("html").getAttribute("lang");
  for (const language of ["fr", "en"] as const) {
    const button = page.locator(`button.lang-button[lang='${language}']`);
    await expect(button).toHaveCount(1);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    expect(await inspectLanguageButtons(page)).toEqual([]);
  }
  if (original === "fr") {
    const button = page.locator("button.lang-button[lang='fr']");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  }
}

export async function auditRouteContext(page: Page): Promise<RouteFinding[]> {
  return [
    ...await inspectRouteIdentity(page),
    ...await inspectSkipNavigation(page),
    ...await inspectLanguageButtons(page),
  ];
}
