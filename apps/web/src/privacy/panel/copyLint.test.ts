import { describe, expect, it } from "vitest";
import { lintCopy, lintTable } from "./copyLint";

const codes = (loc: "en" | "fr", t: string): string[] => lintCopy(loc, t).map((i) => i.code);

describe("lintCopy banned terms", () => {
  it.each([
    "Verified by our team",
    "Updated in real-time",
    "Real time updates",
    "In partnership with a group",
    "A certified tool",
    "AAA conformant",
    "Powered by AI",
    "You may be eligible",
  ])("flags %s in English", (t) => {
    expect(codes("en", t)).toContain("banned-term");
  });
  it.each([
    "Données vérifiées",
    "Mise à jour en temps réel",
    "En partenariat avec un groupe",
    "Outil certifié",
    "Propulsé par l’IA",
    "Vous êtes éligible",
  ])("flags %s in French", (t) => {
    expect(codes("fr", t)).toContain("banned-term");
  });
  it("does not flag ordinary words that contain the letters", () => {
    expect(codes("en", "Rail and air travel, said Sai")).toEqual([]);
    expect(codes("fr", "J’ai la liste")).toEqual([]);
  });
  it("flags empty text", () => {
    expect(codes("en", "   ")).toEqual(["empty"]);
  });
});

describe("lintCopy French typography", () => {
  it("flags a straight apostrophe", () => {
    expect(codes("fr", "l'App")).toContain("fr-straight-apostrophe");
    expect(codes("fr", "l’App")).toEqual([]);
  });
  it("needs U+00A0 before a colon that precedes a space", () => {
    expect(codes("fr", "Durée: 3 jours")).toContain("fr-colon-space");
    expect(codes("fr", "Durée : 3 jours")).toContain("fr-colon-space");
    expect(codes("fr", "Durée\u00a0: 3 jours")).toEqual([]);
  });
  it("leaves times and addresses alone", () => {
    expect(codes("fr", "À 12:30 sur https://exemple.ca/a")).toEqual([]);
  });
  it("needs U+202F before ; ! ?", () => {
    expect(codes("fr", "Vraiment?")).toContain("fr-narrow-space");
    expect(codes("fr", "Vraiment ?")).toContain("fr-narrow-space");
    expect(codes("fr", "Vraiment\u202f?")).toEqual([]);
    expect(codes("fr", "Oui\u202f; non\u202f!")).toEqual([]);
    expect(codes("fr", "Oui; non!")).toHaveLength(2);
  });
  it("needs U+202F inside « »", () => {
    expect(codes("fr", "Le mot «bonjour»")).toEqual(["fr-guillemets", "fr-guillemets"]);
    expect(codes("fr", "Le mot «\u202fbonjour\u202f»")).toEqual([]);
  });
  it("does not apply French rules to English", () => {
    expect(codes("en", "Don't wait: it's 12:30!")).toEqual([]);
  });
  it("reports where the problem starts", () => {
    expect(lintCopy("fr", "Ça va?")[0]?.index).toBe(4);
  });
});

describe("lintTable", () => {
  it("walks nested tables and calls functions", () => {
    const table = { a: "ok", b: { c: "l'App", d: (s: string) => `Date : ${s}` }, n: 3 };
    const found = lintTable("fr", table);
    expect(found.map((f) => f.path)).toEqual(["b.c", "b.d"]);
  });
  it("returns nothing for clean tables", () => {
    expect(lintTable("en", { a: "Fine", b: { c: "Also fine" } })).toEqual([]);
  });
});
