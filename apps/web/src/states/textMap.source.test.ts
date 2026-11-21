import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["textMap.ts", "textMapExport.ts", "TextMap.tsx", "placeMatrix.ts", "placeMatrixExport.ts", "DistanceMatrix.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["vér", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the text map sources", () => {
  for (const f of FILES) {
    it(`${f} makes no banned claim`, () => expect(read(f)).not.toMatch(BANNED));
    it(`${f} names no organisation it should not`, () => {
      const text = read(f).toLowerCase();
      for (const n of forbiddenOrgNeedles()) expect(text.includes(n.toLowerCase()), n).toBe(false);
    });
    it(`${f} stores nothing and makes no network or location request`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|geolocation/);
    });
    it(`${f} has no irregular spaces`, () => expect(read(f)).not.toMatch(/[\u00a0\u202f\ufeff\u2007\u2009]/));
  }
  it("the grid and directions say straight lines and not streets", () => {
    expect(code("textMap.ts")).toMatch(/straight lines/);
    expect(code("textMap.ts")).toMatch(/not a street or neighbourhood map/);
  });
  it("nothing here ranks places or calls one better", () => {
    expect(code("textMap.ts")).not.toMatch(/score|rating|stars|best|recommend/i);
  });
  it("the component uses design-system controls only", () => {
    expect(code("TextMap.tsx")).not.toMatch(/<button\b|<input\b|tabIndex|onClick=/);
  });
});
