import { describe, expect, it } from "vitest";
import { auditHtml } from "../audit/htmlAudit";
import { lintCopy } from "./copyLint";
import { LINK_LABELS, PAGE_TITLES, ROUTE_PATHS, matchRoute, renderPrivacyLinkHtml, routeHref } from "./route";

describe("matchRoute", () => {
  it.each([
    ["#/privacy", "en"],
    ["#/privacy/", "en"],
    ["#!/privacy", "en"],
    ["#/Privacy", "en"],
    ["#/privacy?from=footer", "en"],
    ["#/privacy#top", "en"],
    ["/privacy", "en"],
    ["#/confidentialite", "fr"],
    ["#/confidentialite/", "fr"],
    ["#/CONFIDENTIALITE", "fr"],
  ] as const)("%s -> %s", (hash, loc) => {
    expect(matchRoute(hash)).toBe(loc);
  });
  it.each(["", "#", "#/", "#/privacy-policy", "#/privacy/extra", "#/confidentialité", "#/home", "#privacy", "#//privacy"])(
    "%j is not the privacy page",
    (hash) => {
      expect(matchRoute(hash)).toBeNull();
    },
  );
});

describe("route data", () => {
  it("routeHref and matchRoute agree for each language", () => {
    for (const loc of ["en", "fr"] as const) {
      expect(routeHref(loc)).toBe(`#${ROUTE_PATHS[loc]}`);
      expect(matchRoute(routeHref(loc))).toBe(loc);
    }
  });
  it("titles and link labels differ by language and pass the copy lint", () => {
    expect(PAGE_TITLES.en).not.toBe(PAGE_TITLES.fr);
    for (const loc of ["en", "fr"] as const) {
      expect(lintCopy(loc, PAGE_TITLES[loc])).toEqual([]);
      expect(lintCopy(loc, LINK_LABELS[loc])).toEqual([]);
    }
  });
});

describe("renderPrivacyLinkHtml", () => {
  it.each(["en", "fr"] as const)("is an audited, 44 px link in the page language (%s)", (loc) => {
    const html = renderPrivacyLinkHtml(loc);
    expect(html).toContain(`href="${routeHref(loc)}"`);
    expect(html).toContain(`lang="${loc}"`);
    expect(html).toContain(LINK_LABELS[loc]);
    expect(auditHtml(html)).toEqual([]);
  });
});
