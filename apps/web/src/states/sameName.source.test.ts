import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

const FILES = ["sameName.ts", "sameNameCopy.ts", "nearNames.ts", "nearNamesCopy.ts", "SameName.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BANNED = new RegExp([["ver", "ified"].join(""), ["ver", "ify"].join(""), ["vér", "ifi"].join(""), ["real", "-time"].join(""), ["partner", "ship"].join(""), ["guar", "antee"].join("")].join("|"), "i");

describe("the shared-name sources", () => {
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
  it("the copy says unrelated and not better", () => {
    expect(code("sameNameCopy.ts")).toMatch(/may be unrelated/);
    expect(code("sameNameCopy.ts")).toMatch(/better than another/);
  });
  it("nothing here scores or ranks a place", () => {
    for (const f of FILES) expect(code(f)).not.toMatch(/\bscore|\brating|\bstars\b|\bsafest\b|\brecommend/i);
  });
  it("the grouping reads the name only, never the tag, to decide who is together", () => {
    const grouping = code("sameName.ts").split("export function buildSameName")[1]!.split("/** What is listed")[0]!;
    expect(grouping).toMatch(/nameKey\(p\.name\)/);
    expect(grouping.replace(/tagsDiffer[^\n]*\n/, "")).not.toMatch(/\.tag\b[^\n]*(key|bucket)/);
  });
  it("the files are made without distances: the CSV and text builders never read metres", () => {
    const csvText = code("sameNameCopy.ts").split("export function sameNameToText")[1]!;
    expect(csvText).not.toMatch(/\.metres|formatPackDistance|withDistance\s*=\s*true|, true\)/);
  });
  it("the component uses design-system controls only", () => {
    expect(code("SameName.tsx")).not.toMatch(/<button\b|<input\b|onClick=/);
  });
  it("the logic module is plain TypeScript with no React", () => {
    expect(code("sameName.ts")).not.toMatch(/from "react"/);
    expect(code("sameNameCopy.ts")).not.toMatch(/from "react"/);
  });
  it("the readme exists, names each file and says no distance is saved", () => {
    const doc = read("README.sameName.md");
    for (const f of FILES) expect(doc).toContain(f);
    expect(doc).toMatch(/no distance/i);
  });
});
