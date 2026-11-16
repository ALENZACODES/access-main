import { describe, expect, it } from "vitest";
import { FEATURE_IDS, NBSP, computeCoverage, coverageRouteView, formatPercent, initialConnectivity } from "./index";
import { LOC_PROV, TODAY, mkPlace, mkRecord } from "./testHelpers";

const old = { source: "Old survey", licence: "ODbL-1.0", retrievedOn: "2024-01-01" };
const places = [
  mkRecord("a", "A", { elevator: "yes", "automatic-door": "no", "level-path": "partial" }, { lat: 1, lon: 1, provenance: LOC_PROV }),
  mkRecord("b", "B", { elevator: "yes" }),
  { id: "c", ...mkPlace("C", { elevator: "no" }, old) },
  mkRecord("d", "D", {}),
];

describe("computeCoverage", () => {
  const c = computeCoverage(places, TODAY);
  it("counts every status per feature and they add up to the number of places", () => {
    for (const f of c.features) expect(f.yes + f.no + f.partial + f.unknown).toBe(places.length);
    const elevator = c.features.find((f) => f.feature === "elevator")!;
    expect(elevator).toMatchObject({ yes: 2, no: 1, partial: 0, unknown: 1, reportedPercent: 75 });
  });
  it("covers every feature in fixed order", () => {
    expect(c.features.map((f) => f.feature)).toEqual([...FEATURE_IDS]);
    expect(c.features.find((f) => f.feature === "accessible-parking")).toMatchObject({ unknown: 4, reportedPercent: 0 });
  });
  it("counts located places, stale places and sources", () => {
    expect(c.placeCount).toBe(4);
    expect(c.located).toBe(1);
    expect(c.unlocated).toBe(3);
    expect(c.placesWithStaleDetails).toBe(1);
    expect(c.sourceCount).toBe(3); // Test source, Old survey, OpenStreetMap
    expect(c.latestRetrieval).toBe("2026-10-01");
  });
  it("handles an empty list without dividing by zero", () => {
    const e = computeCoverage([], TODAY);
    expect(e.placeCount).toBe(0);
    expect(e.features.every((f) => f.reportedPercent === 0)).toBe(true);
    expect(e.latestRetrieval).toBeNull();
  });
});

describe("formatPercent", () => {
  it("uses a no-break space before % in French", () => {
    expect(formatPercent(42, "en")).toBe("42%");
    expect(formatPercent(42, "fr")).toBe(`42${NBSP}%`);
  });
});

describe("coverageRouteView", () => {
  const ctx = { locale: "en", connectivity: initialConnectivity(true), today: TODAY } as const;
  it("builds a table and summary lines", () => {
    const v = coverageRouteView({ status: "ok", places }, ctx);
    if (v.kind !== "table") throw new Error("table expected");
    expect(v.rows).toHaveLength(FEATURE_IDS.length);
    expect(v.rows[0]).toMatchObject({ label: "Step-free entrance", unknown: 4, shareText: "0%" });
    expect(v.lines).toEqual([
      "4 places are listed.",
      "1 with a recorded location, 3 with location UNKNOWN.",
      "1 place has details retrieved more than a year ago.",
      "3 sources recorded. Latest retrieval: 1 October 2026.",
    ]);
  });
  it("reports records that were dropped for being incomplete", () => {
    const v = coverageRouteView({ status: "ok", places, dropped: 2 }, ctx);
    expect(v.kind === "table" && v.lines.at(-1)).toBe("2 records could not be shown because they were incomplete.");
    const one = coverageRouteView({ status: "ok", places, dropped: 1 }, ctx);
    expect(one.kind === "table" && one.lines.at(-1)).toBe("1 record could not be shown because it was incomplete.");
  });
  it("says so when there are no places, and still reports dropped records", () => {
    const v = coverageRouteView({ status: "ok", places: [], dropped: 3 }, ctx);
    expect(v.kind).toBe("empty");
    expect(v.kind === "empty" && v.text).toBe("No places are listed yet.");
    expect(v.kind === "empty" && v.lines).toHaveLength(1);
  });
  it("is available in French", () => {
    const v = coverageRouteView({ status: "ok", places }, { ...ctx, locale: "fr" });
    if (v.kind !== "table") throw new Error("table expected");
    expect(v.headers.unknown).toBe("INCONNU");
    expect(v.rows.find((r) => r.feature === "elevator")!.shareText).toBe(`75${NBSP}%`);
    expect(v.lines[0]).toBe("4 lieux sont répertoriés.");
  });
  it("maps errors", () => {
    const v = coverageRouteView({ status: "error", httpStatus: 504 }, ctx);
    expect(v.kind === "error" && v.view.title).toBe("This is taking too long");
  });
});
