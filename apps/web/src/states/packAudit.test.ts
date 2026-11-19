import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import {
  PackAuditError,
  type PackIssueCode,
  assertPackClean,
  auditPackPlaces,
  computePackCoverage,
  packCoverageLines,
  provenanceIssues,
} from "./packAudit";
import { parsePackPlaces } from "./packPlaces";

const TODAY = "2026-11-19";
const prov = (over: Record<string, unknown> = {}) => ({
  source_name: "OpenStreetMap, Geofabrik Ontario extract",
  source_url: "https://www.openstreetmap.org/way/1",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
  ...over,
});
const raw = (over: Record<string, unknown> = {}) => ({
  id: "osm:way/1",
  name: "Hall",
  category: "attraction",
  wheelchair: "yes",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  provenance: prov(),
  ...over,
});
const codes = (place: unknown, today = TODAY): PackIssueCode[] => auditPackPlaces([place], today).issues.map((i) => i.code);

describe("provenanceIssues", () => {
  it("is empty for a usable provenance", () => expect(provenanceIssues(prov(), TODAY)).toEqual([]));
  it.each([[null], [undefined], ["x"], [5]])("reports missing for %s", (v) => expect(provenanceIssues(v, TODAY)).toEqual(["provenance-missing"]));
  it("reports each kind of problem under its own code", () => {
    expect(provenanceIssues(prov({ source_name: "  " }), TODAY)).toEqual(["provenance-no-source"]);
    expect(provenanceIssues(prov({ source_name: undefined }), TODAY)).toEqual(["provenance-no-source"]);
    expect(provenanceIssues(prov({ licence: "All rights reserved" }), TODAY)).toEqual(["provenance-licence-not-open"]);
    expect(provenanceIssues(prov({ retrieved_at: "13/11/2026" }), TODAY)).toEqual(["provenance-bad-date"]);
    expect(provenanceIssues(prov({ retrieved_at: "2026-02-30" }), TODAY)).toEqual(["provenance-bad-date"]);
    expect(provenanceIssues(prov({ source_url: "ftp://example.org/x" }), TODAY)).toEqual(["provenance-bad-url"]);
    expect(provenanceIssues(prov({ retrieved_at: "2026-11-20" }), TODAY)).toEqual(["provenance-future-date"]);
  });
  it("accepts a timestamp by its date part and today as a retrieval date", () => {
    expect(provenanceIssues(prov({ retrieved_at: "2026-11-19T08:00:00Z" }), TODAY)).toEqual([]);
  });
  it("rejects a plain-text link", () => {
    expect(provenanceIssues(prov({ source_url: "ht" + "tp://example.org/x" }), TODAY)).toEqual(["provenance-bad-url"]);
  });
});

describe("auditPackPlaces: records", () => {
  it("passes a complete record", () => {
    const r = auditPackPlaces([raw()], TODAY);
    expect(r).toMatchObject({ checked: 1, errors: 0, warnings: 0, clean: true });
  });
  it("reports a non-object, an array and a null record", () => {
    for (const v of [null, 5, "x", [], undefined]) expect(codes(v)).toEqual(["not-an-object"]);
  });
  it("reports a bad id and stops checking that record", () => {
    for (const id of ["", " a", "a b", "a\u0000b", "a".repeat(201), 5, undefined]) expect(codes(raw({ id })), String(id)).toEqual(["bad-id"]);
  });
  it("reports a duplicate id on the second record only", () => {
    const r = auditPackPlaces([raw(), raw()], TODAY);
    expect(r.issues).toEqual([{ severity: "error", code: "duplicate-id", index: 1, id: "osm:way/1" }]);
  });
  it("warns about a missing name, treating blank and UNKNOWN the same", () => {
    for (const name of [undefined, null, "", "  ", "UNKNOWN", "unknown", 5]) expect(codes(raw({ name })), String(name)).toEqual(["missing-name"]);
    expect(auditPackPlaces([raw({ name: null })], TODAY).warnings).toBe(1);
  });
  it("warns about coordinates that are missing, out of range or not numbers", () => {
    for (const bad of [{ lat: undefined }, { lon: undefined }, { lat: 91 }, { lon: -181 }, { lat: "43.6" }, { lat: Number.NaN }]) expect(codes(raw(bad))).toEqual(["bad-coordinates"]);
  });
  it("makes an unrecognised tag an error, but not a missing one", () => {
    expect(codes(raw({ wheelchair: "maybe" }))).toEqual(["tag-unrecognised"]);
    expect(codes(raw({ wheelchair: undefined }))).toEqual([]);
    expect(codes(raw({ wheelchair: "UNKNOWN" }))).toEqual([]);
  });
  it("makes a reported tag with no usable source an error, with the provenance problem named too", () => {
    expect(codes(raw({ provenance: null }))).toEqual(["provenance-missing", "tag-without-source"]);
    expect(codes(raw({ provenance: prov({ licence: "proprietary" }) }))).toEqual(["provenance-licence-not-open", "tag-without-source"]);
  });
  it("only warns when no tag is reported and there is no provenance", () => {
    const r = auditPackPlaces([raw({ wheelchair: "UNKNOWN", provenance: null })], TODAY);
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([["provenance-missing", "warning"]]);
  });
  it("accepts every reported tag value case-insensitively", () => {
    for (const w of ["yes", "LIMITED", "No", "designated"]) expect(codes(raw({ wheelchair: w }))).toEqual([]);
  });
  it("counts errors and warnings separately and records index and id", () => {
    const r = auditPackPlaces([raw(), raw({ id: "b", name: null, lat: 200 }), raw({ id: "c", wheelchair: "maybe" })], TODAY);
    expect(r.checked).toBe(3);
    expect(r.errors).toBe(1);
    expect(r.warnings).toBe(2);
    expect(r.issues.find((i) => i.code === "tag-unrecognised")).toMatchObject({ index: 2, id: "c" });
    expect(r.clean).toBe(false);
  });
});

describe("assertPackClean", () => {
  it("returns the result when there are no errors, even with warnings", () => {
    expect(assertPackClean([raw({ name: null })], TODAY).warnings).toBe(1);
  });
  it("throws a PackAuditError naming the first problems when there is an error", () => {
    try {
      assertPackClean([raw(), raw()], TODAY);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PackAuditError);
      expect((e as PackAuditError).message).toContain("#1 osm:way/1: duplicate-id");
      expect((e as PackAuditError).result.errors).toBe(1);
    }
  });
});

describe("the pack shipped in this build", () => {
  const places = (JSON.parse(contentText) as { places: unknown[] }).places;
  it("has no audit errors", () => {
    const r = auditPackPlaces(places, "2026-11-19");
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("audits exactly the records the parser keeps", () => {
    expect(parsePackPlaces(places).places).toHaveLength(auditPackPlaces(places, TODAY).checked - parsePackPlaces(places).dropped);
  });
});

describe("computePackCoverage", () => {
  const parsed = (items: unknown[]) => parsePackPlaces(items).places;
  const mixed = parsed([
    raw({ id: "a" }),
    raw({ id: "b", wheelchair: "limited", provenance: prov({ retrieved_at: "2024-01-01" }) }),
    raw({ id: "c", wheelchair: "UNKNOWN", name: null, address: null, category: null, lat: undefined }),
    raw({ id: "d", wheelchair: "maybe" }),
    raw({ id: "e", provenance: null }),
  ]);
  it("counts tags and the reasons for UNKNOWN", () => {
    const c = computePackCoverage(mixed, TODAY);
    expect(c.total).toBe(5);
    expect(c.byTag).toEqual({ yes: 1, limited: 1, no: 0, designated: 0, unknown: 3 });
    expect(c).toMatchObject({ reported: 2, reportedPercent: 40, unknownNotRecorded: 1, unknownUnrecognised: 1, unknownNoSource: 1 });
  });
  it("counts completeness, sources and stale records", () => {
    const c = computePackCoverage(mixed, TODAY);
    expect(c).toMatchObject({ withName: 4, withAddress: 4, withCategory: 4, withLocation: 4, withSource: 4, staleRecords: 1, sources: 1, latestRetrieval: "2026-11-13" });
  });
  it("rounds the reported percent to the nearest whole number", () => {
    const two = parsed([raw({ id: "a" }), raw({ id: "b" }), raw({ id: "c", wheelchair: "UNKNOWN" })]);
    expect(computePackCoverage(two, TODAY).reportedPercent).toBe(67);
  });
  it("is all zero for no records and never divides by zero", () => {
    expect(computePackCoverage([], TODAY)).toMatchObject({ total: 0, reported: 0, reportedPercent: 0, withSource: 0, sources: 0, latestRetrieval: null });
  });
  it("counts the same source under two licences as two sources", () => {
    const c = computePackCoverage(parsed([raw({ id: "a" }), raw({ id: "b", provenance: prov({ licence: "CC0-1.0" }) })]), TODAY);
    expect(c.sources).toBe(2);
  });
  it("covers the shipped pack", () => {
    const c = computePackCoverage(parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places).places, TODAY);
    expect(c.total).toBe(24);
    expect(c.reported + c.byTag.unknown).toBe(24);
    expect(c.unknownNotRecorded + c.unknownUnrecognised + c.unknownNoSource).toBe(c.byTag.unknown);
  });
});

describe("packCoverageLines", () => {
  const c = computePackCoverage(parsePackPlaces([raw({ id: "a" }), raw({ id: "b", wheelchair: "UNKNOWN", provenance: prov({ retrieved_at: "2024-01-01" }) })]).places, TODAY);
  it("reads in English", () => {
    const text = packCoverageLines(c, "en").join("\n");
    expect(text).toContain("2 places in the pack.");
    expect(text).toContain("Wheelchair tag reported with a source: 1 / 2 (50%).");
    expect(text).toContain("By tag, yes: 1, limited: 0, no: 0, designated: 0, UNKNOWN: 1.");
    expect(text).toContain("Most recent retrieval: 13 November 2026.");
    expect(text).toContain("1 may be out of date.");
  });
  it("reads in French with French typography and the token UNKNOWN", () => {
    const text = packCoverageLines(c, "fr").join("\n");
    expect(text).toContain("2 lieux dans le pack.");
    expect(text).toContain("1 / 2 (50 %)");
    expect(text).toContain("avec source :");
    expect(text).toContain("UNKNOWN\u00a0: 1");
    expect(text).toContain("peuvent être périmés");
    expect(text).not.toMatch(/INCONNU/);
  });
  it("says plainly when the pack has no places", () => {
    expect(packCoverageLines(computePackCoverage([], TODAY), "en")).toEqual(["No places in the pack on this device."]);
    expect(packCoverageLines(computePackCoverage([], TODAY), "fr")).toEqual(["Aucun lieu dans le pack sur cet appareil."]);
  });
  it("uses singular and plural source counts", () => {
    expect(packCoverageLines(c, "en").join(" ")).toContain("from 1 source.");
    const two = computePackCoverage(parsePackPlaces([raw({ id: "a" }), raw({ id: "b", provenance: prov({ licence: "CC0-1.0" }) })]).places, TODAY);
    expect(packCoverageLines(two, "en").join(" ")).toContain("from 2 sources.");
  });
  it("passes the copy linter and carries no banned organisation name", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of packCoverageLines(c, locale)) {
        expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
        expect(containsForbiddenOrg(line)).toBe(false);
      }
    }
  });
});
