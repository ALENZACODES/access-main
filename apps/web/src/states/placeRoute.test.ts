import { describe, expect, it } from "vitest";
import {
  type PlaceRouteContext,
  type PlaceReport,
  initialConnectivity,
  placeRouteView,
} from "./index";

const prov = { source: "Venue self-report form", licence: "CC-BY-4.0", retrievedOn: "2026-10-01" };
const known: PlaceReport = { name: "Hall", features: [{ feature: "elevator", value: "yes", provenance: prov }] };
const none: PlaceReport = { name: "Hall", features: [{ feature: "elevator", value: "yes" }] };
const ctx = (online: boolean, locale: "en" | "fr" = "en"): PlaceRouteContext => ({
  locale,
  connectivity: { ...initialConnectivity(online), lastSavedOn: "2026-11-10" },
  today: "2026-11-15",
});

describe("placeRouteView", () => {
  it("shows content with no banner when online", () => {
    const v = placeRouteView({ status: "ok", place: known, fromSavedCopy: false }, ctx(true));
    expect(v.kind).toBe("content");
    if (v.kind === "content") {
      expect(v.banner).toBeNull();
      expect(v.savedCopyNotice).toBeNull();
      expect(v.summary.knownCount).toBe(1);
    }
  });
  it("adds the offline banner and saved-copy notice", () => {
    const v = placeRouteView({ status: "ok", place: known, fromSavedCopy: true }, ctx(false));
    expect(v.kind === "content" && v.banner?.title).toBe("You are offline");
    expect(v.kind === "content" && v.savedCopyNotice).toBe("These details come from a copy saved on this device.");
    const fr = placeRouteView({ status: "ok", place: known, fromSavedCopy: true }, ctx(false, "fr"));
    expect(fr.kind === "content" && fr.savedCopyNotice).toContain("d’une copie");
  });
  it("falls to the UNKNOWN empty state when nothing is validly reported", () => {
    const v = placeRouteView({ status: "ok", place: none, fromSavedCopy: false }, ctx(true));
    expect(v.kind).toBe("empty");
    if (v.kind === "empty") expect(v.view.title).toContain("UNKNOWN");
  });
  it("maps not-found and HTTP errors to error views", () => {
    const nf = placeRouteView({ status: "not-found" }, ctx(true));
    expect(nf.kind === "error" && nf.view.title).toBe("This place was not found");
    const server = placeRouteView({ status: "error", httpStatus: 503 }, ctx(true));
    expect(server.kind === "error" && server.view.title).toBe("This place could not be loaded");
    const offline = placeRouteView({ status: "error" }, ctx(false));
    expect(offline.kind === "error" && offline.view.title).toBe("You are offline");
  });
  it("labels error views with the route name", () => {
    const v = placeRouteView({ status: "not-found" }, ctx(true, "fr"));
    expect(v.kind === "error" && v.view.ariaLabel.startsWith("Fiche du lieu")).toBe(true);
  });
});
