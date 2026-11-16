import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * A crawl of same-origin, document-style links, starting at both locale
 * entry points. This intentionally does not claim to cover routes that are
 * accessible only after authentication or a form submission.
 */
const MAX_ROUTES = 60;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LANGUAGE_CODES = new Set(["en", "fr"]);

function localeOf(language: string): "en" | "fr" | null {
  const primary = language.trim().toLowerCase().split("-")[0];
  return primary === "en" || primary === "fr" ? primary : null;
}

function isDocumentRoute(candidate: URL, origin: string): boolean {
  if (candidate.origin !== origin || !/^https?:$/.test(candidate.protocol)) {
    return false;
  }

  // Exclude downloads and common non-page resources, not app routes.
  return !/\.(?:pdf|zip|json|geojson|csv|txt|jpe?g|png|gif|webp|svg|ico|js|css|map|woff2?|ttf|mp4|mp3)$/i.test(
    candidate.pathname,
  );
}

function canonicalUrl(url: URL): string {
  const clean = new URL(url.href);
  clean.hash = "";
  return clean.href;
}

async function documentLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.locator("a[href]").evaluateAll((elements) =>
    elements.map((element) => (element as HTMLAnchorElement).href),
  );
  const links: string[] = [];
  for (const href of hrefs) {
    try {
      const candidate = new URL(href);
      if (isDocumentRoute(candidate, origin)) {
        links.push(canonicalUrl(candidate));
      }
    } catch {
      // Invalid and non-HTTP link targets cannot be crawled as documents.
    }
  }
  return links;
}

function entryPoints(baseURL: string): string[] {
  const base = new URL(baseURL);
  const home = new URL("/", base);
  const enPath = new URL("/en", base);
  const frPath = new URL("/fr", base);
  const enQuery = new URL(home);
  const frQuery = new URL(home);
  enQuery.searchParams.set("lang", "en");
  frQuery.searchParams.set("lang", "fr");

  // Deployments can point directly to the two real locale entry points.
  // Otherwise, probe conventional URL forms and only scan live pages.
  const configured = [
    process.env.AXE_SWEEP_EN_URL,
    process.env.AXE_SWEEP_FR_URL,
  ].filter((value): value is string => Boolean(value));
  const defaultEntries = [home.href, enPath.href, frPath.href, enQuery.href, frQuery.href];
  return [...new Set([...configured.map((value) => new URL(value, base).href), ...defaultEntries])];
}

function failureDetails(
  route: string,
  violations: readonly {
    id: string;
    impact?: string | null;
    nodes: readonly { target: readonly string[] }[];
  }[],
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 5)
        .map((node) => node.target.join(" "))
        .join(", ");
      return `${route}: ${violation.id} (${violation.impact ?? "unknown"}) at ${targets}`;
    })
    .join("\n");
}

test.describe("Axe sweep — navigable EN and FR pages", () => {
  test("runs WCAG 2.2 AA axe rules on every discovered document route", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL, "Playwright use.baseURL must point to the local App").toBeTruthy();
    const origin = new URL(baseURL!).origin;
    const queue = entryPoints(baseURL!);
    const seen = new Set<string>();
    const scanned = new Set<string>();
    const languages = new Set<string>();
    const failures: string[] = [];

    test.setTimeout(600_000);

    while (queue.length > 0) {
      expect(
        seen.size,
        `The crawl exceeded ${MAX_ROUTES} routes; increase coverage limits deliberately`,
      ).toBeLessThan(MAX_ROUTES);

      const next = queue.shift()!;
      const parsed = new URL(next, baseURL);
      if (!isDocumentRoute(parsed, origin)) continue;
      const url = canonicalUrl(parsed);
      if (seen.has(url)) continue;
      seen.add(url);

      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      // Conventional fallback locale paths may be absent; required coverage
      // is checked below, rather than asserting their presence here.
      if (response === null || response.status() === 404) continue;
      expect(response.ok(), `${url} responded with ${response.status()}`).toBe(true);
      await page.locator("body").waitFor();
      const language = localeOf(await page.locator("html").getAttribute("lang") ?? "");
      if (language === null || !LANGUAGE_CODES.has(language)) {
        failures.push(`${url}: html[lang] must identify English or French`);
      } else {
        languages.add(language);
      }

      await test.step(`axe: ${url}`, async () => {
        const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        if (result.violations.length > 0) {
          failures.push(failureDetails(url, result.violations));
        }
      });
      scanned.add(url);

      for (const link of await documentLinks(page, origin)) {
        if (!seen.has(link) && !queue.includes(link)) queue.push(link);
      }
    }

    if (!languages.has("fr")) {
      const french = page.getByRole("button", { name: /Fran\u00e7ais|French/i }).first();
      if (await french.count()) {
        await french.click();
        await page.locator("body").waitFor();
        const language = localeOf((await page.locator("html").getAttribute("lang")) ?? "");
        if (language) languages.add(language);
        const url = page.url();
        await test.step(`axe after language switch: ${url}`, async () => {
          const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          if (result.violations.length > 0) {
            failures.push(failureDetails(url, result.violations));
          }
        });
        scanned.add(url);
      }
    }

    expect(scanned.size, "At least one live document must be scanned").toBeGreaterThan(0);
    expect(languages.has("en"), "No English document was scanned").toBe(true);
    expect(languages.has("fr"), "No French document was scanned").toBe(true);
    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});
