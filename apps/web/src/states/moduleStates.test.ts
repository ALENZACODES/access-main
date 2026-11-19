import { describe, expect, it } from "vitest";
import {
  ACTION_LINKS,
  MODULE_KEYS,
  MODULE_ROUTE,
  ROUTE_STATES,
  handlerActions,
  lintCopy,
  lintFrench,
  moduleStateFor,
  moduleStateView,
  routeAccepts,
  visibleActions,
  type ActionId,
  type ErrorKind,
  type Locale,
  type ModuleAvailability,
  type ModuleKey,
  type ModuleStateInput,
} from "./index";

const base: ModuleStateInput = { module: "places", availability: "ready", itemCount: 0, asked: true, online: true, packStored: true };
const pick = (over: Partial<ModuleStateInput>) => {
  const c = moduleStateFor({ ...base, ...over });
  return c ? `${c.type}:${c.kind}` : null;
};

describe("moduleStateFor: named rules", () => {
  it("shows nothing before a result arrives, or for a module that is not connected", () => {
    for (const module of MODULE_KEYS) {
      expect(pick({ module, availability: "loading" })).toBeNull();
      expect(pick({ module, availability: "stub" })).toBeNull();
      expect(pick({ module, availability: "stub", online: true, packStored: false })).toBeNull();
      expect(pick({ module, availability: "loading", online: false, packStored: false })).toBeNull();
    }
  });
  it("offline with no pack, a stub module still gets the offline-no-pack state with its pack download and retry", () => {
    for (const module of ["places", "journey", "finders"] as const) {
      expect(pick({ module, availability: "stub", online: false, packStored: false })).toBe("error:offline-no-pack");
      const c = moduleStateFor({ module, availability: "stub", itemCount: 0, asked: false, online: false, packStored: false });
      const view = moduleStateView(c!, "en");
      expect(view.title).toBe("No connection and no offline pack");
      expect(view.actions.map((a) => a.id)).toEqual(expect.arrayContaining(["download-pack", "retry"]));
    }
    for (const module of ["navigator", "games", "help"] as const) {
      expect(pick({ module, availability: "stub", online: false, packStored: false })).toBeNull();
    }
  });
  it.each([
    ["places", "search-no-results"],
    ["finders", "finder-no-results"],
    ["journey", "journey-no-route"],
    ["help", "help-no-results"],
  ] as const)("%s shows %s only after the person has asked", (module, kind) => {
    expect(pick({ module, asked: true })).toBe(`empty:${kind}`);
    expect(pick({ module, asked: false })).toBeNull();
  });
  it.each(["navigator", "games"] as const)("%s shows an empty list at once, with no search needed", (module) => {
    expect(pick({ module, asked: false })).toBe("empty:nothing-listed");
    expect(pick({ module, asked: true })).toBe("empty:nothing-listed");
  });
  it("shows no empty state when there are items", () => {
    for (const module of MODULE_KEYS) expect(pick({ module, itemCount: 3 })).toBeNull();
  });
  it("shows the games load failure in its own words and every other module's as a list failure", () => {
    expect(pick({ module: "games", availability: "error" })).toBe("error:game-load-failed");
    for (const module of MODULE_KEYS.filter((m) => m !== "games")) {
      expect(pick({ module, availability: "error", asked: false })).toBe("error:module-load-failed");
    }
  });
  it("shows offline-no-pack for search modules that are offline, have no stored pack and did not get a ready result", () => {
    for (const module of ["places", "journey", "finders"] as const) {
      expect(pick({ module, availability: "error", online: false, packStored: false })).toBe("error:offline-no-pack");
      expect(pick({ module, availability: "stub", online: false, packStored: false })).toBe("error:offline-no-pack");
    }
  });
  it("does not say there is no pack while that is still being read, or when one is stored", () => {
    expect(pick({ module: "places", availability: "error", online: false, packStored: null })).toBe("error:module-load-failed");
    expect(pick({ module: "places", availability: "error", online: false, packStored: true })).toBe("error:module-load-failed");
  });
  it("does not use offline-no-pack for a ready result, or for modules that need no pack", () => {
    expect(pick({ module: "places", online: false, packStored: false })).toBe("empty:search-no-results");
    for (const module of ["navigator", "games", "help"] as const) {
      expect(pick({ module, availability: "error", online: false, packStored: false })).not.toBe("error:offline-no-pack");
    }
  });
  it("lets a failure win over items that arrived with it", () => {
    expect(pick({ availability: "error", itemCount: 4 })).toBe("error:module-load-failed");
  });
});

describe("moduleStateFor: every combination", () => {
  const availabilities: ModuleAvailability[] = ["loading", "ready", "stub", "error"];
  const combos: ModuleStateInput[] = [];
  for (const module of MODULE_KEYS) {
    for (const availability of availabilities) {
      for (const itemCount of [0, 2]) {
        for (const asked of [false, true]) {
          for (const online of [false, true]) {
            for (const packStored of [null, true, false]) combos.push({ module, availability, itemCount, asked, online, packStored });
          }
        }
      }
    }
  }
  // The handlers the module and help pages supply.
  const handlers: Partial<Record<ActionId, () => void>> = { retry: () => undefined, "clear-search": () => undefined, "change-trip": () => undefined };

  it("covers every module, availability and input combination", () => {
    expect(combos).toHaveLength(MODULE_KEYS.length * 4 * 2 * 2 * 2 * 3);
  });
  it("never throws, and always answers in the module's own route", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c) expect(c.route, JSON.stringify(input)).toBe(MODULE_ROUTE[input.module]);
    }
  });
  it("only ever picks an error kind the route lists, so nothing is swapped for another message", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c?.type === "error") expect(routeAccepts(c.route, c.kind as ErrorKind), JSON.stringify(input)).toBe(true);
      if (c?.type === "empty") expect(ROUTE_STATES[c.route].empty, JSON.stringify(input)).toBe(c.kind);
    }
  });
  it("shows an empty state only for a ready, empty result, and a search-like one only after asking", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c?.type !== "empty") continue;
      expect(input.availability, JSON.stringify(input)).toBe("ready");
      expect(input.itemCount).toBe(0);
      if (!["navigator", "games"].includes(input.module)) expect(input.asked).toBe(true);
    }
  });
  it("shows an error only when the module failed or this device is offline with no pack", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c?.type !== "error") continue;
      const offlineNoPack = c.kind === "offline-no-pack";
      expect(offlineNoPack || input.availability === "error", JSON.stringify(input)).toBe(true);
      if (offlineNoPack) expect(!input.online && input.packStored === false && input.availability !== "ready").toBe(true);
    }
  });
  it("shows nothing while loading, or for a stub module unless it is offline with no pack on a search route", () => {
    for (const input of combos.filter((i) => i.availability === "loading" || i.availability === "stub")) {
      const c = moduleStateFor(input);
      if (c) expect(input.availability === "stub" && !input.online && input.packStored === false && c.kind === "offline-no-pack").toBe(true);
    }
  });
  it("gives every state a next action the person can use with the handlers the pages supply", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (!c) continue;
      for (const locale of ["en", "fr"] as const) {
        const view = moduleStateView(c, locale);
        expect(visibleActions(view, handlers).length, `${JSON.stringify(input)} ${locale}`).toBeGreaterThan(0);
        for (const action of view.actions) expect(action.minTargetPx).toBeGreaterThanOrEqual(44);
      }
    }
  });
  it("makes errors alerts and empty states polite status text", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c) expect(moduleStateView(c, "en").role).toBe(c.type === "error" ? "alert" : "status");
    }
  });
  it("offers a retry on every failure that is not a missing pack", () => {
    for (const input of combos) {
      const c = moduleStateFor(input);
      if (c?.type === "error" && c.kind !== "offline-no-pack") {
        expect(handlerActions(moduleStateView(c, "en")), JSON.stringify(input)).toContain("retry");
      }
    }
  });
});

describe("moduleStateView", () => {
  it("names the region after the route and the state", () => {
    const view = moduleStateView({ route: "games", type: "empty", kind: "nothing-listed" }, "en");
    expect(view.ariaLabel).toBe("Games – Nothing is listed here yet");
    expect(moduleStateView({ route: "help", type: "empty", kind: "help-no-results" }, "fr").ariaLabel).toBe("Aide – Aucun article d’aide ne correspond à cette recherche");
  });
  it("never says the App guessed: an empty list says it does not fill gaps", () => {
    expect(moduleStateView({ route: "navigator", type: "empty", kind: "nothing-listed" }, "en").description).toContain("does not fill gaps with guesses");
    expect(moduleStateView({ route: "navigator", type: "empty", kind: "nothing-listed" }, "fr").description).toContain("ne comble pas les vides par des suppositions");
  });
});

describe("handlerActions and visibleActions", () => {
  const view = { actions: [{ id: "retry" as const }, { id: "go-home" as const }, { id: "clear-search" as const }] };
  it("separates links from actions that need a handler", () => {
    expect(handlerActions(view)).toEqual(["retry", "clear-search"]);
    expect(Object.keys(ACTION_LINKS)).toContain("go-home");
  });
  it("hides an action that has no link and no handler, so nothing on screen does nothing", () => {
    expect(visibleActions(view, {})).toEqual(["go-home"]);
    expect(visibleActions(view, { retry: () => undefined })).toEqual(["retry", "go-home"]);
  });
});

describe("the new wording", () => {
  const kinds: Array<{ route: ModuleKey; kind: string }> = [];
  for (const module of MODULE_KEYS) {
    const r = MODULE_ROUTE[module];
    for (const e of ROUTE_STATES[r].errors) kinds.push({ route: module, kind: e });
  }
  it("passes the copy lint and French typography in every module route's states", () => {
    for (const locale of ["en", "fr"] as const satisfies readonly Locale[]) {
      for (const module of MODULE_KEYS) {
        const r = MODULE_ROUTE[module];
        const views = [
          ...ROUTE_STATES[r].errors.map((k) => moduleStateView({ route: r, type: "error", kind: k }, locale)),
          ...(ROUTE_STATES[r].empty ? [moduleStateView({ route: r, type: "empty", kind: ROUTE_STATES[r].empty! }, locale)] : []),
        ];
        for (const v of views) {
          for (const s of [v.title, v.description, v.ariaLabel, ...v.actions.map((a) => a.label)]) {
            expect(lintCopy(s, locale), s).toEqual([]);
            if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
          }
        }
      }
    }
  });
  it("has no wording that blames a server or promises more than the App records", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const module of MODULE_KEYS) {
        const r = MODULE_ROUTE[module];
        for (const k of ROUTE_STATES[r].errors) {
          const v = moduleStateView({ route: r, type: "error", kind: k }, locale);
          expect(`${v.title} ${v.description}`).not.toMatch(/server|serveur|our side|notre côté|accessible|sûr|safe|guarantee|garantie/i);
        }
      }
    }
    expect(kinds.length).toBeGreaterThan(MODULE_KEYS.length);
  });
});
