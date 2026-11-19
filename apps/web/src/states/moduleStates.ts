/**
 * Which error or empty state a module page shows, and what it needs from the page.
 *
 * One pure function replaces the ad-hoc conditions each page used to carry, so the
 * rules can be tested as a table: every module, every availability, every
 * combination of "asked", "online" and "pack stored".
 *
 * Rules, in order:
 *  1. No result yet, or a module that is not connected ("stub"): no state. The page
 *     already says the module is not available; this is not an error to retry.
 *  2. A module that searches (places, finders, journey), when this device is
 *     offline, has no stored pack and did not return a ready result: offline-no-pack.
 *  3. A result with availability "error": a retry state. Games has its own wording.
 *  4. A ready result with no items: the module's empty state. Search-like modules
 *     show it only after the person has asked, so a blank form is never "no results".
 *     Navigator and games are lists with no input, so an empty list is shown at once.
 */
import {
  type ActionId,
  type EmptyKind,
  type ErrorKind,
  type Locale,
  ACTION_LINKS,
  getState,
} from "./stateCopy";
import { type RouteId, type RouteStateView, ROUTE_STATES, getRouteEmpty, getRouteError } from "./routeStates";

export type ModuleKey = "places" | "journey" | "finders" | "navigator" | "games" | "help";
export const MODULE_KEYS: readonly ModuleKey[] = ["places", "journey", "finders", "navigator", "games", "help"];

export type ModuleAvailability = "loading" | "ready" | "stub" | "error";

export interface ModuleStateInput {
  readonly module: ModuleKey;
  /** "loading" while no result has arrived. */
  readonly availability: ModuleAvailability;
  readonly itemCount: number;
  /** True once the person has submitted a search or a trip. */
  readonly asked: boolean;
  readonly online: boolean;
  /** Whether an offline pack is stored on this device; null while that is being read. */
  readonly packStored: boolean | null;
}

export interface ModuleStateChoice {
  readonly route: RouteId;
  readonly type: "error" | "empty";
  readonly kind: ErrorKind | EmptyKind;
}

/** The route whose state set a module uses. The places module is the "search" route. */
export const MODULE_ROUTE: Readonly<Record<ModuleKey, RouteId>> = {
  places: "search",
  journey: "journey",
  finders: "finders",
  navigator: "navigator",
  games: "games",
  help: "help",
};

const SEARCHES_OFFLINE: ReadonlySet<ModuleKey> = new Set<ModuleKey>(["places", "journey", "finders"]);

const EMPTY_BY_MODULE: Readonly<Record<ModuleKey, { kind: EmptyKind; needsAsk: boolean }>> = {
  places: { kind: "search-no-results", needsAsk: true },
  finders: { kind: "finder-no-results", needsAsk: true },
  journey: { kind: "journey-no-route", needsAsk: true },
  help: { kind: "help-no-results", needsAsk: true },
  navigator: { kind: "nothing-listed", needsAsk: false },
  games: { kind: "nothing-listed", needsAsk: false },
};

export function moduleStateFor(input: ModuleStateInput): ModuleStateChoice | null {
  const { module, availability, itemCount, asked, online, packStored } = input;
  const route = MODULE_ROUTE[module];
  if (availability === "loading" || availability === "stub") return null;

  if (SEARCHES_OFFLINE.has(module) && !online && packStored === false && availability !== "ready") {
    return { route, type: "error", kind: "offline-no-pack" };
  }
  if (availability === "error") {
    return { route, type: "error", kind: module === "games" ? "game-load-failed" : "module-load-failed" };
  }
  if (itemCount === 0) {
    const empty = EMPTY_BY_MODULE[module];
    if (!empty.needsAsk || asked) return { route, type: "empty", kind: empty.kind };
  }
  return null;
}

/** The view for a choice, in the module's own route so the region name reads "Games – …". */
export function moduleStateView(choice: ModuleStateChoice, locale: Locale): RouteStateView {
  if (choice.type === "error") return getRouteError(choice.route, choice.kind as ErrorKind, locale);
  return getRouteEmpty(choice.route, locale) ?? { ...getState(choice.kind, locale), routeId: null, ariaLabel: getState(choice.kind, locale).title };
}

/** Actions of a view that need a handler from the page because they are not links. */
export function handlerActions(view: { readonly actions: readonly { readonly id: ActionId }[] }): ActionId[] {
  return view.actions.map((a) => a.id).filter((id) => ACTION_LINKS[id] === undefined);
}

/** Actions a person will actually see: links, plus any action the page supplied a handler for. */
export function visibleActions(
  view: { readonly actions: readonly { readonly id: ActionId }[] },
  handlers: Partial<Record<ActionId, unknown>>,
): ActionId[] {
  return view.actions.map((a) => a.id).filter((id) => ACTION_LINKS[id] !== undefined || handlers[id] !== undefined);
}

/** True when the route's configuration lists the kind, so getRouteError will not swap it for another. */
export function routeAccepts(route: RouteId, kind: ErrorKind): boolean {
  return ROUTE_STATES[route].errors.includes(kind);
}
