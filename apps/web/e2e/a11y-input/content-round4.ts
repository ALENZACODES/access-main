import { expect, type Page } from "@playwright/test";

export interface ContentFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/**
 * Test only authored UI labels and known evidence metadata. Do not mistake
 * an unlabelled data point for a fact with a known accessibility value.
 */
export async function auditContentIntegrity(page: Page): Promise<ContentFinding[]> {
  return page.evaluate(() => {
    const findings: { code: string; target: string; detail: string }[] = [];
    const lang = document.documentElement.lang.toLowerCase();
    const french = lang === "fr" || lang.startsWith("fr-");
    const english = lang === "en" || lang.startsWith("en-");
    if (!french && !english) {
      findings.push({ code: "unsupported-document-language", target: "html", detail: lang || "missing" });
    }
    const report = (code: string, element: Element, detail: string): void => {
      findings.push({ code, target: element.id || element.localName, detail });
    };
    const elements = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-localized-copy], [data-a11y-evidence], [data-a11y-unknown]",
    ));
    for (const element of elements) {
      if (element.hasAttribute("data-a11y-localized-copy")) {
        const declared = element.getAttribute("lang")?.toLowerCase();
        if (declared && declared !== "en" && declared !== "fr" &&
            !declared.startsWith("en-") && !declared.startsWith("fr-")) {
          report("unsupported-copy-language", element, declared);
        }
        const effectiveLanguage = declared || lang;
        const copy = element.textContent ?? "";
        if (effectiveLanguage.startsWith("fr")) {
          if (copy.includes("'")) report("french-straight-apostrophe", element, "U+2019 required");
          if (/(^|[^\u00a0\s])[ \t]+:/.test(copy)) {
            report("french-colon-space", element, "U+00A0 required");
          }
          if (/[ \t\u00a0]+[;!?]/.test(copy)) {
            report("french-narrow-space", element, "U+202F required");
          }
          if (/«(?!\u202f)/.test(copy) || /(?<!\u202f)»/.test(copy)) {
            report("french-quotation-space", element, "U+202F required");
          }
        }
        if (!copy.trim() && !element.querySelector("img[alt],svg[aria-label]")) {
          report("empty-localized-copy", element, "Empty authored string");
        }
      }
      if (element.hasAttribute("data-a11y-evidence")) {
        const source = element.getAttribute("data-source")?.trim();
        const licence = element.getAttribute("data-licence")?.trim();
        const date = element.getAttribute("data-date")?.trim();
        if (!source) report("missing-source", element, "Source required");
        if (!licence) report("missing-licence", element, "Open licence required");
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          report("missing-date", element, "ISO date required");
        } else {
          const parsed = new Date(`${date}T00:00:00Z`);
          if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
            report("invalid-date", element, date);
          }
        }
        if (licence && !/^(CC0(?:-1\.0)?|CC-BY(?:-[0-9.]+)?|ODbL(?:-[0-9.]+)?|OGL(?:-[\w.-]+)?|MIT|Apache-2\.0|public-domain)$/i.test(licence)) {
          report("unrecognised-open-licence", element, licence);
        }
        const status = element.getAttribute("data-accessibility-status")?.trim();
        if (status !== null && status !== undefined && ![
          "UNKNOWN", "REPORTED", "OBSERVED", "NOT_APPLICABLE",
        ].includes(status)) {
          report("invalid-evidence-state", element, status);
        }
      }
      if (element.hasAttribute("data-a11y-unknown")) {
        const status = element.getAttribute("data-accessibility-status");
        if (status !== "UNKNOWN") {
          report("unknown-state-changed", element, String(status));
        }
        if (element.hasAttribute("data-inferred-accessibility")) {
          report("inferred-accessibility", element, "Unknown must stay UNKNOWN");
        }
      }
    }
    const images = document.querySelectorAll<HTMLImageElement>("img");
    for (const image of Array.from(images)) {
      if (image.closest("[hidden],[inert],[aria-hidden='true']")) continue;
      if (image.getAttribute("role") === "presentation" || image.getAttribute("role") === "none") continue;
      if (!image.hasAttribute("alt")) report("image-no-alt", image, "Missing alternative text");
    }
    const mainLandmarks = document.querySelectorAll("main, [role='main']");
    if (mainLandmarks.length !== 1) {
      findings.push({ code: "main-landmark-count", target: "document", detail: String(mainLandmarks.length) });
    }
    const headings = Array.from(document.querySelectorAll("h1, [role='heading'][aria-level='1']"));
    if (headings.length !== 1) {
      findings.push({ code: "primary-heading-count", target: "document", detail: String(headings.length) });
    } else if (!headings[0].textContent?.trim() && !headings[0].getAttribute("aria-label")) {
      report("empty-primary-heading", headings[0], "Heading has no name");
    }
    if (!document.title.trim()) {
      findings.push({ code: "empty-document-title", target: "title", detail: "Title required" });
    }
    return findings;
  });
}

/** Repeated names should be scoped to language, never inferred from URL paths. */
export async function auditLocalizedRoutePair(
  page: Page,
  englishURL: string,
  frenchURL: string,
): Promise<ContentFinding[]> {
  const findings: ContentFinding[] = [];
  for (const [language, url] of [["en", englishURL], ["fr", frenchURL]] as const) {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) {
      findings.push({ code: "locale-route-unavailable", target: language, detail: String(response?.status()) });
      continue;
    }
    const declared = (await page.locator("html").getAttribute("lang"))?.toLowerCase() ?? "";
    if (!(declared === language || declared.startsWith(`${language}-`))) {
      findings.push({ code: "locale-mismatch", target: language, detail: declared });
    }
    findings.push(...(await auditContentIntegrity(page)).map((item) => ({
      ...item, target: `${language}/${item.target}`,
    })));
    const interactive = await page.locator("button, a[href], input, select, textarea").count();
    if (interactive === 0) {
      findings.push({ code: "locale-without-interaction", target: language, detail: "No controls" });
    }
  }
  return findings;
}

/**
 * Explicitly declared accessible status markers have to remain stable while
 * connectivity changes. A missing offline dataset is not promoted to known.
 */
export async function auditUnknownStateAfterOffline(
  page: Page,
): Promise<ContentFinding[]> {
  const initial = await page.locator("[data-a11y-unknown]").evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.id,
      status: element.getAttribute("data-accessibility-status"),
    })),
  );
  const findings: ContentFinding[] = [];
  for (const [index, marker] of initial.entries()) {
    if (marker.status !== "UNKNOWN") {
      findings.push({ code: "initial-unknown-invalid", target: marker.id || String(index), detail: String(marker.status) });
    }
  }
  return findings;
}

export async function assertContentIntegrity(page: Page): Promise<void> {
  expect(await auditContentIntegrity(page), "Locale and attribution integrity").toEqual([]);
}
