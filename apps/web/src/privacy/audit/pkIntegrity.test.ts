import { describe, expect, it } from "vitest";
import { GUESSED_LICENCES, WHEELCHAIR_VALUES, checkIntegrity, contentSources, isIsoDate } from "./pkIntegrity";

const SHA = "a".repeat(64);
const prov = (name: string, licence: string) => ({ source_name: name, licence });
const manifest = (over: Record<string, unknown> = {}) => ({
  schema_version: "offline-pack-1.0.0",
  pack_id: "t",
  built_at: "2026-11-14",
  size_bytes: 100,
  sha256: SHA,
  source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2026-11-13" }],
  counts: { places: 1, help_numbers: 0, elevator_status: 0, journeys: 0 },
  ...over,
});
const content = (over: Record<string, unknown> = {}) => ({
  schema_version: "offline-pack-1.0.0",
  pack_id: "t",
  places: [{ id: "p1", wheelchair: "yes", provenance: prov("S1", "ODbL-1.0") }],
  help_numbers: [],
  elevator_status: [],
  journeys: [],
  ...over,
});
const M = { bytes: 100, sha256: SHA };
const codes = (m: unknown, c: unknown, measured: typeof M | null = M): string[] => checkIntegrity(m, c, measured).map((p) => p.code);

describe("isIsoDate", () => {
  it.each(["2026-11-14", "2024-02-29", "1999-12-31"])("%s is a date", (d) => expect(isIsoDate(d)).toBe(true));
  it.each(["2026-13-01", "2026-02-30", "2025-02-29", "2026-1-1", "26-11-14", "2026-11-14T00:00:00Z", "", " 2026-11-14", 20261114, null, undefined])("%j is not a date", (d) => expect(isIsoDate(d)).toBe(false));
});

describe("the lists of values", () => {
  it("allows five wheelchair values, with UNKNOWN in capitals", () => expect([...WHEELCHAIR_VALUES]).toEqual(["yes", "no", "limited", "designated", "UNKNOWN"]));
  it.each(["", "n/a", "N/A", "NA", "none", "None", "null", "TBD", "unspecified", "public domain", "Public Domain", "free", "open", "ok", "?", "??", "-", "--"])("takes %j for a guessed licence", (l) => expect(GUESSED_LICENCES.test(l)).toBe(true));
  it.each(["UNKNOWN", "ODbL-1.0", "OGL-Toronto-1.0", "CC-BY-4.0", "Open Government Licence"])("does not take %s for a guessed licence", (l) => expect(GUESSED_LICENCES.test(l)).toBe(false));
});

describe("contentSources", () => {
  it("lists the source of each record, from its provenance or from the record itself", () => {
    const s = contentSources({
      places: [{ provenance: prov("A", "L1") }],
      help_numbers: [{ provenance: prov("B", "UNKNOWN") }],
      elevator_status: [{ source_name: "C", licence: "L3" }],
      journeys: [],
    });
    expect(s).toEqual([{ name: "A", licence: "L1", path: "places[0]" }, { name: "B", licence: "UNKNOWN", path: "help_numbers[0]" }, { name: "C", licence: "L3", path: "elevator_status[0]" }]);
  });
  it("leaves out a record with no source name, and a list that is not a list", () => expect(contentSources({ places: [{}, 5, { provenance: { licence: "x" } }], help_numbers: "no" })).toEqual([]));
  it("gives an empty licence for a source that names none", () => expect(contentSources({ places: [{ provenance: { source_name: "A" } }] })[0]?.licence).toBe(""));
});

describe("checkIntegrity: the two files", () => {
  it("finds nothing when the files agree", () => expect(codes(manifest(), content())).toEqual([]));
  it("finds a manifest that is not an object, and a content that is not", () => {
    expect(codes(null, content())).toEqual(["pk-manifest-unreadable"]);
    expect(codes(manifest(), [])).toEqual(["pk-content-unreadable"]);
    expect(codes("x", 5)).toEqual(["pk-manifest-unreadable", "pk-content-unreadable"]);
  });
  it("finds a schema version that differs", () => expect(checkIntegrity(manifest(), content({ schema_version: "x" }), M)).toEqual([{ code: "pk-schema-mismatch", path: "schema_version", detail: "manifest offline-pack-1.0.0, content x" }]));
  it("finds a pack id that differs", () => expect(codes(manifest(), content({ pack_id: "u" }))).toEqual(["pk-pack-id-mismatch"]));
  it("finds a size and a hash that differ from what was measured", () => {
    expect(checkIntegrity(manifest(), content(), { bytes: 101, sha256: SHA })).toEqual([{ code: "pk-size-mismatch", path: "size_bytes", detail: "manifest 100, file 101" }]);
    expect(codes(manifest(), content(), { bytes: 100, sha256: "b".repeat(64) })).toEqual(["pk-sha-mismatch"]);
  });
  it("does not judge the size or the hash when nothing was measured", () => expect(codes(manifest({ size_bytes: 1, sha256: "x" }), content(), null)).toEqual([]));
  it("finds a count that differs, for each list", () => {
    const m = manifest({ counts: { places: 2, help_numbers: 1, elevator_status: 0, journeys: 0 } });
    expect(checkIntegrity(m, content(), M).map((p) => `${p.path} ${p.detail}`)).toEqual(["counts.places manifest 2, content 1", "counts.help_numbers manifest 1, content 0"]);
  });
  it("finds a count that is missing, as a count that differs", () => expect(codes(manifest({ counts: { places: 1 } }), content())).toEqual(["pk-count-mismatch", "pk-count-mismatch", "pk-count-mismatch"]));
  it("counts a list that is not a list as empty", () => expect(codes(manifest({ counts: { places: 0, help_numbers: 0, elevator_status: 0, journeys: 0 } }), content({ places: "x" }))).toEqual(["pk-source-unused"]));
});

describe("checkIntegrity: dates and sources", () => {
  it("finds a build date that is not a date", () => expect(codes(manifest({ built_at: "yesterday" }), content())).toEqual(["pk-date-bad"]));
  it("finds a retrieval date that is not a date, and one after the build", () => {
    expect(codes(manifest({ source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "soon" }] }), content())).toEqual(["pk-date-bad"]);
    expect(codes(manifest({ source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2026-11-15" }] }), content())).toEqual(["pk-date-after-build"]);
  });
  it("does not compare a retrieval date with a build date that is bad", () => expect(codes(manifest({ built_at: "x", source_dates: [{ source_name: "S1", licence: "ODbL-1.0", retrieved_at: "2099-01-01" }] }), content())).toEqual(["pk-date-bad"]));
  it("finds a source in the content that the manifest does not list", () => expect(checkIntegrity(manifest(), content({ places: [{ id: "p1", wheelchair: "yes", provenance: prov("S2", "ODbL-1.0") }] }), M).map((p) => p.code)).toEqual(["pk-source-not-listed", "pk-source-unused"]));
  it("finds a source the manifest lists and no record uses", () => expect(codes(manifest(), content({ places: [], }))).toContain("pk-source-unused"));
  it("finds a licence that differs between the manifest and a record", () => expect(checkIntegrity(manifest(), content({ places: [{ id: "p1", wheelchair: "yes", provenance: prov("S1", "UNKNOWN") }] }), M)).toEqual([{ code: "pk-source-licence-differs", path: "places[0]", detail: "S1: manifest ODbL-1.0, record UNKNOWN" }]));
  it("finds a licence that was guessed, in the manifest and in a record", () => {
    const m = manifest({ source_dates: [{ source_name: "S1", licence: "N/A", retrieved_at: "2026-11-13" }] });
    const c = content({ places: [{ id: "p1", wheelchair: "yes", provenance: prov("S1", "N/A") }] });
    expect(checkIntegrity(m, c, M).map((p) => `${p.code} ${p.path}`)).toEqual(["pk-licence-invented source_dates[0].licence", "pk-licence-invented places[0].licence"]);
  });
  it("accepts the licence UNKNOWN", () => expect(codes(manifest({ source_dates: [{ source_name: "S1", licence: "UNKNOWN", retrieved_at: "2026-11-13" }] }), content({ places: [{ id: "p1", wheelchair: "UNKNOWN", provenance: prov("S1", "UNKNOWN") }] }))).toEqual([]));
});

describe("checkIntegrity: records", () => {
  it("finds a record with no id, or an id that is not text or is empty", () => {
    for (const id of [undefined, "", 5, null]) expect(codes(manifest(), content({ places: [{ id, wheelchair: "yes", provenance: prov("S1", "ODbL-1.0") }] }))).toEqual(["pk-id-missing"]);
  });
  it("finds an id used twice in one list, and not across lists", () => {
    const row = { id: "x", wheelchair: "yes", provenance: prov("S1", "ODbL-1.0") };
    expect(codes(manifest({ counts: { places: 2, help_numbers: 0, elevator_status: 0, journeys: 0 } }), content({ places: [row, row] }))).toEqual(["pk-id-duplicate"]);
    expect(codes(manifest({ counts: { places: 1, help_numbers: 1, elevator_status: 0, journeys: 0 } }), content({ help_numbers: [{ id: "p1", provenance: prov("S1", "ODbL-1.0") }] }))).toEqual([]);
  });
  it.each(["unknown", "Yes", "", "true", "partial", null, 1])("finds the wheelchair value %j", (v) => expect(codes(manifest(), content({ places: [{ id: "p1", wheelchair: v, provenance: prov("S1", "ODbL-1.0") }] }))).toEqual(["pk-wheelchair-value"]));
  it.each(["yes", "no", "limited", "designated", "UNKNOWN"])("accepts the wheelchair value %s", (v) => expect(codes(manifest(), content({ places: [{ id: "p1", wheelchair: v, provenance: prov("S1", "ODbL-1.0") }] }))).toEqual([]));
  it("does not judge wheelchair values outside the places", () => expect(codes(manifest({ counts: { places: 1, help_numbers: 1, elevator_status: 0, journeys: 0 } }), content({ help_numbers: [{ id: "h", wheelchair: "x", provenance: prov("S1", "ODbL-1.0") }] }))).toEqual([]));
  it("names where a record is", () => expect(checkIntegrity(manifest(), content({ places: [{ id: "p1", wheelchair: "x", provenance: prov("S1", "ODbL-1.0") }] }), M)[0]?.path).toBe("places[0].wheelchair"));
});
