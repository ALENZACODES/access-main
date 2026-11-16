import { describe, expect, it } from "vitest";
import { auditHtml, auditPage, type HtmlViolationCode } from "./index";

const codes = (html: string): HtmlViolationCode[] => auditHtml(html, "en").map((v) => v.code);
const S = "min-width:44px;min-height:44px";
const wrap = (inner: string): string => `<section lang="en" aria-labelledby="s-h"><h2 id="s-h">T</h2>${inner}</section>`;

describe("auditHtml: forms", () => {
  const input = `<label for="n">Name</label><input id="n" name="n" style="${S}">`;
  it("accepts a labelled, sized input", () => expect(auditHtml(wrap(input), "en")).toEqual([]));
  it("flags inputs without a label, id, or size", () => {
    expect(codes(wrap(`<input id="n" style="${S}">`))).toContain("form-label");
    expect(codes(wrap(`<label for="n">Name</label><input name="n" style="${S}">`))).toContain("form-label");
    expect(codes(wrap(`<label for="n">Name</label><input id="n" style="min-height:30px">`))).toContain("target-size");
    expect(codes(wrap(`<label for="s">S</label><select id="s" style="min-height:20px"></select>`))).toContain("target-size");
    expect(codes(wrap(`<label for="t">T</label><textarea id="t"></textarea>`))).toContain("target-size");
  });
  it("ignores hidden inputs", () => expect(auditHtml(wrap(`<input type="hidden" name="x" value="1">`), "en")).toEqual([]));
  it("requires 44px width on checkboxes and radios", () => {
    expect(codes(wrap(`<label for="c">C</label><input id="c" type="checkbox" style="min-height:44px">`))).toContain("target-size");
    expect(codes(wrap(`<label for="c">C</label><input id="c" type="radio" style="${S}">`))).not.toContain("target-size");
  });
  it("requires aria-invalid fields to point at an existing error", () => {
    const base = (attrs: string, extra = "") => wrap(`<label for="n">N</label><input id="n" ${attrs} style="${S}">${extra}`);
    expect(codes(base('aria-invalid="true"'))).toContain("error-association");
    expect(codes(base('aria-invalid="true" aria-describedby="missing"'))).toContain("error-association");
    expect(codes(base('aria-invalid="true" aria-describedby="n-err"', '<p id="n-err">Bad</p>'))).not.toContain("error-association");
  });
});

describe("auditHtml: links and tables", () => {
  it("flags links that are small, empty or without href", () => {
    expect(codes(wrap(`<a href="/x">Go</a>`))).toContain("target-size");
    expect(codes(wrap(`<a href="/x" style="min-height:44px"></a>`))).toContain("link-name");
    expect(codes(wrap(`<a style="min-height:44px">Go</a>`))).toContain("link-name");
    expect(auditHtml(wrap(`<a href="/x" style="min-height:44px">Go</a>`), "en")).toEqual([]);
  });
  it("requires a caption and scoped headers on tables", () => {
    expect(codes(wrap(`<table><tr><td>x</td></tr></table>`))).toContain("table-structure");
    expect(codes(wrap(`<table><caption>c</caption><tr><th>h</th></tr></table>`))).toContain("table-structure");
    expect(auditHtml(wrap(`<table><caption>c</caption><tr><th scope="col">h</th></tr></table>`), "en")).toEqual([]);
  });
  it("does not lint the text of <style> blocks", () => {
    expect(auditHtml(wrap("") + "<style>a:hover{color:red}</style>", "fr").filter((v) => v.code === "copy")).toEqual([]);
  });
});

describe("auditPage", () => {
  const good =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title><style>:focus-visible{outline:3px solid #0B4F9E}</style></head>` +
    `<body><a href="#main" style="min-height:44px">Skip</a><nav aria-label="Main"></nav><main id="main"><h1>T</h1></main></body></html>`;
  const detail = (html: string): string => auditPage(html, "en").filter((v) => v.code === "page-structure").map((v) => v.detail).join("|");

  it("accepts a well-formed page", () => expect(auditPage(good, "en")).toEqual([]));
  it.each([
    ["doctype", good.replace("<!doctype html>", ""), /doctype/],
    ["html lang", good.replace('<html lang="en">', '<html lang="fr">'), /lang/],
    ["title", good.replace("<title>T</title>", "<title> </title>"), /title/],
    ["main", good.replace("<main", "<div").replace("</main>", "</div>"), /main/],
    ["two mains", good.replace("</main>", "</main><main>"), /main/],
    ["h1", good.replace("<h1>T</h1>", ""), /h1/],
    ["skip link", good.replace('href="#main"', 'href="/x"'), /skip link/],
    ["nav label", good.replace(' aria-label="Main"', ""), /nav/],
    ["viewport", good.replace(/<meta name="viewport"[^>]*>/, ""), /viewport/],
    ["zoom lock", good.replace("initial-scale=1", "user-scalable=no"), /zoom/],
    ["max scale", good.replace("initial-scale=1", "maximum-scale=1"), /zoom/],
    ["focus style", good.replace(":focus-visible{outline:3px solid #0B4F9E}", ""), /focus-visible/],
  ])("flags %s", (_n, html, re) => expect(detail(html)).toMatch(re));
  it("allows a maximum-scale of 5", () => expect(auditPage(good.replace("initial-scale=1", "maximum-scale=5"), "en")).toEqual([]));
});

describe("auditHtml: scripts and third-party resources", () => {
  const w = (inner: string) => wrap(inner);
  it("allows an external same-origin script and nothing inline", () => {
    expect(auditHtml(w('<script src="/register-sw.js" defer></script>'), "en")).toEqual([]);
  });
  it("flags inline scripts, event handlers and scripts from elsewhere", () => {
    expect(codes(w("<script>alert(1)</script>"))).toContain("inline-script");
    expect(codes(w('<script src="/ok.js">alert(1)</script>'))).toContain("inline-script");
    expect(codes(w('<script src="//cdn.example/x.js"></script>'))).toContain("third-party-resource");
    expect(codes(w('<script src="https://cdn.example/x.js"></script>'))).toContain("third-party-resource");
    expect(codes(w('<script src="x.js"></script>'))).toContain("inline-script");
    expect(codes(w(`<button onclick="x()" style="${S}">Go</button>`))).toContain("inline-script");
  });
  it("flags map tiles, fonts, frames and tracking pixels loaded from other origins", () => {
    for (const tag of [
      '<img src="https://tile.example/1/2/3.png" alt="">',
      '<img srcset="//tile.example/a.png 1x" alt="">',
      '<link rel="stylesheet" href="https://fonts.example/css">',
      '<iframe src="https://maps.example/embed"></iframe>',
      '<source src="http://cdn.example/v.mp4">',
      '<form action="https://other.example/post"></form>',
    ]) expect(codes(w(tag)), tag).toContain("third-party-resource");
  });
  it("allows same-origin resources and ordinary outbound links", () => {
    expect(auditHtml(w('<img src="/a.png" alt=""><link rel="manifest" href="/manifest.webmanifest"><form action="/x"></form>'), "en")).toEqual([]);
    expect(auditHtml(w('<a href="https://www.openstreetmap.org/copyright" style="min-height:44px">OSM</a>'), "en")).toEqual([]);
  });
});
