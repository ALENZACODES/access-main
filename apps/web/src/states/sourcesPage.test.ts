import { describe, expect, it } from "vitest";
import { collectSources, initialConnectivity, sourcesRouteView } from "./index";
import { LOC_PROV, PROV, mkPlace, mkRecord } from "./testHelpers";

const older = { source: "Test source", licence: "CC-BY-4.0", retrievedOn: "2026-06-01", url: "https://example.org/data" };
const places = [
  { ...mkRecord("a", "A", { elevator: "yes", "automatic-door": "yes" }, { lat: 1, lon: 1, provenance: LOC_PROV }) },
  { id: "b", ...mkPlace("B", { elevator: "yes" }, older) },
  mkRecord("c", "C", { elevator: "unknown", "level-path": "yes" }, { lat: 200, lon: 1, provenance: LOC_PROV }),
];

describe("collectSources", () => {
  it("groups by source and licence and counts details", () => {
    const s = collectSources(places);
    const test = s.find((x) => x.source === "Test source")!;
    expect(test.details).toBe(4); // 2 + 1 + 1
    expect(test.earliest).toBe("2026-06-01");
    expect(test.latest).toBe(PROV.retrievedOn);
    expect(test.url).toBe("https://example.org/data");
  });
  it("includes location sources, but only for valid locations", () => {
    const osm = collectSources(places).find((x) => x.source === "OpenStreetMap contributors")!;
    expect(osm.details).toBe(1); // the out-of-range location is ignored
    expect(osm.licenceName).toBe("ODbL 1.0");
  });
  it("ignores UNKNOWN and unsourced details and sorts by name", () => {
    expect(collectSources([mkRecord("x", "X", { elevator: "unknown" })])).toEqual([]);
    expect(collectSources(places).map((s) => s.source)).toEqual(["OpenStreetMap contributors", "Test source"]);
  });
});

describe("sourcesRouteView", () => {
  const ctx = { locale: "en", connectivity: initialConnectivity(true) } as const;
  it("builds a table with formatted dates", () => {
    const v = sourcesRouteView({ status: "ok", places }, ctx);
    if (v.kind !== "table") throw new Error("table expected");
    expect(v.rows[0]!.latestText).toBe("20 September 2026");
    expect(v.headers.latest).toBe("Latest retrieval");
  });
  it("says so when no sources are recorded", () => {
    const v = sourcesRouteView({ status: "ok", places: [] }, ctx);
    expect(v.kind === "empty" && v.text).toBe("No sources are recorded yet.");
  });
  it("is available in French", () => {
    const v = sourcesRouteView({ status: "ok", places }, { ...ctx, locale: "fr" });
    expect(v.kind === "table" && v.rows[0]!.latestText).toBe("20 septembre 2026");
    expect(v.kind === "table" && v.caption).toBe("Sources des détails de l’App");
  });
  it("maps errors", () => {
    const v = sourcesRouteView({ status: "error", httpStatus: 504 }, ctx);
    expect(v.kind === "error" && v.view.title).toBe("The places could not be loaded");
  });
});
