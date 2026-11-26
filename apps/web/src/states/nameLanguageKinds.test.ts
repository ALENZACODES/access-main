import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { KIND_COLUMNS, NAME_KIND_CSV_HEADER, nameKindsCsvFile, nameKindsToCsv, summariseNameKinds, topKinds } from "./nameLanguageKinds";
import { buildNameReport } from "./nameLanguageReport";
import { place } from "./placeFixtures";

const p = (id: string, name: string | null, category: string | null, address = "1 Main Street") => place(id, { name, category, address });
const rows = () =>
  buildNameReport([
    p("a", "Bibliothèque municipale", "library"),
    p("b", "Public Library", "library"),
    p("c", "Library", "Library"),
    p("d", "Tim Hortons", "cafe"),
    p("e", "Café Zoé", "cafe"),
    p("f", "Parc des Lilas", "park"),
    p("g", "Mystery", null),
    p("h", null, "park"),
    p("i", "北京图书馆", "library"),
  ]).rows;

describe("summariseNameKinds", () => {
  const k = summariseNameKinds(rows());
  it("groups by kind, ignoring case, and keeps the first spelling", () => {
    expect(k.map((x) => x.kind)).toEqual(["library", "cafe", "park", "UNKNOWN"]);
  });
  it("counts the named places of each kind", () => expect(k.map((x) => x.total)).toEqual([4, 2, 1, 1]));
  it("does not count a place with no name", () => expect(k.find((x) => x.kind === "park")!.total).toBe(1));
  it("counts each reading per kind", () => {
    expect(k[0]!.byReading).toEqual({ french: 1, english: 2, both: 0, neither: 0, "other-script": 1, "no-name": 0 });
    expect(k[1]!.byReading).toMatchObject({ neither: 2 });
  });
  it("counts the places whose name and address point to different languages", () => {
    expect(k[0]!.differs).toBe(1);
    expect(k[1]!.differs).toBe(0);
  });
  it("puts UNKNOWN last even when it has the most places", () => {
    const many = summariseNameKinds(buildNameReport([p("a", "A", null), p("b", "B", null), p("c", "C", null), p("d", "D", "park")]).rows);
    expect(many.map((x) => x.kind)).toEqual(["park", "UNKNOWN"]);
  });
  it("breaks a tie by kind", () => {
    const tie = summariseNameKinds(buildNameReport([p("a", "A", "zoo"), p("b", "B", "bank")]).rows);
    expect(tie.map((x) => x.kind)).toEqual(["bank", "zoo"]);
  });
  it("is empty for no rows", () => expect(summariseNameKinds([])).toEqual([]));
  it("adds up: the counts of a kind sum to its total", () => {
    for (const x of k) expect(KIND_COLUMNS.reduce((n, c) => n + x.byReading[c], 0)).toBe(x.total);
  });
  it("adds up across kinds to the number of named places", () => expect(k.reduce((n, x) => n + x.total, 0)).toBe(8));
});

describe("topKinds", () => {
  const k = summariseNameKinds(rows());
  it("takes the first kinds and says how many were left", () => {
    expect(topKinds(k, 2)).toEqual({ shown: k.slice(0, 2), more: 2 });
    expect(topKinds(k, 10)).toEqual({ shown: k, more: 0 });
  });
  it("copes with zero, negative and fractional limits", () => {
    expect(topKinds(k, 0)).toEqual({ shown: [], more: 4 });
    expect(topKinds(k, -3)).toEqual({ shown: [], more: 4 });
    expect(topKinds(k, 1.9).shown).toHaveLength(1);
  });
});

describe("nameKindsToCsv", () => {
  it("writes the header and a row per kind", () => {
    const parsed = parseCsv(nameKindsToCsv(summariseNameKinds(rows())));
    expect(parsed.ok && parsed.rows[0]).toEqual([...NAME_KIND_CSV_HEADER]);
    expect(parsed.ok && parsed.rows[1]).toEqual(["library", "4", "1", "2", "0", "0", "1", "1"]);
    expect(parsed.ok && parsed.rows).toHaveLength(5);
  });
  it("has a column per reading, with no hyphen in a column name", () => {
    expect(NAME_KIND_CSV_HEADER).toEqual(["kind", "named_places", "french", "english", "both", "neither", "other_script", "name_and_address_differ"]);
  });
  it("guards a kind that starts like a formula", () => expect(nameKindsToCsv([{ kind: "=sum", total: 1, byReading: { french: 0, english: 0, both: 0, neither: 1, "other-script": 0, "no-name": 0 }, differs: 0 }])).toContain("'=sum"));
  it("starts with a byte order mark only when asked, and ends lines with CRLF", () => {
    expect(nameKindsToCsv([]).charCodeAt(0)).not.toBe(0xfeff);
    expect(nameKindsToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(nameKindsToCsv([])).toBe(NAME_KIND_CSV_HEADER.join(",") + "\r\n");
  });
  it("makes a file with the name given", () => expect(nameKindsCsvFile([], "kinds.csv")).toMatchObject({ name: "kinds.csv", mime: "text/csv;charset=utf-8" }));
});
