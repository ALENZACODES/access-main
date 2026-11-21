import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["placeSheet.ts", "placeSheetExport.ts", "PlaceSheet.tsx", "ShortlistFiles.tsx", "placeFixtures.ts", "gapMatrix.ts", "gapMatrixExport.ts", "GapMatrix.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// Built from parts so this file does not contain the words it forbids.
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["vér", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the place sheet sources", () => {
  for (const f of FILES) {
    it(`${f} makes no banned claim`, () => expect(read(f)).not.toMatch(BANNED));
    it(`${f} names no organisation it should not`, () => {
      const text = read(f).toLowerCase();
      for (const n of forbiddenOrgNeedles()) expect(text.includes(n.toLowerCase()), n).toBe(false);
    });
    it(`${f} keeps nothing in browser storage and makes no network request`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
    });
    it(`${f} has no irregular spaces in its source`, () => expect(read(f)).not.toMatch(/[\u00a0\u202f\ufeff\u2007\u2009]/));
  }
  it("the export modules never claim a place was checked", () => {
    expect(code("placeSheetExport.ts")).toContain("not a check of the place");
  });
  it("the sheet counts details and never scores a place", () => {
    expect(code("placeSheet.ts")).not.toMatch(/score|rank|rating|stars/i);
  });
  it("the geo link is the only anchor and is styled as a button", () => {
    const tsx = code("PlaceSheet.tsx");
    expect(tsx.match(/<a\b/g)).toHaveLength(1);
    expect(tsx).toMatch(/<a className="btn btn-secondary"/);
  });
  it("every interactive control is a design-system Button or the button-styled link", () => {
    for (const f of ["PlaceSheet.tsx", "ShortlistFiles.tsx", "GapMatrix.tsx"]) expect(code(f)).not.toMatch(/<button\b|tabIndex|onClick=/);
  });
});
