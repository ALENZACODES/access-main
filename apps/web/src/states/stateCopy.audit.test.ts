import { describe, expect, it } from "vitest";
import { ACTION_LINKS, DAY22_STATES, EMPTY_KINDS, ERROR_KINDS, MIN_TOUCH_TARGET_PX, errorKindFromStatus, getEmptyState, getErrorState, getState, type ActionId, type EmptyKind, type ErrorKind, type Locale } from "./stateCopy";
import { lintCopy } from "./copyLint";

const LOCALES: Locale[] = ["en", "fr"];
const ALL = [...ERROR_KINDS, ...EMPTY_KINDS] as (ErrorKind | EmptyKind)[];
const ACTIONS: ActionId[] = ["retry", "go-home", "go-back", "download-pack", "clear-search", "change-trip", "help"];

describe("state kinds", () => {
  it("has no kind that is both an error and an empty state", () => {
    for (const k of ERROR_KINDS) expect(EMPTY_KINDS.includes(k as never), k).toBe(false);
  });
  it("has each kind once", () => expect(new Set(ALL).size).toBe(ALL.length));
  it("lists the kinds the types name", () => {
    expect([...ERROR_KINDS].sort()).toEqual(["data-load-failed", "game-load-failed", "load-failed", "module-load-failed", "not-found", "offline", "offline-no-pack", "pack-download-failed", "pack-unreadable", "page-load-failed", "region-list-unavailable"]);
    expect([...EMPTY_KINDS].sort()).toEqual(["accessibility-unknown", "finder-no-results", "help-no-results", "journey-no-route", "map-no-places", "no-regions", "no-saved-places", "nothing-listed", "search-no-results"]);
  });
  it("covers the six Day 22 states", () => {
    expect(DAY22_STATES).toHaveLength(6);
    for (const k of DAY22_STATES) expect(ALL.includes(k), k).toBe(true);
  });
});

describe("every state", () => {
  for (const kind of ALL) for (const locale of LOCALES) {
    const view = getState(kind, locale);
    it(`${kind} (${locale}) has a heading and one sentence or two, with no copy-lint issue`, () => {
      expect(view.title.length).toBeGreaterThan(5);
      expect(view.description.length).toBeGreaterThan(10);
      expect(lintCopy(view.title, locale), view.title).toEqual([]);
      expect(lintCopy(view.description, locale), view.description).toEqual([]);
    });
    it(`${kind} (${locale}) ends its heading without a full stop and its description with one`, () => {
      expect(view.title).not.toMatch(/[.!]$/);
      expect(view.description).toMatch(/[.»)]$/);
    });
    it(`${kind} (${locale}) has actions that are each a known action, once, at the minimum touch size`, () => {
      const ids = view.actions.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of view.actions) {
        expect(ACTIONS, a.id).toContain(a.id);
        expect(a.label.length).toBeGreaterThan(1);
        expect(a.minTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
        expect(lintCopy(a.label, locale), a.label).toEqual([]);
      }
    });
    it(`${kind} (${locale}) blames no server and promises no fix`, () => {
      const text = `${view.title} ${view.description}`.toLowerCase();
      for (const w of ["our side", "our servers", "service is", "we will fix", "serveur", "notre faute"]) expect(text, w).not.toContain(w);
    });
  }
  it("has an action on every state, so nobody is stuck", () => {
    for (const k of ALL) for (const l of LOCALES) expect(getState(k, l).actions.length, k).toBeGreaterThan(0);
  });
  it("gives an error an alert role and an empty state a status role", () => {
    for (const k of ERROR_KINDS) expect(getErrorState(k, "en").role, k).toBe("alert");
    for (const k of EMPTY_KINDS) expect(getEmptyState(k, "en").role, k).toBe("status");
  });
  it("dispatches getState to the right group", () => {
    for (const k of ERROR_KINDS) expect(getState(k, "fr")).toEqual(getErrorState(k, "fr"));
    for (const k of EMPTY_KINDS) expect(getState(k, "fr")).toEqual(getEmptyState(k, "fr"));
  });
  it("gives each kind a different title within a language", () => {
    for (const l of LOCALES) {
      const titles = ALL.map((k) => getState(k, l).title);
      expect(new Set(titles).size, l).toBe(titles.length);
    }
  });
  it("gives the same actions, in the same order, in both languages", () => {
    for (const k of ALL) expect(getState(k, "en").actions.map((a) => a.id), k).toEqual(getState(k, "fr").actions.map((a) => a.id));
  });
  it("gives the same label to the same action everywhere in a language", () => {
    for (const l of LOCALES) {
      const seen = new Map<ActionId, string>();
      for (const k of ALL) for (const a of getState(k, l).actions) {
        const prev = seen.get(a.id);
        if (prev !== undefined) expect(a.label, `${k}/${a.id}`).toBe(prev);
        seen.set(a.id, a.label);
      }
    }
  });
  it("uses the curly apostrophe in French and no straight one in either language", () => {
    for (const k of ALL) for (const l of LOCALES) {
      const v = getState(k, l);
      for (const s of [v.title, v.description, ...v.actions.map((a) => a.label)]) expect(s, `${k}/${l}`).not.toContain("'");
    }
  });
  it("does not give a link action an action the view cannot follow", () => {
    for (const [id, href] of Object.entries(ACTION_LINKS)) {
      expect(ACTIONS, id).toContain(id);
      expect(href, id).toMatch(/^\/[a-z-]*$/);
    }
  });
  it("keeps every action that is a link on a state that offers it", () => {
    const used = new Set<ActionId>();
    for (const k of ALL) for (const a of getState(k, "en").actions) used.add(a.id);
    for (const id of Object.keys(ACTION_LINKS)) expect(used.has(id as ActionId), id).toBe(true);
  });
  it("returns a new view each time, so a caller cannot change the next one", () => {
    const a = getState("not-found", "en");
    const b = getState("not-found", "en");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("errorKindFromStatus", () => {
  it("says offline whenever the device is offline, whatever the status", () => {
    for (const s of [undefined, 200, 404, 500]) expect(errorKindFromStatus(s, false), String(s)).toBe("offline");
  });
  it("says not found for 404 only", () => {
    expect(errorKindFromStatus(404, true)).toBe("not-found");
    for (const s of [undefined, 0, 200, 400, 403, 410, 500, 503]) expect(errorKindFromStatus(s, true), String(s)).toBe("load-failed");
  });
  it("always gives a kind that has a state", () => {
    for (const s of [undefined, 404, 500]) for (const o of [true, false]) expect(ERROR_KINDS).toContain(errorKindFromStatus(s, o));
  });
});
