import { describe, expect, it } from "vitest";
import { NEAR_RADII, buildNearGroups } from "./nearGroup";
import { nearCaveat, nearGroupLine, nearGroupTitle, nearSummary, nearToCsv, nearToText } from "./nearCopy";
import { buildNeighbours } from "./nearNeighbour";
import { neighbourCountText, neighbourLine, neighbourSummary, neighbourToCsv, neighbourToText, neighbourWhere } from "./nearNeighbourCopy";
import type { PackPlaceRecord } from "./packPlaces";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const STEP = 0.0004;
const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });

/** Layouts with 0 to 3 groups, 0 to 3 places on their own and 0 to 2 with no map point. */
function layout(groups: number, alone: number, none: number): PackPlaceRecord[] {
  const out: PackPlaceRecord[] = [];
  let k = 0;
  for (let g = 0; g < groups; g++) {
    out.push(at(`g${g}a`, 0.1 * k++, { name: `Name ${k}` }), at(`g${g}b`, 0.1 * (k - 1) + STEP, { name: `Name ${k}b` }));
  }
  for (let a = 0; a < alone; a++) out.push(at(`s${a}`, 0.1 * k++, { name: `Solo ${a}` }));
  for (let z = 0; z < none; z++) out.push(bare(`z${z}`));
  return out;
}
const layouts: [number, number, number][] = [];
for (let g = 0; g <= 3; g++) for (let a = 0; a <= 3; a++) for (let z = 0; z <= 2; z++) layouts.push([g, a, z]);

describe("every combination of groups, loners and places with no point", () => {
  for (const [g, a, z] of layouts) {
    const ps = layout(g, a, z);
    const label = `${g} groups, ${a} alone, ${z} no point`;
    it(`${label}: the English summary is one or two plain sentences ending in a full stop`, () => {
      const s = nearSummary(buildNearGroups(ps, 100), "en");
      expect(s.endsWith(".")).toBe(true);
      expect(s).not.toMatch(/undefined|NaN|\[object|\s{2,}/);
    });
    it(`${label}: the French summary passes the French typography check and has no English plural`, () => {
      const s = nearSummary(buildNearGroups(ps, 100), "fr");
      expect(lintFrench(s)).toEqual([]);
      expect(s).not.toMatch(/\b(places?|groups?|its|their|own)\b/);
    });
    it(`${label}: the count in the summary matches the layout`, () => {
      const r = buildNearGroups(ps, 100);
      const en = nearSummary(r, "en");
      if (ps.length === 0) return expect(en).toBe("There are no places to compare.");
      if (g > 0) expect(en).toContain(`${g} group${g === 1 ? "" : "s"} with ${g * 2} places`);
      else expect(en).toMatch(/^No two places/);
      if (z > 0) expect(en).toContain(`${z} with no map point`);
      else expect(en).not.toContain("no map point");
    });
    it(`${label}: the text and CSV name every place once`, () => {
      const r = buildNearGroups(ps, 100);
      const csv = nearToCsv(r, ps, "en").replace(/^\ufeff/, "").trimEnd().split("\r\n");
      expect(csv).toHaveLength(ps.length + 1);
      const text = nearToText(r, ps, "en");
      for (const p of ps.filter((x) => x.name !== null)) expect(text.split(`${p.name}`).length - 1, p.name ?? "").toBeGreaterThanOrEqual(1);
    });
    it(`${label}: the nearest-place summary and files are consistent`, () => {
      const n = buildNeighbours(ps);
      expect(neighbourSummary(n, "en").length).toBeGreaterThan(20);
      const csv = neighbourToCsv(n, ps, "fr").replace(/^\ufeff/, "").trimEnd().split("\r\n");
      expect(csv).toHaveLength(n.rows.length + n.unlocatedIds.length + 1);
      expect(lintFrench(neighbourSummary(n, "fr"))).toEqual([]);
    });
  }
});

describe("French typography of the shared pieces", () => {
  const ps = layout(2, 2, 1);
  const r = buildNearGroups(ps, 250);
  const n = buildNeighbours(ps);
  const names = (s: string): string => s.replace(/Name \d+b?|Solo \d/g, "X");
  it("the caveat and group titles", () => {
    expect(lintFrench(nearCaveat("fr"))).toEqual([]);
    expect(nearGroupTitle(r.groups[0]!, "fr")).toBe("Groupe 1");
  });
  it("group lines put a no-break space before the colon and before units", () => {
    const line = nearGroupLine(r.groups[0]!, new Map(ps.map((p) => [p.id, p] as const)), "fr");
    expect(line).toMatch(/\u00a0:/);
    expect(line).toMatch(/\d\u00a0m/);
    expect(lintFrench(line)).toEqual([]);
  });
  it("nearest-place lines and counts", () => {
    expect(lintFrench(names(neighbourLine(n.rows[0]!, "fr")))).toEqual([]);
    for (const radius of NEAR_RADII) expect(lintFrench(neighbourCountText(n, radius, "fr"))).toEqual([]);
    expect(neighbourWhere(n.rows[0]!, "fr")).toMatch(/vers le (nord|sud|est|ouest)/);
  });
  it("the files are French and use a semicolon with a narrow no-break space", () => {
    const text = nearToText(r, ps, "fr");
    expect(text).toContain("\u202f; ");
    expect(lintFrench(names(text))).toEqual([]);
    expect(lintFrench(names(neighbourToText(n, NEAR_RADII, "fr")))).toEqual([]);
  });
});

describe("a large pack", () => {
  it("groups and pairs 2,000 places and accounts for each once", () => {
    const ps = Array.from({ length: 2000 }, (_, i) => at(`k${String(i).padStart(4, "0")}`, (i % 100) * 0.0007, { lon: -79.38 + Math.floor(i / 100) * 0.0009 }));
    const r = buildNearGroups(ps, 100);
    expect(r.groups.reduce((s, x) => s + x.ids.length, 0) + r.aloneIds.length).toBe(2000);
    const n = buildNeighbours(ps);
    expect(n.rows).toHaveLength(2000);
    expect(n.counts[3]!.count).toBe(2000);
  });
});
