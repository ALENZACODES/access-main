import {
  emptyModuleResult,
  type FindersModule,
  type GamesModule,
  type HelpModule,
  type JourneyModule,
  type ModuleRegistry,
  type NavigatorModule,
  type PlacesModule,
} from "@access/shared";

const places: PlacesModule = {
  id: "places",
  search() {
    return Promise.resolve(emptyModuleResult("places", "modules.notConnected"));
  },
};

const journey: JourneyModule = {
  id: "journey",
  plan() {
    return Promise.resolve(emptyModuleResult("journey", "modules.notConnected"));
  },
};

const finders: FindersModule = {
  id: "finders",
  search() {
    return Promise.resolve(emptyModuleResult("finders", "modules.notConnected"));
  },
};

const navigatorModule: NavigatorModule = {
  id: "navigator",
  list() {
    return Promise.resolve(emptyModuleResult("navigator", "modules.notConnected"));
  },
};

const games: GamesModule = {
  id: "games",
  list() {
    return Promise.resolve(emptyModuleResult("games", "modules.notConnected"));
  },
};

const help: HelpModule = {
  id: "help",
  list() {
    return Promise.resolve(emptyModuleResult("help", "modules.notConnected"));
  },
};

/** Replace a property when another lane ships a real module. Stubs return no records. */
export const modules: ModuleRegistry = {
  places,
  journey,
  finders,
  navigator: navigatorModule,
  games,
  help,
};
