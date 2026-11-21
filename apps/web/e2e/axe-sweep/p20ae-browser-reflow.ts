import type { Page } from "@playwright/test";
import { evaluate, type ControlKind, type Observation, type Report } from "./p20ae-reflow-contracts.ts";

export interface ReadOptions { route?: string; limit?: number; includeHidden?: boolean; }
const CONTROL_SELECTOR = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[tabindex]:not([tabindex='-1'])";
const TEXT_SELECTOR = "main h1,main h2,main h3,main p,main li,main label,main legend,main table,main pre,main blockquote";

export async function readObservation(page: Page, options: ReadOptions = {}): Promise<Observation> {
  return page.evaluate(({ route, limit, includeHidden }) => {
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden"
        && !element.closest("[hidden],[inert],[aria-hidden=true]");
    };
    const accessibleName = (element: HTMLElement) => {
      const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
      const labelled = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      return (element.getAttribute("aria-label") || labelled || element.textContent || element.getAttribute("placeholder") || "")
        .trim().replace(/\s+/g, " ").slice(0, 120);
    };
    const all = Array.from(document.querySelectorAll<HTMLElement>([
      "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
      "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=switch]",
      "[tabindex]:not([tabindex='-1'])", "main h1", "main h2", "main h3", "main p",
      "main li", "main label", "main legend", "main table", "main pre", "main blockquote",
    ].join(",")));
    const elements = all.slice(0, limit).filter((el) => includeHidden || isVisible(el)).map((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const parse = (value: string) => Number.parseFloat(value) || 0;
      const tag = el.localName;
      const role = el.getAttribute("role");
      const kind: ControlKind = tag === "a" || role === "link" ? "link"
        : tag === "button" || role === "button" ? "button"
        : tag === "input" ? "input" : tag === "select" ? "select"
        : tag === "textarea" ? "textarea" : tag === "summary" ? "summary" : "other";
      const clippingAncestors: string[] = [];
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const ps = getComputedStyle(parent);
        if (/(hidden|clip|auto|scroll)/.test(`${ps.overflowX} ${ps.overflowY}`)) {
          const pr = parent.getBoundingClientRect();
          if (rect.left < pr.left || rect.right > pr.right || rect.top < pr.top || rect.bottom > pr.bottom) {
            clippingAncestors.push(parent.id ? `#${parent.id}` : parent.localName);
          }
        }
        parent = parent.parentElement;
      }
      const disabled = ("disabled" in el && Boolean((el as HTMLButtonElement).disabled))
        || el.getAttribute("aria-disabled") === "true";
      return {
        selector: el.id ? `#${CSS.escape(el.id)}` : `${tag}:nth-observed(${index})`,
        name: accessibleName(el), kind,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
        visible: isVisible(el), disabled, tabIndex: el.tabIndex,
        fontSize: parse(style.fontSize), lineHeight: style.lineHeight === "normal" ? parse(style.fontSize) * 1.2 : parse(style.lineHeight),
        textLength: (el.textContent ?? "").trim().length,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        fixed: style.position === "fixed", sticky: style.position === "sticky", clippingAncestors,
      };
    });
    const width = window.innerWidth;
    const height = window.innerHeight;
    const orientation = width === height ? "square" : width > height ? "landscape" : "portrait";
    const locale = document.documentElement.lang.toLowerCase();
    const spacingApplied = document.documentElement.dataset.p20aeSpacing === "true";
    const spacingSample = document.querySelector<HTMLElement>("main p,main li,main label,main button,main a");
    const spacingStyle = spacingSample ? getComputedStyle(spacingSample) : null;
    const spacingFont = spacingStyle ? Number.parseFloat(spacingStyle.fontSize) || 0 : 0;
    const measuredTextSpacing = spacingStyle && spacingFont > 0 ? {
      lineHeight: (spacingStyle.lineHeight === "normal" ? spacingFont * 1.2 : Number.parseFloat(spacingStyle.lineHeight)) / spacingFont,
      paragraphGap: (Number.parseFloat(spacingStyle.marginBottom) || 0) / spacingFont,
      letterSpacing: (spacingStyle.letterSpacing === "normal" ? 0 : Number.parseFloat(spacingStyle.letterSpacing) || 0) / spacingFont,
      wordSpacing: (Number.parseFloat(spacingStyle.wordSpacing) || 0) / spacingFont,
    } : null;
    const observation: Observation = {
      route: route || `${location.pathname}${location.search}${location.hash}`,
      locale: locale.startsWith("fr") ? "fr" : locale.startsWith("en") ? "en" : "UNKNOWN",
      viewport: {
        width, height, clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollX: window.scrollX, scrollY: window.scrollY,
        deviceScaleFactor: window.devicePixelRatio || 1,
        orientation, rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 0,
      },
      elements,
      mainCount: document.querySelectorAll("main,[role=main]").length,
      headingCount: document.querySelectorAll("main h1,[role=main] h1").length,
      visibleHeadingCount: Array.from(document.querySelectorAll("main h1,[role=main] h1")).filter(isVisible).length,
      textSpacing: spacingApplied ? measuredTextSpacing : null,
    };
    return observation;
  }, { route: options.route ?? "", limit: options.limit ?? 600, includeHidden: options.includeHidden ?? false });
}
export async function auditPageReflow(page: Page, options: ReadOptions = {}): Promise<Report> {
  return evaluate(await readObservation(page, options));
}
export async function applySpacingStress(page: Page): Promise<void> {
  await page.addStyleTag({ content: `
    html[data-p20ae-spacing=true] { line-height:1.5 !important; }
    html[data-p20ae-spacing=true] p,
    html[data-p20ae-spacing=true] li,
    html[data-p20ae-spacing=true] label,
    html[data-p20ae-spacing=true] legend,
    html[data-p20ae-spacing=true] button,
    html[data-p20ae-spacing=true] a,
    html[data-p20ae-spacing=true] input,
    html[data-p20ae-spacing=true] textarea,
    html[data-p20ae-spacing=true] select,
    html[data-p20ae-spacing=true] summary {
      line-height:1.5 !important; margin-bottom:2em !important;
      letter-spacing:.12em !important; word-spacing:.16em !important;
    }` });
  await page.locator("html").evaluate((element) => { element.dataset.p20aeSpacing = "true"; });
}
export async function clearSpacingStress(page: Page): Promise<void> {
  await page.locator("html").evaluate((element) => { delete element.dataset.p20aeSpacing; });
}
export async function readControlRects(page: Page) {
  return page.locator(CONTROL_SELECTOR).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      name: (element.getAttribute("aria-label") || element.textContent || element.localName).trim().slice(0, 100),
      width: rect.width, height: rect.height,
      visible: style.display !== "none" && style.visibility !== "hidden"
        && !element.closest("[hidden],[inert],[aria-hidden=true]"),
    };
  }));
}
