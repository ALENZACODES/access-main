import {
  emptyModuleResult,
  type FindersModule,
  type GamesModule,
  type HelpModule,
  type JourneyModule,
  type ModuleId,
  type ModuleRegistry,
  type ModuleResult,
  type NavigatorModule,
  type PlacesModule,
} from "@access/shared";

function unlinked<T>(id: ModuleId): Promise<ModuleResult<T>> {
  return Promise.resolve(emptyModuleResult(id, "modules.unavailable"));
}

/**
 * Builds the route modules. Pass a lane package's adapter in `linked` when
 * that package can be imported. Omitted lanes stay empty and say which
 * package the route calls. They do not invent records.
 */
export function createModules(linked: Partial<ModuleRegistry> = {}): ModuleRegistry {
  const places: PlacesModule = linked.places ?? { id: "places", search: () => unlinked("places") };
  const journey: JourneyModule = linked.journey ?? { id: "journey", plan: () => unlinked("journey") };
  const finders: FindersModule = linked.finders ?? { id: "finders", search: () => unlinked("finders") };
  const navigatorModule: NavigatorModule = linked.navigator ?? { id: "navigator", list: () => unlinked("navigator") };
  const games: GamesModule = linked.games ?? { id: "games", list: () => unlinked("games") };
  const help: HelpModule = linked.help ?? { id: "help", list: () => unlinked("help") };
  return { places, journey, finders, navigator: navigatorModule, games, help };
}

export const modules: ModuleRegistry = createModules();
