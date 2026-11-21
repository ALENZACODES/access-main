import type { Page } from "@playwright/test";
import {
  buttonFindings,
  counterpartIssues,
  evidenceFindings,
  formFindings,
  imageFindings,
  languageOf,
  liveMessageFindings,
  logicalRoute,
  motionFindings,
  tabFindings,
  finding,
  type AccessibleImage,
  type ButtonInfo,
  type EvidenceRow,
  type Finding,
  type FormField,
  type LanguageLink,
  type LiveMessage,
  type MotionElement,
  type TabStep,
} from "./p20d-contracts";

export interface DocumentSnapshot {
  readonly url: string;
  readonly language: string | null;
  readonly title: string;
  readonly headings: readonly string[];
  readonly mainLandmarks: number;
  readonly links: readonly string[];
  readonly alternates: readonly LanguageLink[];
  readonly forms: readonly FormField[];
  readonly controls: readonly ButtonInfo[];
  readonly images: readonly AccessibleImage[];
  readonly announcements: readonly LiveMessage[];
  readonly evidence: readonly EvidenceRow[];
  readonly hasSkipLink: boolean;
  readonly bodyWidth: number;
  readonly viewportWidth: number;
}

/** Only report evidence that a live view explicitly marks as evidence. */
export async function snapshotDocument(page: Page): Promise<DocumentSnapshot> {
  const raw = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0 &&
        !element.closest("[hidden], [inert], [aria-hidden='true']");
    };
    const name = (element: Element): string => {
      const label = element.getAttribute("aria-label");
      if (label !== null) return label.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const labels = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "");
        if (labels.some(Boolean)) return labels.join(" ").trim();
      }
      if (element instanceof HTMLInputElement) {
        const explicit = element.labels ? [...element.labels].map((l) => l.textContent?.trim() ?? "").join(" ") : "";
        if (explicit.trim()) return explicit.trim();
      }
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const explicit = element.labels ? [...element.labels].map((l) => l.textContent?.trim() ?? "").join(" ") : "";
        if (explicit.trim()) return explicit.trim();
      }
      const nested = element.textContent?.trim() ?? "";
      if (nested) return nested.slice(0, 120);
      return element.getAttribute("title")?.trim() ?? "";
    };
    const controls = [...document.querySelectorAll<HTMLElement>(
      "button, input[type='button'], input[type='submit'], input[type='reset'], [role='button'], [role='switch'], [role='checkbox'], [role='radio'], summary, select, textarea",
    )].map((element) => {
      const rect = element.getBoundingClientRect();
      const input = element instanceof HTMLInputElement ? element : null;
      return {
        label: input?.value && ["button", "submit", "reset"].includes(input.type) ? input.value : name(element),
        width: rect.width,
        height: rect.height,
        enabled: !(element instanceof HTMLButtonElement && element.disabled) &&
          !(input?.disabled ?? false) && element.getAttribute("aria-disabled") !== "true",
        visible: visible(element),
        role: element.getAttribute("role") || element.tagName.toLowerCase(),
      };
    });
    const fields = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type='hidden']), select, textarea",
    )].map((field) => {
      const describedBy = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      return {
        id: field.id,
        kind: field.tagName.toLowerCase(),
        required: field.required || field.getAttribute("aria-required") === "true",
        disabled: field.disabled,
        name: field.name,
        label: name(field),
        describedBy,
        invalid: field.getAttribute("aria-invalid") === "true",
        hasError: describedBy.some((id) => Boolean(document.getElementById(id)?.textContent?.trim())) ||
          Boolean(field.closest("[data-error]")?.getAttribute("data-error")),
        visible: visible(field),
      };
    });
    const images = [...document.querySelectorAll<HTMLImageElement>("img")].map((img) => ({
      source: img.currentSrc || img.src || "unknown-image",
      decorative: img.hasAttribute("alt") && img.alt === "" || img.getAttribute("role") === "presentation",
      alternative: img.getAttribute("alt"),
      hidden: !visible(img),
    }));
    const announcements = [...document.querySelectorAll<HTMLElement>(
      "[role='status'], [role='alert'], [aria-live]",
    )].map((element) => ({
      role: element.getAttribute("role") ?? "region",
      text: element.textContent?.trim().slice(0, 200) ?? "",
      polite: element.getAttribute("aria-live"),
      relevant: element.getAttribute("aria-relevant"),
    }));
    const evidence = [...document.querySelectorAll<HTMLElement>("[data-accessibility-evidence]")]
      .map((element) => ({
        source: element.getAttribute("data-source"),
        licence: element.getAttribute("data-licence"),
        date: element.getAttribute("data-observed-at"),
        status: element.getAttribute("data-accessibility-status"),
        label: element.getAttribute("data-accessibility-evidence") ?? "evidence",
      }));
    const alternates = [...document.querySelectorAll<HTMLAnchorElement | HTMLLinkElement>(
      "a[hreflang], link[hreflang], a[data-language-switch]",
    )].map((element) => ({
      href: element.href,
      hreflang: element.getAttribute("hreflang"),
      label: name(element),
      rel: element.getAttribute("rel") ?? "",
    }));
    const skipLinks = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='#']")]
      .filter((anchor) => /main|content/i.test(`${anchor.textContent ?? ""} ${anchor.getAttribute("href") ?? ""}`));
    return {
      language: document.documentElement.getAttribute("lang"),
      title: document.title,
      headings: [...document.querySelectorAll("h1")].filter(visible)
        .map((h) => h.textContent?.trim() ?? ""),
      mainLandmarks: [...document.querySelectorAll("main, [role='main']")].filter(visible).length,
      links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => a.href),
      alternates,
      forms: fields,
      controls,
      images,
      announcements,
      evidence,
      hasSkipLink: skipLinks.some((link) => {
        const target = document.getElementById(link.hash.slice(1));
        return target !== null && (target.matches("main, [role='main']") || target.contains(document.querySelector("main")));
      }),
      bodyWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  return { url: page.url(), ...raw };
}

/** Make audit failures ordinary Playwright assertion failures, not log-only hints. */
export function documentFindings(snapshot: DocumentSnapshot): Finding[] {
  const issues: Finding[] = [];
  const locale = languageOf(snapshot.language);
  if (locale === null) issues.push(finding("html-language", snapshot.url, snapshot.language ?? "missing"));
  if (!snapshot.title.trim()) issues.push(finding("document-title", snapshot.url, "Missing title"));
  if (snapshot.mainLandmarks !== 1) {
    issues.push(finding("main-landmark-count", snapshot.url, String(snapshot.mainLandmarks)));
  }
  if (snapshot.headings.length !== 1 || !snapshot.headings[0]?.trim()) {
    issues.push(finding("visible-h1", snapshot.url, String(snapshot.headings.length)));
  }
  if (!snapshot.hasSkipLink) issues.push(finding("skip-link", snapshot.url, "No usable skip to main link"));
  if (snapshot.bodyWidth > snapshot.viewportWidth + 2 && snapshot.viewportWidth <= 320) {
    issues.push(finding("reflow-320", snapshot.url,
      `${snapshot.bodyWidth}px content within ${snapshot.viewportWidth}px viewport`));
  }
  issues.push(...formFindings(snapshot.forms, snapshot.url));
  issues.push(...buttonFindings(snapshot.controls, snapshot.url));
  issues.push(...imageFindings(snapshot.images, snapshot.url));
  issues.push(...liveMessageFindings(snapshot.announcements, snapshot.url));
  issues.push(...evidenceFindings(snapshot.evidence, snapshot.url));
  if (locale !== null && snapshot.alternates.length > 0) {
    issues.push(...counterpartIssues({
      url: snapshot.url,
      language: locale,
      key: logicalRoute(snapshot.url),
    }, snapshot.alternates, new URL(snapshot.url).origin));
  }
  return issues;
}

/** Observe computed motion under the browser's reduced-motion emulation. */
export async function reducedMotionSnapshot(page: Page): Promise<MotionElement[]> {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll<HTMLElement>(
      "button, a, dialog, [role='dialog'], [aria-busy], [data-animated], [class*='anim'], [class*='transition']",
    )];
    const seconds = (value: string): number => Math.max(0, ...value.split(",").map((part) => {
      const token = part.trim();
      if (token.endsWith("ms")) return Number.parseFloat(token) / 1000;
      if (token.endsWith("s")) return Number.parseFloat(token);
      return 0;
    }).filter(Number.isFinite));
    return candidates.slice(0, 300).map((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        label: element.getAttribute("aria-label") || element.id || element.tagName.toLowerCase(),
        animationSeconds: seconds(style.animationDuration),
        transitionSeconds: seconds(style.transitionDuration),
        visible: bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden",
      };
    });
  });
}

/** Collect focus steps after actual Tab presses; keyboard behaviour is never mocked. */
export async function collectTabSequence(page: Page, count = 30): Promise<TabStep[]> {
  const steps: TabStep[] = [];
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return null;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const before = getComputedStyle(active, "::before");
      const after = getComputedStyle(active, "::after");
      const focusIndicator = style.outlineStyle !== "none" && style.outlineWidth !== "0px" ||
        style.boxShadow !== "none" || before.boxShadow !== "none" || after.boxShadow !== "none" ||
        active.matches(":focus-visible") && active.getAttribute("data-focus-visible") !== null;
      const parts: string[] = [];
      let node: Element | null = active;
      while (node && node !== document.documentElement) {
        const parent: Element | null = node.parentElement;
        const siblings = parent ? [...parent.children].filter((child) => child.tagName === node?.tagName) : [];
        parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
        node = parent;
      }
      return {
        key: parts.join(" > "),
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
        outline: focusIndicator ? "present" : "none",
        inViewport: rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth,
        disabled: active.getAttribute("aria-disabled") === "true" || active.hasAttribute("disabled"),
      };
    });
    if (step === null) break;
    steps.push(step);
  }
  return steps;
}

export async function keyboardFindings(page: Page, url: string): Promise<Finding[]> {
  const steps = await collectTabSequence(page);
  const issues = tabFindings(steps, url);
  if (steps.length === 0) issues.push(finding("no-keyboard-navigation", url, "Tab reached no controls"));
  return issues;
}

/** Check that skip-link activation moves keyboard focus into main content. */
export async function skipLinkFindings(page: Page): Promise<Finding[]> {
  const url = page.url();
  const links = page.locator("a[href^='#']");
  const total = await links.count();
  for (let index = 0; index < total; index += 1) {
    const link = links.nth(index);
    const text = (await link.textContent()) ?? "";
    const href = (await link.getAttribute("href")) ?? "";
    if (!/main|content/i.test(`${text} ${href}`)) continue;
    const targetId = href.slice(1);
    if (!targetId) continue;
    await link.focus();
    await page.keyboard.press("Enter");
    const result = await page.evaluate((id) => {
      const target = document.getElementById(id);
      const active = document.activeElement;
      return Boolean(target && active && (target === active || target.contains(active)));
    }, targetId);
    return result ? [] : [finding("skip-link-focus", url, `#${targetId}`)];
  }
  return [finding("skip-link-unavailable", url, "No skip link can be exercised")];
}

export async function exerciseDialogEscape(page: Page): Promise<Finding[]> {
  const url = page.url();
  const dialog = page.locator("dialog[open], [role='dialog']:visible");
  if (await dialog.count() === 0) return [];
  const before = await dialog.first().count();
  if (!before) return [];
  await page.keyboard.press("Escape");
  const remains = await dialog.first().isVisible().catch(() => false);
  return remains ? [finding("dialog-escape", url, "Dialog remains visible after Escape")] : [];
}

export function findLocalLinks(snapshot: DocumentSnapshot, base: string): string[] {
  const origin = new URL(base).origin;
  const out = new Set<string>();
  for (const value of snapshot.links) {
    try {
      const url = new URL(value, snapshot.url);
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
      if (/\.(?:pdf|zip|json|csv|png|jpe?g|webp|svg|css|m?js|woff2?)$/i.test(url.pathname)) continue;
      if (/\/(?:logout|delete|remove)(?:\/|$)/i.test(url.pathname)) continue;
      url.hash = "";
      out.add(url.href);
    } catch {
      // Invalid links are surfaced by the axe / link audit elsewhere.
    }
  }
  return [...out].sort();
}

export async function assertNoInaccessibleLoading(page: Page): Promise<Finding[]> {
  const url = page.url();
  return page.evaluate((currentUrl) => {
    const problems: Finding[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("[aria-busy='true']")) {
      if (!element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") &&
          !element.querySelector("[role='status'], [aria-live]")) {
        problems.push({
          rule: "busy-no-announcement",
          url: currentUrl,
          detail: element.id || element.tagName.toLowerCase(),
          severity: "error",
        });
      }
    }
    return problems;
  }, url);
}

/** Optional validation of visible first-party records with explicit metadata. */
export async function auditEvidenceCards(page: Page): Promise<Finding[]> {
  const url = page.url();
  const rows = await page.locator("[data-accessibility-evidence]").evaluateAll((elements) =>
    elements.map((node) => ({
      source: node.getAttribute("data-source"),
      licence: node.getAttribute("data-licence"),
      date: node.getAttribute("data-observed-at"),
      status: node.getAttribute("data-accessibility-status"),
      label: node.getAttribute("data-accessibility-evidence") ?? "record",
    })),
  );
  return evidenceFindings(rows, url);
}

export function describeProblems(issues: readonly Finding[]): string {
  return issues.map((issue) => `${issue.url} [${issue.rule}] ${issue.detail}`).join("\n");
}

export function collectMotionProblems(values: readonly MotionElement[], url: string): Finding[] {
  return motionFindings(values, url);
}
