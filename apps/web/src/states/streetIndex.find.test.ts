import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { keyWord } from "./streetAddress";
import { buildStreetIndex, filterStreets } from "./streetIndex";

const at = (id: string, address: string) => place(id, { name: `Place ${id}`, address });
const groups = buildStreetIndex([at("a", "1 Yonge St"), at("b", "1 King St W"), at("c", "1 King St E"), at("d", "1 rue Sainte-Catherine Ouest"), at("e", "1 Queen Rd"), at("f", "1 rue de l’Église"), at("g", "1 Highway 7 East")], "en", "name").groups;
const keys = (q: string) => filterStreets(groups, q).map((g) => g.key);

describe("keyWord", () => {
  it("writes a short street type in full", () => {
    expect(keyWord("st")).toBe("street");
    expect(keyWord("St.")).toBe("street");
    expect(keyWord("AVE")).toBe("avenue");
    expect(keyWord("boul")).toBe("boulevard");
  });
  it("writes a direction as its lower-case letter, in either language", () => {
    expect(keyWord("East")).toBe("e");
    expect(keyWord("ouest")).toBe("w");
    expect(keyWord("N")).toBe("n");
  });
  it("drops case and accents from other words and leaves them otherwise alone", () => {
    expect(keyWord("Église")).toBe("eglise");
    expect(keyWord("Yonge")).toBe("yonge");
  });
});

describe("filterStreets", () => {
  it("keeps every street, in order, for an empty or blank search", () => {
    for (const q of ["", "   ", ".", " , "]) expect(keys(q)).toEqual(groups.map((g) => g.key));
  });
  it("finds a street by part of its name", () => {
    expect(keys("yon")).toEqual(["yonge street"]);
  });
  it("ignores case and accents", () => {
    expect(keys("EGLISE")).toEqual(["rue de l' eglise"]);
    expect(keys("église")).toEqual(["rue de l' eglise"]);
    expect(keys("sainte-catherine")).toEqual(["rue sainte-catherine W"]);
  });
  it("matches a short street type to the full one", () => {
    expect(keys("yonge st")).toEqual(["yonge street"]);
    expect(keys("queen rd")).toEqual(["queen road"]);
  });
  it("needs every word typed", () => {
    expect(keys("king west")).toEqual(["king street W"]);
    expect(keys("king st e")).toEqual(["king street E"]);
    expect(keys("king queen")).toEqual([]);
  });
  it("finds the two sides of a divided street with the name alone", () => {
    expect(keys("king")).toEqual(["king street E", "king street W"]);
  });
  it("matches a French direction word", () => {
    expect(keys("catherine ouest")).toEqual(["rue sainte-catherine W"]);
  });
  it("finds a highway by its number", () => {
    expect(keys("highway 7")).toEqual(["highway 7 E"]);
  });
  it("matches the start of a word, not the middle", () => {
    expect(keys("onge")).toEqual([]);
    expect(keys("cath")).toEqual(["rue sainte-catherine W"]);
  });
  it("matches a single letter only as a whole word, so E is not found inside street", () => {
    expect(keys("e")).toEqual(["highway 7 E", "king street E"].sort());
  });
  it("finds nothing for a street that is not there", () => {
    expect(keys("zzz")).toEqual([]);
  });
  it("keeps the order of the streets it is given", () => {
    const reversed = [...groups].reverse();
    expect(filterStreets(reversed, "king").map((g) => g.key)).toEqual(["king street W", "king street E"]);
  });
  it("does not change the groups it is given", () => {
    const before = JSON.stringify(groups);
    filterStreets(groups, "king");
    expect(JSON.stringify(groups)).toBe(before);
  });
  it("returns a new array even when nothing is filtered", () => {
    expect(filterStreets(groups, "")).not.toBe(groups);
  });
});
