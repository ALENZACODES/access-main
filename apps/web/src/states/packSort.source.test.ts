import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["packSort.ts", "packSortCopy.ts", "packSortKeys.ts", "PackSort.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["vér", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the list-order sources", () => {
  for (const f of FILES) {
    it(`${f} makes no banned claim`, () => expect(read(f)).not.toMatch(BANNED));
    it(`${f} names no organisation it should not`, () => {
      const text = read(f).toLowerCase();
      for (const n of forbiddenOrgNeedles()) expect(text.includes(n.toLowerCase()), n).toBe(false);
    });
    it(`${f} stores nothing and makes no network, clock or random request`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|geolocation|Date\.now|new Date\(|Math\.random/);
    });
    it(`${f} has no raw invisible spaces`, () => expect(read(f)).not.toMatch(/[\u00a0\u202f\ufeff\u2007\u2009\u2028\u2029\u200b]/));
    it(`${f} imports only files that exist`, () => {
      for (const m of read(f).matchAll(/from "(\.\/[^"]+)"/g)) {
        const rel = m[1]!;
        const ok = [rel, `${rel}.ts`, `${rel}.tsx`].some((c) => {
          try {
            read(c.slice(2));
            return true;
          } catch {
            return false;
          }
        });
        expect(ok, rel).toBe(true);
      }
    });
  }
  it("no order scores, rates or recommends a place", () => {
    for (const f of ["packSort.ts", "packSortCopy.ts"]) expect(code(f)).not.toMatch(/score|rating|stars|\bbest\b|recommend|safest|easiest/i);
  });
  it("the sort is pure: it sorts a copy", () => {
    expect(code("packSort.ts")).toMatch(/\[\.\.\.places\]\.sort\(/);
    expect(code("packSort.ts")).not.toMatch(/\bplaces\.sort\(/);
  });
  it("the component uses design-system controls only", () => {
    expect(code("PackSort.tsx")).not.toMatch(/<button\b|<input\b|<select\b|tabIndex|onClick=|innerHTML/);
  });
  it("French text puts a no-break space before a colon, by escape", () => expect(read("packSortCopy.ts")).toMatch(/\\u00a0:/));
});
