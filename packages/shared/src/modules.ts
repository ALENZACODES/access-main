import type { DirectoryRecord } from "./directory.ts";
import type { Provenance } from "./provenance.ts";
import type { RoutingPreference, UserProfile } from "./profile.ts";

/**
 * Contracts for modules owned by other lanes.
 * places and journey: maps lane (place pages may also come from the tools lane).
 * finders, navigator, games: tools lane.
 * help: help lane.
 *
 * JSON Schemas are owned by Lane 2 in packages/schema. This file is the
 * TypeScript contract the shell compiles against. Do not add schemas here.
 * Stubs return no records. Unknown stays unknown. The shell does not invent places.
 */
export const MODULE_IDS = ["places", "journey", "finders", "navigator", "games", "help"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const SHELL_CONTRACT_VERSION = "1.1.0";

export interface ModuleContext {
  locale: "en" | "fr";
  offline: boolean;
  profile: UserProfile | null;
  nowIso: string;
}

export interface ModuleResult<T> {
  moduleId: ModuleId;
  availability: "stub" | "ready" | "error";
  items: T[];
  messageKey: string;
  asOf: string | null;
  liveStatus: "unavailable";
}

export function emptyModuleResult<T>(moduleId: ModuleId, messageKey: string): ModuleResult<T> {
  return {
    moduleId,
    availability: "stub",
    items: [],
    messageKey,
    asOf: null,
    liveStatus: "unavailable",
  };
}

export interface PlaceHit {
  id: string;
  name: string;
  provenance: Provenance;
}

export interface PlacesQuery {
  text: string;
}

export interface PlacesModule {
  id: "places";
  search(query: PlacesQuery, ctx: ModuleContext): Promise<ModuleResult<PlaceHit>>;
}

export interface JourneyRequest {
  originLabel: string | null;
  destinationLabel: string | null;
  routingPreference: RoutingPreference | null;
  offline: boolean;
}

export interface JourneyPlan {
  id: string;
  summary: string;
  provenance: Provenance;
  liveStatus: "unavailable";
}

export interface JourneyModule {
  id: "journey";
  plan(request: JourneyRequest, ctx: ModuleContext): Promise<ModuleResult<JourneyPlan>>;
}

export const FINDER_KINDS = ["washroom", "parking", "charging", "repair", "adult-change"] as const;
export type FinderKind = (typeof FINDER_KINDS)[number];

export interface FinderHit {
  id: string;
  name: string;
  kind: FinderKind;
  provenance: Provenance;
  /** Municipal flags are not measurements. Unknown stays unknown. */
  detail: "unknown";
}

export interface FindersModule {
  id: "finders";
  search(query: { kind: FinderKind; text: string }, ctx: ModuleContext): Promise<ModuleResult<FinderHit>>;
}

/** Same object the navigator package stores. Provenance tier for a stored copy is E. */
export type DirectoryEntry = DirectoryRecord;

export interface NavigatorModule {
  id: "navigator";
  list(ctx: ModuleContext): Promise<ModuleResult<DirectoryEntry>>;
}

export interface ActivityDefinition {
  id: string;
  title: string;
  /** A game in the games hub. Not therapy and not an assessment. */
  clinicalClaim: false;
  seizureRiskFlash: false;
  keyboardOperable: true;
}

export interface GamesModule {
  id: "games";
  list(ctx: ModuleContext): Promise<ModuleResult<ActivityDefinition>>;
}

export interface HelpArticle {
  id: string;
  title: string;
  locale: "en" | "fr";
  provenance: Provenance;
}

export interface HelpModule {
  id: "help";
  list(ctx: ModuleContext): Promise<ModuleResult<HelpArticle>>;
}

export interface ModuleRegistry {
  places: PlacesModule;
  journey: JourneyModule;
  finders: FindersModule;
  navigator: NavigatorModule;
  games: GamesModule;
  help: HelpModule;
}
