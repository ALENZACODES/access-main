import { describe, expect, it } from "vitest";
import { findNearNames } from "./nearNames";
import { NEAR_NAMES_CSV_FILENAMES, nearNamesCaveat, nearNamesSummary, nearNamesToCsv, nearNamesToText, nearPairText, nearRelationText } from "./nearNamesCopy";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";

const at = (id: string, name: string) => place(id, { name });
const r = findNearNames([at("a1", "Tim Hortons"), at("a2", "Tim Hortons"), at("b1", "Tim Horton"), at("c1", "Library"), at("c2", "Librory"), at("d1", "Hotrons Cafe"), at("d2", "Hortons Cafe")]);

describe("sentences", () => {
  it("names each kind of difference in both languages", () => {
    for (const k of ["missing", "different", "swapped"] as const) {
      expect(nearRelationText(k, "en")).not.toBe(nearRelationText(k, "fr"));
      expect(nearRelationText(k, "en").length).toBeGreaterThan(8);
    }
  });
  it("says what a pair is, and where the extra letter is", () => {
    const p = r.pairs.find((x) => x.a.label === "Tim Hortons")!;
    expect(nearPairText(p, "en")).toBe("Tim Hortons (2 places) and Tim Horton (1 place): one letter more in the first.");
    expect(nearPairText(p, "fr")).toBe("Tim Hortons (2 lieux) et Tim Horton (1 lieu)\u00a0: une lettre de plus dans le premier.");
    const d = r.pairs.find((x) => x.a.label === "Library")!;
    expect(nearPairText(d, "en")).toBe("Library (1 place) and Librory (1 place): one letter different.");
  });
  it("summarises none, one, several and a cut-off list", () => {
    expect(nearNamesSummary({ pairs: [], leftOut: 0 }, "en")).toBe("No two names on screen are one letter apart.");
    expect(nearNamesSummary({ pairs: [r.pairs[0]!], leftOut: 0 }, "en")).toBe("1 pair of names is one letter apart.");
    expect(nearNamesSummary(r, "en")).toBe("3 pairs of names are one letter apart.");
    expect(nearNamesSummary({ pairs: r.pairs, leftOut: 5 }, "en")).toBe("8 pairs of names are one letter apart. The first 3 are listed.");
    expect(nearNamesSummary(r, "fr")).toBe("3 paires de noms diffèrent d’une lettre.");
  });
  it("the caveat says may be one name or two places", () => {
    expect(nearNamesCaveat("en")).toMatch(/one name spelled two ways, or two different places/);
    expect(nearNamesCaveat("fr")).toMatch(/deux lieux différents/);
  });
});

describe("files", () => {
  it("text lists every pair after the caveat and ends with one newline", () => {
    const txt = nearNamesToText(r, "en");
    expect(txt.endsWith("\n")).toBe(true);
    expect(txt.endsWith("\n\n")).toBe(false);
    expect(txt).toContain(nearNamesCaveat("en"));
    for (const p of r.pairs) expect(txt).toContain(`- ${nearPairText(p, "en")}`);
  });
  it("text with no pair says so", () => {
    expect(nearNamesToText({ pairs: [], leftOut: 0 }, "en")).toContain("No two names on screen are one letter apart.");
  });
  it("csv has a BOM, CRLF, seven columns and the ids behind each name", () => {
    const csv = nearNamesToCsv(r, "en");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1 + r.pairs.length);
    for (const l of lines) expect(l.replace(/"(?:[^"]|"")*"/g, "x").split(",")).toHaveLength(7);
    expect(csv).toContain("Tim Hortons,2,a1 a2,Tim Horton,1,b1,one letter more");
  });
  it("csv quotes a name with a comma and defuses a formula", () => {
    const x = findNearNames([at("a", "=Cmdxx"), at("b", "=Cmdxy"), at("c", "Salt, Pepper"), at("d", "Salt, Peppar")]);
    const csv = nearNamesToCsv(x, "en");
    expect(csv).toContain("'=Cmdxx");
    expect(csv).toContain('"Salt, Pepper"');
  });
  it("names two different files", () => expect(NEAR_NAMES_CSV_FILENAMES.en).not.toBe(NEAR_NAMES_CSV_FILENAMES.fr));
});

describe("French typography", () => {
  it("every French string passes lintFrench", () => {
    const out = [nearNamesCaveat("fr"), nearNamesSummary(r, "fr"), nearNamesSummary({ pairs: [], leftOut: 0 }, "fr"), nearNamesSummary({ pairs: r.pairs, leftOut: 2 }, "fr")];
    for (const k of ["missing", "different", "swapped"] as const) out.push(nearRelationText(k, "fr"));
    for (const p of r.pairs) out.push(nearPairText(p, "fr"));
    out.push(...nearNamesToText(r, "fr").split("\n"));
    for (const s of out) expect(lintFrench(s), s).toEqual([]);
  });
});
