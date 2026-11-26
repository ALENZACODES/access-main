import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { place } from "./placeFixtures";
import { WR_CSV_HEADER, wrDirectionLine, wrDirectionSummary, wrFilterLabel } from "./writingCopy";
import { writingToCsv, writingToText } from "./writingExport";
import { WRITING_FILTER_GROUPS, buildWritingReport, filterWriting, isWritingFilter, noticed, orderWriting } from "./writingReport";
import type { StyleMix } from "./writingStyle";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const at = (id: string, address: string, name = `Place ${id}`) => place(id, { address, name });
const places = () => [at("a", "1 Queen Street W"), at("b", "2 King Street West"), at("c", "3 Bay Street West"), at("d", "4 Yonge Street West"), at("e", "5 Oak Avenue")];
const mix = (minority: "short" | "long", shortCount: number, longCount: number): StyleMix => ({ long: "west", shortCount, longCount, minority, ids: ["a"] });

describe("direction mixes in the report", () => {
  it("point out the place using the less common form", () => {
    const r = buildWritingReport(places());
    expect(r.directionMixes).toHaveLength(1);
    expect(r.directionMinority).toBe(1);
    expect(r.findings.map((f) => f.id)).toEqual(["a"]);
    expect(r.findings[0]!.directionMix).toMatchObject({ long: "west", minority: "short" });
    expect(r.findings[0]!.styleMix).toBeNull();
  });
  it("leave a plain list with no finding", () => {
    const r = buildWritingReport([at("a", "1 Queen Street W"), at("b", "2 King Street West")]);
    expect(r.findings).toEqual([]);
    expect(r.directionMinority).toBe(0);
  });
  it("count together with the street-type note", () => {
    const list = [at("a", "1 Queen St W"), at("b", "2 King Street West"), at("c", "3 Bay Street West"), at("d", "4 Yonge Street West")];
    const f = buildWritingReport(list).findings;
    expect(f).toHaveLength(1);
    expect(f[0]!.styleMix).not.toBeNull();
    expect(f[0]!.directionMix).not.toBeNull();
    expect(noticed(f[0]!)).toBe(2);
  });
  it("have a filter of their own", () => {
    expect(WRITING_FILTER_GROUPS).toContain("direction");
    expect(isWritingFilter("direction")).toBe(true);
    const f = buildWritingReport(places()).findings;
    expect(filterWriting(f, "direction").map((x) => x.id)).toEqual(["a"]);
    expect(filterWriting(f, "style")).toEqual([]);
  });
  it("order a place with more noticed above one with fewer", () => {
    const list = [at("a", "1 Queen Street W", "ZED"), at("b", "2 King Street West", "Alpha"), at("c", "3 Bay Street West"), at("d", "4 Yonge Street West")];
    const f = buildWritingReport(list).findings;
    expect(orderWriting(f, "most").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("direction wording", () => {
  it("says which form this address uses and how many use each", () => {
    expect(wrDirectionLine(mix("short", 1, 3), "en")).toBe("This address ends with “W”, as 1 of 4 addresses with this direction do; 3 write “West”.");
    expect(wrDirectionLine(mix("long", 3, 1), "en")).toBe("This address ends with “West”, as 1 of 4 addresses with this direction do; 3 write “W”.");
  });
  it("is in French with French quotation marks", () => {
    expect(wrDirectionLine(mix("short", 1, 3), "fr")).toBe("Cette adresse se termine par «\u202fW\u202f», comme 1 adresse sur 4 avec cette direction\u202f; 3 écrivent «\u202fWest\u202f».");
    expect(wrDirectionLine(mix("short", 2, 2), "fr")).toContain("comme 2 adresses sur 4");
  });
  it("counts the directions written two ways, in the singular and the plural", () => {
    expect(wrDirectionSummary({ directionMixes: [] }, "en")).toBe("");
    expect(wrDirectionSummary({ directionMixes: [mix("short", 1, 3)] }, "en")).toBe("1 direction is written two ways in the list.");
    expect(wrDirectionSummary({ directionMixes: [mix("short", 1, 3), mix("long", 3, 1)] }, "en")).toBe("2 directions are written two ways in the list.");
    expect(wrDirectionSummary({ directionMixes: [mix("short", 1, 3)] }, "fr")).toBe("1 direction est écrite de deux façons dans la liste.");
    expect(wrDirectionSummary({ directionMixes: [mix("short", 1, 3), mix("long", 3, 1)] }, "fr")).toBe("2 directions sont écrites de deux façons dans la liste.");
  });
  it("passes the copy lint", () => {
    for (const l of ["en", "fr"] as const) {
      for (const s of [wrDirectionLine(mix("short", 1, 3), l), wrDirectionLine(mix("long", 3, 1), l), wrDirectionSummary({ directionMixes: [mix("short", 1, 3)] }, l), wrFilterLabel("direction", l)]) {
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    }
  });
  it("labels the filter differently from the others", () => {
    expect(new Set(WRITING_FILTER_GROUPS.map((f) => wrFilterLabel(f, "en"))).size).toBe(WRITING_FILTER_GROUPS.length);
  });
});

describe("direction mixes in the files", () => {
  it("add a row of their own to the CSV", () => {
    const rows = parseCsv(writingToCsv(buildWritingReport(places()).findings, "en"));
    const r = rows.ok ? rows.rows : [];
    expect(r[0]).toEqual([...WR_CSV_HEADER]);
    expect(r).toHaveLength(2);
    expect(r[1]!.slice(0, 5)).toEqual(["a", "Place a", "1 Queen Street W", "address", "direction-mix"]);
    expect(r[1]![6]).toContain("This address ends with");
  });
  it("add a line to the text", () => {
    const t = writingToText(buildWritingReport(places()).findings, "en");
    expect(t).toContain("  - This address ends with “W”");
  });
  it("write the street-type and direction rows one after the other", () => {
    const list = [at("a", "1 Queen St W"), at("b", "2 King Street West"), at("c", "3 Bay Street West"), at("d", "4 Yonge Street West")];
    const rows = parseCsv(writingToCsv(buildWritingReport(list).findings, "en"));
    expect(rows.ok && rows.rows.slice(1).map((x) => x[4])).toEqual(["street-type-mix", "direction-mix"]);
  });
});
