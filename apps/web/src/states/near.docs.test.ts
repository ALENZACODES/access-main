import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const SOURCES = ["nearGroup.ts", "nearNeighbour.ts", "nearCopy.ts", "nearNeighbourCopy.ts", "NearGroups.tsx"];
const readme = read("README.nearGroups.md");
const all = readdirSync(new URL("./", import.meta.url));

describe("README.nearGroups.md", () => {
  for (const f of SOURCES) it(`names ${f}`, () => expect(readme).toContain(`\`${f}\``));
  it("names every test file of the feature", () => {
    const tests = all.filter((f) => /^(near(?!Names)|Near|PackPlaces\.nearGroups).*\.test\.tsx?$/.test(f) && f !== "near.docs.test.ts");
    expect(tests.length).toBeGreaterThanOrEqual(10);
    for (const f of tests) expect(readme, f).toContain(f);
  });
  it("says what the feature does not claim", () => {
    expect(readme).toMatch(/Straight line only/);
    expect(readme).toMatch(/UNKNOWN/);
    expect(readme).toMatch(/does not rank places/);
  });
  it("is not pointing at a file that is missing", () => {
    for (const m of readme.matchAll(/`((?:near|Near)[A-Za-z]*\.tsx?)`/g)) expect(all, m[1]).toContain(m[1]);
  });
});

describe("wiring", () => {
  it("the barrel exports every source file", () => {
    const index = read("index.ts");
    for (const f of SOURCES) expect(index, f).toContain(`./${f}`);
  });
  it("PackPlaces mounts the section once, after the text map, with the point handler", () => {
    const src = read("PackPlaces.tsx");
    expect(src.match(/<NearGroups\b/g)).toHaveLength(1);
    expect(src.indexOf("<NearGroups")).toBeGreaterThan(src.indexOf("<TextMap"));
    expect(src).toMatch(/onUsePoint=/);
  });
  it("the French typography check covers every source file", () => {
    const fr = read("frSourceTypography.test.ts");
    for (const f of SOURCES) expect(fr, f).toContain(`"${f}"`);
  });
});
