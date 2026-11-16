import { describe, expect, it } from "vitest";
import { initialConnectivity, savedRouteView, type SavedContext } from "./index";
import { TODAY, mkPlace } from "./testHelpers";

const ctx = (over: Partial<SavedContext> = {}): SavedContext => ({
  locale: "en",
  connectivity: initialConnectivity(true),
  today: TODAY,
  ...over,
});

describe("savedRouteView", () => {
  it("shows the empty state when nothing is saved", () => {
    const v = savedRouteView({ status: "ok", places: [] }, ctx());
    expect(v.kind === "empty" && v.view.title).toBe("No saved places yet");
  });
  it("lists saved places sorted by name with 44px remove controls", () => {
    const v = savedRouteView({ status: "ok", places: [mkPlace("Zoo", {}), mkPlace("État", {}), mkPlace("Bar", {})] }, ctx());
    if (v.kind !== "content") throw new Error("expected content");
    expect(v.items.map((i) => i.summary.name)).toEqual(["Bar", "État", "Zoo"]);
    expect(v.countText).toBe("3 saved places.");
    expect(v.items[0]!.removeLabel).toBe("Remove Bar from saved places");
    for (const i of v.items) expect(i.removeTargetPx).toBeGreaterThanOrEqual(44);
  });
  it("works offline and says when the data was saved", () => {
    const v = savedRouteView(
      { status: "ok", places: [mkPlace("Bar", {})] },
      ctx({ connectivity: { status: "offline", lastSavedOn: "2026-11-01" } }),
    );
    expect(v.kind === "content" && v.banner?.description).toContain("1 November 2026");
  });
  it("translates to French", () => {
    const v = savedRouteView({ status: "ok", places: [mkPlace("Bar", {})] }, ctx({ locale: "fr" }));
    expect(v.kind === "content" && v.countText).toBe("1 lieu enregistré.");
    expect(v.kind === "content" && v.items[0]!.removeLabel).toBe("Retirer Bar des lieux enregistrés");
  });
  it("falls back to the generic error for server failures", () => {
    const v = savedRouteView({ status: "error", httpStatus: 500 }, ctx());
    expect(v.kind === "error" && v.view.title).toBe("Something went wrong");
  });
});
