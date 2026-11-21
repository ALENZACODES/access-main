import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, classifyPlace, normalizeText, searchPlaces, type PlaceFilter } from "./index";
import { mkPlace } from "./testHelpers";

const need = (...required: PlaceFilter["required"][number][]): PlaceFilter => ({ ...EMPTY_FILTER, required });

describe("normalizeText", () => {
  it("strips accents and case", () => {
    expect(normalizeText("  Café Élan ")).toBe("cafe elan");
  });
});

describe("classifyPlace", () => {
  it("matches when every required detail is reported yes", () => {
    const m = classifyPlace(mkPlace("A", { elevator: "yes", "step-free-entrance": "yes" }), need("elevator", "step-free-entrance"));
    expect(m.kind).toBe("match");
    expect(m.matched).toEqual(["elevator", "step-free-entrance"]);
  });
  it("never treats UNKNOWN as a match", () => {
    const m = classifyPlace(mkPlace("A", { elevator: "unknown" }), need("elevator"));
    expect(m.kind).toBe("unknown");
    expect(m.unknown).toEqual(["elevator"]);
  });
  it("treats a missing detail and a detail without provenance as UNKNOWN", () => {
    expect(classifyPlace(mkPlace("A", {}), need("elevator")).kind).toBe("unknown");
    expect(classifyPlace(mkPlace("A", { elevator: "yes" }, null), need("elevator")).kind).toBe("unknown");
  });
  it("rejects no and partial for a requirement", () => {
    expect(classifyPlace(mkPlace("A", { elevator: "no" }), need("elevator")).kind).toBe("no-match");
    const p = classifyPlace(mkPlace("A", { elevator: "partial" }), need("elevator"));
    expect(p.kind).toBe("no-match");
    expect(p.failed).toEqual(["elevator"]);
  });
  it("a reported failure wins over an UNKNOWN detail", () => {
    const m = classifyPlace(mkPlace("A", { elevator: "no", "automatic-door": "unknown" }), need("elevator", "automatic-door"));
    expect(m.kind).toBe("no-match");
  });
  it("applies the name query regardless of accents", () => {
    const f: PlaceFilter = { ...EMPTY_FILTER, query: "cafe" };
    expect(classifyPlace(mkPlace("Café Nord", {}), f).kind).toBe("match");
    expect(classifyPlace(mkPlace("Library", {}), f).kind).toBe("no-match");
  });
  it("matches everything when there are no requirements", () => {
    expect(classifyPlace(mkPlace("A", {}), EMPTY_FILTER).kind).toBe("match");
  });
});

describe("searchPlaces", () => {
  const places = [
    mkPlace("Zed", { elevator: "yes" }),
    mkPlace("Alpha", { elevator: "yes" }),
    mkPlace("Mid", { elevator: "unknown" }),
    mkPlace("Eve", { elevator: "no" }),
    mkPlace("Bob", {}),
  ];
  it("splits into matches, UNKNOWN places and a count of the rest", () => {
    const r = searchPlaces(places, need("elevator"));
    expect(r.matches.map((m) => m.place.name)).toEqual(["Alpha", "Zed"]);
    expect(r.unknownPlaces.map((m) => m.place.name)).toEqual(["Bob", "Mid"]);
    expect(r.noMatchCount).toBe(1);
  });
  it("accounts for every place exactly once", () => {
    const r = searchPlaces(places, need("elevator"));
    expect(r.matches.length + r.unknownPlaces.length + r.noMatchCount).toBe(places.length);
  });
});
