import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { DIRECTION_PAIRS, directionUse, findDirectionMixes, longDirection, shortDirection } from "./writingDirection";

const at = (id: string, address: string | null) => place(id, { address });

describe("directionUse", () => {
  it.each([
    ["100 Queen Street W", "west", "short", "W"],
    ["100 Queen Street West", "west", "long", "West"],
    ["100 Queen St. W.", "west", "short", "W."],
    ["12 Bloor Ave NE", "northeast", "short", "NE"],
    ["12 Bloor Avenue Northeast", "northeast", "long", "Northeast"],
    ["5 Dundas Rd. s", "south", "short", "s"],
    ["5 DUNDAS ROAD SOUTH", "south", "long", "SOUTH"],
    ["9 Lake Shore Blvd East, Toronto, ON", "east", "long", "East"],
    ["300 Main Street N", "north", "short", "N"],
  ])("reads %s", (address, long, form, written) => expect(directionUse(address)).toEqual({ long, form, written }));

  it.each([
    ["King West"],
    ["100 King West"],
    ["100 W Queen St"],
    ["100 Queen Street"],
    ["Queen W"],
    ["100 Queen Street Wilson"],
    ["100 Main Street, West End"],
    [""],
  ])("does not read %s", (address) => expect(directionUse(address)).toBeNull());

  it("is null for no address", () => expect(directionUse(null)).toBeNull());
  it("reads a type in any of its forms before the direction", () => {
    for (const t of ["St", "Street", "Ave", "Av", "Avenue", "Rd", "Road", "Blvd", "Dr", "Cres", "Ct", "Pl", "Ln", "Hwy", "Pkwy", "Terr", "Cir"]) expect(directionUse(`1 Oak ${t} W`)?.long).toBe("west");
  });
  it("reads only the street part, before the first comma", () => {
    expect(directionUse("1 Oak Street, Suite W")).toBeNull();
    expect(directionUse("1 Oak Street W, Toronto, ON")?.form).toBe("short");
  });
  it("pairs every direction once", () => {
    expect(new Set(DIRECTION_PAIRS.map((p) => p.long)).size).toBe(8);
    expect(new Set(DIRECTION_PAIRS.map((p) => p.short)).size).toBe(8);
  });
});

describe("findDirectionMixes", () => {
  const four = (shortN: number, longN: number) => [
    ...Array.from({ length: shortN }, (_, i) => at(`s${i}`, `${i + 1} Queen Street W`)),
    ...Array.from({ length: longN }, (_, i) => at(`l${i}`, `${i + 1} King Street West`)),
  ];
  it("points out the places using the less common form", () => {
    expect(findDirectionMixes(four(1, 3))).toEqual([{ long: "west", shortCount: 1, longCount: 3, minority: "short", ids: ["s0"] }]);
    expect(findDirectionMixes(four(3, 1))).toEqual([{ long: "west", shortCount: 3, longCount: 1, minority: "long", ids: ["l0"] }]);
  });
  it("reads a tie as the short form being the minority", () => expect(findDirectionMixes(four(2, 2))[0]).toMatchObject({ minority: "short", ids: ["s0", "s1"] }));
  it("needs at least four addresses of a direction", () => expect(findDirectionMixes(four(1, 2))).toEqual([]));
  it("needs both forms", () => {
    expect(findDirectionMixes(four(4, 0))).toEqual([]);
    expect(findDirectionMixes(four(0, 4))).toEqual([]);
  });
  it("keeps each direction apart", () => {
    const places = [...four(1, 3), at("n1", "1 Oak Street N"), at("n2", "2 Oak Street North")];
    expect(findDirectionMixes(places)).toHaveLength(1);
  });
  it("lists the mixes in direction order", () => {
    const mk = (d: string, s: string, l: string) => [1, 2, 3].map((i) => at(`${d}l${i}`, `${i} A Street ${l}`)).concat(at(`${d}s`, `9 A Street ${s}`));
    const out = findDirectionMixes([...mk("e", "E", "East"), ...mk("n", "N", "North")]);
    expect(out.map((m) => m.long)).toEqual(["north", "east"]);
  });
  it("ignores places with no address or a non-street one", () => expect(findDirectionMixes([at("a", null), at("b", "King West")])).toEqual([]));
  it("is empty for no places", () => expect(findDirectionMixes([])).toEqual([]));
});

describe("direction words", () => {
  it("writes the short form in capitals and the long form with a capital", () => {
    expect(shortDirection("northwest")).toBe("NW");
    expect(longDirection("northwest")).toBe("Northwest");
    expect(shortDirection("unknown")).toBe("UNKNOWN");
  });
});
