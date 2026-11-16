import { describe, expect, it } from "vitest";
import { assertAccessibleHtml, auditHtml, formatViolations, normalizeName, parseStyle } from "./htmlAudit";

const BTN = 'style="min-width:44px;min-height:44px"';
const codes = (html: string, o = {}): string[] => auditHtml(html, o).map((v) => v.code);

describe("a clean fragment", () => {
  const good =
    `<section lang="en" aria-labelledby="t"><h2 id="t">Title</h2>` +
    `<button type="button" ${BTN}>Go</button>` +
    `<table><caption>Things</caption><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>` +
    `<fieldset><legend>Language</legend><label style="min-width:44px;min-height:44px"><input type="radio" name="l" value="en">English</label></fieldset>` +
    `</section>`;
  it("has no violations", () => {
    expect(auditHtml(good)).toEqual([]);
    expect(() => assertAccessibleHtml(good)).not.toThrow();
  });
});

describe("structure", () => {
  it("flags a missing or invalid lang", () => {
    expect(codes("<div>x</div>")).toContain("missing-lang");
    expect(codes('<div lang="english now">x</div>')).toContain("bad-lang");
    expect(codes("<div>x</div>", { requireLang: false })).not.toContain("missing-lang");
  });
  it("flags duplicate ids and dangling references", () => {
    expect(codes('<div lang="en"><p id="a">x</p><p id="a">y</p></div>')).toContain("duplicate-id");
    const c = codes('<div lang="en" aria-labelledby="nope" aria-describedby="nada">x</div>');
    expect(c.filter((x) => x === "dangling-reference")).toHaveLength(2);
    expect(codes('<div lang="en"><label for="x">a</label></div>')).toContain("dangling-reference");
  });
  it("flags unbalanced markup", () => {
    expect(codes('<div lang="en"><p>x</div>')).toContain("malformed-html");
    expect(codes('<div lang="en">x</div></span>')).toContain("malformed-html");
    expect(codes('<div lang="en"><p>x')).toContain("malformed-html");
  });
  it("accepts void and self-closed elements", () => {
    expect(codes('<div lang="en"><br><img alt="" src="a.png"><input type="hidden" name="x"/></div>')).toEqual([]);
  });
  it("flags heading skips and empty headings", () => {
    expect(codes('<div lang="en"><h2>a</h2><h4>b</h4></div>')).toContain("heading-skip");
    expect(codes('<div lang="en"><h2>a</h2><h3>b</h3><h2>c</h2></div>')).not.toContain("heading-skip");
    expect(codes('<div lang="en"><h2> </h2></div>')).toContain("empty-heading");
  });
  it("flags tables without caption, header or scope", () => {
    expect(codes('<table lang="en"><tr><td>1</td></tr></table>')).toEqual(
      expect.arrayContaining(["table-no-caption", "table-no-header"]),
    );
    expect(codes('<table lang="en"><caption>c</caption><tr><th>h</th></tr></table>')).toContain("th-no-scope");
  });
  it("flags a fieldset without a legend and a nameless region", () => {
    expect(codes('<fieldset lang="en"><input type="radio" aria-label="a" style="width:44px;height:44px"></fieldset>')).toContain(
      "fieldset-no-legend",
    );
    expect(codes('<div lang="en" role="region">x</div>')).toContain("region-no-name");
    expect(codes('<div lang="en" role="region" aria-label="Notes">x</div>')).not.toContain("region-no-name");
  });
  it("flags images without alt", () => {
    expect(codes('<img lang="en" src="a.png">')).toContain("img-no-alt");
  });
});

describe("names", () => {
  it("flags a button with no accessible name, and accepts aria-label or text", () => {
    expect(codes(`<button lang="en" ${BTN}></button>`)).toContain("button-no-name");
    expect(codes(`<button lang="en" aria-label="Close" ${BTN}></button>`)).not.toContain("button-no-name");
    expect(codes(`<button lang="en" ${BTN}>Close</button>`)).not.toContain("button-no-name");
  });
  it("flags an unlabelled input and accepts wrapper, for= and aria-label", () => {
    const s = 'style="min-width:44px;min-height:44px"';
    expect(codes(`<div lang="en"><input type="text" ${s}></div>`)).toContain("input-no-name");
    expect(codes(`<label lang="en" ${s}>Name<input type="text"></label>`)).not.toContain("input-no-name");
    expect(codes(`<div lang="en"><label for="n">Name</label><input id="n" type="text" ${s}></div>`)).not.toContain("input-no-name");
    expect(codes(`<div lang="en"><input type="text" aria-label="Name" ${s}></div>`)).not.toContain("input-no-name");
  });
  it("flags an aria-label that does not contain the visible text (Label in Name)", () => {
    expect(codes(`<button lang="en" aria-label="Submit" ${BTN}>Send</button>`)).toContain("label-not-in-name");
    expect(codes(`<button lang="en" aria-label="Send: report" ${BTN}>Send</button>`)).not.toContain("label-not-in-name");
    expect(codes(`<button lang="en" aria-label="Autoriser\u00a0: lieux" ${BTN}>Autoriser</button>`)).not.toContain("label-not-in-name");
  });
  it("normalizeName ignores case, punctuation and the French spaces", () => {
    expect(normalizeName("Où\u202f?")).toBe("où");
    expect(normalizeName("A\u00a0:  B")).toBe("a b");
  });
});

describe("targets", () => {
  it("flags a target below 44 px and one with unknown size", () => {
    expect(codes('<button lang="en" style="min-width:40px;min-height:44px">Go</button>')).toContain("target-too-small");
    expect(codes('<button lang="en" style="width:44px;height:30px">Go</button>')).toContain("target-too-small");
    expect(codes('<button lang="en">Go</button>')).toContain("target-size-unknown");
  });
  it("accepts exactly 44 px, either by minimum or by size", () => {
    expect(codes(`<button lang="en" ${BTN}>Go</button>`)).toEqual([]);
    expect(codes('<button lang="en" style="width:44px;height:44px">Go</button>')).toEqual([]);
  });
  it("can be told not to require declared sizes, but still catches a declared small one", () => {
    expect(codes('<button lang="en">Go</button>', { requireTargetSize: false })).toEqual([]);
    expect(codes('<button lang="en" style="width:10px;height:10px">Go</button>', { requireTargetSize: false })).toContain(
      "target-too-small",
    );
  });
  it("judges a radio by its wrapping label", () => {
    const small = '<label lang="en" style="width:20px;height:20px"><input type="radio">A</label>';
    expect(codes(small)).toContain("target-too-small");
  });
  it("honours a different minimum", () => {
    expect(codes('<button lang="en" style="width:24px;height:24px">Go</button>', { minTargetPx: 24 })).toEqual([]);
  });
  it("does not count a hidden input as a target", () => {
    expect(codes('<div lang="en"><input type="hidden" name="a" value="b"></div>')).toEqual([]);
  });
  it("parseStyle reads declarations", () => {
    expect(parseStyle("Min-Width: 44px; min-height:44px;")).toEqual({ "min-width": "44px", "min-height": "44px" });
    expect(parseStyle(undefined)).toEqual({});
  });
});

describe("behaviour and egress", () => {
  it("flags positive tabindex and focusable aria-hidden", () => {
    expect(codes(`<button lang="en" tabindex="2" ${BTN}>Go</button>`)).toContain("positive-tabindex");
    expect(codes(`<button lang="en" aria-hidden="true" ${BTN}>Go</button>`)).toContain("hidden-focusable");
    expect(codes('<div lang="en" tabindex="-1">x</div>')).toEqual([]);
  });
  it("flags invalid aria-pressed values", () => {
    expect(codes(`<button lang="en" aria-pressed="yes" ${BTN}>Go</button>`)).toContain("bad-aria-value");
    expect(codes(`<button lang="en" aria-pressed="mixed" ${BTN}>Go</button>`)).toEqual([]);
    expect(codes(`<button lang="en" aria-expanded="mixed" ${BTN}>Go</button>`)).toContain("bad-aria-value");
  });
  it("flags inline event handlers", () => {
    expect(codes(`<button lang="en" onclick="x()" ${BTN}>Go</button>`)).toContain("inline-handler");
  });
  it("flags external URLs unless the host is allowed, and any javascript: URL", () => {
    const a = '<a lang="en" href="https://cdn.example.net/x" style="min-width:44px;min-height:44px">x</a>';
    expect(codes(a)).toContain("external-url");
    expect(codes(a, { allowedHosts: ["cdn.example.net"] })).not.toContain("external-url");
    expect(codes('<img lang="en" alt="" src="//tiles.example.org/1.png">')).toContain("external-url");
    expect(codes('<a lang="en" href="javascript:void(0)" style="width:44px;height:44px">x</a>')).toContain("javascript-url");
    expect(codes('<img lang="en" alt="" src="/local.png">')).toEqual([]);
  });
  it("flags target=_blank without noopener", () => {
    const a = (rel: string): string =>
      `<a lang="en" href="/x" target="_blank"${rel} style="min-width:44px;min-height:44px">x</a>`;
    expect(codes(a(""))).toContain("target-blank-no-rel");
    expect(codes(a(' rel="noopener noreferrer"'))).toEqual([]);
  });
});

describe("reporting", () => {
  it("gives each violation a path to the element", () => {
    const v = auditHtml('<div lang="en"><p>x</p><button>Go</button></div>');
    expect(v[0]?.path).toBe("div[1]>button[1]");
  });
  it("assertAccessibleHtml lists every violation", () => {
    expect(() => assertAccessibleHtml("<button>x</button>")).toThrow(/missing-lang[\s\S]*target-size-unknown/);
    expect(formatViolations(auditHtml("<button>x</button>"))).toContain("button[1]");
  });
  it("decodes entities before judging text", () => {
    expect(codes(`<button lang="en" ${BTN}>&lt;Go&gt;</button>`)).toEqual([]);
  });
});
