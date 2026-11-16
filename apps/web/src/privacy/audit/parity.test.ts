import { describe, expect, it } from "vitest";
import { assertParity, checkParity } from "./parity";

const codes = (en: unknown, fr: unknown, o = {}): string[] => checkParity(en, fr, o).map((p) => p.code);

describe("checkParity", () => {
  it("accepts matching tables", () => {
    expect(checkParity({ a: "Close", b: { c: "Where it is kept" } }, { a: "Fermer", b: { c: "Où c’est conservé" } })).toEqual([]);
  });
  it("flags keys missing on either side", () => {
    expect(codes({ a: "x", b: "y" }, { a: "x" })).toEqual(["missing-in-fr"]);
    expect(codes({ a: "x" }, { a: "x", b: "y" })).toEqual(["missing-in-en"]);
  });
  it("flags a type mismatch", () => {
    expect(codes({ a: "x" }, { a: 3 })).toEqual(["type-mismatch"]);
    expect(codes({ a: { b: "x" } }, { a: "x" })).toEqual(["type-mismatch"]);
  });
  it("flags empty text on either side", () => {
    expect(checkParity({ a: "Hello" }, { a: " " })[0]?.detail).toBe("French is empty");
    expect(checkParity({ a: "" }, { a: "Bonjour" })[0]?.detail).toBe("English is empty");
  });
  it("flags long text left identical, but not short names or allowed paths", () => {
    expect(codes({ a: "This is a long sentence." }, { a: "This is a long sentence." })).toEqual(["identical"]);
    expect(codes({ a: "OK" }, { a: "OK" })).toEqual([]);
    expect(codes({ a: "Dominion Lending Centres" }, { a: "Dominion Lending Centres" }, { allowIdentical: ["a"] })).toEqual([]);
    expect(codes({ a: "Twelve chars!" }, { a: "Twelve chars!" }, { minIdenticalLength: 20 })).toEqual([]);
  });
  it("flags placeholders and digits that differ", () => {
    expect(codes({ a: "Hello {name}" }, { a: "Bonjour" })).toContain("placeholder-mismatch");
    expect(codes({ a: "Up to 44 px" }, { a: "Jusqu’à 40 px" })).toContain("digits-mismatch");
    expect(codes({ a: "Up to 44 px" }, { a: "Jusqu’à 44\u00a0px" })).toEqual([]);
  });
  it("calls functions with the samples and compares their output", () => {
    const en = { f: (n: number) => `${n} items` };
    const fr = { f: (n: number) => `${n} éléments` };
    expect(checkParity(en, fr, { samples: { f: [[0], [1], [5]] } })).toEqual([]);
    const bad = { f: (n: number) => `${n + 1} éléments` };
    expect(codes(en, bad, { samples: { f: [[1]] } })).toEqual(["digits-mismatch"]);
  });
  it("fails loudly when a function has no sample", () => {
    expect(codes({ f: () => "x" }, { f: () => "y" })).toEqual(["function-unsampled"]);
    expect(codes({ f: () => "x" }, { f: () => "y" }, { samples: { f: [] } })).toEqual(["function-unsampled"]);
  });
  it("reports a function that throws or returns a non-string", () => {
    const boom = (): string => {
      throw new Error("boom");
    };
    expect(codes({ f: boom }, { f: () => "y" }, { samples: { f: [[]] } })).toEqual(["function-throws"]);
    expect(codes({ f: () => 1 }, { f: () => "y" }, { samples: { f: [[]] } })).toEqual(["type-mismatch"]);
  });
  it("reports nested paths", () => {
    expect(checkParity({ a: { b: "x" } }, { a: {} })[0]?.path).toBe("a.b");
  });
});

describe("assertParity", () => {
  it("throws with every problem listed", () => {
    expect(() => assertParity({ a: "x", b: "y" }, {})).toThrow(/missing-in-fr at a[\s\S]*missing-in-fr at b/);
  });
  it("does not throw when tables match", () => {
    expect(() => assertParity({ a: "Fermer" }, { a: "Close" })).not.toThrow();
  });
});
