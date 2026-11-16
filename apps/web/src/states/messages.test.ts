import { describe, expect, it } from "vitest";
import { CATALOG, NBSP, auditCatalog, listJoin, message, pluralCategory, type Entry } from "./index";

describe("plural categories", () => {
  it("English: only 1 is singular", () => {
    expect([0, 1, 2].map((n) => pluralCategory("en", n))).toEqual(["other", "one", "other"]);
  });
  it("French: 0 and 1 are singular", () => {
    expect([0, 1, 2].map((n) => pluralCategory("fr", n))).toEqual(["one", "one", "other"]);
  });
});

describe("message", () => {
  it("fills plurals and placeholders", () => {
    expect(message("search.matches", "en", { n: 1 })).toBe("1 place matches your filters.");
    expect(message("search.matches", "en", { n: 3 })).toBe("3 places match your filters.");
    expect(message("search.matches", "fr", { n: 0 })).toBe("0 lieu correspond à vos filtres.");
    expect(message("search.matches", "fr", { n: 2 })).toBe("2 lieux correspondent à vos filtres.");
  });
  it("applies French typography to the template, not to the values", () => {
    expect(message("place.unknownFor", "fr", { features: "Ascenseur" })).toBe(`INCONNU${NBSP}: Ascenseur`);
    expect(message("saved.remove", "fr", { name: "Café: Nord ?" })).toBe("Retirer Café: Nord ? des lieux enregistrés");
    expect(message("search.unknownHidden", "fr", { n: 1 })).toContain("n’est pas affiché");
  });
  it("throws on a missing parameter or plural count", () => {
    expect(() => message("place.unknownFor", "en")).toThrow(/features/);
    expect(() => message("search.matches", "en")).toThrow(/"n"/);
  });
  it("keeps UNKNOWN wording in every unknown message", () => {
    for (const id of ["search.unknownHidden", "search.unknownShown"] as const) {
      expect(message(id, "en", { n: 2 })).toContain("UNKNOWN");
      expect(message(id, "fr", { n: 2 })).toContain("INCONNUS");
    }
  });
});

describe("listJoin", () => {
  it("joins 0 to 4 items", () => {
    expect(listJoin("en", [])).toBe("");
    expect(listJoin("en", ["a"])).toBe("a");
    expect(listJoin("en", ["a", "b"])).toBe("a and b");
    expect(listJoin("en", ["a", "b", "c"])).toBe("a, b and c");
    expect(listJoin("fr", ["a", "b", "c", "d"])).toBe("a, b, c et d");
  });
});

describe("auditCatalog", () => {
  it("passes the shipped catalogue", () => {
    expect(auditCatalog(CATALOG)).toEqual([]);
  });
  it("fails on EN/FR drift, overclaims and typography", () => {
    const bad: Record<string, Entry> = {
      empty: { en: " ", fr: "ok" },
      shape: { en: "x", fr: { one: "x", other: "y" } },
      holes: { en: "Hello {name}", fr: "Bonjour" },
      claim: { en: "Verified by staff", fr: "Vérifié par le personnel" },
      rt: { en: "Updated in real-time", fr: "Mis à jour en temps réel" },
      apostrophe: { en: "ok", fr: "l'App" },
    };
    const issues = auditCatalog(bad);
    const has = (id: string, issue: string): boolean => issues.some((i) => i.id === id && i.issue === issue);
    expect(has("empty", "empty")).toBe(true);
    expect(has("shape", "shape-mismatch")).toBe(true);
    expect(has("holes", "placeholder-mismatch")).toBe(true);
    expect(has("claim", "overclaim-verified")).toBe(true);
    expect(has("rt", "overclaim-realtime")).toBe(true);
    // the audit lints the text after French typography is applied, so an apostrophe is repaired
    expect(has("apostrophe", "straight-apostrophe")).toBe(false);
  });
});
