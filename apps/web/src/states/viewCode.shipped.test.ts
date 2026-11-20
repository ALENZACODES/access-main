import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { filterByKind, kindKey } from "./packCategories";
import { FACET_IDS, applyFacets, facetValueOf } from "./packFacets";
import { parsePackPlaces } from "./packPlaces";
import { EMPTY_VIEW_PARTS, parseViewCode, viewToCode } from "./viewCode";

const { places } = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
const TODAY = "2026-11-19";

describe("the view code on the shipped pack", () => {
  it("reads back every kind the pack holds, written the way the pack spells it", () => {
    const kinds = new Set(places.map((p) => kindKey(p.category)));
    expect(kinds.size).toBeGreaterThan(3);
    for (const p of places) {
      if (typeof p.category !== "string") continue;
      const parsed = parseViewCode(`kind: ${p.category}`);
      expect(parsed.view.kind, p.category).toBe(kindKey(p.category));
      expect(filterByKind(places, parsed.view.kind).length, p.category).toBeGreaterThan(0);
    }
  });
  it("round trips each kind through a written code", () => {
    for (const k of new Set(places.map((p) => kindKey(p.category)))) {
      expect(parseViewCode(viewToCode({ ...EMPTY_VIEW_PARTS, kind: k })).view.kind).toBe(k);
    }
  });
  it("reads back every licence, tier and age value the pack holds, and each selects places", () => {
    for (const f of FACET_IDS) {
      if (f === "source") continue;
      for (const v of new Set(places.map((p) => facetValueOf(p, f, TODAY)))) {
        const parsed = parseViewCode(`${f}: ${v}`);
        expect(parsed.ok, `${f}:${v}`).toBe(true);
        expect(applyFacets(places, parsed.view.facets, TODAY).length, `${f}:${v}`).toBeGreaterThan(0);
      }
    }
  });
  it("reads the source the pack names, in any letter case", () => {
    for (const s of new Set(places.map((p) => facetValueOf(p, "source", TODAY)))) {
      const parsed = parseViewCode(`source: ${s.toUpperCase()}`);
      expect(applyFacets(places, parsed.view.facets, TODAY).length, s).toBeGreaterThan(0);
    }
  });
});
