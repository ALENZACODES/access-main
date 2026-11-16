import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg.ts";
import {
  ERROR_KINDS,
  ROUTE_IDS,
  ROUTE_STATES,
  getRouteEmpty,
  getRouteError,
  createRouteStates,
  isRouteId,
  MIN_TOUCH_TARGET_PX,
  type Locale,
} from "./index.ts";

const locales: Locale[] = ["en", "fr"];

describe("route states (via package index)", () => {
  it("every route resolves an error view for every kind in both locales", () => {
    for (const l of locales) {
      for (const r of ROUTE_IDS) {
        for (const k of ERROR_KINDS) {
          const v = getRouteError(r, k, l);
          expect(v.role).toBe("alert");
          expect(v.routeId).toBe(r);
          expect(v.actions.length).toBeGreaterThan(0);
          for (const a of v.actions) expect(a.minTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
        }
      }
    }
  });

  it("unknown routes get the generic error and no empty state", () => {
    expect(isRouteId("nope")).toBe(false);
    expect(getRouteError("nope", "offline-no-pack", "fr").routeId).toBeNull();
    expect(getRouteEmpty("nope", "en")).toBeNull();
  });

  it("place route empty state keeps accessibility UNKNOWN", () => {
    expect(getRouteEmpty("place", "en")?.title).toContain("UNKNOWN");
    // The map has no search box: its empty state names the view and filters.
    expect(getRouteEmpty("map", "en")?.title).toBe("No places in this map view");
    expect(getRouteEmpty("map", "fr")?.ariaLabel).toBe("Carte – Aucun lieu dans cette vue de la carte");
    expect(getRouteError("map", "pack-download-failed", "en").title).toBe("No connection and no offline pack");
    expect(getRouteEmpty("place", "fr")?.title).toContain("INCONNUE");
  });

  it("aria labels include the route name and have no straight apostrophes in FR", () => {
    expect(getRouteEmpty("search", "en")?.ariaLabel).toBe("Search – No places match this search");
    for (const r of ROUTE_IDS) {
      const label = getRouteEmpty(r, "fr")?.ariaLabel ?? "";
      expect(label).toContain(ROUTE_STATES[r].label.fr);
      expect(label).not.toContain("'");
    }
  });

  it("route labels avoid banned and prohibited wording", () => {
    const banned = new RegExp(["verified", "vérifié", "AAA", String.raw`\bAI\b`, String.raw`\bIA\b`].join("|"), "i");
    for (const r of ROUTE_IDS) {
      for (const l of locales) {
        expect(ROUTE_STATES[r].label[l]).not.toMatch(banned);
        expect(containsForbiddenOrg(ROUTE_STATES[r].label[l])).toBe(false);
      }
    }
  });

  it("createRouteStates lets the app supply its own route ids", () => {
    const rs = createRouteStates({
      home: { label: { en: "Home", fr: "Accueil" }, empty: null, errors: ["offline-no-pack"] },
    });
    expect(rs.isRouteId("home")).toBe(true);
    expect(rs.getRouteEmpty("home", "en")).toBeNull();
    expect(rs.getRouteError("home", "offline-no-pack", "fr").ariaLabel).toBe(
      "Accueil – Pas de connexion ni de pack hors ligne",
    );
    expect(rs.getRouteError("search", "offline-no-pack", "en").routeId).toBeNull();
  });
});
