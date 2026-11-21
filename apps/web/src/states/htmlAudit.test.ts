import { describe, expect, it } from "vitest";
import { AccessibilityAuditError, assertAccessibleHtml, auditHtml, decodeEntities, escapeHtml, type HtmlViolationCode } from "./index";

const codes = (html: string, locale: "en" | "fr" = "en"): HtmlViolationCode[] => auditHtml(html, locale).map((v) => v.code);

const OK =
  '<section lang="en" aria-labelledby="a-h" style="color:#1A1A1A;background:#FFFFFF"><h2 id="a-h">Title</h2>' +
  '<button type="button" style="min-width:44px;min-height:44px">Go</button></section>';

describe("auditHtml: a compliant fragment", () => {
  it("passes", () => {
    expect(auditHtml(OK, "en")).toEqual([]);
    expect(() => assertAccessibleHtml(OK, "en")).not.toThrow();
  });
});

describe("auditHtml: violations are reported", () => {
  it("small or unsized targets", () => {
    expect(codes(OK.replace("min-height:44px", "min-height:40px"))).toContain("target-size");
    expect(codes(OK.replace("min-width:44px;min-height:44px", ""))).toContain("target-size");
    expect(codes(OK.replace("<button", "<summary").replace("</button>", "</summary>").replace("min-width:44px;", "").replace("min-height:44px", "min-height:20px"))).toContain("target-size");
  });
  it("a button without a name", () => {
    expect(codes(OK.replace(">Go<", "><span></span><"))).toContain("button-name");
  });
  it("wrong or missing language", () => {
    expect(codes(OK.replace('lang="en"', 'lang="fr"'))).toContain("lang-mismatch");
    expect(codes(OK.replace(' lang="en"', ""))).toContain("lang-mismatch");
  });
  it("region without a name, or with a dangling reference", () => {
    expect(codes(OK.replace(' aria-labelledby="a-h"', ""))).toContain("region-name");
    expect(codes(OK.replace('aria-labelledby="a-h"', 'aria-labelledby="zzz"'))).toContain("dangling-labelledby");
  });
  it("missing heading", () => {
    expect(codes(OK.replace(/<h2[^>]*>Title<\/h2>/, "<p>Title</p>"))).toContain("missing-heading");
  });
  it("images without alt, inline handlers and scripts", () => {
    expect(codes(OK + '<img src="x.png">')).toContain("img-alt");
    expect(codes(OK + '<img src="x.png" alt="">')).not.toContain("img-alt");
    expect(codes(OK.replace("<button", '<button onclick="x()"'))).toContain("inline-script");
    expect(codes(OK + "<script>1</script>")).toContain("inline-script");
  });
  it("low contrast", () => {
    expect(codes(OK.replace("color:#1A1A1A;background:#FFFFFF", "color:#999999;background:#FFFFFF"))).toContain("contrast");
    expect(codes(OK.replace("color:#1A1A1A", "color:red"))).toContain("contrast");
  });
  it("duplicate ids", () => {
    expect(codes(OK + '<p id="a-h">x</p>')).toContain("duplicate-id");
  });
  it("prohibited wording in text and aria-labels", () => {
    expect(codes(OK.replace(">Title<", ">Verified access<"))).toContain("copy");
    expect(codes(OK.replace('lang="en"', 'lang="en" aria-label="Real-time map"'))).toContain("copy");
    expect(codes(OK.replace(">Title<", ">Live in partnership<"))).toContain("copy");
  });
  it("French typography errors", () => {
    const fr = OK.replace('lang="en"', 'lang="fr"').replace(">Title<", ">Source: l'App<");
    const found = auditHtml(fr, "fr").filter((v) => v.code === "copy").map((v) => v.detail).join("|");
    expect(found).toContain("straight-apostrophe");
    expect(found).toContain("punctuation-spacing");
  });
  it("inferred accessibility", () => {
    expect(codes(OK.replace(">Title<", ">Probably accessible<"))).toContain("inferred-accessibility");
    expect(codes(OK.replace(">Title<", ">Probablement accessible<"), "en")).toContain("inferred-accessibility");
  });
  it("assertAccessibleHtml throws with every violation listed", () => {
    expect(() => assertAccessibleHtml(OK.replace('lang="en"', ""), "en")).toThrow(AccessibilityAuditError);
    try {
      assertAccessibleHtml(OK.replace(">Title<", ">Verified<").replace("min-height:44px", ""), "en");
    } catch (e) {
      expect((e as AccessibilityAuditError).violations.map((v) => v.code)).toEqual(expect.arrayContaining(["copy", "target-size"]));
    }
  });
});

describe("html helpers", () => {
  it("escapes and decodes round-trip", () => {
    const s = `<a href="x">Tom & 'Jerry'</a>`;
    expect(escapeHtml(s)).not.toMatch(/[<>"]/);
    expect(decodeEntities(escapeHtml(s))).toBe(s);
  });
});
