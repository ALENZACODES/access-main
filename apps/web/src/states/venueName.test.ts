import { describe, expect, it } from "vitest";
import { PART_KINDS, foldVenueName, readName, venueBase, venueDisplayBase, venuePartKind, venuePartLabel } from "./venueName";

type Want = { base: string | null; kind: (typeof PART_KINDS)[number]; partWords?: string[] };
const cases: ReadonlyArray<readonly [string, string | null, Want]> = [
  ["a plain name", "Sankofa Square", { base: "sankofa square", kind: "main", partWords: [] }],
  ["a part word at the end", "Sankofa Square Entrance", { base: "sankofa square", kind: "entrance", partWords: ["entrance"] }],
  ["an elevator", "Sankofa Square Elevator", { base: "sankofa square", kind: "elevator" }],
  ["a lift", "Union Station Lift", { base: "union station", kind: "elevator" }],
  ["parking with a qualifier", "Sankofa Square Underground Parking", { base: "sankofa square", kind: "parking" }],
  ["a garage", "City Hall Garage", { base: "city hall", kind: "parking" }],
  ["a washroom", "Union Station Washroom", { base: "union station", kind: "washroom" }],
  ["a restroom", "Union Station Restroom", { base: "union station", kind: "washroom" }],
  ["a ramp", "Library Ramp", { base: "library", kind: "ramp" }],
  ["a door", "Library Door", { base: "library", kind: "entrance" }],
  ["a part word first and a link word", "Entrance from The Tenor (via PATH)", { base: "tenor", kind: "entrance" }],
  ["a bracket note is dropped", "The Tenor (PATH)", { base: "tenor", kind: "main" }],
  ["square brackets are dropped", "The Tenor [north side]", { base: "tenor", kind: "main" }],
  ["a French entrance", "Entrée de la Place Ville-Marie", { base: "place ville marie", kind: "entrance" }],
  ["a French elevator", "Ascenseur du Musée", { base: "musee", kind: "elevator" }],
  ["French parking", "Stationnement de l’hôtel de ville", { base: "hotel de ville", kind: "parking" }],
  ["French toilets", "Toilettes de la gare", { base: "gare", kind: "washroom" }],
  ["a French ramp", "Rampe du Musée", { base: "musee", kind: "ramp" }],
  ["a name with an apostrophe", "Jack Astor's", { base: "jack astor's", kind: "main" }],
  ["an ampersand", "Jewellery & Diamond Center", { base: "jewellery and diamond center", kind: "main" }],
  ["a hyphen", "Toronto Eaton Centre - SMART", { base: "toronto eaton centre smart", kind: "main" }],
  ["a part word alone", "Entrance", { base: null, kind: "entrance" }],
  ["a qualifier and a part word", "Main Entrance", { base: null, kind: "entrance" }],
  ["an elevator alone in French", "Ascenseur", { base: null, kind: "elevator" }],
  ["a number in the name", "Gate 12 Entrance", { base: "12", kind: "entrance" }],
  ["upper case", "SANKOFA SQUARE ENTRANCE", { base: "sankofa square", kind: "entrance" }],
  ["extra spaces", "  Sankofa   Square   Entrance ", { base: "sankofa square", kind: "entrance" }],
  ["a leading article in English", "The Tenor", { base: "tenor", kind: "main" }],
  ["a leading article in French", "La Gare", { base: "gare", kind: "main" }],
  ["an elided article", "L’Hôtel", { base: "hotel", kind: "main" }],
  ["a name that is only an article", "The", { base: "the", kind: "main" }],
  ["a directional qualifier next to a part word", "Library North Entrance", { base: "library", kind: "entrance" }],
  ["a directional word in the name of a main place", "North York Centre", { base: "north york centre", kind: "main" }],
  ["the first part word sets the kind", "Elevator Entrance Library", { base: "library", kind: "elevator", partWords: ["elevator", "entrance"] }],
  ["a link word inside the name stays", "Bank of Montreal", { base: "bank of montreal", kind: "main" }],
  ["a link word at the end is dropped when a part word is present", "Library Entrance at", { base: "library", kind: "entrance" }],
];

describe("readName", () => {
  it.each(cases)("%s", (_label, input, want) => {
    const got = readName(input);
    expect(got.base).toBe(want.base);
    expect(got.kind).toBe(want.kind);
    if (want.partWords !== undefined) expect(got.partWords).toEqual(want.partWords);
  });
  it.each([[null], [undefined], [""], ["   "], ["()"], ["(PATH)"], ["---"]])("reads %j as no name", (input) => {
    expect(readName(input as string | null | undefined)).toEqual({ base: null, kind: "main", partWords: [] });
  });
  it("does not change the text it is given", () => {
    const text = "Entrance from The Tenor (via PATH)";
    readName(text);
    expect(text).toBe("Entrance from The Tenor (via PATH)");
  });
  it("gives the same answer every time", () => {
    expect(readName("Sankofa Square Entrance")).toEqual(readName("Sankofa Square Entrance"));
  });
  it("joins the forms of one venue name under one base", () => {
    const names = ["Sankofa Square", "Sankofa Square Entrance", "Entrance from Sankofa Square (via PATH)", "SANKOFA SQUARE ELEVATOR", "Sankofa Square Underground Parking"];
    expect(new Set(names.map(venueBase)).size).toBe(1);
  });
  it("keeps different venues apart", () => {
    expect(venueBase("Sankofa Square")).not.toBe(venueBase("Dundas Square"));
    expect(venueBase("Union Station")).not.toBe(venueBase("Union Station Plaza"));
  });
  it("matches an accent typed with or without it", () => {
    expect(venueBase("Entrée Musée")).toBe(venueBase("Entree Musee"));
  });
  it("does not read a part word inside a longer word", () => {
    expect(readName("Doorway Cafe").kind).toBe("main");
    expect(readName("Gateway Plaza").kind).toBe("main");
    expect(readName("Liftoff Studio").kind).toBe("main");
    expect(readName("Rampart Hall").kind).toBe("main");
  });
});

describe("venueBase and venuePartKind", () => {
  it("are the base and the kind of readName", () => {
    expect(venueBase("Library Ramp")).toBe("library");
    expect(venuePartKind("Library Ramp")).toBe("ramp");
    expect(venueBase(null)).toBeNull();
    expect(venuePartKind(null)).toBe("main");
  });
});

describe("foldVenueName", () => {
  it("lowers case, drops accents and marks, and tidies spaces", () => {
    expect(foldVenueName("  Café   Étoile! ")).toBe("cafe etoile");
  });
  it("turns the curly apostrophe into a straight one", () => {
    expect(foldVenueName("Jack Astor’s")).toBe("jack astor's");
  });
  it("splits an elided article from its word", () => {
    expect(foldVenueName("L’Église")).toBe("l' eglise");
    expect(foldVenueName("D'Arcy")).toBe("d' arcy");
  });
  it("does not split an apostrophe inside a name", () => {
    expect(foldVenueName("Astor's")).toBe("astor's");
  });
  it("writes an ampersand as and", () => {
    expect(foldVenueName("A&B")).toBe("a and b");
  });
  it("is stable when applied twice", () => {
    const once = foldVenueName("Jack Astor’s — L’Église & Co.");
    expect(foldVenueName(once)).toBe(once);
  });
});

describe("venuePartLabel", () => {
  it("has a label for every kind in both languages, and the French differs from the English", () => {
    for (const k of PART_KINDS) {
      expect(venuePartLabel(k, "en")).not.toBe("");
      expect(venuePartLabel(k, "fr")).not.toBe("");
    }
    expect(venuePartLabel("entrance", "en")).toBe("Entrance");
    expect(venuePartLabel("entrance", "fr")).toBe("Entrée");
    expect(venuePartLabel("main", "fr")).toBe("Lieu principal");
  });
  it("lists the kinds with the main place first", () => {
    expect(PART_KINDS[0]).toBe("main");
    expect(new Set(PART_KINDS).size).toBe(PART_KINDS.length);
  });
});

describe("venueDisplayBase", () => {
  it.each([
    ["Sankofa Square Entrance", "Sankofa Square"],
    ["Entrée du Musée", "Musée"],
    ["Entrance from The Tenor (via PATH)", "Tenor"],
    ["Entrée de la Place Ville-Marie", "Place Ville-Marie"],
    ["Stationnement de l’Hôtel de Ville", "Hôtel de Ville"],
    ["Jack Astor's", "Jack Astor's"],
    ["SANKOFA SQUARE ELEVATOR", "SANKOFA SQUARE"],
    ["Café Étoile Parking", "Café Étoile"],
  ])("writes %j as %j", (input, want) => {
    expect(venueDisplayBase(input)).toBe(want);
  });
  it("is null when the name has no base", () => {
    for (const n of [null, undefined, "", "Entrance", "Main Entrance", "()"]) expect(venueDisplayBase(n as string | null | undefined)).toBeNull();
  });
  it("has the same words as the base once folded", () => {
    for (const n of ["Sankofa Square Entrance", "Entrée du Musée", "Entrée de la Place Ville-Marie", "Stationnement de l’Hôtel de Ville", "Gate 12 Entrance"]) {
      expect(foldVenueName(venueDisplayBase(n)!)).toBe(venueBase(n));
    }
  });
});
