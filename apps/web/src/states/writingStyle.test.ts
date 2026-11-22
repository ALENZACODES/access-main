import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { MIN_STYLE_SAMPLE, STREET_TYPE_PAIRS, findStyleMixes, minorityIndex, streetTypeUse } from "./writingStyle";

const at = (id: string, address: string | null) => place(id, { address });

describe("streetTypeUse", () => {
  it.each([
    ["100 King Street West", "street", "long", "Street"],
    ["100 King St W", "street", "short", "St"],
    ["5 Oak Ave.", "avenue", "short", "Ave."],
    ["5 Oak av", "avenue", "short", "av"],
    ["5 Oak AVENUE", "avenue", "long", "AVENUE"],
    ["7 Elm Rd, Toronto", "road", "short", "Rd"],
    ["9 Pine Crescent North", "crescent", "long", "Crescent"],
    ["9 Pine Cres NE", "crescent", "short", "Cres"],
    ["3 Lakeshore Blvd.", "boulevard", "short", "Blvd."],
  ])("reads the type in %j", (a, long, form, written) => expect(streetTypeUse(a)).toEqual({ long, form, written }));
  it("reads St. Clair Avenue as an avenue, not a street", () => expect(streetTypeUse("St. Clair Avenue")?.long).toBe("avenue"));
  it("does not read a leading St as a type", () => expect(streetTypeUse("St. Clair")).toBeNull());
  it.each([null, "", "Main", "100 Main", "PO Box 12", "12 rue Saint-Denis"])("finds no type in %j", (a) => expect(streetTypeUse(a)).toBeNull());
  it("ignores everything after the first comma", () => expect(streetTypeUse("100 King, Toronto St")).toBeNull());
  it("skips several direction words", () => expect(streetTypeUse("1 Main St North East")?.form).toBe("short"));
});

describe("findStyleMixes", () => {
  const mixed = [at("a", "1 Main Street"), at("b", "2 Oak Street"), at("c", "3 Elm Street"), at("d", "4 Pine St")];
  it("points at the less common form when both are in use", () => {
    expect(findStyleMixes(mixed)).toEqual([{ long: "street", shortCount: 1, longCount: 3, minority: "short", ids: ["d"] }]);
  });
  it("points at the long form when it is the less common", () => {
    const m = findStyleMixes([at("a", "1 Main St"), at("b", "2 Oak St"), at("c", "3 Elm St"), at("d", "4 Pine Street")]);
    expect(m[0]).toMatchObject({ minority: "long", ids: ["d"] });
  });
  it("reads a tie as the short form being the minority", () => {
    const m = findStyleMixes([at("a", "1 Main St"), at("b", "2 Oak St"), at("c", "3 Elm Street"), at("d", "4 Pine Street")]);
    expect(m[0]).toMatchObject({ minority: "short", ids: ["a", "b"] });
  });
  it("says nothing when the list is written one way", () => {
    expect(findStyleMixes([at("a", "1 A St"), at("b", "2 B St"), at("c", "3 C St"), at("d", "4 D St")])).toEqual([]);
  });
  it("says nothing for a small sample", () => {
    expect(MIN_STYLE_SAMPLE).toBe(4);
    expect(findStyleMixes([at("a", "1 A Street"), at("b", "2 B Street"), at("c", "3 C St")])).toEqual([]);
  });
  it("keeps each street type apart", () => {
    const ps = [at("a", "1 A Avenue"), at("b", "2 B Avenue"), at("c", "3 C Avenue"), at("d", "4 D Ave"), at("e", "5 E Street"), at("f", "6 F St")];
    expect(findStyleMixes(ps).map((m) => m.long)).toEqual(["avenue"]);
  });
  it("ignores places with no address or no type", () => {
    expect(findStyleMixes([at("a", null), at("b", "PO Box 1"), at("c", "Main")])).toEqual([]);
  });
  it("lists ids in pack order", () => {
    const ps = [at("z", "1 A St"), at("y", "2 B Street"), at("x", "3 C St"), at("w", "4 D Street"), at("v", "5 E Street")];
    expect(findStyleMixes(ps)[0]!.ids).toEqual(["z", "x"]);
  });
  it("gives the same counts in any order", () => {
    const rev = findStyleMixes([...mixed].reverse());
    expect(rev[0]).toMatchObject({ shortCount: 1, longCount: 3, minority: "short", ids: ["d"] });
  });
  it("has each type once in the pair list", () => {
    const longs = STREET_TYPE_PAIRS.map((p) => p.long);
    expect(new Set(longs).size).toBe(longs.length);
    const shorts = STREET_TYPE_PAIRS.flatMap((p) => p.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});

describe("minorityIndex", () => {
  it("maps each minority place to its mix", () => {
    const mixes = findStyleMixes([at("a", "1 A Avenue"), at("b", "2 B Avenue"), at("c", "3 C Avenue"), at("d", "4 D Ave"), at("e", "5 E Street"), at("f", "6 F Street"), at("g", "7 G Street"), at("h", "8 H St")]);
    const idx = minorityIndex(mixes);
    expect([...idx.keys()].sort()).toEqual(["d", "h"]);
    expect(idx.get("d")!.long).toBe("avenue");
    expect(idx.get("h")!.long).toBe("street");
  });
  it("is empty for no mixes", () => expect(minorityIndex([]).size).toBe(0));
});
