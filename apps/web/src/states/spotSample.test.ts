import { describe, expect, it } from "vitest";
import type { WheelchairTag } from "./packPlaces";
import { lcg, place, varied } from "./placeFixtures";
import { DEFAULT_SAMPLE_SIZE, MAX_SEED_CHARS, SAMPLE_SIZES, SAMPLE_TAG_ORDER, cleanSeed, isSampleSize, parseSampleSize, sampleForSpotCheck, tallyPicks } from "./spotSample";

const ids = (s: ReturnType<typeof sampleForSpotCheck>) => s.picks.map((p) => p.place.id);
const pack = varied(5, 80);
const opts = (over: Partial<{ size: number; seed: string; balanced: boolean }> = {}) => ({ size: 10, seed: "2026-11-21", balanced: true, ...over });

describe("sizes", () => {
  it("offers 3, 5, 10 and 20, with 5 as the default", () => {
    expect([...SAMPLE_SIZES]).toEqual([3, 5, 10, 20]);
    expect(DEFAULT_SAMPLE_SIZE).toBe(5);
  });
  it("accepts only the offered sizes", () => {
    for (const n of SAMPLE_SIZES) expect(isSampleSize(n)).toBe(true);
    for (const v of [0, 4, 21, -3, 5.5, "5", null, undefined, NaN]) expect(isSampleSize(v)).toBe(false);
  });
  it("reads a size from text and falls back to the default", () => {
    expect(parseSampleSize("10")).toBe(10);
    expect(parseSampleSize(20)).toBe(20);
    for (const v of ["", "abc", "7", "1e1x", null, undefined, {}]) expect(parseSampleSize(v)).toBe(5);
  });
});

describe("cleanSeed", () => {
  it("trims and collapses spaces but keeps case", () => {
    expect(cleanSeed("  Hello   World ", "x")).toBe("Hello World");
  });
  it("uses the fallback for blank text", () => {
    expect(cleanSeed("", "2026-11-21")).toBe("2026-11-21");
    expect(cleanSeed(" \n\t ", "fb")).toBe("fb");
  });
  it("cuts to the limit", () => {
    expect(cleanSeed("x".repeat(500), "f")).toHaveLength(MAX_SEED_CHARS);
  });
});

describe("sampleForSpotCheck", () => {
  it("returns the number asked for, with no place twice", () => {
    for (const balanced of [true, false]) {
      const s = sampleForSpotCheck(pack, opts({ balanced }));
      expect(s.picks).toHaveLength(10);
      expect(new Set(ids(s)).size).toBe(10);
      expect(s.wanted).toBe(10);
      expect(s.available).toBe(80);
    }
  });
  it("is the same for the same seed, whatever order the places arrive in", () => {
    const next = lcg(3);
    const shuffled = [...pack].sort(() => next() - 0.5);
    for (const balanced of [true, false]) expect(ids(sampleForSpotCheck(shuffled, opts({ balanced })))).toEqual(ids(sampleForSpotCheck(pack, opts({ balanced }))));
  });
  it("differs for a different seed", () => {
    for (const balanced of [true, false]) expect(ids(sampleForSpotCheck(pack, opts({ seed: "a", balanced })))).not.toEqual(ids(sampleForSpotCheck(pack, opts({ seed: "b", balanced }))));
  });
  it("has fixed picks for a fixed seed, so a sample can be drawn again", () => {
    const a = ids(sampleForSpotCheck(pack, opts({ seed: "repeatable" })));
    const b = ids(sampleForSpotCheck([...pack].reverse(), opts({ seed: "repeatable" })));
    expect(a).toEqual(b);
  });
  it("gives everything when fewer places than asked for are available", () => {
    const few = pack.slice(0, 4);
    const s = sampleForSpotCheck(few, opts({ size: 10 }));
    expect(ids(s).sort()).toEqual(few.map((p) => p.id).sort());
    expect(s.wanted).toBe(10);
    expect(s.available).toBe(4);
  });
  it("gives nothing for no places or a size of zero, and never fails", () => {
    expect(sampleForSpotCheck([], opts()).picks).toEqual([]);
    expect(sampleForSpotCheck(pack, opts({ size: 0 })).picks).toEqual([]);
    expect(sampleForSpotCheck(pack, opts({ size: -4 })).picks).toEqual([]);
    expect(sampleForSpotCheck(pack, opts({ size: NaN })).picks).toEqual([]);
  });
  it("caps an absurd size", () => {
    const big = Array.from({ length: 300 }, (_, i) => place(`id${i}`, {}));
    expect(sampleForSpotCheck(big, opts({ size: 1e9 })).picks).toHaveLength(200);
  });
  it("counts a repeated id once", () => {
    const dup = [place("a", {}), place("a", { name: "Again" }), place("b", {})];
    const s = sampleForSpotCheck(dup, opts({ size: 5 }));
    expect(s.available).toBe(2);
    expect(ids(s).sort()).toEqual(["a", "b"]);
  });
  it("carries each place's own tag", () => {
    const s = sampleForSpotCheck(pack, opts({ size: 20 }));
    for (const p of s.picks) expect(p.tag).toBe(p.place.tag);
  });
  it("does not change the list it is given", () => {
    const copy = [...pack];
    sampleForSpotCheck(pack, opts());
    expect(pack).toEqual(copy);
  });
});

describe("balanced draws", () => {
  const tagged = (counts: Partial<Record<WheelchairTag, number>>) => {
    const out: ReturnType<typeof place>[] = [];
    for (const [tag, n] of Object.entries(counts)) {
      for (let i = 0; i < (n as number); i += 1) out.push(place(`${tag}-${i}`, { wheelchair: tag === "unknown" ? null : tag }));
    }
    return out;
  };
  it("takes places in turn from each tag, so a rare tag is included", () => {
    const places = tagged({ yes: 60, limited: 30, no: 2, designated: 1, unknown: 40 });
    const s = sampleForSpotCheck(places, opts({ size: 10 }));
    expect(s.byTag).toEqual({ yes: 3, limited: 2, no: 2, designated: 1, unknown: 2 });
    expect(s.picks.map((p) => p.tag).slice(0, 5)).toEqual([...SAMPLE_TAG_ORDER]);
  });
  it("gives each tag an equal turn when there is plenty of each", () => {
    const places = tagged({ yes: 20, limited: 20, no: 20, designated: 20, unknown: 20 });
    const s = sampleForSpotCheck(places, opts({ size: 10 }));
    expect(s.byTag).toEqual({ yes: 2, limited: 2, no: 2, designated: 2, unknown: 2 });
  });
  it("carries on with the tags that have places when others run out", () => {
    const places = tagged({ yes: 10, no: 1 });
    const s = sampleForSpotCheck(places, opts({ size: 5 }));
    expect(s.byTag.no).toBe(1);
    expect(s.byTag.yes).toBe(4);
    expect(s.picks).toHaveLength(5);
  });
  it("stops when every tag is used up", () => {
    const places = tagged({ yes: 2, limited: 1 });
    expect(sampleForSpotCheck(places, opts({ size: 10 })).picks).toHaveLength(3);
  });
  it("does not reshuffle the other tags when one tag gains a place", () => {
    const base = tagged({ yes: 12, limited: 12, no: 12 });
    const more = [...base, place("limited-extra", { wheelchair: "limited" })];
    const a = sampleForSpotCheck(base, opts({ size: 9 })).picks.filter((p) => p.tag !== "limited").map((p) => p.place.id);
    const b = sampleForSpotCheck(more, opts({ size: 9 })).picks.filter((p) => p.tag !== "limited").map((p) => p.place.id);
    expect(b).toEqual(a);
  });
  it("is not the same draw as the plain random one", () => {
    const places = tagged({ yes: 50, limited: 5, no: 5 });
    const plain = sampleForSpotCheck(places, opts({ balanced: false, size: 10 }));
    const balanced = sampleForSpotCheck(places, opts({ balanced: true, size: 10 }));
    expect(ids(plain)).not.toEqual(ids(balanced));
    expect(balanced.byTag.no).toBeGreaterThan(0);
  });
});

describe("tallyPicks", () => {
  it("counts picks by tag and adds up to the number of picks", () => {
    const s = sampleForSpotCheck(pack, opts({ size: 20 }));
    const t = tallyPicks(s.picks);
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(20);
    expect(t).toEqual(s.byTag);
  });
  it("is all zeros for no picks", () => {
    expect(tallyPicks([])).toEqual({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });
  });
});
