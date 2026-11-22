import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { IDENTIFIER_REGISTER, checkIdentifierRegister, identifierKeptCounts, identifierTotal } from "./identifierRegister";
import type { IdentifierRow } from "./identifierRegister";

const row = (over: Partial<IdentifierRow> = {}): IdentifierRow => ({
  path: "apps/web/src/a.ts", where: { en: "Part", fr: "Partie" }, what: { en: "A value", fr: "Une valeur" }, count: 1, kept: "not-kept", recordedOn: "2026-11-21", ...over,
});

describe("IDENTIFIER_REGISTER", () => {
  it("has no problem", () => expect(checkIdentifierRegister(IDENTIFIER_REGISTER)).toEqual([]));
  it("lists each file once and in order", () => {
    const paths = IDENTIFIER_REGISTER.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([...paths].sort());
  });
  it("names the part and the value in both languages, in different words", () => {
    for (const r of IDENTIFIER_REGISTER) {
      expect(r.where.en, r.path).not.toBe(r.where.fr);
      expect(r.what.en, r.path).not.toBe(r.what.fr);
    }
  });
  it("passes the copy lint in both languages", () => {
    for (const r of IDENTIFIER_REGISTER) for (const l of ["en", "fr"] as const) for (const t of [r.where[l], r.what[l]]) expect(lintCopy(l, t), `${r.path} ${t}`).toEqual([]);
  });
  it("shows no path, no code name and no API name in the plain words", () => {
    for (const r of IDENTIFIER_REGISTER) for (const l of ["en", "fr"] as const) {
      expect(r.what[l], r.path).not.toMatch(/randomUUID|Math\.random|getRandomValues|matchMedia|navigator|\.tsx?\b|apps\/web/);
    }
  });
  it("never says the value is not sent", () => {
    for (const r of IDENTIFIER_REGISTER) for (const l of ["en", "fr"] as const) expect(`${r.where[l]} ${r.what[l]}`, r.path).not.toMatch(/never sent|not sent|jamais envoy|pas envoy|verified|vérif/i);
  });
  it("keeps a value only where it is made for a record or a copy", () => {
    for (const r of IDENTIFIER_REGISTER.filter((x) => x.kept === "on-device" || x.kept === "in-copy")) expect(r.what.en, r.path).toMatch(/random/i);
  });
});

describe("checkIdentifierRegister", () => {
  it("finds a repeat", () => expect(checkIdentifierRegister([row(), row()])).toEqual(["apps/web/src/a.ts: listed twice"]));
  it("finds a path outside the App", () => expect(checkIdentifierRegister([row({ path: "packages/a.ts" })])).toEqual(["packages/a.ts: not a file of the App"]));
  it("finds a count that is not a positive whole number", () => {
    expect(checkIdentifierRegister([row({ count: 0 })])).toHaveLength(1);
    expect(checkIdentifierRegister([row({ count: 1.5 })])).toHaveLength(1);
  });
  it("finds empty words in each language", () => {
    expect(checkIdentifierRegister([row({ where: { en: " ", fr: "x" } })])).toEqual(["apps/web/src/a.ts: no en name for the part"]);
    expect(checkIdentifierRegister([row({ what: { en: "x", fr: "" } })])).toEqual(["apps/web/src/a.ts: no fr words for what it makes or reads"]);
  });
  it("finds a date that is not written as YYYY-MM-DD", () => expect(checkIdentifierRegister([row({ recordedOn: "21/11/2026" })])).toEqual(["apps/web/src/a.ts: the date is not YYYY-MM-DD"]));
  it("finds rows that are out of order", () => expect(checkIdentifierRegister([row({ path: "apps/web/src/b.ts" }), row()])).toEqual(["apps/web/src/a.ts: not in order"]));
  it("finds nothing in an empty list", () => expect(checkIdentifierRegister([])).toEqual([]));
});

describe("identifierTotal and identifierKeptCounts", () => {
  const rows = [row({ count: 3, kept: "on-device" }), row({ path: "apps/web/src/b.ts", count: 2, kept: "not-kept" }), row({ path: "apps/web/src/c.ts", count: 1, kept: "on-device" })];
  it("adds the places", () => expect(identifierTotal(rows)).toBe(6));
  it("counts the places by what is done with the value, with zero for none", () => expect(identifierKeptCounts(rows)).toEqual({ "on-device": 4, "not-kept": 2, "in-copy": 0, "shown-only": 0 }));
  it("is zero for no rows", () => {
    expect(identifierTotal([])).toBe(0);
    expect(identifierKeptCounts([])).toEqual({ "on-device": 0, "not-kept": 0, "in-copy": 0, "shown-only": 0 });
  });
});
