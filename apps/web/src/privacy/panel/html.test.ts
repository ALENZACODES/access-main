import { describe, expect, it } from "vitest";
import { button, esc, isSingular, TARGET_PX } from "./html";

describe("html helpers", () => {
  it("escapes the five characters that matter in text and attributes", () => {
    expect(esc(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
  it("escapes ampersands first so entities are not double-decoded", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
  });
  it("builds a 44 px button and escapes its label and action", () => {
    const b = button('a"b', "<Go>");
    expect(TARGET_PX).toBe(44);
    expect(b).toContain('data-action="a&quot;b"');
    expect(b).toContain("&lt;Go&gt;");
    expect(b).toContain("min-width:44px;min-height:44px");
    expect(b).toContain('type="button"');
  });
  it("applies English and French plural rules", () => {
    expect([0, 1, 2].map((n) => isSingular("en", n))).toEqual([false, true, false]);
    expect([0, 1, 2].map((n) => isSingular("fr", n))).toEqual([true, true, false]);
  });
});
