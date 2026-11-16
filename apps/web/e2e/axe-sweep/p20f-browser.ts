import type { Page, Request } from "@playwright/test";
import type {
  ActionEvidence, FieldEvidence, FilterEvidence, LanguageEvidence,
  LiveRegionEvidence, Locale, MapEvidence, RouteEvidence, SearchEvidence,
  TransitionEvidence,
} from "./p20f-contracts";

/** Browser-only collectors; do not synthesize accessibility status from DOM hints. */
export interface BrowserConfig {
  readonly baseURL: string;
  readonly entryEN: string;
  readonly entryFR: string;
  readonly maxPages: number;
  readonly maxActions: number;
}

export interface PageCapture {
  readonly route: RouteEvidence;
  readonly language: LanguageEvidence;
  readonly actions: readonly ActionEvidence[];
  readonly fields: readonly FieldEvidence[];
  readonly regions: readonly LiveRegionEvidence[];
  readonly maps: readonly MapEvidence[];
  readonly visibleText: string;
}

export function browserConfig(baseURL: string): BrowserConfig {
  const root = new URL(baseURL);
  const en = process.env.AXE_SWEEP_EN_URL ?? "/en";
  const fr = process.env.AXE_SWEEP_FR_URL ?? "/fr";
  const max = Number(process.env.P20F_MAX_ROUTES ?? "48");
  return {
    baseURL: root.href,
    entryEN: new URL(en, root).href,
    entryFR: new URL(fr, root).href,
    maxPages: Number.isInteger(max) && max >= 2 && max <= 200 ? max : 48,
    maxActions: 12,
  };
}

export function sameOriginDocument(href: string, baseURL: string): string | null {
  try {
    const candidate = new URL(href, baseURL);
    if (candidate.origin !== new URL(baseURL).origin) return null;
    if (!/^https?:$/.test(candidate.protocol)) return null;
    if (/\.(?:png|jpe?g|gif|webp|svg|ico|mp4|mp3|ogg|pdf|zip|csv|json|geojson|js|css|woff2?|ttf|map)$/i.test(candidate.pathname)) {
      return null;
    }
    candidate.hash = "";
    return candidate.href;
  } catch {
    return null;
  }
}

export async function openDocument(page: Page, url: string): Promise<boolean> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (!response || response.status() === 404) return false;
  if (!response.ok()) {
    throw new Error(`Document ${url} returned HTTP ${response.status()}`);
  }
  await page.locator("body").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  return true;
}

export async function collectLinks(page: Page, baseURL: string): Promise<string[]> {
  const raw = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
  );
  return [...new Set(raw.map((href) => sameOriginDocument(href, baseURL)).filter(
    (url): url is string => url !== null,
  ))];
}

export async function captureRoute(page: Page, locale: Locale): Promise<RouteEvidence> {
  return page.evaluate((language) => {
    const main = document.querySelectorAll("main,[role='main']");
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active?.id || active?.getAttribute("data-testid") || active?.getAttribute("aria-label") || active?.tagName || null;
    return {
      url: location.href,
      locale: language,
      title: document.title,
      headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .filter((heading) => (heading as HTMLElement).getClientRects().length > 0)
        .map((heading) => (heading.textContent ?? "").trim()),
      links: Array.from(document.querySelectorAll("a[href]"))
        .map((link) => (link as HTMLAnchorElement).href),
      mainCount: main.length,
      focusKey,
      scrollX: scrollX,
      scrollY: scrollY,
    };
  }, locale);
}

export async function captureLanguage(page: Page, expected: Locale): Promise<LanguageEvidence> {
  return page.evaluate((locale) => {
    const main = document.querySelector("main,[role='main']");
    const mainName = main?.querySelector("h1")?.textContent?.trim() ?? null;
    const choices = new Set<string>();
    const selectors = document.querySelectorAll("a[lang],button[lang],select option,[hreflang], [data-lang]");
    for (const item of selectors) {
      const candidate = (item.getAttribute("hreflang") ?? item.getAttribute("lang") ??
        item.getAttribute("data-lang") ?? item.getAttribute("value") ?? "").toLowerCase();
      if (candidate === "en" || candidate.startsWith("en-")) choices.add("en");
      if (candidate === "fr" || candidate.startsWith("fr-")) choices.add("fr");
    }
    const text = document.body?.innerText ?? "";
    return {
      expected: locale,
      actual: document.documentElement.lang,
      title: document.title,
      mainName,
      selectors: Array.from(choices),
      fallbackVisible: /(?:missing translation|translation missing|i18n\.missing|translation key)/i.test(text),
    };
  }, expected);
}

export async function captureActions(page: Page): Promise<ActionEvidence[]> {
  return page.evaluate(() => {
    function nameOf(element: HTMLElement): string {
      const labelledBy = element.getAttribute("aria-labelledby");
      const referenced = labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      return (referenced || element.getAttribute("aria-label") ||
        (element as HTMLInputElement).value || element.getAttribute("title") ||
        element.innerText || element.textContent || "").trim();
    }
    const selectors = "button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=switch],[role=tab],[role=menuitem],[role=slider]";
    return Array.from(document.querySelectorAll<HTMLElement>(selectors)).slice(0, 250).map((element, index) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const role = element.getAttribute("role") || element.tagName.toLowerCase();
      const visible = box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
      const nativeKeyboard = /^(button|a|input|select|textarea)$/.test(element.tagName.toLowerCase());
      const tab = element.tabIndex;
      return {
        key: element.id || element.getAttribute("data-testid") || `${role}-${index}`,
        role,
        name: nameOf(element),
        disabled,
        focusable: tab >= 0 && !disabled,
        keyboard: nativeKeyboard || (tab >= 0 && element.hasAttribute("role")),
        visible,
        width: Math.round(box.width),
        height: Math.round(box.height),
        x: Math.round(box.x),
        y: Math.round(box.y),
        hiddenText: !!element.querySelector("svg") && !(element.innerText || "").trim(),
      };
    });
  });
}

export async function captureFields(page: Page): Promise<FieldEvidence[]> {
  return page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input:not([type=hidden]),textarea,select",
    );
    return Array.from(controls).map((element, index) => {
      const key = element.id || element.name || `field-${index}`;
      const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/).map(
        (id) => document.getElementById(id)?.textContent?.trim() ?? "",
      ).join(" ") ?? "";
      const label = element.labels ? Array.from(element.labels).map((item) => item.textContent?.trim() ?? "").join(" ") : "";
      const describedBy = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const description = describedBy.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ");
      const invalid = element.getAttribute("aria-invalid") === "true" || element.matches(":invalid");
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
      return {
        key,
        type: element.getAttribute("type") ?? element.tagName.toLowerCase(),
        required: element.required || element.getAttribute("aria-required") === "true",
        disabled: element.disabled,
        label: (labelledBy || element.getAttribute("aria-label") || label || element.getAttribute("title") || "").trim(),
        describedBy,
        hasError: describedBy.some((id) => document.getElementById(id)?.getAttribute("role") === "alert") ||
          !!description.trim(),
        invalid,
        message: description,
        visible,
      };
    });
  });
}

export async function captureLiveRegions(page: Page): Promise<LiveRegionEvidence[]> {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[aria-live],[role=status],[role=alert],[role=log]");
    return Array.from(nodes).map((element, index) => ({
      key: element.id || `live-${index}`,
      role: element.getAttribute("role") ?? "",
      live: element.getAttribute("aria-live"),
      atomic: element.getAttribute("aria-atomic") === "true",
      text: (element.innerText || element.textContent || "").trim(),
    }));
  });
}

export async function captureMaps(page: Page, requests: readonly string[]): Promise<MapEvidence[]> {
  return page.evaluate((requested) => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(
      "[role=application][aria-label*=map i],[data-testid*=map i]," +
      "[class*=map-container i],canvas[aria-label*=map i],svg[aria-label*=map i]",
    ));
    const unique = [...new Set(elements)];
    return unique.slice(0, 10).map((element, index) => {
      const tag = element.tagName.toLowerCase();
      const kind = tag === "canvas" ? "canvas" : tag === "svg" ? "svg" : tag === "img" ? "image" : "region";
      const labelled = element.getAttribute("aria-label") || element.getAttribute("title") || "";
      const labelledBy = element.getAttribute("aria-labelledby");
      const name = labelled || (labelledBy ? document.getElementById(labelledBy)?.textContent ?? "" : "");
      const container = element.parentElement ?? element;
      const sibling = container.querySelector("[role=list],ol,ul,table,[data-testid*=results i]");
      const alt = !!sibling || !!document.querySelector("[data-testid*=map-alternative i],a[href*=list],button[aria-controls*=results]");
      const attribution = container.querySelector<HTMLElement>("[class*=attribution i],[data-attribution],a[rel=license]");
      const rect = attribution?.getBoundingClientRect();
      return {
        key: element.id || `map-${index}`,
        kind,
        accessibleName: name.trim(),
        hasTextAlternative: alt,
        controls: [],
        externalTiles: requested.filter((url) => /(?:tile|tiles|\/\d+\/\d+\/\d+\.(?:png|jpg|webp))/i.test(url)),
        attribution: (attribution?.innerText ?? "").trim(),
        attributionVisible: !!rect && rect.width > 0 && rect.height > 0,
      };
    });
  }, requests);
}

export async function capturePage(
  page: Page,
  locale: Locale,
  requests: readonly string[] = [],
): Promise<PageCapture> {
  const [route, language, actions, fields, regions, maps, visibleText] = await Promise.all([
    captureRoute(page, locale),
    captureLanguage(page, locale),
    captureActions(page),
    captureFields(page),
    captureLiveRegions(page),
    captureMaps(page, requests),
    page.locator("body").innerText(),
  ]);
  return { route, language, actions, fields, regions, maps, visibleText };
}

export function startRequestLog(page: Page): { requests: string[]; stop: () => void } {
  const requests: string[] = [];
  const listener = (request: Request): void => { requests.push(request.url()); };
  page.on("request", listener);
  return { requests, stop: () => page.off("request", listener) };
}

export async function captureTransition(
  page: Page,
  actionKey: string,
  locale: Locale,
  perform: () => Promise<void>,
): Promise<TransitionEvidence> {
  const before = await captureRoute(page, locale);
  const beforeMain = await page.locator("main,[role=main]").first().innerText().catch(() => "");
  await perform();
  await page.waitForTimeout(80);
  const after = await captureRoute(page, locale);
  const afterMain = await page.locator("main,[role=main]").first().innerText().catch(() => "");
  const regions = await captureLiveRegions(page);
  return {
    before,
    after,
    actionKey,
    changedUrl: before.url !== after.url,
    changedContent: beforeMain !== afterMain,
    focusAfter: after.focusKey === "BODY" ? null : after.focusKey,
    announced: regions.some((region) => !!region.text.trim() && region.live !== "off"),
  };
}

export async function probeSearch(page: Page, query: string): Promise<SearchEvidence | null> {
  const search = page.locator("input[type=search],[role=searchbox]").first();
  if (!(await search.count()) || !(await search.isVisible())) return null;
  const list = page.locator("[role=listitem],[data-testid*=result i],main article");
  const beforeCount = await list.count();
  const beforeText = await page.locator("main,[role=main]").first().innerText().catch(() => "");
  const inputName = (await search.getAttribute("aria-label")) ||
    (await search.getAttribute("placeholder")) || (await search.getAttribute("name")) || "";
  await search.fill(query);
  await search.press("Enter").catch(() => undefined);
  await page.waitForTimeout(150);
  const afterCount = await list.count();
  const afterText = await page.locator("main,[role=main]").first().innerText().catch(() => "");
  const regions = await captureLiveRegions(page);
  return {
    beforeCount,
    afterCount,
    beforeText,
    afterText,
    query,
    inputName,
    stateAnnounced: regions.some((region) => !!region.text && region.live !== "off"),
    changed: beforeCount !== afterCount || beforeText !== afterText,
    emptyState: /(?:no results|nothing found|aucun résultat|aucune correspondance)/i.test(afterText),
  };
}

export async function probeFilters(page: Page): Promise<FilterEvidence[]> {
  const filters = page.locator("[data-testid*=filter i] input[type=checkbox],fieldset input[type=checkbox],[role=group][aria-label*=filter i] [role=checkbox]");
  const count = Math.min(await filters.count(), 8);
  const findings: FilterEvidence[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = filters.nth(index);
    if (!(await item.isVisible()) || !(await item.isEnabled())) continue;
    const label = await item.getAttribute("aria-label") || await item.getAttribute("name") || "";
    const selectedBefore = (await item.getAttribute("aria-checked")) === "true" || await item.isChecked().catch(() => false);
    const beforeText = await page.locator("main,[role=main]").first().innerText().catch(() => "");
    await item.click();
    await page.waitForTimeout(100);
    const selectedAfter = (await item.getAttribute("aria-checked")) === "true" || await item.isChecked().catch(() => false);
    const afterText = await page.locator("main,[role=main]").first().innerText().catch(() => "");
    const regions = await captureLiveRegions(page);
    findings.push({
      key: `filter-${index}`,
      label,
      kind: await item.getAttribute("role") || "checkbox",
      selectedBefore,
      selectedAfter,
      resultChanged: beforeText !== afterText,
      resultAnnounced: regions.some((region) => !!region.text && region.live !== "off"),
      unknownHidden: /unknown (?:is|treated as) accessible|inconnu (?:est|comme) accessible/i.test(afterText),
    });
    if (await item.isVisible()) await item.click().catch(() => undefined);
  }
  return findings;
}
