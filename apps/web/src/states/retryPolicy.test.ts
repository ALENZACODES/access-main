import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { ESCALATE_AFTER, MAX_SHOWN_FAILURES, escalateView, escalationFor, type EscalationInput } from "./retryPolicy";
import { ROUTE_IDS, ROUTE_STATES, getRouteEmpty, getRouteError } from "./routeStates";
import { ACTION_LINKS, ERROR_KINDS, getErrorState, getEmptyState, EMPTY_KINDS, type Locale } from "./stateCopy";

const base: EscalationInput = { failures: 0, online: true, packStored: null };
const locales: Locale[] = ["en", "fr"];

describe("escalationFor", () => {
  it("does nothing before the second failure in a row", () => {
    for (const failures of [0, 1]) expect(escalationFor({ ...base, failures })).toEqual({ escalated: false, shownFailures: failures, extraActions: [] });
    expect(ESCALATE_AFTER).toBe(2);
  });
  it("adds Help from the second failure", () => {
    expect(escalationFor({ ...base, failures: 2 })).toEqual({ escalated: true, shownFailures: 2, extraActions: ["help"] });
  });
  it("adds the offline pack page only offline with no pack stored", () => {
    expect(escalationFor({ failures: 3, online: false, packStored: false }).extraActions).toEqual(["help", "download-pack"]);
    expect(escalationFor({ failures: 3, online: false, packStored: true }).extraActions).toEqual(["help"]);
    expect(escalationFor({ failures: 3, online: false, packStored: null }).extraActions).toEqual(["help"]);
    expect(escalationFor({ failures: 3, online: true, packStored: false }).extraActions).toEqual(["help"]);
  });
  it("treats a negative, fractional or non-finite count safely", () => {
    expect(escalationFor({ ...base, failures: -4 }).escalated).toBe(false);
    expect(escalationFor({ ...base, failures: Number.NaN }).escalated).toBe(false);
    expect(escalationFor({ ...base, failures: Number.POSITIVE_INFINITY }).escalated).toBe(false);
    expect(escalationFor({ ...base, failures: 2.9 }).shownFailures).toBe(2);
  });
  it("caps the number shown", () => {
    expect(escalationFor({ ...base, failures: 5000 }).shownFailures).toBe(MAX_SHOWN_FAILURES);
  });
});

describe("escalateView", () => {
  const view = (locale: Locale) => getErrorState("load-failed", locale);
  it("returns the same view before escalation", () => {
    const v = view("en");
    expect(escalateView(v, { ...base, failures: 1 }, "en")).toBe(v);
  });
  it("returns an empty state unchanged, however many failures", () => {
    const v = getEmptyState("search-no-results", "en");
    expect(escalateView(v, { ...base, failures: 9 }, "en")).toBe(v);
  });
  it("appends a count sentence and the Help link, keeping the original actions first", () => {
    const original = getErrorState("module-load-failed", "en");
    const out = escalateView(original, { ...base, failures: 2 }, "en");
    expect(out.title).toBe(original.title);
    expect(out.role).toBe("alert");
    expect(out.description.startsWith(original.description)).toBe(true);
    expect(out.description).toContain("failed 2 times in a row");
    expect(out.actions.map((a) => a.id)).toEqual([...original.actions.map((a) => a.id), "help"]);
    expect(out.actions.at(-1)).toMatchObject({ label: "Open help", minTargetPx: 44 });
  });
  it("counts in the plural in both languages", () => {
    expect(escalateView(getErrorState("load-failed", "en"), { ...base, failures: 2 }, "en").description).toContain("2 times");
    expect(escalateView(getErrorState("load-failed", "fr"), { ...base, failures: 2 }, "fr").description).toContain("2 fois de suite");
  });
  it("does not repeat an action the view already has", () => {
    const original = getErrorState("pack-download-failed", "en"); // already has Help
    const out = escalateView(original, { ...base, failures: 4 }, "en");
    expect(out.actions.filter((a) => a.id === "help")).toHaveLength(1);
    const offline = getErrorState("offline-no-pack", "en"); // already has Download
    const out2 = escalateView(offline, { failures: 4, online: false, packStored: false }, "en");
    expect(out2.actions.filter((a) => a.id === "download-pack")).toHaveLength(1);
  });
  it("only ever adds actions that are links, so they work without a handler", () => {
    for (const kind of ERROR_KINDS) {
      const original = getErrorState(kind, "en");
      const out = escalateView(original, { failures: 3, online: false, packStored: false }, "en");
      for (const action of out.actions.slice(original.actions.length)) expect(ACTION_LINKS[action.id]).toBeDefined();
    }
  });
  it("does not change the original view object", () => {
    const original = getErrorState("load-failed", "en");
    const copy = JSON.stringify(original);
    escalateView(original, { ...base, failures: 5 }, "en");
    expect(JSON.stringify(original)).toBe(copy);
  });
  it("reads in French with the same actions", () => {
    const out = escalateView(getErrorState("load-failed", "fr"), { ...base, failures: 3 }, "fr");
    expect(out.actions.at(-1)).toMatchObject({ id: "help", label: "Ouvrir l’aide" });
    expect(out.description).toContain("3 fois de suite");
  });
  it("passes the copy lint in both languages for every error kind and route", () => {
    for (const locale of locales) {
      for (const kind of ERROR_KINDS) {
        const out = escalateView(getErrorState(kind, locale), { failures: 6, online: false, packStored: false }, locale);
        expect(lintCopy(out.description, locale), `${kind} ${locale}`).toEqual([]);
        for (const a of out.actions) expect(lintCopy(a.label, locale)).toEqual([]);
      }
      for (const route of ROUTE_IDS) {
        for (const kind of ROUTE_STATES[route].errors) {
          const out = escalateView(getRouteError(route, kind, locale), { failures: 2, online: true, packStored: null }, locale);
          expect(lintCopy(out.description, locale), `${route}/${kind} ${locale}`).toEqual([]);
        }
        const empty = getRouteEmpty(route, locale);
        if (empty) expect(escalateView(empty, { ...base, failures: 9 }, locale)).toBe(empty);
      }
      for (const kind of EMPTY_KINDS) expect(escalateView(getEmptyState(kind, locale), { ...base, failures: 9 }, locale).description).toBe(getEmptyState(kind, locale).description);
    }
  });
  it("keeps the route label on a route view", () => {
    const routeView = getRouteError("help", "module-load-failed", "en");
    const out = escalateView(routeView, { ...base, failures: 2 }, "en");
    expect(out).toMatchObject({ routeId: routeView.routeId, ariaLabel: routeView.ariaLabel });
  });
});
