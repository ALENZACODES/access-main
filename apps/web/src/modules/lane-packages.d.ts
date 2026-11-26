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

/**
 * The journey-data package's own request and result types, copied from
 * .lanes/access-maps/packages/journey-data/src (index.ts, route.ts,
 * transit.ts, geometry.ts). It does not return the shell's JourneyModule;
 * lane-adapters.ts maps its result. journey-types.test.ts fails when the
 * pinned package's interfaces gain or lose a field.
 */
declare module "@access-maps/journey-data" {
  export interface Point { lat: number; lon: number }
  export type PrototypeLabel = "SEEDED-OPEN-DATA" | "PROTOTYPE-UNVERIFIED";
  export interface Evidence {
    recordId: string;
    field: string;
    sourceId: string;
    sourceName: string;
    licence: string;
    retrievedAt: string;
    tier: number | null;
    prototype_label: PrototypeLabel;
    attribution?: string;
  }
  export interface RollProfile { stepFreeRequired: boolean; maxGradePercent?: number | null; widthMm?: number | null }
  export interface RollRoute {
    status: "step-free" | "unknown" | "not-step-free";
    distanceMetres: number;
    path: Point[];
    recordIds: string[];
    unknownSurfaceCount: number;
    unknownAccessCount: number;
    evidence: Evidence[];
  }
  export interface StopWithAccess {
    id: string;
    name: string;
    point: Point;
    region: string;
    boarding: "yes" | "no" | "unknown";
    evidence: Evidence[];
    elevator: { state: "working" | "out" | "unknown"; checkedAt: string; evidence: Evidence } | null;
  }
  export interface TransitOption {
    from: StopWithAccess;
    to: StopWithAccess;
    routeId: string;
    departure: string;
    arrival: string;
    sourceName: string;
    fetchedAt: string;
    evidence: Evidence[];
    scheduled: true;
  }
  export interface JourneyRequest {
    origin: Point;
    destination: Point;
    profile: RollProfile;
    locale?: "en" | "fr";
    now: string;
    offline?: boolean;
    signal?: AbortSignal;
  }
  export interface JourneyResult {
    roll: RollRoute | null;
    originStops: StopWithAccess[];
    destinationStops: StopWithAccess[];
    transit: TransitOption[];
    missingRegions: string[];
    missingTimetables: string[];
    notices: string[];
    sources: PackSourceEntry[];
  }
  /** pack-types.ts: the package's local copy of the source entry. */
  export interface PackSourceEntry {
    sourceId: string;
    name: string;
    licence: string;
    licenceUrl?: string;
    attribution?: string;
    retrieved?: string;
    inWebPack?: boolean;
    heldReason?: string | null;
  }
  export interface JourneyModule {
    id: "journey";
    plan(request: JourneyRequest): Promise<JourneyResult>;
  }
  /** Timetable options are not passed by the shell until a timetable source is pinned. */
  export function createJourneyModule(source: import("@access-main/data-client").PackSource, options?: Record<string, never>): JourneyModule;
  export const messages: Record<"en" | "fr", {
    roll: string;
    far: string;
    noRoute: string;
    barrier: string;
    unverified: string;
  }>;
}

declare module "@access-tools/finders" {
  export function createFindersModule(source: import("@access-main/data-client").PackSource): import("@access/shared").FindersModule;
}

declare module "@access-tools/navigator" {
  export const navigatorShellModule: import("@access/shared").NavigatorModule;
}

declare module "@access-tools/games" {
  export const gamesShellModule: import("@access/shared").GamesModule;
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
  export type PlaceLookupHint = import("./data-client-fallback.ts").PlaceLookupHint;
  export type SearchHit = import("./data-client-fallback.ts").SearchHit;
  export const fieldValue: typeof import("./data-client-fallback.ts").fieldValue;
  export const createPackSource: typeof import("./data-client-fallback.ts").createPackSource;
  export const createFixtureSource: typeof import("./data-client-fallback.ts").createFixtureSource;
}

declare module "@access-tools/finders/shell" {
  export function searchFindersForShell(
    source: import("@access-main/data-client").PackSource,
    query: { kind: import("@access/shared").FinderKind; text: string },
    ctx: import("@access/shared").ModuleContext,
  ): ReturnType<import("@access/shared").FindersModule["search"]>;
}

declare module "@access/help/shell" {
  export const helpShellModule: import("@access/shared").HelpModule;
}

declare module "@access-tools/games/shell" {
  export function listGamesForShell(
    catalog?: readonly { id: string; name: string }[],
  ): import("@access/shared").ModuleResult<import("@access/shared").ActivityDefinition>;
}

declare module "@access-tools/games/library" {
  export const GAME_LIBRARY: readonly { id: string; name: string }[];
}

declare module "@access-tools/navigator/shell" {
  export function listForShell(
    ctx: import("@access/shared").ModuleContext,
  ): import("@access/shared").ModuleResult<import("@access/shared").DirectoryEntry>;
}
