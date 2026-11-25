import { describe, expect, it } from "vitest";
import { configFile, options, withManifest } from "./pwaFixture";
import { compareHead, readAttributes, readPageHead, stripHtmlComments, type PageHead } from "./pwaHtml";
import { parsePwaConfig } from "./pwaModel";

const page = (head: string, lang = "en"): string => `<!doctype html>\n<html lang="${lang}">\n<head>\n${head}\n</head>\n<body></body>\n</html>\n`;
const GOOD_HEAD = `<meta charset="utf-8" />\n<meta name="theme-color" content="#083734" />\n<link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n<title>the App</title>`;
const head = (): PageHead => readPageHead(page(GOOD_HEAD));
const config = (text = configFile()) => parsePwaConfig("v.ts", text);

describe("readAttributes", () => {
  it.each([
    ['a="1" b=\'2\' c=3', [["a", "1"], ["b", "2"], ["c", "3"]]],
    ['A="x"', [["a", "x"]]],
    ['a = "x y"', [["a", "x y"]]],
    ['a="1" a="2"', [["a", "1"]]],
    ['data-x="1" aria-label="L"', [["data-x", "1"], ["aria-label", "L"]]],
    ['a=""', [["a", ""]]],
    ["hidden", []],
  ])("reads %s", (s, pairs) => expect([...readAttributes(s)]).toEqual(pairs));
});

describe("stripHtmlComments", () => {
  it.each([
    ["a<!-- b -->c", "ac"],
    ["<!--a--><!--b-->c", "c"],
    ["a<!-- b", "a"],
    ["a<!--b-->c<!--d-->e", "ace"],
    ["no comment", "no comment"],
    ["", ""],
  ])("%j gives %j", (s, out) => expect(stripHtmlComments(s)).toBe(out));
});

describe("readPageHead", () => {
  it("reads the language, the colour, the title and the icon of the good head", () => {
    expect(head()).toEqual({ lang: "en", themeColor: "#083734", title: "the App", icons: ["/favicon.svg"], themeColorTags: 1 });
  });
  it("reads nothing from a page with none of them", () => expect(readPageHead("<p>hello</p>")).toEqual({ lang: null, themeColor: null, title: null, icons: [], themeColorTags: 0 }));
  it("reads nothing from text that is not a page", () => expect(readPageHead("")).toEqual({ lang: null, themeColor: null, title: null, icons: [], themeColorTags: 0 }));
  it("does not read a tag that is in a comment", () => {
    const h = readPageHead(page(`<!-- <meta name="theme-color" content="#000000"> --><title>t</title>`));
    expect(h.themeColor).toBeNull();
    expect(h.themeColorTags).toBe(0);
  });
  it("takes the first of two theme-color tags and counts both", () => {
    const h = readPageHead(page(`<meta name="theme-color" content="#111111"><meta name="theme-color" content="#222222" media="(prefers-color-scheme: dark)">`));
    expect(h.themeColor).toBe("#111111");
    expect(h.themeColorTags).toBe(2);
  });
  it("reads the tag names in any case", () => expect(readPageHead(`<HTML LANG="fr"><META NAME="Theme-Color" CONTENT="#abcdef"><TITLE> T </TITLE>`)).toMatchObject({ lang: "fr", themeColor: "#abcdef", title: "T" }));
  it("reads a title that runs over lines, trimmed", () => expect(readPageHead("<title>\n  the App\n</title>").title).toBe("the App"));
  it("reads every icon link, whatever the order of its attributes, and the apple icon", () => {
    const h = readPageHead(page(`<link href="/a.png" rel="shortcut icon"><link rel="apple-touch-icon" href="/b.png"><link rel="stylesheet" href="/c.css"><link rel="icon">`));
    expect(h.icons).toEqual(["/a.png", "/b.png"]);
  });
  it("reads a meta tag that is not the colour as nothing", () => expect(readPageHead(`<meta name="viewport" content="width=device-width">`).themeColor).toBeNull());
  it("reads the real language of the first html tag only", () => expect(readPageHead(`<html lang="en"><html lang="fr">`).lang).toBe("en"));
  it("reads an html tag with no lang as null", () => expect(readPageHead("<html>").lang).toBeNull());
  it("does not decode a character reference", () => expect(readPageHead("<title>A &amp; B</title>").title).toBe("A &amp; B"));
  it("does not throw on odd text", () => {
    for (const s of ["<", "<html", "<meta name=", "<title>", "<!--", "<link rel=\"icon\" href=", "<<>>", "<meta name='theme-color' content=>"]) expect(() => readPageHead(s)).not.toThrow();
  });
});

describe("compareHead", () => {
  it("has no difference when the head and the manifest agree", () => expect(compareHead(config(), head())).toEqual([]));

  it("finds a colour that differs, in any letter case it is not", () => {
    expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace("#083734", "#000000"))))).toEqual([
      { code: "head-theme-differs", key: "theme-color", detail: "the page says #000000; the manifest says #083734" },
    ]);
    expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace("#083734", "#083734".toUpperCase()))))).toEqual([]);
  });
  it("finds no colour tag in the page", () => expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace(/<meta name="theme-color"[^>]*>\n/, ""))))[0]?.detail).toBe("the page has no theme-color tag; the manifest has one"));
  it("finds two colour tags", () => {
    const p = compareHead(config(), readPageHead(page(`${GOOD_HEAD}\n<meta name="theme-color" content="#083734" media="(prefers-color-scheme: dark)">`)));
    expect(p.map((x) => x.detail)).toEqual(["the page has 2 theme-color tags"]);
  });
  it("finds a language that differs, comparing the language and not the region", () => {
    expect(compareHead(config(), readPageHead(page(GOOD_HEAD, "fr"))).map((x) => x.code)).toEqual(["head-lang-differs"]);
    expect(compareHead(config(), readPageHead(page(GOOD_HEAD, "en-CA")))).toEqual([]);
    expect(compareHead(config(), readPageHead(page(GOOD_HEAD, "EN")))).toEqual([]);
  });
  it("finds a page with no language", () => expect(compareHead(config(), readPageHead(GOOD_HEAD))[0]?.detail).toBe("the page has no lang; the manifest has one"));
  it("finds a title that is not the name", () => expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace("the App", "Other"))))[0]).toEqual({ code: "head-title-differs", key: "title", detail: '(the page title is "Other"; the manifest name is "the App")'.slice(1, -1) }));
  it("does not judge a page with no title", () => expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace("<title>the App</title>", ""))))).toEqual([]));
  it("finds an icon that is not among the kept files", () => {
    const p = compareHead(config(), readPageHead(page(`${GOOD_HEAD}\n<link rel="apple-touch-icon" href="/icons/apple.png">`)));
    expect(p).toEqual([{ code: "head-icon-not-kept", key: "icons/apple.png", detail: "the page icon icons/apple.png is not in includeAssets" }]);
  });
  it("takes a query or a fragment off an icon address", () => expect(compareHead(config(), readPageHead(page(GOOD_HEAD.replace("/favicon.svg", "/favicon.svg?v=2#x"))))).toEqual([]));
  it("finds an icon at another address", () => {
    const p = compareHead(config(), readPageHead(page(GOOD_HEAD.replace("/favicon.svg", "https://cdn.example.org/f.svg"))));
    expect(p.map((x) => x.code)).toEqual(["head-icon-not-kept"]);
    expect(p[0]?.detail).toContain("another address");
  });
  it("does not judge the icon when the kept files are not a plain list", () => {
    expect(compareHead(config(configFile(options({ includeAssets: "assets" }))), readPageHead(page(`${GOOD_HEAD}\n<link rel="icon" href="/other.png">`)))).toEqual([]);
  });
  it("does not judge anything when the manifest is not written out", () => expect(compareHead(config(configFile(options({ manifest: "m()" }))), readPageHead(page("", "zz")))).toEqual([]));
  it("does not judge a colour, a language or a name that is not a plain value", () => {
    const c = config(withManifest("theme_color: \"#083734\"", "theme_color: color").replace("lang: \"en\"", "lang: language").replace('name: "the App"', "name: appName"));
    expect(compareHead(c, readPageHead(page(GOOD_HEAD.replace("#083734", "#000000"), "fr")))).toEqual([]);
  });
  it("gives the problems in key order", () => {
    const p = compareHead(config(), readPageHead(page(GOOD_HEAD.replace("#083734", "#000000").replace("the App", "Other"), "fr")));
    expect(p.map((x) => x.key)).toEqual(["lang", "theme-color", "title"]);
  });
});
