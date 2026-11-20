import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["handout.ts", "handoutHtml.ts", "Handout.tsx", "listTransfer.ts", "ListTransfer.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["vér", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the handout sources", () => {
  for (const f of FILES) {
    it(`${f} makes no banned claim`, () => expect(read(f)).not.toMatch(BANNED));
    it(`${f} names no organisation it should not`, () => {
      const text = read(f).toLowerCase();
      for (const n of forbiddenOrgNeedles()) expect(text.includes(n.toLowerCase()), n).toBe(false);
    });
    it(`${f} stores nothing and makes no network request`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
    });
    it(`${f} has no irregular spaces`, () => expect(read(f)).not.toMatch(/[\u00a0\u202f\ufeff\u2007\u2009]/));
  }
  it("the page generator writes no script, link or external reference", () => {
    const c = code("handoutHtml.ts");
    expect(c).not.toMatch(/<script|<link|<img|<iframe|src=|href=|@import|url\(/i);
  });
  it("the component uses design-system controls only", () => {
    expect(code("Handout.tsx")).not.toMatch(/<button\b|<input\b|tabIndex|onClick=/);
  });
  it("the handout never scores or ranks", () => {
    expect(code("handout.ts")).not.toMatch(/score|rank|rating|stars|sort\(/i);
  });
});
