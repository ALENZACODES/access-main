import { describe, expect, it } from "vitest";
import { copyLintOk } from "./writingApostrophe.helpers";
import { parseCsv } from "./csvParse";
import { place } from "./placeFixtures";
import { wrApostropheLine, wrApostropheSummary, wrFilterLabel } from "./writingCopy";
import { writingToCsv, writingToText } from "./writingExport";
import { WRITING_FILTER_GROUPS, buildWritingReport, filterWriting, isWritingFilter, noticed } from "./writingReport";
import { apostropheForm, apostropheIds, findApostropheMix, type ApostropheMix } from "./writingApostrophe";

const S = "'";
const C = "’";
const named = (id: string, name: string | null) => place(id, { name, address: "1 Main Street" });
const list = (straight: number, curly: number) => [
  ...Array.from({ length: straight }, (_, i) => named(`s${i}`, `Joe${S}s Place ${i}`)),
  ...Array.from({ length: curly }, (_, i) => named(`c${i}`, `Mary${C}s Place ${i}`)),
];
const mix = (minority: "straight" | "curly", straightCount: number, curlyCount: number): ApostropheMix => ({ straightCount, curlyCount, minority, ids: ["x"] });

describe("apostropheForm", () => {
  it.each([
    [`Joe${S}s`, "straight"],
    [`Joe${C}s`, "curly"],
    ["Joes", null],
    [`Joe${S}s ${C}Bar`, null],
    [`${C}${S}`, null],
    ["", null],
  ])("reads %j as %s", (name, want) => expect(apostropheForm(name)).toBe(want));
  it("is null for no name", () => expect(apostropheForm(null)).toBeNull());
  it("does not read the left single quotation mark or the grave accent as an apostrophe", () => {
    expect(apostropheForm("‘Joe‘")).toBeNull();
    expect(apostropheForm("Joe`s")).toBeNull();
  });
});

describe("findApostropheMix", () => {
  it("points out the names using the less common kind", () => {
    expect(findApostropheMix(list(1, 3))).toEqual({ straightCount: 1, curlyCount: 3, minority: "straight", ids: ["s0"] });
    expect(findApostropheMix(list(3, 1))).toEqual({ straightCount: 3, curlyCount: 1, minority: "curly", ids: ["c0"] });
  });
  it("reads a tie as the straight kind being the minority", () => expect(findApostropheMix(list(2, 2))).toMatchObject({ minority: "straight", ids: ["s0", "s1"] }));
  it("needs both kinds", () => {
    expect(findApostropheMix(list(4, 0))).toBeNull();
    expect(findApostropheMix(list(0, 4))).toBeNull();
  });
  it("needs at least four names with an apostrophe", () => {
    expect(findApostropheMix(list(1, 2))).toBeNull();
    expect(findApostropheMix(list(1, 3))).not.toBeNull();
  });
  it("does not count names with no apostrophe or with both", () => {
    const extra = [named("n", "Plain Name"), named("b", `Both${S} and${C}`), named("z", null)];
    expect(findApostropheMix([...list(1, 2), ...extra])).toBeNull();
    expect(findApostropheMix([...list(1, 3), ...extra])?.ids).toEqual(["s0"]);
  });
  it("keeps the ids in pack order", () => {
    const places = [named("b", `B${S}s`), named("c", `C${C}s`), named("a", `A${S}s`), named("d", `D${C}s`), named("e", `E${C}s`)];
    expect(findApostropheMix(places)?.ids).toEqual(["b", "a"]);
  });
  it("is null for no places", () => expect(findApostropheMix([])).toBeNull());
  it("turns a mix into a set of ids", () => {
    expect([...apostropheIds(findApostropheMix(list(1, 3)))]).toEqual(["s0"]);
    expect(apostropheIds(null).size).toBe(0);
  });
});

describe("apostrophe mix in the report", () => {
  it("points out the place and counts it as one thing noticed", () => {
    const r = buildWritingReport(list(1, 3));
    expect(r.findings.map((f) => f.id)).toEqual(["s0"]);
    expect(r.apostropheMix?.minority).toBe("straight");
    expect(noticed(r.findings[0]!)).toBe(1);
    expect(r.findings[0]!.apostropheMix).toBe(r.apostropheMix);
  });
  it("is null on the report and the findings when only one kind is used", () => {
    const r = buildWritingReport(list(0, 4));
    expect(r.apostropheMix).toBeNull();
    expect(r.findings).toEqual([]);
  });
  it("has a filter of its own", () => {
    expect(WRITING_FILTER_GROUPS).toContain("apostrophe");
    expect(isWritingFilter("apostrophe")).toBe(true);
    const f = buildWritingReport(list(1, 3)).findings;
    expect(filterWriting(f, "apostrophe").map((x) => x.id)).toEqual(["s0"]);
    expect(filterWriting(f, "direction")).toEqual([]);
  });
});

describe("apostrophe wording", () => {
  it("says which kind this name uses and how many use each", () => {
    expect(wrApostropheLine(mix("straight", 1, 3), "en")).toBe("This name uses the straight form of the apostrophe, as 1 of 4 names with an apostrophe do; 3 use the curly form.");
    expect(wrApostropheLine(mix("curly", 3, 1), "en")).toBe("This name uses the curly form of the apostrophe, as 1 of 4 names with an apostrophe do; 3 use the straight form.");
  });
  it("is in French and agrees in number", () => {
    expect(wrApostropheLine(mix("straight", 1, 3), "fr")).toBe("Ce nom utilise la forme droite de l’apostrophe, comme 1 nom sur 4 avec une apostrophe ; 3 utilisent la forme courbe.");
    expect(wrApostropheLine(mix("straight", 2, 2), "fr")).toContain("comme 2 noms sur 4");
  });
  it("has a summary only when there is a mix", () => {
    expect(wrApostropheSummary({ apostropheMix: null }, "en")).toBe("");
    expect(wrApostropheSummary({ apostropheMix: mix("straight", 1, 3) }, "en")).toBe("The apostrophe in names is written two ways in the list.");
    expect(wrApostropheSummary({ apostropheMix: mix("straight", 1, 3) }, "fr")).toBe("L’apostrophe des noms est écrite de deux façons dans la liste.");
  });
  it("passes the copy lint in both languages", () => {
    for (const l of ["en", "fr"] as const) for (const s of [wrApostropheLine(mix("straight", 1, 3), l), wrApostropheLine(mix("curly", 3, 1), l), wrApostropheSummary({ apostropheMix: mix("straight", 1, 3) }, l), wrFilterLabel("apostrophe", l)]) expect(copyLintOk(s, l), s).toBe(true);
  });
  it("labels the filter differently from the others", () => expect(new Set(WRITING_FILTER_GROUPS.map((f) => wrFilterLabel(f, "fr"))).size).toBe(WRITING_FILTER_GROUPS.length));
});

describe("apostrophe mix in the files", () => {
  it("adds a name row to the CSV", () => {
    const rows = parseCsv(writingToCsv(buildWritingReport(list(1, 3)).findings, "en"));
    const r = rows.ok ? rows.rows : [];
    expect(r).toHaveLength(2);
    expect(r[1]!.slice(0, 5)).toEqual(["s0", `Joe${S}s Place 0`, "1 Main Street", "name", "apostrophe-mix"]);
    expect(r[1]![6]).toContain("the straight form of the apostrophe");
  });
  it("adds a line to the text, in French for French", () => {
    const f = buildWritingReport(list(1, 3)).findings;
    expect(writingToText(f, "en")).toContain("  - This name uses the straight form");
    expect(writingToText(f, "fr")).toContain("  - Ce nom utilise la forme droite");
  });
});
