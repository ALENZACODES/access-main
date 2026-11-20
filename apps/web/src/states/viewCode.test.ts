import { describe, expect, it } from "vitest";
import { EMPTY_FACETS } from "./packFacets";
import { MAX_VIEW_CODE_CHARS, MAX_VIEW_CODE_LINES, EMPTY_VIEW_PARTS, VIEW_CODE_HEADER, parseViewCode, viewIsEmpty, viewKeys, viewToCode, type ViewParts } from "./viewCode";
import { SEARCH_MAX_CHARS } from "./packSearchParse";

const view = (over: Partial<ViewParts> = {}): ViewParts => ({ ...EMPTY_VIEW_PARTS, ...over });

describe("viewToCode", () => {
  it("writes only the header for an empty view", () => {
    expect(viewToCode(EMPTY_VIEW_PARTS)).toBe(`${VIEW_CODE_HEADER}\n`);
    expect(viewIsEmpty(EMPTY_VIEW_PARTS)).toBe(true);
  });
  it("writes one line for each thing set, in a fixed order", () => {
    const v = view({ text: "ramp  \n main", tag: "yes", kind: "cafe", facets: { source: "Geofabrik", licence: "ODbL-1.0", tier: "0", age: "within-30" } });
    expect(viewToCode(v)).toBe("VIEW v1\nsearch: ramp main\ntag: yes\nkind: cafe\nsource: Geofabrik\nlicence: ODbL-1.0\ntier: 0\nage: within-30\n");
    expect(viewKeys(v)).toEqual(["search", "tag", "kind", "source", "licence", "tier", "age"]);
  });
  it("treats blank search words as not set, and any tag as not set", () => {
    expect(viewKeys(view({ text: "  \n " }))).toEqual([]);
    expect(viewIsEmpty(view({ text: " " }))).toBe(true);
    expect(viewIsEmpty(view({ tag: "unknown" }))).toBe(false);
  });
  it("cannot be made to carry a second line by what was typed", () => {
    const code = viewToCode(view({ text: "a\ntag: yes\u2028kind: bar" }));
    expect(code.split("\n").filter((l) => l !== "")).toHaveLength(2);
    expect(parseViewCode(code).view.tag).toBe("any");
  });
  it("cuts very long search words to the search limit", () => {
    expect(viewToCode(view({ text: "x".repeat(SEARCH_MAX_CHARS + 50) }))).toBe(`VIEW v1\nsearch: ${"x".repeat(SEARCH_MAX_CHARS)}\n`);
  });
});

describe("parseViewCode", () => {
  it("round trips every combination of settings", () => {
    const tags = ["any", "yes", "limited", "no", "designated", "unknown"] as const;
    for (const tag of tags) for (const text of ["", "ramp", "kind:cafe -bar", "“quoted” ; semi : colon"]) {
      const v = view({ tag, text, kind: tag === "yes" ? "cafe" : null, facets: tag === "no" ? { ...EMPTY_FACETS, tier: "0", licence: "ODbL-1.0" } : EMPTY_FACETS });
      if (viewIsEmpty(v)) continue;
      const back = parseViewCode(viewToCode(v));
      expect(back.ok).toBe(true);
      expect(back.view).toEqual(v);
      expect(back.ignored).toEqual([]);
    }
  });
  it("reads a code without the header line", () => {
    const p = parseViewCode("tag: no");
    expect(p.ok).toBe(true);
    expect(p.view.tag).toBe("no");
  });
  it("reads the header and keys without regard to case or spacing", () => {
    const p = parseViewCode("  view V1 \r\n  TAG :  Limited\r\nSearch:   a   b ");
    expect(p.ok).toBe(true);
    expect(p.view).toEqual(view({ tag: "limited", text: "a b" }));
    expect(p.applied).toEqual(["search", "tag"]);
  });
  it("is not ok for an empty paste, a paste that is not a code, another version or nothing usable", () => {
    for (const raw of ["", " \n\n ", "hello there", "VIEW v2\ntag: yes", "VIEW v1\n", "VIEW v1\ntag: purple"]) {
      const p = parseViewCode(raw);
      expect(p.ok, raw).toBe(false);
      expect(p.view, raw).toEqual(EMPTY_VIEW_PARTS);
      expect(p.applied, raw).toEqual([]);
    }
    expect(parseViewCode("VIEW v1\ntag: purple").ignored).toEqual(["tag"]);
    expect(parseViewCode("hello there").ignored).toEqual(["hello there"]);
    expect(parseViewCode("VIEW v2\ntag: yes").ignored).toEqual([]);
  });
  it("lists lines it does not use and keeps the rest", () => {
    const p = parseViewCode("VIEW v1\ntag: yes\ncolour: red\njust words\ntag: no");
    expect(p.ok).toBe(true);
    expect(p.view.tag).toBe("yes");
    expect(p.ignored).toEqual(["colour", "just words", "tag"]);
  });
  it("does not read the typed starting point or the distance band", () => {
    const p = parseViewCode("VIEW v1\nlat: 43.65\nlon: -79.38\nband: 500\ntag: yes");
    expect(p.applied).toEqual(["tag"]);
    expect(p.ignored).toEqual(["lat", "lon", "band"]);
  });
  it("does not trust inherited object keys", () => {
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const p = parseViewCode(`VIEW v1\n${k}: yes\ntag: ${k}`);
      expect(p.ok).toBe(false);
      expect(p.view).toEqual(EMPTY_VIEW_PARTS);
      expect(p.ignored).toEqual([k, "tag"]);
    }
  });
  it("does not count tag: any as a setting, because any is the default", () => {
    const p = parseViewCode("VIEW v1\ntag: any");
    expect(p.ok).toBe(false);
    expect(p.ignored).toEqual(["tag"]);
  });
  it("ignores an empty value and a value that is only spaces", () => {
    const p = parseViewCode("VIEW v1\nsearch:\nkind:   \ntag: yes");
    expect(p.applied).toEqual(["tag"]);
    expect(p.ignored).toEqual(["search", "kind"]);
  });
  it("accepts only facet values the page offers", () => {
    const p = parseViewCode("VIEW v1\nlicence: nonsense\ntier: 99\nage: yesterday\nsource: Somewhere\nlicence: ODbL-1.0");
    expect(p.view.facets).toEqual({ source: "Somewhere", licence: "ODbL-1.0", tier: null, age: null });
    expect(p.ignored).toEqual(["licence", "tier", "age"]);
  });
  it("keeps the token UNKNOWN for an unknown value and never the French word", () => {
    const p = parseViewCode("VIEW v1\ntag: unknown\nlicence: unknown\nkind: UNKNOWN");
    expect(p.view.tag).toBe("unknown");
    expect(p.view.facets.licence).toBe("unknown");
    expect(p.view.kind).toBe("unknown");
    expect(parseViewCode("VIEW v1\ntag: inconnu").ok).toBe(false);
  });
  it("reads a kind the way the pack spells it, with underscores, or with spaces", () => {
    expect(parseViewCode("kind: post_office").view.kind).toBe("post office");
    expect(parseViewCode("kind: Post Office").view.kind).toBe("post office");
  });
  it("leaves fields the code does not set at their defaults", () => {
    expect(parseViewCode("VIEW v1\ntag: no").view).toEqual(view({ tag: "no" }));
  });
  it("reads nothing past the paste limit", () => {
    const p = parseViewCode(`VIEW v1\nsearch: ${"a".repeat(MAX_VIEW_CODE_CHARS + 100)}\ntag: yes`);
    expect(p.view.tag).toBe("any");
    expect(p.view.text).toHaveLength(SEARCH_MAX_CHARS);
  });
  it("reads at most the line limit", () => {
    const lines = Array.from({ length: MAX_VIEW_CODE_LINES + 10 }, (_, i) => `x${i}: a`);
    expect(parseViewCode(`VIEW v1\n${lines.join("\n")}`).ignored).toHaveLength(MAX_VIEW_CODE_LINES);
  });
  it("cuts search words to the search limit", () => {
    expect(parseViewCode(`search: ${"y".repeat(SEARCH_MAX_CHARS + 5)}`).view.text).toHaveLength(SEARCH_MAX_CHARS);
  });
  it("removes control and direction characters from what it reads", () => {
    expect(parseViewCode("VIEW v1\nsearch: a\u0000b\u202ec\u2066d").view.text).toBe("a b c d");
  });
  it("never throws on awkward input", () => {
    for (const raw of ["\u0000", ":", "::::", "search", "search:", ": x", "\n\n:\n", "VIEW", "VIEW v", "ＶＩＥＷ ｖ1", "a".repeat(5000), "tag:\ttag:yes"]) {
      expect(() => parseViewCode(raw)).not.toThrow();
    }
  });
});
