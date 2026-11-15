import { emptyModuleResult, type FindersModule, type GamesModule, type HelpModule, type JourneyModule, type ModuleId, type ModuleResult, type NavigatorModule, type PlacesModule } from "@access/shared";
import type { ReactElement } from "react";

function unlinked<T>(id: ModuleId): Promise<ModuleResult<T>> {
  return Promise.resolve(emptyModuleResult(id, "modules.unavailable"));
}

/** Used when scripts/sync-lanes.mjs has not pinned and pulled a sibling package yet. */
export function createPlacesModule(): Omit<PlacesModule, "get"> {
  return { id: "places", search: () => unlinked("places") };
}
export function createJourneyModule(): JourneyModule {
  return { id: "journey", plan: () => unlinked("journey") };
}
export function createFindersModule(): FindersModule {
  return { id: "finders", search: () => unlinked("finders") };
}
export const navigatorShellModule: NavigatorModule = { id: "navigator", list: () => unlinked("navigator") };
export const gamesShellModule: GamesModule = { id: "games", list: () => unlinked("games") };
export const helpShellModule: HelpModule = { id: "help", list: () => unlinked("help") };
export function PackPlaceView(): ReactElement | null {
  return null;
}
