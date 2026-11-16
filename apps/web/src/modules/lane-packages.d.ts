/**
 * Types for the packages that scripts/sync-lanes.mjs pulls into .lanes/.
 * Each declaration is the surface the integration contract gives the shell:
 * the adapters return the shell's own module types, and they take a PackSource
 * from @access-main/data-client. Vite resolves the real code through the
 * aliases in vite.config.ts.
 */
declare module "@access-maps/places-shell" {
  export function createPlacesModule(
    source: import("@access-main/data-client").PackSource,
  ): Omit<import("@access/shared").PlacesModule, "get">;
}

declare module "@access-maps/journey-data" {
  export function createJourneyModule(source: import("@access-main/data-client").PackSource): import("@access/shared").JourneyModule;
}

declare module "@access-tools/finders" {
  export function createFindersModule(source: import("@access-main/data-client").PackSource): import("@access/shared").FindersModule;
}

declare module "@access-tools/navigator" {
  export const navigatorShellModule: import("@access/shared").NavigatorModule;
  export const DIRECTORY: readonly import("@access/shared").DirectoryEntry[];
}

declare module "@access-tools/games" {
  export const gamesShellModule: import("@access/shared").GamesModule;
  export function filterGames(
    filter: string,
    favourites: readonly string[],
  ): Array<{ id: string; name: string }>;
}

declare module "@access/help" {
  export const helpShellModule: import("@access/shared").HelpModule;
}

declare module "@access-tools/place" {
  type Detail = Awaited<ReturnType<import("@access/shared").PlacesModule["get"]>>["items"][number];
  export function PackPlaceView(props: {
    record: Detail["record"];
    sources: Detail["sources"];
    locale: "en" | "fr";
  }): import("react").ReactElement | null;
}

declare module "@access-main/data-client" {
  export type PackSource = import("./data-client-fallback.ts").PackSource;
  export type PackRecord = import("./data-client-fallback.ts").PackRecord;
  export type PackSourceEntry = import("./data-client-fallback.ts").PackSourceEntry;
  export const fieldValue: typeof import("./data-client-fallback.ts").fieldValue;
  export const createPackSource: typeof import("./data-client-fallback.ts").createPackSource;
  export const createFixtureSource: typeof import("./data-client-fallback.ts").createFixtureSource;
}
