import { describe, expect, it } from "vitest";
import { HOSTILE, MARK, checkEscaped, escapedForm, unknownTags } from "./dgHostile";

describe("HOSTILE", () => {
  it("has ten texts, named once each", () => {
    expect(HOSTILE).toHaveLength(10);
    expect(new Set(HOSTILE.map((h) => h.name)).size).toBe(10);
  });
  it("puts the mark in every text, so a check can see that it was shown", () => {
    for (const h of HOSTILE) expect(h.text, h.name).toContain(MARK);
  });
  it("gives every text with a tag or a quote at least one raw marker that its own text holds", () => {
    for (const h of HOSTILE.filter((x) => /[<"']/.test(x.text) && x.name !== "a template expression")) {
      expect(h.rawMarkers.length, h.name).toBeGreaterThan(0);
    }
  });
});

describe("escapedForm", () => {
  it("escapes the five characters", () => expect(escapedForm(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"));
  it("escapes an ampersand first, so an entity is not left half done", () => expect(escapedForm("&lt;")).toBe("&amp;lt;"));
  it("leaves other text alone", () => expect(escapedForm("plain text 1 + 1")).toBe("plain text 1 + 1"));
  it("is the same for every hostile text, whatever it holds", () => {
    for (const h of HOSTILE) expect(escapedForm(h.text)).not.toMatch(/[<>"']/);
  });
});

describe("checkEscaped", () => {
  it("finds nothing when the text is shown, escaped", () => {
    for (const h of HOSTILE) expect(checkEscaped(`<div>${escapedForm(h.text)}</div>`, h), h.name).toEqual([]);
  });
  it("finds a text that is written as it is, with the markers it holds", () => {
    const h = HOSTILE[0]!;
    const r = checkEscaped(`<div>${h.text}</div>`, h).map((x) => x.problem);
    expect(r[0]).toBe("the text is written as it is, without escaping");
    expect(r).toContain('the markup holds "<b id="');
  });
  it("does not call a text unescaped when it holds nothing to escape", () => expect(checkEscaped(`<p>${HOSTILE[9]!.text}</p>`, HOSTILE[9]!)).toEqual([]));
  it("finds a text that is not shown at all", () => expect(checkEscaped("<div></div>", HOSTILE[0]!)).toEqual([{ hostile: "a tag", problem: "the text is not shown at all" }]));
  it("finds a raw marker even when the whole text is not there", () => {
    const h = HOSTILE[1]!;
    const r = checkEscaped(`<p>${MARK}<img src=y></p>`, h).map((x) => x.problem);
    expect(r).toEqual(['the markup holds "<img"']);
  });
  it("names the hostile text in each finding", () => expect(checkEscaped("", HOSTILE[2]!).every((x) => x.hostile === "a script")).toBe(true));
});

describe("unknownTags", () => {
  const known = new Set(["div", "p", "h2", "button"]);
  it("lists the tags that are not known, once each and in order, in any case", () => expect(unknownTags("<div><B>x</B><img src=y><IMG><p>", known)).toEqual(["b", "img"]));
  it("reads a closing tag and a tag with a hyphen", () => expect(unknownTags("</span><my-tag>", known)).toEqual(["my-tag", "span"]));
  it("is empty when every tag is known, and for text with no tag", () => {
    expect(unknownTags("<div><p>x</p></div>", known)).toEqual([]);
    expect(unknownTags("a < b and c > d", known)).toEqual([]);
  });
});
