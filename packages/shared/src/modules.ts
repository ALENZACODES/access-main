import type { DirectoryRecord } from "./directory.ts";
import type { Provenance } from "./provenance.ts";
import type { RoutingPreference, UserProfile } from "./profile.ts";

/**
 * Contracts for modules owned by other lanes.
 * places and journey: maps lane (place pages may also come from the tools lane).
 * finders, navigator, games: tools lane.
 * help: help lane.
 *
 * JSON Schemas live in packages/schema. This file is the
 * TypeScript contract the shell compiles against. Do not add schemas here.
 * Stubs return no records. Unknown stays unknown. The shell does not invent places.
 */
export const MODULE_IDS = ["places", "journey", "finders", "navigator", "games", "help"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const SHELL_CONTRACT_VERSION = "1.2.0";

export interface ModuleContext {
  locale: "en" | "fr";
  offline: boolean;
  profile: UserProfile | null;
  nowIso: string;
  /** Text the person submitted on this route. Omitted when the field is empty. */
  query?: string;
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

/**
 * Data pack shapes behind a place page. `@access-main/data-client` owns these
 * types. This is the contract copy until that package is the single source.
 * A field's value is the string "UNKNOWN" when the source gives nothing.
 */
export interface PackFieldValue {
  value: string | number | Array<[number, number]>;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: 0 | 1 | 2 | 3 | 4;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

export interface PackRecord {
  id: string;
  tranche: "venue" | "washroom" | "transit" | "path";
  region: string;
  fields: Record<string, PackFieldValue>;
}

export interface PackSourceEntry {
  sourceId: string;
  name: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  retrieved: string;
  shareAlike: boolean;
  inWebPack: boolean;
  heldReason: string | null;
}

export interface PlaceDetail {
  id: string;
  /** "UNKNOWN" when the record has no known name. */
  name: string;
  record: PackRecord;
  sources: PackSourceEntry[];
}

export interface PlacesModule {
  id: "places";
  search(query: PlacesQuery, ctx: ModuleContext): Promise<ModuleResult<PlaceHit>>;
  /** One record from the data pack, with the sources behind it. An empty result means no such record. */
  get(id: string, ctx: ModuleContext): Promise<ModuleResult<PlaceDetail>>;
}

export interface JourneyRequest {
  originLabel: string | null;
  destinationLabel: string | null;
  /** Record id the person chose from the place search. When set, it is used instead of the label. */
  originId?: string | null;
  destinationId?: string | null;
  routingPreference: RoutingPreference | null;
  offline: boolean;
}

/** One end of a planned journey: the place and the source of its recorded position. */
export interface JourneyEndpoint {
  role: "origin" | "destination";
  id: string;
  name: string;
  /** The source of the record's own latitude and longitude, as the pack records it. */
  position: { source_id: string; source_name: string; licence: string; retrieved_at: string; tier: 0 | 1 | 2 | 3 | 4 };
}

export interface JourneyPlan {
  id: string;
  summary: string;
  provenance: Provenance;
  liveStatus: "unavailable";
  /** The planner's own notes (Unknown fields, missing timetables, limits), shown as text. */
  notices?: string[];
  endpoints?: JourneyEndpoint[];
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
