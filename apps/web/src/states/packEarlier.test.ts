import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { MAX_CSV_BYTES } from "./csvParse";
import { csvCell } from "./exportData";
import { EXPECTED_HEADER, MAX_LISTED_SKIPS, REQUIRED_COLUMNS, readEarlierFile, type EarlierFile } from "./packEarlier";
import { PACK_CSV_HEADER, packPlacesToCsv, readExportRecords } from "./packExport";
import { isShortId } from "./packEarlierId";

const HEADER = PACK_CSV_HEADER.join(",");
const row = (over: Partial<Record<(typeof PACK_CSV_HEADER)[number], string>> = {}): string => {
  const base: Record<string, string> = {
    place_id: "osm:node/1",
    place_name: "Corner Cafe",
    kind: "cafe",
    address: "1 Main Street",
    latitude: "43.65",
    longitude: "-79.38",
    wheelchair_tag: "yes",
    tag_status: "reported",
    tag_unknown_reason: "",
    source: "OpenStreetMap, Geofabrik Ontario extract",
    licence: "ODbL-1.0",
    retrieved_on: "2026-11-10",
    tier: "0",
    source_url: "",
  };
  return PACK_CSV_HEADER.map((c) => csvCell(over[c] ?? base[c]!)).join(",");
};
const file = (...rows: string[]) => [HEADER, ...rows].join("\r\n") + "\r\n";
const ok = (r: EarlierFile) => {
  if (!r.ok) throw new Error(r.problem);
  return r;
};

describe("readEarlierFile problems", () => {
  it("rejects empty and blank text", () => {
    expect(readEarlierFile("")).toEqual({ ok: false, problem: "empty" });
    expect(readEarlierFile("  \r\n \r\n")).toEqual({ ok: false, problem: "empty" });
  });
  it("rejects text over the size limit", () => {
    expect(readEarlierFile("a".repeat(MAX_CSV_BYTES + 1))).toEqual({ ok: false, problem: "too-large" });
  });
  it("passes on a quote that is never closed", () => {
    expect(readEarlierFile(`${HEADER}\r\n"x`)).toEqual({ ok: false, problem: "unterminated-quote" });
  });
  it("names the columns that are missing", () => {
    const r = readEarlierFile("place_id,place_name\r\na,b\r\n");
    expect(r).toMatchObject({ ok: false, problem: "missing-columns" });
    expect((r as unknown as { missing: string[] }).missing).toEqual(REQUIRED_COLUMNS.filter((c) => c !== "place_id" && c !== "place_name"));
  });
  it("rejects a file of some other kind", () => {
    expect(readEarlierFile("name,age\r\nAnn,3\r\n")).toMatchObject({ ok: false, problem: "missing-columns" });
    expect(readEarlierFile('{"places":[]}')).toMatchObject({ ok: false, problem: "missing-columns" });
  });
  it("rejects a file with a header and no rows, or only unusable rows", () => {
    expect(readEarlierFile(`${HEADER}\r\n`)).toEqual({ ok: false, problem: "no-places" });
    expect(readEarlierFile(file(row({ place_id: "" }), row({ place_id: "a b" })))).toEqual({ ok: false, problem: "no-places" });
  });
});

describe("readEarlierFile places", () => {
  it("reads a row into a place", () => {
    const r = ok(readEarlierFile(file(row())));
    expect(r.places).toEqual([
      { id: "osm:node/1", name: "Corner Cafe", kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag: "yes", source: "OpenStreetMap, Geofabrik Ontario extract", retrievedOn: "2026-11-10", tier: "0" },
    ]);
    expect(r.skippedTotal).toBe(0);
  });
  it("finds columns by name, whatever their order, and ignores extra ones", () => {
    const cols = [...PACK_CSV_HEADER].reverse();
    const values: Record<string, string> = { place_id: "id1", place_name: "N", kind: "k", address: "A", latitude: "1", longitude: "2", wheelchair_tag: "no", tag_status: "reported", tag_unknown_reason: "", source: "S", licence: "ODbL-1.0", retrieved_on: "2026-11-10", tier: "1", source_url: "" };
    const text = `${[...cols, "extra"].join(",")}\r\n${[...cols.map((c) => values[c]!), "zzz"].join(",")}\r\n`;
    expect(ok(readEarlierFile(text)).places).toEqual([{ id: "id1", name: "N", kind: "k", address: "A", lat: 1, lon: 2, tag: "no", source: "S", retrievedOn: "2026-11-10", tier: "1" }]);
  });
  it("reads the token UNKNOWN and blank cells as unknown, whatever their case", () => {
    const r = ok(readEarlierFile(file(row({ place_name: "UNKNOWN", kind: "unknown", address: "", latitude: "UNKNOWN", longitude: "UNKNOWN", wheelchair_tag: "UNKNOWN", source: "", retrieved_on: "UNKNOWN", tier: "UNKNOWN" }))));
    expect(r.places[0]).toEqual({ id: "osm:node/1", name: null, kind: null, address: null, lat: null, lon: null, tag: "unknown", source: null, retrievedOn: null, tier: null });
  });
  it("reads every tag the App writes, in any case", () => {
    const r = ok(readEarlierFile(file(...["yes", "LIMITED", "No", "designated"].map((t, i) => row({ place_id: `p${i}`, wheelchair_tag: t })))));
    expect(r.places.map((p) => p.tag)).toEqual(["yes", "limited", "no", "designated"]);
  });
  it("undoes the guard on a name that starts with a formula character", () => {
    const r = ok(readEarlierFile(file(row({ place_name: "'=Cafe", address: "'-1 Main" }))));
    expect(r.places[0]).toMatchObject({ name: "=Cafe", address: "-1 Main" });
  });
  it("keeps a date only when it is a real date", () => {
    const r = ok(readEarlierFile(file(row({ place_id: "a", retrieved_on: "2026-02-30" }), row({ place_id: "b", retrieved_on: "last week" }), row({ place_id: "c", retrieved_on: "2026-11-10" }))));
    expect(r.places.map((p) => p.retrievedOn)).toEqual([null, null, "2026-11-10"]);
  });
  it("trims spaces around an id and a value", () => {
    const r = ok(readEarlierFile(file(row({ place_id: " a1 ", place_name: " Cafe " }))));
    expect(r.places[0]).toMatchObject({ id: "a1", name: "Cafe" });
  });
});

describe("readEarlierFile skipped rows", () => {
  const skipsOf = (...rows: string[]) => {
    const r = readEarlierFile(file(row({ place_id: "good" }), ...rows));
    return ok(r);
  };
  it("skips a row with no id, a bad id or a repeated id, with the line number", () => {
    const r = skipsOf(row({ place_id: "" }), row({ place_id: "has space" }), row({ place_id: "good" }), row({ place_id: "x".repeat(201) }));
    expect(r.places.map((p) => p.id)).toEqual(["good"]);
    expect(r.skipped).toEqual([
      { line: 3, reason: "no-id" },
      { line: 4, reason: "bad-id" },
      { line: 5, reason: "repeated-id" },
      { line: 6, reason: "bad-id" },
    ]);
  });
  it("skips a row that is shorter than the header", () => {
    expect(skipsOf("only,three,cells").skipped).toEqual([{ line: 3, reason: "short-row" }]);
  });
  it("skips a tag the App does not write rather than calling it unknown", () => {
    const r = skipsOf(row({ place_id: "p", wheelchair_tag: "maybe" }));
    expect(r.skipped).toEqual([{ line: 3, reason: "bad-tag" }]);
    expect(r.places.some((p) => p.id === "p")).toBe(false);
  });
  it("skips a position that is out of range, not a number or has only one coordinate", () => {
    const bad = [
      row({ place_id: "a", latitude: "91" }),
      row({ place_id: "b", longitude: "-181" }),
      row({ place_id: "c", latitude: "north" }),
      row({ place_id: "d", latitude: "UNKNOWN" }),
      row({ place_id: "e", longitude: "UNKNOWN" }),
      row({ place_id: "f", latitude: "1e3" }),
    ];
    const r = skipsOf(...bad);
    expect(r.skipped.map((s) => s.reason)).toEqual(Array(6).fill("bad-position"));
    expect(r.places).toHaveLength(1);
  });
  it("accepts the limits of a position and a position of both UNKNOWN", () => {
    const r = skipsOf(row({ place_id: "a", latitude: "90", longitude: "180" }), row({ place_id: "b", latitude: "-90", longitude: "-180" }), row({ place_id: "c", latitude: "UNKNOWN", longitude: "UNKNOWN" }));
    expect(r.skippedTotal).toBe(0);
    expect(r.places).toHaveLength(4);
  });
  it("counts every skip but lists only the first ones", () => {
    const rows = Array.from({ length: MAX_LISTED_SKIPS + 10 }, () => row({ place_id: "" }));
    const r = skipsOf(...rows);
    expect(r.skippedTotal).toBe(MAX_LISTED_SKIPS + 10);
    expect(r.skipped).toHaveLength(MAX_LISTED_SKIPS);
    expect(r.skipped[0]!.line).toBe(3);
  });
  it("does not treat a skipped row as present: its id may appear again later", () => {
    const r = readEarlierFile(file(row({ place_id: "dup", wheelchair_tag: "maybe" }), row({ place_id: "dup" })));
    expect(ok(r).places.map((p) => p.id)).toEqual(["dup"]);
  });
});

describe("readEarlierFile round trip with the App's own files", () => {
  const records = readExportRecords((JSON.parse(contentText) as { places: unknown[] }).places).records;
  it("reads back every place the App saved, with the same id, name and tag", () => {
    const r = ok(readEarlierFile(packPlacesToCsv(records)));
    expect(r.skippedTotal).toBe(0);
    expect(r.places.map((p) => p.id)).toEqual(records.map((x) => x.place.id));
    expect(r.places.map((p) => p.name)).toEqual(records.map((x) => x.place.name));
    expect(r.places.map((p) => p.tag)).toEqual(records.map((x) => x.place.tag));
  });
  it("reads a file saved with a byte order mark", () => {
    expect(ok(readEarlierFile(packPlacesToCsv(records, { bom: true }))).places).toHaveLength(records.length);
  });
  it("reads the positions and tiers back as saved", () => {
    const r = ok(readEarlierFile(packPlacesToCsv(records)));
    r.places.forEach((p, i) => {
      expect(p.lat, p.id).toBe(records[i]!.place.location?.lat ?? null);
      expect(p.lon, p.id).toBe(records[i]!.place.location?.lon ?? null);
      expect(p.tier, p.id).toBe(records[i]!.tier);
    });
  });
  it("expects the header the App writes", () => {
    expect([...EXPECTED_HEADER]).toEqual([...PACK_CSV_HEADER]);
    for (const c of REQUIRED_COLUMNS) expect(PACK_CSV_HEADER as readonly string[]).toContain(c);
  });
});

describe("isShortId", () => {
  it("applies the pack's id rule", () => {
    expect(isShortId("osm:way/12")).toBe(true);
    expect(isShortId("x".repeat(200))).toBe(true);
    expect(isShortId("x".repeat(201))).toBe(false);
    expect(isShortId("")).toBe(false);
    for (const bad of ["a b", "a\tb", "a\nb", "a\u0000b", "a\u007fb", " a"]) expect(isShortId(bad), JSON.stringify(bad)).toBe(false);
  });
});
