import { describe, expect, it } from "vitest";
import { NEAR_RADII } from "./nearGroup";
import { buildNeighbours } from "./nearNeighbour";
import { NEIGHBOUR_CSV_FILENAMES, NEIGHBOUR_FILENAMES, neighbourCountText, neighbourLine, neighbourSummary, neighbourToCsv, neighbourToText, pointText } from "./nearNeighbourCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });
const STEP = 0.0004;
const ps = [at("a", 0, { name: "Alpha" }), at("b", STEP, { name: "Bravo" }), at("c", 0.02, { name: "Charlie" }), bare("z")];
const n = buildNeighbours(ps);

describe("neighbourLine", () => {
  it("names the place, its nearest place, the distance and the direction", () => {
    const row = n.rows.find((r) => r.id === "a")!;
    expect(neighbourLine(row, "en")).toMatch(/^Alpha: Bravo, \d+\u00a0m to the north\.$/);
    expect(neighbourLine(row, "fr")).toMatch(/^Alpha\u00a0: Bravo, \d+\u00a0m vers le nord\.$/);
  });
  it("says same spot when there is no direction", () => {
    const same = buildNeighbours([at("a", 0), at("b", 0)]);
    expect(neighbourLine(same.rows[0]!, "en")).toMatch(/at the same spot\.$/);
    expect(neighbourLine(same.rows[0]!, "fr")).toMatch(/au même endroit\.$/);
  });
  it("writes UNKNOWN for a name the pack lacks", () => {
    const x = buildNeighbours([at("a", 0, { name: null }), at("b", STEP, { name: null })]);
    expect(neighbourLine(x.rows[0]!, "en")).toMatch(/^UNKNOWN: UNKNOWN, /);
  });
});

describe("summary and counts", () => {
  it("summarises with located places and those with no point", () => {
    expect(neighbourSummary(n, "en")).toBe("3 places with a map point, each paired with the nearest other place in a straight line. 1 with no map point: UNKNOWN.");
    expect(neighbourSummary(n, "fr")).toContain("sans point de carte\u00a0: UNKNOWN");
  });
  it("says two places are needed when there are fewer", () => {
    expect(neighbourSummary(buildNeighbours([at("a", 0)]), "en")).toMatch(/At least two places/);
    expect(neighbourSummary(buildNeighbours([]), "fr")).toMatch(/au moins deux lieux/);
  });
  it("gives one sentence per distance", () => {
    expect(neighbourCountText(n, 100, "en")).toBe("2 of 3 places have another place within 100\u00a0m.");
    expect(neighbourCountText(n, 500, "fr")).toBe("2 lieux sur 3 ont un autre lieu à moins de 500\u00a0m.");
  });
  it("gives 0 for a distance that is not listed", () => expect(neighbourCountText(n, 7, "en")).toMatch(/^0 of 3/));
});

describe("text file", () => {
  it("has a title, the summary, a count per distance and a line per place", () => {
    const text = neighbourToText(n, NEAR_RADII, "en");
    expect(text.startsWith("Nearest place to each place\n")).toBe(true);
    for (const r of NEAR_RADII) expect(text).toContain(`within ${r}\u00a0m.`);
    expect(text.split("\n").filter((l) => /^(Alpha|Bravo|Charlie): /.test(l))).toHaveLength(3);
  });
  it("gives only the summary when there are not two located places", () => {
    const text = neighbourToText(buildNeighbours([at("a", 0)]), NEAR_RADII, "en");
    expect(text).toContain("At least two places");
    expect(text).not.toContain("within");
  });
  it("is clean French", () => {
    expect(lintFrench(neighbourToText(n, NEAR_RADII, "fr").replace(/(Alpha|Bravo|Charlie)/g, "X"))).toEqual([]);
  });
});

describe("CSV file", () => {
  const lines = neighbourToCsv(n, ps, "en").replace(/^\ufeff/, "").trimEnd().split("\r\n");
  it("has a header, a row per located place, and a row per place with no point", () => {
    expect(lines[0]).toBe("Place,Id,Nearest place,Nearest id,Metres,Direction");
    expect(lines).toHaveLength(1 + 3 + 1);
  });
  it("gives metres as a plain number and the compass name", () => {
    expect(lines.find((l) => l.startsWith("Alpha,a,Bravo,b,"))).toMatch(/^Alpha,a,Bravo,b,\d+,north$/);
  });
  it("lists the place with no point as UNKNOWN", () => expect(lines.at(-1)).toBe("UNKNOWN,z,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN"));
  it("writes the name of a place with no point when the pack has one", () => {
    const named = [at("a", 0), at("b", STEP), place("q", { name: "Quiet", lat: null, lon: null })];
    expect(neighbourToCsv(buildNeighbours(named), named, "en")).toContain("Quiet,q,UNKNOWN");
  });
  it("is French and says same spot", () => {
    const same = [at("a", 0), at("b", 0)];
    const fr = neighbourToCsv(buildNeighbours(same), same, "fr");
    expect(fr).toContain("Lieu,Identifiant,Lieu le plus proche,Identifiant le plus proche,Mètres,Direction");
    expect(fr).toContain("même endroit");
  });
  it("defuses a formula-looking name", () => {
    const evil = [at("a", 0, { name: "=1+1" }), at("b", STEP)];
    expect(neighbourToCsv(buildNeighbours(evil), evil, "en")).toContain("'=1+1");
  });
});

describe("pointText and file names", () => {
  it("writes five decimals", () => expect(pointText({ lat: 43.6501, lon: -79.3798 })).toBe("43.65010, -79.37980"));
  it("writes a decimal comma and a semicolon in French", () => expect(pointText({ lat: 43.6501, lon: -79.3798 }, "fr")).toBe("43,65010\u202f; -79,37980"));
  it("file names are per language", () => {
    expect(NEIGHBOUR_FILENAMES.fr).toBe("lieux-les-plus-proches.txt");
    expect(NEIGHBOUR_CSV_FILENAMES.en).toBe("nearest-places.csv");
  });
});
