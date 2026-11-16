import { describe, expect, it } from "vitest";
import { auditDocument, extractTexts, type ViolationCode } from "./htmlAudit";

const GOOD =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>Page</title><style>body{margin:0}</style></head><body><main><h1>Heading</h1><p>Text</p></main></body></html>";

const codes = (html: string): ViolationCode[] => auditDocument(html).map((v) => v.code);

describe("auditDocument", () => {
  it("accepts a complete offline page", () => {
    expect(auditDocument(GOOD)).toEqual([]);
  });
  const mutations: ReadonlyArray<[string, string, ViolationCode]> = [
    ["no doctype", GOOD.replace("<!doctype html>", ""), "missing-doctype"],
    ["no lang", GOOD.replace(' lang="en"', ""), "missing-lang"],
    ["no title", GOOD.replace("<title>Page</title>", ""), "missing-title"],
    ["an empty title", GOOD.replace("<title>Page</title>", "<title> </title>"), "missing-title"],
    ["no charset", GOOD.replace('<meta charset="utf-8">', ""), "missing-charset"],
    ["no viewport", GOOD.replace(/<meta name="viewport"[^>]*>/, ""), "missing-viewport"],
    ["no main", GOOD.replace("<main>", "<div>").replace("</main>", "</div>"), "main-count"],
    ["two mains", GOOD.replace("</main>", "</main><main>x</main>"), "main-count"],
    ["no h1", GOOD.replace("<h1>Heading</h1>", "<h2>Heading</h2>"), "h1-count"],
    ["two h1", GOOD.replace("</main>", "<h1>Two</h1></main>"), "h1-count"],
    ["a script", GOOD.replace("</body>", "<script>var a=1</script></body>"), "script-in-document"],
    ["a stylesheet link", GOOD.replace("</head>", '<link rel="stylesheet" href="s.css"></head>'), "external-resource"],
    ["a style import", GOOD.replace("body{margin:0}", '@import "x.css";body{margin:0}'), "external-resource"],
    ["a style url()", GOOD.replace("body{margin:0}", "body{background:url(x.png)}"), "external-resource"],
    ["an outside link", GOOD.replace("<p>Text</p>", '<p><a href="https://example.net/">x</a></p>'), "external-url"],
    ["an image without alt", GOOD.replace("<p>Text</p>", '<img src="data:image/png;base64,AA==">'), "img-no-alt"],
    ["a heading skip", GOOD.replace("<p>Text</p>", "<h3>Skipped</h3>"), "heading-skip"],
  ];
  it.each(mutations)("catches %s", (_n, html, code) => {
    expect(codes(html)).toContain(code);
  });
  it("does not ask a saved page for inline target sizes by default", () => {
    expect(codes(GOOD.replace("<p>Text</p>", '<p><a href="#a">x</a></p><span id="a"></span>'))).not.toContain("target-size-unknown");
  });
});

describe("extractTexts", () => {
  it("returns visible text and text attributes, but not scripts or styles", () => {
    const t = extractTexts(
      '<!doctype html><html lang="en"><head><title>T</title><style>p{color:red}</style></head><body><p>Hello &amp; welcome</p>' +
        '<button aria-label="Close it" title="Tip">x</button><img alt="A picture" src="data:,"><script>var secret=1</script></body></html>',
    );
    expect(t).toEqual(expect.arrayContaining(["Hello & welcome", "Close it", "Tip", "A picture", "x", "T"]));
    expect(t.join(" ")).not.toMatch(/secret|color:red/);
  });
  it("returns nothing for empty markup", () => {
    expect(extractTexts("")).toEqual([]);
  });
});
