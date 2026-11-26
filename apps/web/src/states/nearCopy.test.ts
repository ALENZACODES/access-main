import { describe, expect, it } from "vitest";
import { buildNearGroups } from "./nearGroup";
import { NEAR_CSV_FILENAMES, NEAR_FILENAMES, nearCaveat, nearGroupLine, nearGroupTitle, nearRadiusText, nearSummary, nearToCsv, nearToText } from "./nearCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });
const STEP = 0.0004;
const ps = [at("a", 0, { name: "Alpha" }), at("b", STEP, { name: "Bravo", wheelchair: "no" }), at("c", 0.02, { name: "Charlie" }), bare("z")];
const r = buildNearGroups(ps, 100);
const map = new Map(ps.map((p) => [p.id, p] as const));

describe("radius text", () => {
  it("writes metres with a no-break space, French the same", () => {
    expect(nearRadiusText(100, "en")).toBe("100\u00a0m");
    expect(nearRadiusText(500, "fr")).toBe("500\u00a0m");
  });
});

describe("nearSummary", () => {
  it("counts groups, places in groups, places alone and places with no point", () => {
    expect(nearSummary(r, "en")).toBe("1 group with 2 places, each place within 100\u00a0m of another in its group. 1 place on its own. 1 with no map point: UNKNOWN.");
  });
  it("is French with the colon before UNKNOWN spaced", () => {
    const s = nearSummary(r, "fr");
    expect(s).toContain("1 groupe de 2 lieux");
    expect(s).toContain("1 lieu seul.");
    expect(s).toContain("sans point de carte\u00a0: UNKNOWN");
  });
  it("uses singular and plural", () => {
    const two = buildNearGroups([at("a", 0), at("b", 0.02), at("c", 0.04)], 100);
    expect(nearSummary(two, "en")).toContain("3 places on their own.");
    expect(nearSummary(two, "fr")).toContain("3 lieux seuls.");
  });
  it("says so when no two places are close", () => {
    expect(nearSummary(buildNearGroups([at("a", 0), at("b", 0.02)], 50), "en")).toMatch(/^No two places are within 50\u00a0m of each other\./);
    expect(nearSummary(buildNearGroups([at("a", 0), at("b", 0.02)], 50), "fr")).toMatch(/^Aucun lieu n’est à moins de 50\u00a0m d’un autre\./);
  });
  it("counts places with no point even when nothing else is there", () => {
    const only = buildNearGroups([bare("z")], 100);
    expect(nearSummary(only, "en")).toContain("1 with no map point: UNKNOWN.");
    expect(nearSummary(only, "en")).not.toContain("nothing to compare");
  });
  it("says there is nothing to compare for no places", () => {
    expect(nearSummary(buildNearGroups([], 100), "en")).toBe("There are no places to compare.");
    expect(nearSummary(buildNearGroups([], 100), "fr")).toBe("Il n’y a aucun lieu à comparer.");
  });
});

describe("caveat and group lines", () => {
  it("the caveat says it is a straight line and not a route", () => {
    expect(nearCaveat("en")).toMatch(/straight line/);
    expect(nearCaveat("en")).toMatch(/does not say that a person can get/);
    expect(nearCaveat("fr")).toMatch(/ligne droite/);
  });
  it("titles groups by number", () => {
    expect(nearGroupTitle(r.groups[0]!, "en")).toBe("Group 1");
    expect(nearGroupTitle(r.groups[0]!, "fr")).toBe("Groupe 1");
  });
  it("gives size, span and tag mix", () => {
    const line = nearGroupLine(r.groups[0]!, map, "en");
    expect(line).toMatch(/^2 places, furthest apart \d+\u00a0m: Yes 1, No 1$/);
  });
  it("says 'at the same point' for a zero span", () => {
    const same = buildNearGroups([at("a", 0), at("b", 0)], 50);
    expect(nearGroupLine(same.groups[0]!, new Map([["a", at("a", 0)], ["b", at("b", 0)]]), "en")).toMatch(/at the same point/);
    expect(nearGroupLine(same.groups[0]!, new Map([["a", at("a", 0)], ["b", at("b", 0)]]), "fr")).toMatch(/au même point/);
  });
  it("leaves out the mix when the places are not in the map given", () => {
    expect(nearGroupLine(r.groups[0]!, new Map(), "en")).toMatch(/^2 places, furthest apart \d+\u00a0m$/);
  });
});

describe("text file", () => {
  it("lists the groups, those on their own and those with no point", () => {
    const text = nearToText(r, ps, "en");
    expect(text.startsWith("Places close together\n")).toBe(true);
    expect(text).toContain("Group 1: 2 places");
    expect(text).toContain("  Alpha; Bravo");
    expect(text).toContain("On their own: Charlie");
    expect(text).toContain("No map point: UNKNOWN");
    expect(text.endsWith("\n")).toBe(true);
  });
  it("is French typographically", () => {
    const text = nearToText(r, ps, "fr");
    expect(text).toContain("Groupe 1\u00a0:");
    expect(text).toContain("Seuls\u00a0: Charlie");
    expect(lintFrench(text)).toEqual([]);
  });
  it("omits sections that are empty", () => {
    const only = buildNearGroups([at("a", 0), at("b", STEP)], 100);
    const text = nearToText(only, ps.slice(0, 2), "en");
    expect(text).not.toContain("On their own");
    expect(text).not.toContain("No map point");
  });
  it("names every place once", () => {
    const text = nearToText(r, ps, "en");
    for (const n of ["Alpha", "Bravo", "Charlie"]) expect(text.split(n).length - 1).toBe(1);
  });
});

describe("CSV file", () => {
  const csv = nearToCsv(r, ps, "en");
  const lines = csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
  it("starts with a byte order mark and a header", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe("Place,Id,Group,Group span (metres),Radius (metres)");
  });
  it("has one row per place", () => expect(lines).toHaveLength(1 + ps.length));
  it("gives group number, span and radius for grouped places", () => {
    expect(lines[1]).toMatch(/^Alpha,a,1,\d+,100$/);
  });
  it("marks those alone and those with no point", () => {
    expect(lines).toContain("Charlie,c,alone,0,100");
    expect(lines).toContain(`UNKNOWN,z,UNKNOWN,UNKNOWN,100`);
  });
  it("keeps a formula-looking name from being read as a formula", () => {
    const evil = [at("a", 0, { name: "=SUM(1)" }), at("b", STEP, { name: "@x" })];
    const out = nearToCsv(buildNearGroups(evil, 100), evil, "en");
    expect(out).toContain("'=SUM(1)");
    expect(out).toContain("'@x");
  });
  it("quotes commas and quotes", () => {
    const odd = [at("a", 0, { name: 'A, "B"' }), at("b", STEP)];
    expect(nearToCsv(buildNearGroups(odd, 100), odd, "en")).toContain('"A, ""B"""');
  });
  it("French headers and the word for alone", () => {
    const fr = nearToCsv(r, ps, "fr");
    expect(fr).toContain("Lieu,Identifiant,Groupe,Étendue du groupe (mètres),Rayon (mètres)");
    expect(fr).toContain("Charlie,c,seul,0,100");
  });
});

describe("file names", () => {
  it("are plain and per language", () => {
    expect(NEAR_FILENAMES).toEqual({ en: "places-close-together.txt", fr: "lieux-proches.txt" });
    expect(NEAR_CSV_FILENAMES).toEqual({ en: "places-close-together.csv", fr: "lieux-proches.csv" });
  });
});
