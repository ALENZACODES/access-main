import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, initialConnectivity, searchRouteView, type SearchContext } from "./index";
import { TODAY, mkPlace } from "./testHelpers";

const places = [
  mkPlace("Alpha", { elevator: "yes" }),
  mkPlace("Beta", { elevator: "unknown" }),
  mkPlace("Gamma", { elevator: "no" }),
  mkPlace("Delta", {}),
];
const ctx = (over: Partial<SearchContext> = {}): SearchContext => ({
  locale: "en",
  connectivity: initialConnectivity(true),
  today: TODAY,
  filter: { ...EMPTY_FILTER, required: ["elevator"] },
  ...over,
});

describe("searchRouteView", () => {
  it("lists matches only, and says how many UNKNOWN places are hidden", () => {
    const v = searchRouteView({ status: "ok", places }, ctx());
    expect(v.kind).toBe("results");
    if (v.kind !== "results") return;
    expect(v.cards.map((c) => c.name)).toEqual(["Alpha"]);
    expect(v.unknownNotice).toBe("2 more places have UNKNOWN details for your filters and are not shown.");
    expect(v.unknownToggle?.label).toBe("Show places with UNKNOWN details");
    expect(v.unknownToggle?.nextIncludeUnknown).toBe(true);
    expect(v.unknownToggle?.minTargetPx).toBeGreaterThanOrEqual(44);
    expect(v.announcement).toBe("1 place matches your filters. " + v.unknownNotice);
  });
  it("shows UNKNOWN places, labelled as UNKNOWN, when asked", () => {
    const v = searchRouteView({ status: "ok", places }, ctx({ filter: { ...EMPTY_FILTER, required: ["elevator"], includeUnknown: true } }));
    if (v.kind !== "results") throw new Error("expected results");
    expect(v.cards.map((c) => c.name)).toEqual(["Alpha", "Beta", "Delta"]);
    expect(v.cards[1]!.unknownText).toBe("UNKNOWN: Elevator");
    expect(v.cards[0]!.unknownText).toBeNull();
    expect(v.cards[0]!.matchedText).toBe("Reported yes: Elevator");
    expect(v.unknownToggle?.label).toBe("Hide places with UNKNOWN details");
    expect(v.unknownToggle?.nextIncludeUnknown).toBe(false);
    expect(v.unknownNotice).toBe("Includes 2 places with UNKNOWN details.");
    // the heading count still counts only real matches
    expect(v.announcement.startsWith("1 place matches")).toBe(true);
  });
  it("has no toggle when no requirement is set", () => {
    const v = searchRouteView({ status: "ok", places }, ctx({ filter: EMPTY_FILTER }));
    if (v.kind !== "results") throw new Error("expected results");
    expect(v.cards).toHaveLength(4);
    expect(v.unknownToggle).toBeNull();
    expect(v.unknownNotice).toBeNull();
  });
  it("uses the empty state, and still offers the UNKNOWN places, when nothing matches", () => {
    const v = searchRouteView({ status: "ok", places: [places[1]!, places[2]!] }, ctx());
    expect(v.kind).toBe("empty");
    if (v.kind !== "empty") return;
    expect(v.view.title).toBe("No places match this search");
    expect(v.unknownNotice).toContain("1 more place has UNKNOWN details");
    expect(v.unknownToggle).not.toBeNull();
  });
  it("is empty with no toggle when no place is UNKNOWN either", () => {
    const v = searchRouteView({ status: "ok", places: [places[2]!] }, ctx());
    expect(v.kind === "empty" && v.unknownToggle).toBeNull();
  });
  it("adds the offline banner", () => {
    const v = searchRouteView({ status: "ok", places }, ctx({ connectivity: { status: "offline", lastSavedOn: "2026-11-10" } }));
    expect(v.kind === "results" && v.banner?.description).toContain("10 November 2026");
  });
  it("maps errors by connectivity and status", () => {
    const off = searchRouteView({ status: "error" }, ctx({ connectivity: initialConnectivity(false) }));
    // Search lists only offline-no-pack and pack-download-failed, so other kinds fall back to the first.
    expect(off.kind === "error" && off.view.title).toBe("No connection and no offline pack");
    const srv = searchRouteView({ status: "error", httpStatus: 500 }, ctx());
    expect(srv.kind === "error" && srv.view.title).toBe("No connection and no offline pack");
  });
  it("speaks French with correct plural and typography", () => {
    const v = searchRouteView({ status: "ok", places }, ctx({ locale: "fr" }));
    if (v.kind !== "results") throw new Error("expected results");
    expect(v.announcement).toContain("1 lieu correspond à vos filtres.");
    expect(v.announcement).toContain("2 autres lieux ont des détails INCONNUS");
    expect(v.cards[0]!.matchedText).toBe("Signalé oui : Ascenseur");
  });
});
