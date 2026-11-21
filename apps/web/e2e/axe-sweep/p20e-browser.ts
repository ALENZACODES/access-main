/** Browser adapters for P20E contracts. All selectors observe rendered UI. */
import type { Page } from "@playwright/test";
import type {
  AuditContext, DocumentMetadata, FocusFrame, FormControl, Interactive,
  LiveRegion, Locale, MediaNode, NavigationLink, NetworkResource, OfflineState,
  Rect, StatusRecord,
} from "./p20e-policy";
import { normalizeLocale } from "./p20e-policy";

export interface BrowserSnapshot {
  readonly context: AuditContext;
  readonly metadata: DocumentMetadata;
  readonly controls: readonly Interactive[];
  readonly forms: readonly FormControl[];
  readonly media: readonly MediaNode[];
  readonly regions: readonly LiveRegion[];
  readonly links: readonly NavigationLink[];
  readonly evidence: readonly StatusRecord[];
}
export interface AccessibilityFocus {
  readonly selector: string;
  readonly frame: FocusFrame;
}
export interface RoutedResponse {
  readonly url: string;
  readonly status: number | null;
  readonly error: string | null;
}
export function localeForUrl(url: string, fallback: Locale): Locale {
  const parsed = new URL(url);
  const segment = parsed.pathname.split("/")[1];
  return normalizeLocale(segment ?? null) ??
    normalizeLocale(parsed.searchParams.get("lang")) ?? fallback;
}
export async function collectBrowserSnapshot(page: Page, locale: Locale): Promise<BrowserSnapshot> {
  const url = page.url();
  const values = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const box = html.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        style.opacity !== "0" && box.width > 0 && box.height > 0 &&
        !html.closest("[hidden],[inert],[aria-hidden='true']");
    };
    const key = (element: Element): string => {
      if (element.id) return `#${element.id}`;
      if (element.hasAttribute("data-testid")) return `[data-testid="${element.getAttribute("data-testid")}"]`;
      const tag = element.tagName.toLowerCase();
      const parent = element.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
      return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
    };
    const text = (element: Element): string => (element.textContent ?? "").trim().replace(/\s+/g, " ");
    const name = (element: Element): string => {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const value = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
        if (value) return value;
      }
      const label = element.getAttribute("aria-label");
      if (label?.trim()) return label.trim();
      if (element instanceof HTMLInputElement && element.labels?.length) {
        return Array.from(element.labels).map(text).join(" ").trim();
      }
      if (element instanceof HTMLImageElement) return element.alt;
      return text(element) || element.getAttribute("title") || "";
    };
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const styleNumber = (value: string): number => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const controls = Array.from(document.querySelectorAll(
      'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="radio"],[role="tab"],[tabindex]',
    )).map((node) => {
      const html = node as HTMLElement;
      const style = getComputedStyle(html);
      const disabled = html.matches(":disabled") || html.getAttribute("aria-disabled") === "true";
      return {
        key: key(node), role: html.getAttribute("role") ?? html.tagName.toLowerCase(),
        name: name(node), tag: html.tagName.toLowerCase(),
        href: html instanceof HTMLAnchorElement ? html.href : null,
        disabled, hidden: !visible(node), rect: rect(node),
        fontSize: styleNumber(style.fontSize), lineHeight: styleNumber(style.lineHeight),
        outlineStyle: style.outlineStyle, outlineWidth: styleNumber(style.outlineWidth),
        touchAction: style.touchAction, position: style.position,
        zIndex: styleNumber(style.zIndex),
        hasClickHandler: html.hasAttribute("onclick") || html.getAttribute("role") === "button",
        tabIndex: html.tabIndex,
      };
    });
    const forms = Array.from(document.querySelectorAll("input,select,textarea,[role='combobox']")).map((node) => {
      const html = node as HTMLInputElement;
      const describedBy = node.getAttribute("aria-describedby") ?? "";
      const description = describedBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      return {
        id: key(node), type: html.type || html.tagName.toLowerCase(),
        role: node.getAttribute("role") ?? html.tagName.toLowerCase(),
        name: html.name, label: name(node), required: html.required || node.getAttribute("aria-required") === "true",
        invalid: node.getAttribute("aria-invalid") === "true" || html.validity?.valid === false,
        disabled: html.disabled, visible: visible(node), description,
        errorId: describedBy || null, value: html.value ?? "",
        autocomplete: html.getAttribute("autocomplete"),
      };
    });
    const media = Array.from(document.querySelectorAll("img,svg,canvas,video,audio")).map((node) => {
      const html = node as HTMLElement;
      const kind = html.tagName.toLowerCase() as "img" | "svg" | "canvas" | "video" | "audio";
      const alt = node instanceof HTMLImageElement ? node.getAttribute("alt") : null;
      const tracks = node.querySelectorAll("track[kind='captions'],track[kind='subtitles']");
      return {
        id: key(node), kind, alt, role: node.getAttribute("role"),
        ariaLabel: node.getAttribute("aria-label"), describedBy: node.getAttribute("aria-describedby"),
        hasCaptions: tracks.length > 0,
        hasTranscript: Boolean(node.getAttribute("data-transcript") || node.getAttribute("aria-describedby")),
        isDecorative: node.getAttribute("role") === "presentation" || node.getAttribute("aria-hidden") === "true" ||
          (kind === "img" && alt === ""), hidden: !visible(node),
      };
    });
    const regions = Array.from(document.querySelectorAll("[aria-live],[role='alert'],[role='status']")).map((node) => ({
      id: key(node), role: node.getAttribute("role") ?? "region", live: node.getAttribute("aria-live"),
      atomic: node.getAttribute("aria-atomic"), relevant: node.getAttribute("aria-relevant"),
      text: text(node), hidden: !visible(node),
    }));
    const links = Array.from(document.querySelectorAll("a[href],link[rel='alternate'][hreflang]")).map((node) => ({
      id: key(node), href: (node as HTMLAnchorElement).href, text: name(node),
      lang: node.getAttribute("lang"), hreflang: node.getAttribute("hreflang"),
      current: node.getAttribute("aria-current"), hidden: node.tagName.toLowerCase() === "a" && !visible(node),
    }));
    const evidence = Array.from(document.querySelectorAll("[data-accessibility-evidence],[data-accessibility-status]")).map((node) => ({
      id: key(node), status: node.getAttribute("data-accessibility-status"),
      source: node.getAttribute("data-source"), licence: node.getAttribute("data-licence"),
      observedAt: node.getAttribute("data-observed-at"), expiresAt: node.getAttribute("data-expires-at"),
      collectedAt: node.getAttribute("data-collected-at"), text: text(node),
    }));
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((node) => ({
      level: Number(node.tagName.slice(1)), text: text(node), hidden: !visible(node),
    }));
    const landmarks = Array.from(document.querySelectorAll("main,nav,header,footer,aside,[role='main'],[role='navigation']")).map((node) => ({
      role: node.getAttribute("role") ?? node.tagName.toLowerCase(), name: name(node),
    }));
    const html = document.documentElement;
    const body = document.body;
    const bodyStyle = getComputedStyle(body);
    const metadata = {
      url: location.href, lang: html.lang, title: document.title, direction: html.dir,
      headings, mainCount: document.querySelectorAll("main,[role='main']").length, landmarks,
      viewportWidth: window.innerWidth, documentWidth: html.scrollWidth,
      horizontalOverflow: Math.max(0, html.scrollWidth - window.innerWidth),
      bodyScrollLocked: bodyStyle.overflowX === "hidden" || bodyStyle.overflow === "hidden",
      viewportMeta: document.querySelector("meta[name='viewport']")?.getAttribute("content") ?? null,
    };
    return { controls, forms, media, regions, links, evidence, metadata };
  });
  return { context: { page: url, locale }, ...values };
}
export async function collectFocus(page: Page): Promise<FocusFrame | null> {
  return page.evaluate(() => {
    const node = document.activeElement as HTMLElement | null;
    if (!node || node === document.body || node === document.documentElement) return null;
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const accessibleName = node.getAttribute("aria-label") || node.textContent?.trim() || node.getAttribute("title") || "";
    const width = Number.parseFloat(style.outlineWidth) || 0;
    const id = node.id ? `#${node.id}` : node.tagName.toLowerCase();
    const hidden = node.closest("[aria-hidden='true']") !== null;
    const disabled = node.matches(":disabled") || node.getAttribute("aria-disabled") === "true";
    const visible = box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" &&
      (style.outlineStyle !== "none" && width > 0 || style.boxShadow !== "none" || style.borderStyle !== "none");
    return {
      id, name: accessibleName, tag: node.tagName.toLowerCase(),
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewport: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      outlineStyle: style.outlineStyle, outlineWidth: width,
      ringColor: style.outlineColor, isVisible: visible,
      ariaHidden: hidden, inert: node.closest("[inert]") !== null, disabled,
    };
  });
}
export async function traceKeyboard(page: Page, steps = 24): Promise<FocusFrame[]> {
  await page.locator("body").click({ position: { x: 1, y: 1 }, force: true });
  const result: FocusFrame[] = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await collectFocus(page);
    if (focused) result.push(focused);
  }
  return result;
}
export async function collectOfflineState(page: Page, locale: Locale): Promise<OfflineState> {
  return page.evaluate((desired) => {
    const evidence = Array.from(document.querySelectorAll("[data-accessibility-evidence],[data-accessibility-status]")).map((node, index) => ({
      id: node.id || `evidence-${index}`, status: node.getAttribute("data-accessibility-status"),
      source: node.getAttribute("data-source"), licence: node.getAttribute("data-licence"),
      observedAt: node.getAttribute("data-observed-at"), expiresAt: node.getAttribute("data-expires-at"),
      collectedAt: node.getAttribute("data-collected-at"), text: (node.textContent ?? "").trim(),
    }));
    let storageKeys: string[] = [];
    try { storageKeys = Object.keys(localStorage); } catch { /* restricted storage */ }
    const main = document.querySelector("main,[role='main']");
    return {
      url: location.href, locale: desired, lang: document.documentElement.lang,
      title: document.title, mainText: main?.textContent?.trim() ?? "",
      links: Array.from(document.querySelectorAll("a[href]")).map((node) => (node as HTMLAnchorElement).href),
      statuses: evidence, serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
      storageKeys,
    };
  }, locale);
}
export async function awaitStablePage(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}
export function captureNetwork(page: Page): {
  resources: NetworkResource[];
  stop: () => void;
} {
  const resources: NetworkResource[] = [];
  const onResponse = (response: import("@playwright/test").Response): void => {
    resources.push({ url: response.url(), type: response.request().resourceType(), initiator: "response", status: response.status(), failure: null });
  };
  const onFailure = (request: import("@playwright/test").Request): void => {
    resources.push({ url: request.url(), type: request.resourceType(), initiator: "failure", status: null, failure: request.failure()?.errorText ?? "failed" });
  };
  page.on("response", onResponse);
  page.on("requestfailed", onFailure);
  return { resources, stop: () => { page.off("response", onResponse); page.off("requestfailed", onFailure); } };
}
export async function waitForServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    if (navigator.serviceWorker.controller) return true;
    try {
      await Promise.race([
        navigator.serviceWorker.ready.then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch { return false; }
    return Boolean(navigator.serviceWorker.controller);
  });
}
export async function routeResponse(page: Page, url: string): Promise<RoutedResponse> {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return { url: page.url(), status: response?.status() ?? null, error: null };
  } catch (error) {
    return { url, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}
export async function assertLocaleIsRendered(page: Page, expected: Locale): Promise<boolean> {
  const [language, title, mainCount] = await Promise.all([
    page.locator("html").getAttribute("lang"), page.title(), page.locator("main,[role='main']").count(),
  ]);
  return normalizeLocale(language) === expected && Boolean(title.trim()) && mainCount === 1;
}
export async function snapshotTextPairs(page: Page): Promise<readonly { key: string; text: string }[]> {
  return page.locator("[data-i18n-key]").evaluateAll((elements) => elements.map((element) => ({
    key: element.getAttribute("data-i18n-key") ?? "", text: (element.textContent ?? "").trim(),
  })));
}
export function rectFromBox(box: { x: number; y: number; width: number; height: number } | null): Rect {
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
}
