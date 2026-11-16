import { expect, type Page } from "@playwright/test";
import type {
  ControlGeometry, DetailSnapshot, DialogSnapshot, FieldSnapshot, FocusSnapshot,
  LandmarkSnapshot, Language, LanguageTransition, LinkSnapshot, LiveRegionSnapshot,
  NavigationSnapshot, OfflineSnapshot, SearchSnapshot, MediaSnapshot, TableSnapshot,
} from "./p20g-contracts";

/** Measurements use CSS pixels and the hit region of the actual element. */
export async function inspectControls(page: Page): Promise<ControlGeometry[]> {
  return page.evaluate(() => {
    const selector = [
      "a[href]", "button", "input:not([type='hidden'])", "select", "textarea", "summary",
      "[role='button']", "[role='link']", "[role='switch']", "[role='radio']",
      "[role='checkbox']", "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const nodes = [...new Set(document.querySelectorAll<HTMLElement>(selector))];
    return nodes.map((node, index) => {
      const input = node instanceof HTMLInputElement ? node : null;
      const style = getComputedStyle(node);
      const hidden = node.closest("[hidden], [inert], [aria-hidden='true']") !== null ||
        style.visibility === "hidden" || style.display === "none";
      const isRadioOrCheckbox = node.matches("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']");
      // React Aria uses .radio-option; a nested native input can be small
      // while its wrapping interactive surface is 48px tall.
      const label = isRadioOrCheckbox
        ? node.closest<HTMLElement>("label, .radio-option, .check-option, [role='radio'], [role='checkbox']")
        : null;
      const source = label && (label === node || label.contains(node)) ? label : node;
      const boundingSource = source !== node ? "label" as const : "self" as const;
      const rect = source.getBoundingClientRect();
      const own = node.getAttribute("aria-label")?.trim() ?? "";
      const by = node.getAttribute("aria-labelledby")?.split(/\s+/).map((id) =>
        document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim() ?? "";
      // input, select and textarea are all labelable; a label names each of them.
      const labelable = node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
        node instanceof HTMLTextAreaElement ? node : null;
      const labelText = labelable?.labels?.[0]?.textContent?.trim() ?? "";
      const name = own || by || labelText || node.getAttribute("title") ||
        node.textContent?.trim() || (input?.value && input.type === "submit" ? input.value : "") || "";
      const disabled = node.matches(":disabled, [aria-disabled='true']") ||
        source.matches(":disabled, [aria-disabled='true']");
      const intersectsViewport = rect.right > 0 && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.top < window.innerHeight;
      const elementId = node.id || node.getAttribute("name") ||
        node.getAttribute("aria-label") || `${node.tagName.toLowerCase()}-${index}`;
      const interactiveLabel = source.matches("label, [role='radio'], [role='checkbox'], .radio-option, .check-option") &&
        (source === node || source.contains(node));
      return {
        id: `${index}:${elementId}`,
        tag: node.tagName.toLowerCase(),
        name,
        role: node.getAttribute("role") || "",
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        connected: node.isConnected,
        visible: !hidden && rect.width > 0 && rect.height > 0,
        disabled,
        inViewport: intersectsViewport,
        boundingSource,
        sourceIsInteractive: boundingSource === "self" || interactiveLabel,
      };
    });
  });
}

/** Document structure, including the destination of the first skip link. */
export async function inspectLandmarks(page: Page): Promise<LandmarkSnapshot> {
  return page.evaluate(() => {
    const isVisible = (element: Element): boolean => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 &&
        style.display !== "none" && style.visibility !== "hidden" &&
        !element.closest("[hidden], [aria-hidden='true'], [inert]");
    };
    const mains = [...document.querySelectorAll("main, [role='main']")].filter(isVisible);
    const root = document.documentElement;
    const skipLinks = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='#']")]
      .filter((item) => /skip|aller au contenu/i.test(item.className + " " + item.textContent))
      .map((item) => {
        const href = item.getAttribute("href") ?? "";
        const id = href.slice(1);
        return { href, text: item.textContent?.trim() ?? "", targetExists: Boolean(id && document.getElementById(id)) };
      });
    const mainText = mains.map((main) => (main as HTMLElement).innerText).join(" ").trim();
    const headingText = [...document.querySelectorAll("h1")].filter(isVisible)
      .map((heading) => heading.textContent?.trim() ?? "");
    const loading = [...document.querySelectorAll("main [role='status']")].some((element) =>
      /^(loading|chargement)/i.test(element.textContent?.trim() ?? ""));
    const fatalError = Boolean(document.querySelector("main [data-error-boundary='true']"));
    return {
      title: document.title,
      documentLanguage: root.lang,
      mainCount: mains.length,
      h1: headingText,
      skipLinks,
      pageText: mainText,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      loading,
      fatalError,
    };
  });
}

/** Capture visible text fields with their accessible description references. */
export async function inspectFields(page: Page): Promise<FieldSnapshot[]> {
  return page.evaluate(() => {
    return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    )].map((field, index) => {
      const style = getComputedStyle(field);
      const box = field.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" &&
        box.width > 0 && box.height > 0 && !field.closest("[hidden], [inert], [aria-hidden='true']");
      const labelledBy = field.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const associated = [...(field.labels ?? [])];
      const label = associated.map((entry) => entry.textContent?.replace(/\s+/g, " ").trim() ?? "").join(" ");
      const accessibleName = field.getAttribute("aria-label") ||
        labelledBy.map((id) => document.getElementById(id)?.textContent ?? "").join(" ") || label;
      const descriptionIds = field.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
      const errorIds = field.getAttribute("aria-errormessage")?.split(/\s+/).filter(Boolean) ?? [];
      return {
        id: field.id || `field-${index}`,
        tag: field.tagName.toLowerCase(),
        type: field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase(),
        label,
        accessibleName,
        placeholder: field.getAttribute("placeholder") || "",
        required: field.required || field.getAttribute("aria-required") === "true",
        disabled: field.disabled || field.getAttribute("aria-disabled") === "true",
        descriptionIds,
        brokenDescriptions: descriptionIds.filter((id) => !document.getElementById(id)),
        autocomplete: field.getAttribute("autocomplete") ?? "",
        invalid: field.getAttribute("aria-invalid") === "true",
        errorIds: [...errorIds, ...descriptionIds.filter((id) => /error/i.test(id))],
        visible,
      };
    });
  });
}

/** Live-region checks are read-only and never synthesize an announcement. */
export async function inspectLiveRegions(page: Page): Promise<LiveRegionSnapshot[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    "[aria-live], [role='alert'], [role='status'], [role='log']",
  )].map((element) => ({
    id: element.id,
    role: element.getAttribute("role") || "",
    live: element.getAttribute("aria-live") || "",
    atomic: element.getAttribute("aria-atomic") || "",
    text: element.textContent?.trim() || "",
    hidden: Boolean(element.closest("[hidden], [inert], [aria-hidden='true']")),
    busy: element.getAttribute("aria-busy") === "true",
  })));
}

/** Captures all anchors, including inline links; no WCAG exception is applied. */
export async function inspectLinks(page: Page): Promise<LinkSnapshot[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((anchor) => {
    const box = anchor.getBoundingClientRect();
    const style = getComputedStyle(anchor);
    return {
      href: anchor.getAttribute("href") || "",
      text: anchor.getAttribute("aria-label") || anchor.textContent?.trim() || "",
      target: anchor.target,
      rel: anchor.rel,
      download: anchor.hasAttribute("download"),
      visible: box.width > 0 && box.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && !anchor.closest("[hidden], [inert], [aria-hidden='true']"),
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    };
  }));
}

/** Keyboard probe records actual DOM targets, not a guessed CSS focus order. */
export async function probeFocus(page: Page, maxSteps = 48): Promise<FocusSnapshot> {
  // Lazy routes render disabled controls first and enable them once their data is ready.
  // Wait for a control in main that can take keyboard focus, so the walk measures the settled page.
  // A route can legitimately have nothing to focus in main, for example a form that stays
  // disabled while no records are loaded. Count what can take focus so the policy can tell
  // "nothing to reach" from "something that the keyboard cannot reach".
  const mainTargets = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    "main a[href], main button, main input:not([type='hidden']), main select, main textarea, main summary, main [tabindex]:not([tabindex='-1'])",
  )].filter((node) => {
    const box = node.getBoundingClientRect();
    return !node.matches(":disabled") && node.getAttribute("tabindex") !== "-1" && box.width > 0 && box.height > 0 &&
      getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden], [inert]");
  }).length);
  await page.locator("body").click({ position: { x: 1, y: 1 }, force: true });
  await page.keyboard.press("Tab");
  const identify = () => page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    // Two different controls can share a visible name (a header link and a card link).
    // Each focused element gets its own number, so only a real return to the same element repeats.
    const registry = window as unknown as { focusProbeIds?: WeakMap<Element, number>; focusProbeNext?: number };
    registry.focusProbeIds ??= new WeakMap();
    let serial = registry.focusProbeIds.get(node);
    if (serial === undefined) {
      serial = (registry.focusProbeNext ?? 0) + 1;
      registry.focusProbeNext = serial;
      registry.focusProbeIds.set(node, serial);
    }
    const label = node.id || node.getAttribute("aria-label") || node.getAttribute("name") ||
      node.textContent?.slice(0, 80).trim() || node.tagName;
    return {
      id: `${label} [${serial}]`,
      visible: box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none",
      inMain: Boolean(node.closest("main, [role='main']")),
    };
  });
  const first = await identify();
  await page.keyboard.press("Tab");
  const second = await identify();
  await page.keyboard.press("Shift+Tab");
  const returned = await identify();
  const traps: string[] = [];
  const seen = new Set<string>();
  let visitedMain = Boolean(first?.inMain || second?.inMain);
  let forwardCount = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press("Tab");
    const focus = await identify();
    if (!focus) break;
    forwardCount += 1;
    visitedMain ||= focus.inMain;
    // A repeated target is permitted if the focus walk returned to its
    // starting position; a consecutive repetition signals a stuck control.
    if (seen.has(focus.id) && i > 0 && focus.id !== first?.id) {
      traps.push(`Repeated focus stop: ${focus.id}`);
      break;
    }
    seen.add(focus.id);
    if (focus.id === first?.id) break;
  }
  return {
    firstTab: first?.id ?? null,
    secondTab: second?.id ?? null,
    returnedTab: returned?.id ?? null,
    firstVisible: first?.visible ?? false,
    secondVisible: second?.visible ?? false,
    forwardCount,
    visitedMain,
    mainTargets,
    endedOnBody: !first,
    traps,
  };
}

/** Selects a real article or place link; never fabricates a record ID. */
export async function discoverDetailLink(page: Page, kind: "places" | "help"): Promise<string | null> {
  const pathPattern = kind === "places" ? /^\/places\/[^/]+/ : /^\/help\/[^/]+/;
  const links: string[] = await page.locator("main a[href]").evaluateAll((nodes: Element[]) => nodes.map((node: Element) =>
    (node as HTMLAnchorElement).getAttribute("href") || ""));
  return links.find((href) => {
    try {
      const url = new URL(href, page.url());
      return url.origin === new URL(page.url()).origin && pathPattern.test(url.pathname);
    } catch {
      return false;
    }
  }) ?? null;
}

export async function inspectDetail(
  page: Page, kind: "places" | "help", linkedFromList: boolean,
): Promise<DetailSnapshot> {
  const url = new URL(page.url());
  const match = new RegExp(`^/${kind}/([^/]+)`).exec(url.pathname);
  const requestedId = match ? decodeURIComponent(match[1] ?? "") : "";
  return page.evaluate(({ id, pathname, linked, section }) => {
    const main = document.querySelector<HTMLElement>("main, [role='main']");
    const text = main?.innerText.trim() ?? "";
    const heading = main?.querySelector("h1")?.textContent?.trim() ?? "";
    const loading = /^(loading|chargement)/i.test(main?.querySelector("[role=status]")?.textContent?.trim() ?? "");
    const emptyState = /no (?:results?|items?|data|information)|aucun|aucune|indisponible|unavailable|unknown|inconnu/i.test(text);
    const errorState = Boolean(main?.querySelector("[role='alert']")) && !emptyState;
    const visibleRecord = section === "places"
      ? Boolean(main?.querySelector("dl, article, [data-place-id], [data-record-id]"))
      : Boolean(main?.querySelector("article, [data-article-id]"));
    return {
      requestedId: id,
      activePath: pathname,
      heading,
      mainText: text,
      visibleRecord,
      emptyState,
      errorState,
      loading,
      linkedFromList: linked,
    };
  }, { id: requestedId, pathname: url.pathname, linked: linkedFromList, section: kind });
}

/** Read a possible search without mutating its query or altering results. */
export async function inspectSearchState(page: Page): Promise<SearchSnapshot> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const form = main?.querySelector("form");
    const field = form?.querySelector<HTMLInputElement>("input[type=search], input[type=text], input:not([type])");
    const button = form?.querySelector<HTMLButtonElement>("button[type=submit], button:not([type])");
    const status = main?.querySelector("[role='status']")?.textContent?.trim() ?? "";
    const count = main?.querySelectorAll(".result-items > li, [data-result-id], [data-place-id]").length ?? 0;
    const enabled = Boolean(field && !field.disabled && button && !button.disabled);
    return {
      query: field?.value ?? "",
      enabled,
      entered: Boolean(field),
      submitted: false,
      statusBefore: status,
      statusAfter: status,
      resultsBefore: count,
      resultsAfter: count,
      busyAfter: main?.querySelector("[aria-busy=true]") !== null,
      errorVisible: main?.querySelector("[role=alert]") !== null,
    };
  });
}

/** A real search exercises the rendered form; no assumed fixture results. */
export async function exerciseSearch(page: Page, term = "access"): Promise<SearchSnapshot> {
  const before = await inspectSearchState(page);
  if (!before.enabled) return before;
  const form = page.locator("main form").filter({ has: page.locator("input[type=search], input[type=text], input:not([type])") }).first();
  const field = form.locator("input[type=search], input[type=text], input:not([type])").first();
  await field.fill(term);
  await field.press("Enter");
  await expect(page.locator("main [role='status']").first()).toBeVisible();
  const after = await inspectSearchState(page);
  return {
    ...after,
    query: term,
    entered: true,
    submitted: true,
    statusBefore: before.statusBefore,
    resultsBefore: before.resultsBefore,
  };
}

/** Captures a real in-app transition and browser-back return. */
export async function exerciseNavigation(page: Page, href: string): Promise<NavigationSnapshot> {
  const from = page.url();
  const titleBefore = await page.title();
  const languageBefore = await page.locator("html").getAttribute("lang") ?? "";
  await page.locator(`a[href="${href.replaceAll('"', '\\"')}"]`).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const to = page.url();
  const titleAfter = await page.title();
  const headingAfter = (await page.locator("main h1").first().textContent()) ?? "";
  const languageAfter = await page.locator("html").getAttribute("lang") ?? "";
  await page.goBack({ waitUntil: "domcontentloaded" });
  return {
    from,
    to,
    titleBefore,
    titleAfter,
    headingAfter,
    languageBefore,
    languageAfter,
    historyReturned: page.url() === from,
  };
}

/** The test selects French using the actual header button. */
export async function inspectLanguageTransition(page: Page): Promise<LanguageTransition> {
  const before = (await page.locator("html").getAttribute("lang"))?.split("-")[0] === "fr" ? "fr" : "en";
  const hrefBefore = page.url();
  const headingBefore = (await page.locator("main h1").first().textContent()) ?? "";
  const button = page.getByRole("button", { name: "Français", exact: true }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^fr(?:-|$)/);
  const nextButton = page.getByRole("button", { name: "English", exact: true }).first();
  return {
    before,
    after: await page.locator("html").getAttribute("lang") ?? "",
    buttonUsed: true,
    hrefBefore,
    hrefAfter: page.url(),
    headingBefore,
    headingAfter: await page.locator("main h1").first().textContent() ?? "",
    buttonLabelAfter: await nextButton.textContent() ?? "",
  };
}

/** Only operates on an already open dialog. Never opens unknown controls. */
export async function inspectDialog(page: Page): Promise<DialogSnapshot | null> {
  const modal = page.locator("[role='dialog'][aria-modal='true'], dialog[open]");
  const count = await modal.count();
  if (count === 0) return null;
  const active = modal.first();
  const accessibleName = await active.getAttribute("aria-label") ||
    await active.locator("h1, h2, [aria-labelledby]").first().textContent().catch(() => "") || "";
  const focusInside = await active.evaluate((node: Element) => Boolean(document.activeElement && node.contains(document.activeElement)));
  const backgroundInert = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog'][aria-modal='true'], dialog[open]");
    const main = document.querySelector("main");
    if (!dialog || !main || main.contains(dialog)) return true;
    return main.hasAttribute("inert") || main.getAttribute("aria-hidden") === "true";
  });
  return {
    count,
    accessibleName,
    focusInside,
    backgroundInert,
    dismissible: false,
    escapeClosed: false,
    focusRestored: false,
  };
}

/** Offline observations are made only after the browser actually goes offline. */
export async function inspectOffline(page: Page, documentLoaded: boolean, networkError: boolean): Promise<OfflineSnapshot> {
  if (!documentLoaded) return {
    documentLoaded: false, language: "", title: "", mainCount: 0,
    statusText: "", networkError, claimedFresh: false,
  };
  return page.evaluate(({ networkError: error }) => {
    const main = document.querySelector<HTMLElement>("main");
    const text = main?.innerText.trim() ?? "";
    return {
      documentLoaded: true,
      language: document.documentElement.lang,
      title: document.title,
      mainCount: document.querySelectorAll("main, [role='main']").length,
      statusText: text,
      networkError: error,
      claimedFresh: /(?:updated just now|live right now|mis à jour à l’instant)/i.test(text),
    };
  }, { networkError });
}

/** Wait for the app, not a fixed timeout and not an invented dataset. */
export async function settleRoute(page: Page, route: string, language: Language): Promise<void> {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `No response for ${route}`).not.toBeNull();
  expect(response?.ok(), `Failed response for ${route}`).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${language}(?:-|$)`, "i"));
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("main [role=status]").filter({ hasText: /^(Loading|Chargement)/ })).toHaveCount(0);
}

/** Inspect actual rendered media without reading remote URLs or decoding pixels. */
export async function inspectMedia(page: Page): Promise<MediaSnapshot[]> {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("img, svg, canvas, video, audio")];
    return nodes.map((element, index) => {
      const kind = element.tagName.toLowerCase() as "image" | "svg" | "canvas" | "video" | "audio" | "img";
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = box.width > 0 && box.height > 0 && style.visibility !== "hidden" &&
        style.display !== "none" && !element.closest("[hidden], [inert], [aria-hidden='true']");
      const decorative = element.getAttribute("role") === "presentation" ||
        element.getAttribute("role") === "none" || element.getAttribute("aria-hidden") === "true";
      const alternative = element.getAttribute("aria-label") ||
        (element instanceof HTMLImageElement ? element.getAttribute("alt") : null) ||
        (element.querySelector("title")?.textContent?.trim() ?? null);
      const captions = element instanceof HTMLVideoElement &&
        Boolean(element.querySelector("track[kind='captions'], track[kind='subtitles']"));
      return {
        kind: kind === "img" ? "image" as const : kind,
        id: element.id || `${kind}-${index}`,
        visible,
        decorative,
        alternative,
        captions,
        controls: element instanceof HTMLMediaElement && element.controls,
      };
    });
  });
}

/** Table header associations must be explicit or conveyed by TH scope. */
export async function inspectTables(page: Page): Promise<TableSnapshot[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLTableElement>("table")].map((table, index) => {
    const headers = [...table.querySelectorAll<HTMLTableCellElement>("th")];
    const rows = table.querySelectorAll("tr");
    const headersHaveScope = headers.every((cell) => cell.scope === "row" || cell.scope === "col" ||
      Boolean(cell.id));
    const cellsHaveHeaders = [...table.querySelectorAll<HTMLTableCellElement>("td")].every((cell) =>
      Boolean(cell.getAttribute("headers")) || headersHaveScope);
    return {
      id: table.id || `table-${index}`,
      rowCount: rows.length,
      headerCount: headers.length,
      caption: table.caption?.textContent?.trim() || table.getAttribute("aria-label") || "",
      isLayout: table.getAttribute("role") === "presentation" || table.getAttribute("role") === "none",
      hasHeaderAssociations: headers.length === 0 || cellsHaveHeaders,
    };
  }));
}
