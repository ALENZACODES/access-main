import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILES = ["venueName.ts", "venueGroups.ts", "venueExport.ts", "VenueGroups.tsx"] as const;
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const part = (...p: string[]) => p.join("");

describe("the venue groups source", () => {
  it.each(FILES)("%s makes no banned claim in its words", (f) => {
    const src = read(f);
    const banned = [new RegExp(part("veri", "fie[ds]?|veri", "fy|v", "érifi")), new RegExp(part("real", "-?", "time"), "i"), new RegExp(part("partner", "ship"), "i"), new RegExp(part("guar", "antee"), "i")];
    for (const re of banned) expect(src, `${f} ${re}`).not.toMatch(re);
  });
  it.each(FILES)("%s names no organisation it must not name", (f) => {
    const src = read(f).toLowerCase();
    for (const needle of forbiddenOrgNeedles()) expect(src, `${f} ${needle}`).not.toContain(needle.toLowerCase());
  });
  it.each(FILES)("%s uses no storage, network, location or cookie API", (f) => {
    const src = read(f);
    for (const re of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /geolocation/, /navigator\./, /https?:\/\//]) expect(src, `${f} ${re}`).not.toMatch(re);
  });
  it.each(FILES)("%s has no irregular space characters", (f) => {
    expect(read(f)).not.toMatch(/[\u00a0\u2028\u2029\u202f\ufeff\u200b]/);
  });
  it("the component uses only the design system for controls", () => {
    const src = read("VenueGroups.tsx");
    expect(src).not.toMatch(/<button\b|<input\b|<select\b|<a\b/);
    expect(src).toContain('from "../design/Button.tsx"');
    expect(src).toContain('from "../design/fields.tsx"');
    expect(src).not.toMatch(/style=|minHeight|height:/);
  });
  it("the logic files import nothing from React", () => {
    for (const f of ["venueName.ts", "venueGroups.ts", "venueExport.ts"]) expect(read(f)).not.toMatch(/from "react/);
  });
  it("does not say an entrance leads to a place or that a tag carries over, except to deny it", () => {
    const src = read("venueGroups.ts");
    expect(src).toContain("does not mean an entrance leads to the place");
    expect(src).not.toMatch(/leads to the place\b(?! or)/);
  });
  it("never writes the French word for unknown as a value", () => {
    for (const f of FILES) expect(read(f)).not.toMatch(/"INCONNU"|'INCONNU'/);
  });
});
