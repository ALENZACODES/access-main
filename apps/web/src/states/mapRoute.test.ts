import { describe, expect, it } from "vitest";
import { initialConnectivity, mapRouteView, type MapContext } from "./index";
import { LOC_PROV, mkRecord } from "./testHelpers";

const near = { lat: 43.8828, lon: -79.4403 };
const places = [
  mkRecord("far", "Far Hall", {}, { lat: 43.6532, lon: -79.3832, provenance: LOC_PROV }),
  mkRecord("close", "Close Cafe", {}, { lat: 43.8850, lon: -79.4400, provenance: LOC_PROV }),
  mkRecord("nowhere", "Anywhere", {}),
  mkRecord("unsourced", "Unsourced", {}, { lat: 43.7, lon: -79.4 }),
];
const ctx = (over: Partial<MapContext> = {}): MapContext => ({ locale: "en", connectivity: initialConnectivity(true), near: null, ...over });

describe("mapRouteView", () => {
  it("is a list: says so and loads no tiles", () => {
    const v = mapRouteView({ status: "ok", places }, ctx());
    expect(v.kind === "list" && v.note).toBe("Shown as a list. The App loads no map tiles.");
  });
  it("sorts by name without a position, with located places first", () => {
    const v = mapRouteView({ status: "ok", places }, ctx());
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.entries.map((e) => e.id)).toEqual(["close", "far", "nowhere", "unsourced"]);
  });
  it("sorts by distance from the given point", () => {
    const v = mapRouteView({ status: "ok", places: [places[0]!, places[1]!] }, ctx({ near }));
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.entries.map((e) => e.id)).toEqual(["close", "far"]);
    expect(v.entries[0]!.distanceText).toMatch(/^\d+ m away$/);
    expect(v.entries[1]!.distanceText).toMatch(/^2\d km away$/);
  });
  it("never invents a location: missing, invalid and unsourced are UNKNOWN", () => {
    const v = mapRouteView({ status: "ok", places }, ctx({ near }));
    if (v.kind !== "list") throw new Error("list expected");
    for (const id of ["nowhere", "unsourced"]) {
      const e = v.entries.find((x) => x.id === id)!;
      expect(e.known).toBe(false);
      expect(e.locationText).toBe("Location UNKNOWN");
      expect(e.geoHref).toBeNull();
      expect(e.distanceText).toBeNull();
      expect(e.sourceLine).toBeNull();
    }
    expect(v.unlocatedNotice).toBe("2 places have no recorded location.");
  });
  it("links located places to the person's own maps app with 44px targets", () => {
    const v = mapRouteView({ status: "ok", places }, ctx());
    if (v.kind !== "list") throw new Error("list expected");
    const e = v.entries.find((x) => x.id === "close")!;
    expect(e.geoHref).toBe("geo:43.88500,-79.44000");
    expect(e.openLabel).toBe("Open Close Cafe in your maps app");
    expect(e.sourceLine).toContain("OpenStreetMap contributors");
    expect(e.sourceLine).toContain("ODbL 1.0");
    expect(e.minTargetPx).toBeGreaterThanOrEqual(44);
  });
  it("uses the empty state, banner and error mapping", () => {
    expect(mapRouteView({ status: "ok", places: [] }, ctx()).kind).toBe("empty");
    const off = mapRouteView({ status: "ok", places }, ctx({ connectivity: { status: "offline", lastSavedOn: "2026-11-01" } }));
    expect(off.kind === "list" && off.banner?.title).toBe("You are offline");
    const err = mapRouteView({ status: "error", httpStatus: 500 }, ctx());
    expect(err.kind === "error" && err.view.title).toBe("The places could not be loaded");
  });
  it("is available in French", () => {
    const v = mapRouteView({ status: "ok", places }, ctx({ locale: "fr", near }));
    if (v.kind !== "list") throw new Error("list expected");
    expect(v.heading).toBe("Lieux");
    expect(v.entries.at(-1)!.locationText).toBe("Emplacement INCONNU");
    expect(v.unlocatedNotice).toBe("2 lieux n’ont aucun emplacement enregistré.");
  });
});
