import { describe, expect, it } from "vitest";
import { MAX_GAP_ROWS, UNKNOWN_KIND, computeGaps, gapLines, gapRowLine } from "./packGaps";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const raw = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  wheelchair: "yes",
  provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10" },
  ...over,
});
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];

describe("computeGaps", () => {
  it("has no rows when nothing is missing", () => {
    expect(computeGaps(parse([raw("a"), raw("b")]))).toEqual({ rows: [], kindsWithGaps: 0 });
  });
  it("counts what each kind leaves out", () => {
    const r = computeGaps(parse([raw("a", { name: "" }), raw("b", { address: "" }), raw("c", { lat: undefined, lon: undefined }), raw("d")]));
    expect(r.rows).toEqual([{ kind: "cafe", records: 4, noName: 1, noAddress: 1, noPosition: 1 }]);
  });
  it("groups a record with no kind under UNKNOWN", () => {
    const r = computeGaps(parse([raw("a", { category: undefined, name: "" }), raw("b", { category: "UNKNOWN", name: "" }), raw("c", { category: "  ", name: "" })]));
    expect(r.rows).toEqual([{ kind: UNKNOWN_KIND, records: 3, noName: 3, noAddress: 0, noPosition: 0 }]);
  });
  it("merges kinds that differ only in letter case and keeps the first spelling", () => {
    const r = computeGaps(parse([raw("a", { category: "Cafe", name: "" }), raw("b", { category: "cafe", name: "" })]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ kind: "Cafe", records: 2, noName: 2 });
  });
  it("orders by the most missing, then by records, then by name", () => {
    const r = computeGaps(
      parse([
        raw("a", { category: "park", name: "" }),
        raw("b", { category: "cafe", name: "", address: "" }),
        raw("c", { category: "bank", name: "" }),
        raw("d", { category: "bank" }),
      ]),
    );
    expect(r.rows.map((x) => x.kind)).toEqual(["cafe", "bank", "park"]);
  });
  it("lists at most MAX_GAP_ROWS kinds but counts all of them", () => {
    const kinds = Array.from({ length: 14 }, (_, i) => raw(`k${i}`, { category: `kind${String(i).padStart(2, "0")}`, name: "" }));
    const r = computeGaps(parse(kinds));
    expect(r.kindsWithGaps).toBe(14);
    expect(r.rows).toHaveLength(MAX_GAP_ROWS);
  });
  it("does not change its input", () => {
    const input = parse([raw("a", { name: "" })]);
    const copy = JSON.stringify(input);
    computeGaps(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe("gapRowLine and gapLines", () => {
  const row = { kind: "cafe", records: 3, noName: 1, noAddress: 0, noPosition: 2 };
  it("leaves out zero counts", () => {
    expect(gapRowLine(row, "en")).toBe("cafe (3 records): 1 with no name, 2 with no position");
    expect(gapRowLine({ ...row, records: 1, noName: 1, noPosition: 0 }, "en")).toBe("cafe (1 record): 1 with no name");
  });
  it("is French with a non-breaking space before the colon and the kind left as written", () => {
    expect(gapRowLine(row, "fr")).toBe("cafe (3 fiches) : 1 sans nom, 2 sans position");
    expect(gapRowLine({ ...row, kind: "café: terrasse ?" }, "fr")).toBe("café: terrasse ? (3 fiches) : 1 sans nom, 2 sans position");
  });
  it("has clean French typography around the data", () => {
    expect(lintFrench(gapRowLine(row, "fr"))).toEqual([]);
    expect(lintFrench(gapLines({ rows: [row], kindsWithGaps: 12 }, "fr").join("\n"))).toEqual([]);
  });
  it("says how many kinds are not listed", () => {
    expect(gapLines({ rows: [row], kindsWithGaps: 3 }, "en")).toEqual([gapRowLine(row, "en"), `2 more kinds not listed (the list stops at ${MAX_GAP_ROWS}).`]);
    expect(gapLines({ rows: [row], kindsWithGaps: 2 }, "en")[1]).toBe(`1 more kind not listed (the list stops at ${MAX_GAP_ROWS}).`);
    expect(gapLines({ rows: [row], kindsWithGaps: 2 }, "fr")[1]).toBe(`1 autre type non listé (la liste s’arrête à ${MAX_GAP_ROWS}).`);
  });
  it("is empty when nothing is missing", () => {
    expect(gapLines({ rows: [], kindsWithGaps: 0 }, "en")).toEqual([]);
  });
});
