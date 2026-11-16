import type { PackSource } from "@access-main/data-client";
import { filterGames } from "@access-tools/games";
import { DIRECTORY } from "@access-tools/navigator";
import {
  emptyModuleResult,
  type ActivityDefinition,
  type DirectoryEntry,
  type FindersModule,
  type JourneyModule,
  type GamesModule,
  type ModuleResult,
  type NavigatorModule,
} from "@access/shared";

function ready<T>(moduleId: ModuleResult<T>["moduleId"], items: T[], messageKey: string): ModuleResult<T> {
  return { moduleId, availability: "ready", items, messageKey, asOf: null, liveStatus: "unavailable" };
}

/**
 * The journey-data package plans over coordinates, not the shell's origin and
 * destination labels. Until that wiring exists, the route stays unavailable
 * and does not invent a trip.
 */
export function createJourneyModule(source: PackSource): JourneyModule {
  void source;
  return {
    id: "journey",
    plan: async () => emptyModuleResult("journey", "modules.unavailable"),
  };
}

/**
 * The finders package reads an access-tools place pack, not the shell PackSource
 * used here. Until that wiring exists, the route stays unavailable and does
 * not invent washrooms, parking, chargers, or repair shops.
 */
export function createFindersModule(source: PackSource): FindersModule {
  void source;
  return {
    id: "finders",
    search: async () => emptyModuleResult("finders", "modules.unavailable"),
  };
}

export const navigatorShellModule: NavigatorModule = {
  id: "navigator",
  list: async () => ready("navigator", [...DIRECTORY] as DirectoryEntry[], "navigator.shellReady"),
};

export const gamesShellModule: GamesModule = {
  id: "games",
  list: async () => {
    const items: ActivityDefinition[] = filterGames("all", []).map((game) => ({
      id: game.id,
      title: game.name,
      clinicalClaim: false,
      seizureRiskFlash: false,
      keyboardOperable: true,
    }));
    return ready("games", items, "games.shellReady");
  },
};
