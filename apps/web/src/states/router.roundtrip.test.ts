import { describe, expect, it } from "vitest";
import { ROUTE_NAMES, SLUGS, alternateHref, hrefFor, parseAcceptLanguage, resolveRoute, type RouteName } from "./router";
import { lcg } from "./placeFixtures";

const LOCALES = ["en", "fr"] as const;
const WITH_ID: RouteName[] = ["place", "report"];

describe("slugs", () => {
  it("are different for every route within a language, so a path names one route", () => {
    for (const l of LOCALES) expect(new Set(ROUTE_NAMES.map((r) => SLUGS[r][l])).size).toBe(ROUTE_NAMES.length);
  });
  it("are lower case and made of letters and hyphens only, so they need no escaping", () => {
    for (const r of ROUTE_NAMES) for (const l of LOCALES) expect(SLUGS[r][l], `${r}/${l}`).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
  it("have no accents, since a path with an accent is written two ways", () => {
    for (const r of ROUTE_NAMES) for (const l of LOCALES) expect(SLUGS[r][l]).toBe(SLUGS[r][l].normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });
});

describe("hrefFor and resolveRoute", () => {
  it("round-trip for every route and language", () => {
    for (const l of LOCALES) for (const r of ROUTE_NAMES) {
      const id = WITH_ID.includes(r) ? "cafe-1" : undefined;
      const res = resolveRoute(hrefFor(l, r, id ? { id } : {}));
      expect(res, `${l}/${r}`).toMatchObject({ kind: "route", locale: l, route: r, id: id ?? null });
    }
  });
  it("round-trip a query string", () => {
    for (const l of LOCALES) {
      const res = resolveRoute(hrefFor(l, "search", { query: "q=caf%C3%A9&tag=yes" }));
      expect(res.kind).toBe("route");
      if (res.kind === "route") {
        expect(res.query.get("q")).toBe("café");
        expect(res.query.get("tag")).toBe("yes");
      }
    }
  });
  it("accepts a query with or without its question mark", () => {
    expect(hrefFor("en", "search", { query: "?q=a" })).toBe("/en/search?q=a");
    expect(hrefFor("en", "search", { query: "q=a" })).toBe("/en/search?q=a");
    expect(hrefFor("en", "search", { query: new URLSearchParams({ q: "a b" }) })).toBe("/en/search?q=a+b");
    expect(hrefFor("en", "search", { query: "" })).toBe("/en/search");
  });
  it("leaves an id out of a route that takes none, and out when there is none", () => {
    expect(hrefFor("en", "search", { id: "x" })).toBe("/en/search");
    expect(hrefFor("en", "place", {})).toBe("/en/place");
    expect(hrefFor("fr", "place", { id: "a-1" })).toBe("/fr/lieu/a-1");
    expect(hrefFor("fr", "report", { id: "a-1" })).toBe("/fr/signaler/a-1");
  });
  it("round-trips many generated ids", () => {
    const rand = lcg(11);
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789-";
    for (let i = 0; i < 200; i++) {
      const len = 1 + Math.floor(rand() * 30);
      let id = chars[Math.floor(rand() * 36)]!;
      for (let k = 1; k < len; k++) id += chars[Math.floor(rand() * chars.length)]!;
      for (const l of LOCALES) expect(resolveRoute(hrefFor(l, "place", { id })), id).toMatchObject({ kind: "route", route: "place", id });
    }
  });
});

describe("resolveRoute", () => {
  it("sends the root and a bare language to the search page", () => {
    expect(resolveRoute("/")).toEqual({ kind: "redirect", to: "/en/search" });
    expect(resolveRoute("/", "fr")).toEqual({ kind: "redirect", to: "/fr/recherche" });
    expect(resolveRoute("/fr")).toEqual({ kind: "redirect", to: "/fr/recherche" });
    expect(resolveRoute("/en/")).toEqual({ kind: "redirect", to: "/en/search" });
  });
  it("ignores empty segments and a trailing slash", () => {
    expect(resolveRoute("/en//search//")).toMatchObject({ kind: "route", route: "search" });
    expect(resolveRoute("/en/search/")).toMatchObject({ kind: "route", route: "search" });
  });
  it("does not find a slug from the other language", () => {
    expect(resolveRoute("/fr/search")).toEqual({ kind: "not-found", locale: "fr" });
    expect(resolveRoute("/en/recherche")).toEqual({ kind: "not-found", locale: "en" });
  });
  it("does not find a route in a language that is neither", () => {
    for (const p of ["/de/search", "/EN/search", "/search", "/en-CA/search", "/e/search"]) expect(resolveRoute(p, "fr"), p).toEqual({ kind: "not-found", locale: "fr" });
  });
  it("needs a good id for the routes that take one", () => {
    for (const p of ["/en/place", "/en/place/", "/en/place/A", "/en/place/a_b", "/en/place/a%20b", "/en/place/-x", "/en/report"]) expect(resolveRoute(p).kind, p).toBe("not-found");
    expect(resolveRoute("/en/place/" + "a".repeat(65)).kind).toBe("not-found");
    expect(resolveRoute("/en/place/" + "a".repeat(64)).kind).toBe("route");
  });
  it("does not accept an id on a route that takes none, or more segments after an id", () => {
    expect(resolveRoute("/en/search/x").kind).toBe("not-found");
    expect(resolveRoute("/en/saved/a").kind).toBe("not-found");
    expect(resolveRoute("/en/place/a/b").kind).toBe("not-found");
  });
  it("is not found, not an error, for a bad escape or a bad url", () => {
    expect(resolveRoute("/en/place/%E0%A4%A")).toEqual({ kind: "not-found", locale: "en" });
    expect(resolveRoute("/en/place/%")).toEqual({ kind: "not-found", locale: "en" });
    expect(resolveRoute("http" + "://[::1")).toEqual({ kind: "not-found", locale: "en" });
  });
  it("reads an encoded slash in an id as a bad id, not as a second segment", () => expect(resolveRoute("/en/place/a%2Fb").kind).toBe("not-found"));
  it("reads a full url as well as a path, and drops the hash", () => {
    expect(resolveRoute("https://example.org/en/map?x=1#top")).toMatchObject({ kind: "route", route: "map" });
  });
  it("does not let a dot segment reach another route", () => {
    expect(resolveRoute("/en/../fr/recherche")).toMatchObject({ kind: "route", locale: "fr", route: "search" });
    expect(resolveRoute("/en/./search")).toMatchObject({ kind: "route", locale: "en", route: "search" });
  });
  it("is the same for every call", () => expect(resolveRoute("/fr/lieu/a-1?x=1")).toEqual(resolveRoute("/fr/lieu/a-1?x=1")));
});

describe("alternateHref", () => {
  it("gives the same page in the other language, with its id and query", () => {
    for (const r of ROUTE_NAMES) for (const l of LOCALES) {
      const id = WITH_ID.includes(r) ? "a-1" : undefined;
      const res = resolveRoute(hrefFor(l, r, { ...(id ? { id } : {}), query: "q=x" }));
      if (res.kind !== "route") throw new Error("not a route");
      const alt = alternateHref(res);
      const back = resolveRoute(alt);
      expect(back, `${l}/${r}`).toMatchObject({ kind: "route", locale: l === "en" ? "fr" : "en", route: r, id: id ?? null });
      if (back.kind === "route") expect(back.query.get("q")).toBe("x");
    }
  });
  it("comes back to the first page after two switches", () => {
    const res = resolveRoute("/en/place/cafe-1?x=1");
    if (res.kind !== "route") throw new Error("x");
    const back = resolveRoute(alternateHref(resolveRoute(alternateHref(res)) as never));
    expect(back).toMatchObject({ kind: "route", locale: "en", route: "place", id: "cafe-1" });
  });
});

describe("parseAcceptLanguage", () => {
  it.each([
    [null, "en"], [undefined, "en"], ["", "en"], ["*", "en"], ["de", "en"], ["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"], ["en-US", "en"],
    ["fr;q=0.9, en;q=0.8", "fr"], ["en;q=0.8, fr;q=0.9", "fr"], ["de, fr;q=0.5", "fr"], ["fr;q=0, en", "en"], ["fr;q=0", "en"],
    ["en, fr", "en"], ["fr, en", "fr"], ["fr;q=abc, en", "en"], ["xx;q=1, fr;q=0.1", "fr"], ["frr", "en"], ["fr-", "fr"], [" fr ; q=0.5 ,en;q=0.4", "fr"],
    ["en;q=0.5, fr;q=0.5", "en"], ["fr-CA;q=0.2, en-GB;q=0.7", "en"],
  ])("reads %j as %s", (header, want) => expect(parseAcceptLanguage(header as never)).toBe(want));
});
