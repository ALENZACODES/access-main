import { expect, test } from "@playwright/test";
import {
  COPY,
  CrawlQueue,
  accessibleTarget,
  compactIssues,
  focusIssues,
  isCalendarDate,
  isCrawlableUrl,
  localeFromLang,
  mergeKnowledge,
  normalizeCrawlLinks,
  normalizeCrawlUrl,
  parseAbsoluteUrl,
  provenanceStatus,
  routeKey,
  routeParityIssues,
  routeRecordIssues,
  seedRoutes,
  targetIssues,
  type RouteRecord,
  type TargetGeometry,
} from "./sweep-contracts";

const ROOT = "http://127.0.0.1:4173";

function target(width: number, height: number): TargetGeometry {
  return {
    label: "example",
    width,
    height,
    area: width * height,
    exemptInline: false,
  };
}

function record(locale: "en" | "fr", url: string): RouteRecord {
  return {
    locale,
    url,
    key: routeKey(url),
    title: "Example",
    mainCount: 1,
    headingCount: 1,
  };
}

test.describe("P20C: pure crawl contracts", () => {
  test("rejects remote, script and downloadable document URLs", () => {
    expect(parseAbsoluteUrl("javascript:alert(1)", ROOT)).toBeNull();
    expect(parseAbsoluteUrl("mailto:hello@example.invalid", ROOT)).toBeNull();
    expect(parseAbsoluteUrl("/en", ROOT)?.href).toBe(`${ROOT}/en`);
    expect(isCrawlableUrl(new URL(`${ROOT}/en`), ROOT)).toBe(true);
    expect(isCrawlableUrl(new URL(`${ROOT}/data.geojson`), ROOT)).toBe(false);
    expect(isCrawlableUrl(new URL("https://example.invalid/fr"), ROOT)).toBe(false);
  });

  test("preserves locale queries and strips tracking params and fragments", () => {
    const normalized = normalizeCrawlUrl(new URL(
      `${ROOT}/map?utm_source=sample&lang=fr&z=12#marker`,
    ));
    expect(normalized).toBe(`${ROOT}/map?lang=fr`);
    expect(normalizeCrawlUrl(new URL(`${ROOT}/map?locale=en`)))
      .toBe(`${ROOT}/map?locale=en`);
  });

  test("deduplicates and sorts same-origin route links", () => {
    const links = normalizeCrawlLinks([
      "/fr#heading",
      "/fr",
      "/en?utm_campaign=example",
      "/export.zip",
      "https://example.invalid/fr",
      "data:text/html,hello",
    ], `${ROOT}/`, ROOT);
    expect(links).toEqual([`${ROOT}/en`, `${ROOT}/fr`]);
  });

  test("derives stable logical keys for localized paths", () => {
    expect(routeKey(`${ROOT}/en/finder/`)).toBe("/finder");
    expect(routeKey(`${ROOT}/fr/finder`)).toBe("/finder");
    expect(routeKey(`${ROOT}/finder?lang=fr`)).toBe("/finder");
    expect(routeKey(`${ROOT}/en`)).toBe("/");
  });

  test("seed pages include both locale URL conventions", () => {
    const routes = seedRoutes(ROOT, {
      en: "/english",
      fr: "/francais",
    });
    expect(routes).toContain(`${ROOT}/`);
    expect(routes).toContain(`${ROOT}/en`);
    expect(routes).toContain(`${ROOT}/fr`);
    expect(routes).toContain(`${ROOT}/?lang=en`);
    expect(routes).toContain(`${ROOT}/?lang=fr`);
    expect(routes).toContain(`${ROOT}/english`);
    expect(routes).toContain(`${ROOT}/francais`);
    expect(new Set(routes).size).toBe(routes.length);
  });

  test("crawl budget reports overflow rather than hiding unvisited routes", () => {
    const queue = new CrawlQueue(2);
    queue.add([`${ROOT}/a`, `${ROOT}/b`, `${ROOT}/c`]);
    expect(queue.next()).toBe(`${ROOT}/a`);
    queue.markUnavailable(`${ROOT}/a`);
    expect(queue.next()).toBe(`${ROOT}/b`);
    expect(queue.next()).toBeNull();
    expect(queue.summary()).toEqual({
      visited: [`${ROOT}/a`, `${ROOT}/b`],
      discovered: [`${ROOT}/a`, `${ROOT}/b`],
      unavailable: [`${ROOT}/a`],
      exceeded: true,
    });
  });

  test("rejects zero and nonintegral crawl budgets", () => {
    expect(() => new CrawlQueue(0)).toThrow();
    expect(() => new CrawlQueue(-1)).toThrow();
    expect(() => new CrawlQueue(1.5)).toThrow();
  });
});

test.describe("P20C: accessibility and locale contracts", () => {
  test("only English and French are accepted as known languages", () => {
    expect(localeFromLang("en-CA")).toBe("en");
    expect(localeFromLang("fr-CA")).toBe("fr");
    expect(localeFromLang("Fr")).toBe("fr");
    expect(localeFromLang("und")).toBeNull();
    expect(localeFromLang("")).toBeNull();
    expect(localeFromLang(null)).toBeNull();
  });

  test("supports both localized labels without changing evidence state", () => {
    expect(COPY.unknown.en).toBe("Unknown");
    expect(COPY.unknown.fr).toBe("Inconnu");
    expect(COPY.offlineUnavailable.fr).toContain("hors ligne");
    expect(mergeKnowledge([])).toBe("UNKNOWN");
    expect(mergeKnowledge(["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(mergeKnowledge(["PASS", "BLOCKED"])).toBe("BLOCKED");
    expect(mergeKnowledge(["PASS", "PASS"])).toBe("PASS");
  });

  test("treats 44 by 44 pixels as the inclusive project minimum", () => {
    expect(accessibleTarget(target(44, 44))).toBe(true);
    expect(accessibleTarget(target(43.9, 44))).toBe(false);
    expect(accessibleTarget(target(44, 43.9))).toBe(false);
    expect(targetIssues([target(40, 48)], "/en")[0]?.code).toBe("target-44");
  });

  test("inline textual hyperlinks can be exempt without exempting buttons", () => {
    expect(accessibleTarget({ ...target(15, 16), exemptInline: true })).toBe(true);
    expect(accessibleTarget({ ...target(15, 16), exemptInline: false })).toBe(false);
  });

  test("reports missing landmarks and headings on either locale", () => {
    const issues = routeRecordIssues([
      { ...record("en", `${ROOT}/en`), mainCount: 0 },
      { ...record("fr", `${ROOT}/fr`), headingCount: 0, title: "" },
    ]);
    expect(issues.map((issue) => issue.code)).toEqual([
      "main-landmark", "heading-missing", "title-missing",
    ]);
  });

  test("missing locale is a failure rather than a fallback", () => {
    const issues = routeRecordIssues([record("en", `${ROOT}/en`)]);
    expect(issues).toContainEqual({
      code: "locale-absent",
      location: "/",
      detail: "fr",
    });
  });

  test("a counterpart not found in a crawl stays unknown", () => {
    expect(routeParityIssues([record("en", `${ROOT}/en/find`)])).toEqual([{
      code: "parity-unknown", location: "/find", detail: "en",
    }]);
    expect(routeParityIssues([
      record("en", `${ROOT}/en/find`), record("fr", `${ROOT}/fr/find`),
    ])).toEqual([]);
  });

  test("focus records distinguish hidden and repeated elements", () => {
    const issues = focusIssues([
      { identifier: "first", inDocument: true, visible: true, disabled: false },
      { identifier: "second", inDocument: true, visible: false, disabled: false },
      { identifier: "first", inDocument: true, visible: true, disabled: false },
    ], "/en");
    expect(issues.map((issue) => issue.code)).toEqual([
      "focus-hidden", "focus-cycle",
    ]);
  });

  test("formats diagnostics without dropping unique failures", () => {
    const message = compactIssues([
      { code: "first", location: "/en", detail: "one" },
      { code: "first", location: "/en", detail: "one" },
      { code: "second", location: "/fr", detail: "two" },
    ]);
    expect(message.split("\n")).toHaveLength(2);
  });
});

test.describe("P20C: source and date contracts", () => {
  test("rejects absent provenance instead of assuming good evidence", () => {
    expect(provenanceStatus(null)).toBe("UNKNOWN");
    expect(provenanceStatus({ source: "", licence: "CC0-1.0", date: "2026-11-15" }))
      .toBe("UNKNOWN");
    expect(provenanceStatus({ source: "sample", date: "2026-11-15" }))
      .toBe("UNKNOWN");
    expect(provenanceStatus({ source: "sample", licence: "closed", date: "2026-11-15" }))
      .toBe("UNKNOWN");
  });

  test("requires an explicit open licence and a real date", () => {
    expect(provenanceStatus({
      source: "synthetic-fixture", licence: "CC0-1.0", date: "2026-11-15",
    })).toBe("PASS");
    expect(provenanceStatus({
      source: "synthetic-fixture", licence: "ODbL-1.0", date: "2026-02-30",
    })).toBe("UNKNOWN");
  });

  test("validates leap years and avoids JavaScript date normalization", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(isCalendarDate("2026-11-31")).toBe(false);
    expect(isCalendarDate("2026-11-15")).toBe(true);
    expect(isCalendarDate("2026-1-15")).toBe(false);
    expect(isCalendarDate("0000-01-01")).toBe(false);
  });
});
