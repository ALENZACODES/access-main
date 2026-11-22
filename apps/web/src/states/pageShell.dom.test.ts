/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { MIN_TARGET_PX, STATE_PALETTE } from "./contrast";
import { renderPage, themeFor, type PageOptions } from "./pageShell";
import { DEFAULT_PREFERENCES, type Preferences } from "./preferences";
import { ROUTE_NAMES, hrefFor } from "./router";

const opts = (over: Partial<PageOptions> = {}): PageOptions => ({ locale: "en", current: "search", heading: "Search results", body: "<p>Hello</p>", alternateHref: null, preferences: DEFAULT_PREFERENCES, ...over });
const prefs = (over: Partial<Preferences>): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("themeFor", () => {
  it("is dark only for the dark preference", () => {
    expect(themeFor(prefs({ theme: "dark" }))).toBe("dark");
    expect(themeFor(prefs({ theme: "light" }))).toBe("light");
    expect(themeFor(prefs({ theme: "system" }))).toBe("light");
  });
});

describe("renderPage structure", () => {
  const html = renderPage(opts());
  it("is a whole document with the language set", () => {
    expect(html.startsWith("<!doctype html><html lang=\"en\"")).toBe(true);
    expect(renderPage(opts({ locale: "fr" }))).toContain('<html lang="fr"');
  });
  it("has one h1, one main, one nav and one footer", () => {
    const d = parse(html);
    expect(d.querySelectorAll("h1")).toHaveLength(1);
    expect(d.querySelectorAll("main")).toHaveLength(1);
    expect(d.querySelectorAll("nav")).toHaveLength(1);
    expect(d.querySelectorAll("footer")).toHaveLength(1);
    expect(d.querySelectorAll("header")).toHaveLength(1);
  });
  it("puts the heading and the body inside main, and the main is a skip target", () => {
    const d = parse(html);
    const main = d.querySelector("main")!;
    expect(main.id).toBe("main");
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.querySelector("h1")!.textContent).toBe("Search results");
    expect(main.querySelector("p")!.textContent).toBe("Hello");
  });
  it("starts the body with a skip link to main", () => {
    const d = parse(html);
    const first = d.body.firstElementChild!;
    expect(first.tagName).toBe("A");
    expect(first.getAttribute("href")).toBe("#main");
    expect(first.textContent!.length).toBeGreaterThan(0);
  });
  it("sets a zoomable viewport that does not stop the user from scaling", () => {
    const d = parse(html);
    const vp = d.querySelector('meta[name="viewport"]')!.getAttribute("content")!;
    expect(vp).toContain("width=device-width");
    expect(vp).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(vp).not.toMatch(/maximum-scale/);
  });
  it("labels the navigation and links the manifest", () => {
    const d = parse(html);
    expect(d.querySelector("nav")!.getAttribute("aria-label")!.length).toBeGreaterThan(0);
    expect(d.querySelector('link[rel="manifest"]')!.getAttribute("href")).toBe("/manifest.webmanifest");
  });
  it("makes a title from the heading and the app name", () => {
    const d = parse(html);
    expect(d.title.startsWith("Search results – ")).toBe(true);
  });
  it("has a focus style", () => expect(html).toContain(":focus-visible{outline:3px solid"));
});

describe("renderPage navigation", () => {
  it("links the seven main pages in the language of the page", () => {
    const d = parse(renderPage(opts()));
    const hrefs = Array.from(d.querySelectorAll("nav a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["search", "map", "saved", "compare", "coverage", "sources", "settings"].map((r) => hrefFor("en", r as never)));
    const fr = parse(renderPage(opts({ locale: "fr" })));
    expect(Array.from(fr.querySelectorAll("nav a")).map((a) => a.getAttribute("href"))).toEqual(["search", "map", "saved", "compare", "coverage", "sources", "settings"].map((r) => hrefFor("fr", r as never)));
  });
  it("marks the current page and only that page", () => {
    for (const current of ["search", "map", "saved", "compare", "coverage", "sources", "settings"] as const) {
      const d = parse(renderPage(opts({ current })));
      const marked = Array.from(d.querySelectorAll('nav a[aria-current="page"]'));
      expect(marked).toHaveLength(1);
      expect(marked[0]!.getAttribute("href")).toBe(hrefFor("en", current));
    }
  });
  it("marks no page when the page is not in the navigation", () => {
    for (const current of [null, "place", "report", "offline"] as const) expect(parse(renderPage(opts({ current }))).querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
  it("only links routes that exist", () => {
    for (const a of Array.from(parse(renderPage(opts())).querySelectorAll("nav a"))) expect(ROUTE_NAMES.some((r) => hrefFor("en", r) === a.getAttribute("href"))).toBe(true);
  });
});

describe("renderPage language switch", () => {
  it("links to the same page in the other language when it is given", () => {
    const d = parse(renderPage(opts({ alternateHref: "/fr/recherche?q=cafe" })));
    const a = d.querySelector('a[hreflang="fr"]')!;
    expect(a.getAttribute("href")).toBe("/fr/recherche?q=cafe");
    expect(a.getAttribute("lang")).toBe("fr");
    expect(a.textContent).toBe("Français");
  });
  it("links to the start page of the other language otherwise", () => {
    expect(parse(renderPage(opts({ alternateHref: null }))).querySelector('a[hreflang="fr"]')!.getAttribute("href")).toBe(hrefFor("fr", "search"));
    expect(parse(renderPage(opts({ locale: "fr", alternateHref: null }))).querySelector('a[hreflang="en"]')!.getAttribute("href")).toBe(hrefFor("en", "search"));
  });
  it("names the other language in that language", () => expect(parse(renderPage(opts({ locale: "fr" }))).querySelector('a[hreflang="en"]')!.textContent).toBe("English"));
  it("is a touch target of at least the minimum width", () => expect(renderPage(opts())).toContain(`min-width:${MIN_TARGET_PX}px`));
});

describe("renderPage escaping", () => {
  it("escapes the heading in the h1 and the title", () => {
    const d = parse(renderPage(opts({ heading: '<script>alert(1)</script> & "x"' })));
    expect(d.querySelectorAll("script:not([src])")).toHaveLength(0);
    expect(d.querySelector("h1")!.textContent).toBe('<script>alert(1)</script> & "x"');
    expect(d.title).toContain('<script>alert(1)</script> & "x"');
  });
  it("escapes the alternate link", () => {
    const d = parse(renderPage(opts({ alternateHref: '/fr/x"><script>1</script>' })));
    expect(d.querySelectorAll("script:not([src])")).toHaveLength(0);
    expect(d.querySelector('a[hreflang="fr"]')!.getAttribute("href")).toBe('/fr/x"><script>1</script>');
  });
  it("puts the body in as given, since callers pass markup", () => expect(parse(renderPage(opts({ body: "<ul><li>a</li><li>b</li></ul>" }))).querySelectorAll("main li")).toHaveLength(2));
});

describe("renderPage preferences", () => {
  it("sets the text size on the root", () => {
    for (const textScale of [100, 125, 150, 200] as const) expect(renderPage(opts({ preferences: prefs({ textScale }) }))).toContain(`<html lang="en" style="font-size:${textScale}%">`);
  });
  it("uses the dark palette for the dark theme and the light one otherwise", () => {
    expect(renderPage(opts({ preferences: prefs({ theme: "dark" }) }))).toContain(STATE_PALETTE.dark.roles.body.bg);
    expect(renderPage(opts({ preferences: prefs({ theme: "light" }) }))).toContain(STATE_PALETTE.light.roles.body.bg);
    expect(renderPage(opts({ preferences: prefs({ theme: "dark" }) }))).toContain(`outline:3px solid ${STATE_PALETTE.dark.focusRing}`);
  });
  it("stops motion always when asked and by the system setting otherwise", () => {
    expect(renderPage(opts({ preferences: prefs({ reduceMotion: true }) }))).toContain("*{animation:none!important");
    expect(renderPage(opts({ preferences: prefs({ reduceMotion: true }) }))).not.toContain("@media (prefers-reduced-motion:reduce)");
    expect(renderPage(opts())).toContain("@media (prefers-reduced-motion:reduce){*{animation:none!important");
  });
});
