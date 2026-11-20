/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEFAULT_HANDOUT, HANDOUT_SIZES, SIZE_POINTS, buildHandout } from "./handout";
import { escapeHandoutHtml, handoutCss, handoutToHtml } from "./handoutHtml";
import { bare, place, varied } from "./placeFixtures";

const TODAY = "2026-11-19";
const html = (ps = [place("a", { wheelchair_description: "Side door" }), bare("z")], locale: "en" | "fr" = "en", over = {}) => handoutToHtml(buildHandout(ps, locale, TODAY, { ...DEFAULT_HANDOUT, ...over }));
const dom = (s: string) => new DOMParser().parseFromString(s, "text/html");

describe("escapeHandoutHtml", () => {
  it("escapes the five markup characters", () => {
    expect(escapeHandoutHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
  it("drops control characters but keeps accents, tabs of text and other scripts", () => {
    expect(escapeHandoutHtml("a\u0000b\u0007c Café 東京")).toBe("abc Café 東京");
  });
  it("escapes an ampersand once, not twice", () => {
    expect(escapeHandoutHtml("&amp;")).toBe("&amp;amp;");
  });
});

describe("handoutCss", () => {
  it("sets the base size in points", () => {
    expect(handoutCss(24)).toContain("html { font-size: 24pt; }");
  });
  it("is black on white and carries no colour but those", () => {
    const css = handoutCss(18);
    expect(css).toContain("color: #000; background: #fff");
    expect(css.match(/#[0-9a-f]{3,6}\b/gi)!.every((c) => ["#000", "#fff"].includes(c.toLowerCase()))).toBe(true);
  });
  it("keeps each place together on a printed page and a heading with its text", () => {
    expect(handoutCss(18)).toContain("article { break-inside: avoid; }");
    expect(handoutCss(18)).toContain("h2 { break-after: avoid; }");
  });
  it("never loads anything", () => {
    expect(handoutCss(18)).not.toMatch(/url\(|@import|@font-face/);
  });
});

describe("handoutToHtml", () => {
  const out = html();
  const d = dom(out);
  it("is an HTML5 document with the language, charset, viewport and title", () => {
    expect(out.startsWith("<!DOCTYPE html>\n")).toBe(true);
    expect(d.documentElement.getAttribute("lang")).toBe("en");
    expect(d.querySelector("meta[charset]")!.getAttribute("charset")).toBe("utf-8");
    expect(d.querySelector('meta[name="viewport"]')).not.toBeNull();
    expect(d.title).toBe("My 2 places");
  });
  it("sets lang to fr for French", () => {
    expect(dom(html(undefined, "fr")).documentElement.getAttribute("lang")).toBe("fr");
  });
  it("has one h1, an h2 per place numbered in order, and the footer", () => {
    expect(d.querySelectorAll("h1")).toHaveLength(1);
    expect([...d.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["1. Place a", "2. Name UNKNOWN"]);
    expect(d.querySelectorAll("footer p").length).toBeGreaterThanOrEqual(2);
  });
  it("puts each place's details in a description list inside an article", () => {
    const first = d.querySelectorAll("article")[0]!;
    expect([...first.querySelectorAll("dt")].map((x) => x.textContent)).toEqual(["Wheelchair tag", "Kind", "Address", "Map point", "Where it comes from", "Note"]);
    expect(first.querySelectorAll("dt")).toHaveLength(first.querySelectorAll("dd").length);
  });
  it("has no script, no link, no image, no form and no external reference", () => {
    expect(d.querySelectorAll("script, link, img, iframe, form, object, embed, a, base")).toHaveLength(0);
    expect(out).not.toMatch(/https?:\/\//i);
    expect(out).not.toMatch(/\son[a-z]+=/i);
  });
  it("has one inline style element and nothing else in the head that fetches", () => {
    expect(d.querySelectorAll("style")).toHaveLength(1);
    expect([...d.head.children].map((c) => c.tagName)).toEqual(["META", "META", "TITLE", "STYLE"]);
  });
  it("sets the size chosen, for each size", () => {
    for (const s of HANDOUT_SIZES) expect(html(undefined, "en", { size: s })).toContain(`font-size: ${SIZE_POINTS[s]}pt`);
  });
  it("ends with one newline", () => {
    expect(out.endsWith("</html>\n")).toBe(true);
  });
  it("carries the OpenStreetMap credit", () => {
    expect(out).toContain("© OpenStreetMap contributors");
  });
  it("is parsed without leftover or doubled markup", () => {
    expect(d.body.querySelectorAll("*").length).toBeGreaterThan(10);
    expect(out.match(/<h1>/g)).toHaveLength(1);
  });
});

describe("hostile text from the pack", () => {
  const HOSTILE = ['</h2><script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "<!-- -->", "&lt;b&gt;", "\u0000\u0007x", "'; DROP TABLE places;--", "</style><script>x</script>", "A".repeat(2000)];
  for (const name of HOSTILE) {
    it(`adds no element for ${JSON.stringify(name.slice(0, 24))}`, () => {
      const p = place("h", { name, address: name, wheelchair_description: name });
      const d = dom(handoutToHtml(buildHandout([p], "en", TODAY)));
      expect(d.querySelectorAll("script, img, iframe")).toHaveLength(0);
      expect(d.querySelectorAll("article")).toHaveLength(1);
      expect(d.querySelectorAll("style")).toHaveLength(1);
      expect(d.querySelector("h2")!.textContent!.startsWith("1. ")).toBe(true);
    });
  }
  it("shows markup in a name as text", () => {
    const d = dom(html([place("a", { name: "<b>Bold</b>" })]));
    expect(d.querySelector("h2")!.textContent).toBe("1. <b>Bold</b>");
    expect(d.querySelector("h2 b")).toBeNull();
  });
});

describe("generated lists", () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}: one article per place, in order, in both languages`, () => {
      const ps = varied(seed, 12);
      for (const locale of ["en", "fr"] as const) {
        const d = dom(handoutToHtml(buildHandout(ps, locale, TODAY)));
        expect(d.querySelectorAll("article")).toHaveLength(ps.length);
        expect(d.querySelectorAll("h2")).toHaveLength(ps.length);
        d.querySelectorAll("h2").forEach((h, i) => expect(h.textContent!.startsWith(`${i + 1}. `)).toBe(true));
        expect(d.querySelectorAll("script, a, img")).toHaveLength(0);
      }
    });
  }
});

describe("questions in the page", () => {
  const withQ = (locale: "en" | "fr" = "en") => dom(handoutToHtml(buildHandout([place("a"), bare("z")], locale, TODAY, { ...DEFAULT_HANDOUT, questions: true })));
  it("adds a heading and an ordered list to each place, and nothing when off", () => {
    expect(withQ().querySelectorAll("article h3")).toHaveLength(2);
    expect(withQ().querySelectorAll("article ol.ask")).toHaveLength(2);
    expect(dom(html()).querySelectorAll("h3, ol.ask")).toHaveLength(0);
  });
  it("gives every question its own empty answer line to write on", () => {
    const d = withQ();
    for (const ol of d.querySelectorAll("ol.ask")) {
      expect(ol.querySelectorAll(":scope > li")).toHaveLength(ol.querySelectorAll(".answer").length);
      for (const a of ol.querySelectorAll(".answer")) expect(a.textContent).toBe("");
    }
  });
  it("draws the answer line in black with room to write, in the stylesheet", () => {
    const css = handoutCss(18);
    expect(css).toContain(".answer { height: 2.5rem; border-bottom: 0.1rem solid #000; }");
  });
  it("is in French in French", () => {
    expect(withQ("fr").querySelector("article h3")!.textContent).toBe("Questions à poser");
  });
  it("still has no script, link or image, and escapes the questions", () => {
    const d = withQ();
    expect(d.querySelectorAll("script, a, img")).toHaveLength(0);
  });
});
