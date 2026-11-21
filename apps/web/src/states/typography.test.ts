import { describe, expect, it } from "vitest";
import { NBSP, NNBSP, frTypography, lintFrench, t } from "./index";

describe("frTypography", () => {
  it("curls apostrophes", () => {
    expect(frTypography("l'App")).toBe("l’App");
  });
  it("puts U+00A0 before a colon", () => {
    expect(frTypography("Source: X")).toBe(`Source${NBSP}: X`);
    expect(frTypography("Source : X")).toBe(`Source${NBSP}: X`);
  });
  it("puts U+202F before ; ! ?", () => {
    expect(frTypography("Quoi ?")).toBe(`Quoi${NNBSP}?`);
    expect(frTypography("Oui!")).toBe(`Oui${NNBSP}!`);
    expect(frTypography("a; b")).toBe(`a${NNBSP}; b`);
  });
  it("puts U+202F inside guillemets", () => {
    expect(frTypography("« bonjour »")).toBe(`«${NNBSP}bonjour${NNBSP}»`);
    expect(frTypography("«bonjour»")).toBe(`«${NNBSP}bonjour${NNBSP}»`);
  });
  it("leaves times and URLs alone", () => {
    expect(frTypography("à 10:30")).toBe("à 10:30");
    expect(frTypography("https://example.org")).toBe("https://example.org");
  });
  it("is idempotent", () => {
    const samples = ["Source : X ; Y ! Z ? « a »", "l'App: 10:30 https://a.b", "Déjà propre"];
    for (const s of samples) expect(frTypography(frTypography(s))).toBe(frTypography(s));
  });
  it("does not add a space when the mark starts the string", () => {
    expect(frTypography("?")).toBe("?");
  });
});

describe("lintFrench", () => {
  it("accepts clean text", () => {
    expect(lintFrench(frTypography("Source : X ; l'App"))).toEqual([]);
  });
  it("flags straight apostrophes and spacing", () => {
    expect(lintFrench("l'App")).toContain("straight-apostrophe");
    expect(lintFrench("Source: X")).toContain("punctuation-spacing");
    expect(lintFrench("Quoi ?")).toContain("punctuation-spacing");
  });
});

describe("t", () => {
  it("returns English untouched and French normalised", () => {
    expect(t("en", "Source: X", "Source : X")).toBe("Source: X");
    expect(t("fr", "Source: X", "Source : X")).toBe(`Source${NBSP}: X`);
  });
});
