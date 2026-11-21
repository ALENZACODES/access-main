import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["meetUp.ts", "meetUpCopy.ts", "meetUpTime.ts", "meetUpGeo.ts", "MeetUp.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["v\u00e9r", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the meet-up sources", () => {
  for (const f of FILES) {
    it(`${f} makes no banned claim`, () => expect(read(f)).not.toMatch(BANNED));
    it(`${f} names no organisation it should not`, () => {
      const text = read(f).toLowerCase();
      for (const n of forbiddenOrgNeedles()) expect(text.includes(n.toLowerCase()), n).toBe(false);
    });
    it(`${f} stores nothing and makes no network or location request`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|geolocation/);
    });
    it(`${f} has no irregular spaces`, () => expect(read(f)).not.toMatch(/[\u00a0\u202f\uFEFF\u2007\u2009\u2028\u2029]/));
  }
  it("the copy says straight lines, not routes, and not a recommendation", () => {
    const c = code("meetUpCopy.ts");
    expect(c).toMatch(/straight lines/);
    expect(c).toMatch(/not routes/);
    expect(c).toMatch(/not a recommendation/);
  });
  it("nothing here scores or calls a place better", () => {
    for (const f of FILES) expect(code(f)).not.toMatch(/\bscore|\brating|\bstars\b|\bbest\b|\bbetter\b|\bsafe\b|\bsafest\b/i);
  });
  it("the ordering never reads the wheelchair tag", () => {
    expect(code("meetUp.ts")).not.toMatch(/wheelchair|\.tag\b|provenance/);
  });
  it("the component uses design-system controls only", () => {
    expect(code("MeetUp.tsx")).not.toMatch(/<button\b|<input\b|onClick=/);
  });
  it("the logic module is plain TypeScript with no React", () => {
    expect(code("meetUp.ts")).not.toMatch(/from "react"|\.tsx/);
    expect(code("meetUpCopy.ts")).not.toMatch(/from "react"/);
  });
  it("the readme exists and names each file", () => {
    const doc = read("README.meetUp.md");
    for (const f of FILES) expect(doc).toContain(f);
    expect(doc).toMatch(/Not a recommendation/);
  });
});
