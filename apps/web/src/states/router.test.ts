import { describe, expect, it } from "vitest";
import { ROUTE_NAMES, SLUGS, alternateHref, hrefFor, parseAcceptLanguage, resolveRoute, type Resolved } from "./index";

const route = (r: Resolved) => {
  if (r.kind !== "route") throw new Error(`route expected, got ${r.kind}`);
  return r;
};

describe("resolveRoute", () => {
  it("redirects the root to the preferred language's search page", () => {
    expect(resolveRoute("/", "fr")).toEqual({ kind: "redirect", to: "/fr/recherche" });
    expect(resolveRoute("/en", "fr")).toEqual({ kind: "redirect", to: "/en/search" });
  });
  it("resolves every route in both languages", () => {
    for (const name of ROUTE_NAMES) {
      for (const locale of ["en", "fr"] as const) {
        const path = `/${locale}/${SLUGS[name][locale]}${name === "place" || name === "report" ? "/hall-1" : ""}`;
        const r = route(resolveRoute(path));
        expect(r.route).toBe(name);
        expect(r.locale).toBe(locale);
      }
    }
  });
  it("keeps the id and query string, and tolerates a trailing slash", () => {
    const r = route(resolveRoute("/fr/lieu/hall-1/?q=caf%C3%A9&unk=1"));
    expect(r.id).toBe("hall-1");
    expect(r.query.get("q")).toBe("café");
  });
  it("does not resolve a slug from the other language", () => {
    expect(resolveRoute("/en/recherche").kind).toBe("not-found");
    expect(resolveRoute("/fr/search").kind).toBe("not-found");
  });
  it.each(["/de/search", "/search", "/en/nope", "/en/place", "/en/place/BAD", "/en/place/a/b", "/en/search/x", "/en/place/%E0%A4%A", "/en/place/../x"])(
    "returns not-found for %s",
    (p) => expect(resolveRoute(p).kind).toBe("not-found"),
  );
  it("reports the right locale for not-found pages", () => {
    expect(resolveRoute("/fr/zzz")).toEqual({ kind: "not-found", locale: "fr" });
  });
});

describe("hrefFor and alternateHref", () => {
  it("builds localised links", () => {
    expect(hrefFor("fr", "saved")).toBe("/fr/enregistres");
    expect(hrefFor("en", "place", { id: "hall-1" })).toBe("/en/place/hall-1");
    expect(hrefFor("en", "search", { query: "need=elevator" })).toBe("/en/search?need=elevator");
    expect(hrefFor("en", "search", { query: new URLSearchParams() })).toBe("/en/search");
  });
  it("ignores an id on routes that take none", () => {
    expect(hrefFor("en", "map", { id: "x" })).toBe("/en/map");
  });
  it("switches language and keeps id and query", () => {
    const r = route(resolveRoute("/en/place/hall-1?x=1"));
    expect(alternateHref(r)).toBe("/fr/lieu/hall-1?x=1");
    expect(alternateHref(route(resolveRoute("/fr/carte?near=1,2")))).toBe("/en/map?near=1%2C2");
  });
  it("round-trips every route through the other language and back", () => {
    for (const name of ROUTE_NAMES) {
      const r = route(resolveRoute(hrefFor("en", name, { id: "hall-1" })));
      const fr = route(resolveRoute(alternateHref(r)));
      expect(fr.locale).toBe("fr");
      expect(route(resolveRoute(alternateHref(fr))).route).toBe(name);
    }
  });
});

describe("parseAcceptLanguage", () => {
  it.each([
    [undefined, "en"], ["", "en"], ["fr-CA,fr;q=0.9,en;q=0.8", "fr"], ["en-US,fr;q=0.9", "en"],
    ["fr;q=0.4, en;q=0.9", "en"], ["de, es", "en"], ["de, fr-FR", "fr"], ["fr;q=0", "en"], ["*", "en"], ["fr;q=abc", "en"],
  ])("%j -> %s", (h, expected) => expect(parseAcceptLanguage(h)).toBe(expected));
});
