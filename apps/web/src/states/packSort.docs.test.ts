import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const SOURCES = ["packSort.ts", "packSortCopy.ts", "packSortKeys.ts", "PackSort.tsx"];
const readme = read("README.packSort.md");
const all = readdirSync(new URL("./", import.meta.url));

describe("README.packSort.md", () => {
  for (const f of SOURCES) it(`names ${f}`, () => expect(readme).toContain(`\`${f}\``));
  it("names every test file of the feature", () => {
    const tests = all.filter((f) => /^(packSort|PackSort|PackPlaces\.sort|packPlacesView\.sort).*\.test\.tsx?$/.test(f));
    expect(tests.length).toBeGreaterThanOrEqual(13);
    for (const f of tests) expect(readme, f).toContain(f);
  });
  it("lists all eight orders", () => {
    for (const w of ["Default", "Name, A to Z", "Kind of place", "Street, then number", "Wheelchair tag", "oldest"]) expect(readme).toContain(w);
  });
  it("explains the second order", () => {
    expect(readme).toMatch(/Then by/);
    expect(readme).toContain("cleanThen");
  });
  it("says what is not claimed", () => {
    expect(readme).toMatch(/An order is not a ranking/);
    expect(readme).toMatch(/Nothing is stored/);
  });
  it("points only at files that exist", () => {
    for (const m of readme.matchAll(/`((?:pack|Pack)[A-Za-z.]*\.tsx?)`/g)) expect(all, m[1]).toContain(m[1]);
  });
});

describe("wiring", () => {
  it("the barrel exports every source file", () => {
    const index = read("index.ts");
    for (const f of SOURCES) expect(index, f).toContain(`./${f}`);
  });
  it("PackPlaces holds the order, passes it to the view and mounts the section once, before the text map", () => {
    const src = read("PackPlaces.tsx");
    expect(src.match(/<PackSort\b/g)).toHaveLength(1);
    expect(src.indexOf("<PackSort")).toBeLessThan(src.indexOf("<TextMap"));
    expect(src).toMatch(/sort,? ?\}/);
    expect(src).toMatch(/onSort=\{setSort\}/);
  });
  it("the view orders through the shared sort and no longer sorts inline", () => {
    const src = read("packPlacesView.ts");
    expect(src).toMatch(/sortPlaces\(shown/);
    expect(src).not.toMatch(/\.sort\(\(a, b\)/);
  });
  it("the French typography check covers every source file", () => {
    const fr = read("frSourceTypography.test.ts");
    for (const f of SOURCES) expect(fr, f).toContain(`"${f}"`);
  });
});
