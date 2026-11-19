import { emptyModuleResult, type FindersModule, type GamesModule, type HelpModule, type ModuleId, type ModuleResult, type NavigatorModule, type PlacesModule } from "@access/shared";
import type { ReactElement } from "react";

function unlinked<T>(id: ModuleId): Promise<ModuleResult<T>> {
  return Promise.resolve(emptyModuleResult(id, "modules.unavailable"));
}

/** Used when scripts/sync-lanes.mjs has not pinned and pulled a sibling package yet. */
export function createPlacesModule(): Omit<PlacesModule, "get"> {
  return { id: "places", search: () => unlinked("places") };
}
/** Stand-in for @access-maps/journey-data. `unlinked` tells the shell adapter to report the route unavailable. */
export function createJourneyModule(): { id: "journey"; unlinked: true; plan: () => Promise<never> } {
  return { id: "journey", unlinked: true, plan: () => Promise.reject(new Error("journey-data is not pinned in this build")) };
}
const journeyText = { roll: "", far: "", noRoute: "", barrier: "", unverified: "" };
export const messages = { en: journeyText, fr: journeyText };
export function createFindersModule(): FindersModule {
  return { id: "finders", search: () => unlinked("finders") };
}
export const navigatorShellModule: NavigatorModule = { id: "navigator", list: () => unlinked("navigator") };
export const gamesShellModule: GamesModule = { id: "games", list: () => unlinked("games") };
export const helpShellModule: HelpModule = { id: "help", list: () => unlinked("help") };
export function PackPlaceView(): ReactElement | null {
  return null;
}
