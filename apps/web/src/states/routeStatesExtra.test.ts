import { describe, expect, it } from "vitest";
import { EXTRA_ROUTES, type ExtraRouteId } from "./routeStatesExtra";
import { ROUTE_NAMES } from "./router";
import { ERROR_KINDS } from "./stateCopy";

const IDS = Object.keys(EXTRA_ROUTES.routes) as ExtraRouteId[];

describe("the extra routes", () => {
  it("are the six routes added after the first four", () => expect(IDS.sort()).toEqual(["compare", "coverage", "offline", "report", "settings", "sources"]));
  it("are all routes the router knows", () => {
    for (const id of IDS) expect(ROUTE_NAMES, id).toContain(id);
  });
  it("recognise their own ids and nothing else", () => {
    for (const id of IDS) expect(EXTRA_ROUTES.isRouteId(id)).toBe(true);
    for (const id of ["search", "", "toString", "__proto__", "constructor", "Compare"]) expect(EXTRA_ROUTES.isRouteId(id), id).toBe(false);
  });
  it("have a label in both languages and no empty state, since each page always has content", () => {
    for (const id of IDS) {
      const cfg = EXTRA_ROUTES.routes[id];
      expect(cfg.label.en.length).toBeGreaterThan(0);
      expect(cfg.label.fr.length).toBeGreaterThan(0);
      expect(cfg.empty).toBeNull();
      expect(EXTRA_ROUTES.getRouteEmpty(id, "en")).toBeNull();
    }
  });
  it("list only error kinds that exist, and at least one", () => {
    for (const id of IDS) {
      const errors = EXTRA_ROUTES.routes[id].errors;
      expect(errors.length).toBeGreaterThan(0);
      for (const k of errors) expect(ERROR_KINDS).toContain(k);
    }
  });
  it("give an error view named after the page", () => {
    const v = EXTRA_ROUTES.getRouteError("compare", "data-load-failed", "en");
    expect(v.routeId).toBe("compare");
    expect(v.ariaLabel.startsWith("Compare – ")).toBe(true);
    expect(v.role).toBe("alert");
    expect(EXTRA_ROUTES.getRouteError("compare", "data-load-failed", "fr").ariaLabel.startsWith("Comparer – ")).toBe(true);
  });
  it("show the data wording for a generic load failure on a page that lists it", () => {
    const generic = EXTRA_ROUTES.getRouteError("settings", "load-failed", "en");
    const data = EXTRA_ROUTES.getRouteError("settings", "data-load-failed", "en");
    expect(generic.title).toBe(data.title);
  });
  it("fall back to the first listed kind for a kind the page does not list", () => {
    const v = EXTRA_ROUTES.getRouteError("settings", "pack-unreadable", "en");
    expect(v.title).toBe(EXTRA_ROUTES.getRouteError("settings", "data-load-failed", "en").title);
  });
  it("keep offline for the pages that list it, and not for settings", () => {
    const offline = EXTRA_ROUTES.getRouteError("sources", "offline", "en").title;
    expect(EXTRA_ROUTES.getRouteError("sources", "offline", "en").title).toBe(offline);
    expect(EXTRA_ROUTES.getRouteError("settings", "offline", "en").title).not.toBe(offline);
  });
  it("give the generic offline-pack view, with no page name, for an unknown route", () => {
    const v = EXTRA_ROUTES.getRouteError("nowhere", "offline", "en");
    expect(v.routeId).toBeNull();
    expect(v.ariaLabel).toBe(v.title);
    expect(EXTRA_ROUTES.getRouteEmpty("nowhere", "en")).toBeNull();
  });
  it("answer in French for French", () => {
    for (const id of IDS) expect(EXTRA_ROUTES.getRouteError(id, EXTRA_ROUTES.routes[id].errors[0]!, "fr").ariaLabel).toContain(EXTRA_ROUTES.routes[id].label.fr);
  });
});
