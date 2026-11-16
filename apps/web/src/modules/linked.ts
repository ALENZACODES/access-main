import { createPackSource, fieldValue, type PackSource } from "@access-main/data-client";
import { createPlacesModule } from "@access-maps/places-shell";
import { createFindersModule } from "@access-tools/finders";
import { helpShellModule } from "@access/help";
import { emptyModuleResult, type FindersModule, type ModuleRegistry, type ModuleResult, type PlacesModule } from "@access/shared";
import { createJourneyModule } from "./lane-adapters.ts";
import { createModules } from "./stubs.ts";
import type { PackRecord, PlaceDetail } from "./types.ts";

const UNKNOWN = "UNKNOWN";

function latestRetrieved(record: PackRecord): string | null {
  const dates = Object.values(record.fields)
    .flatMap((field) => (field?.retrieved_at ? [field.retrieved_at] : []))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.at(-1) ?? null;
}

function placeResult(availability: "ready" | "error", items: PlaceDetail[], messageKey: string, asOf: string | null): ModuleResult<PlaceDetail> {
  return { moduleId: "places", availability, items, messageKey, asOf, liveStatus: "unavailable" };
}

/**
 * `places.get` for the shell. It reads one record from the data pack and the
 * sources behind it. A record with a fact that has no source, licence, date or
 * tier is not shown. An unknown name stays "UNKNOWN".
 */
export async function getPlaceDetail(source: PackSource, id: string): Promise<ModuleResult<PlaceDetail>> {
  try {
    const record = await source.get(id);
    if (!record) return placeResult("ready", [], "placeDetail.notFound", null);
    const unsourced = Object.values(record.fields).some(
      (field) => !field || !field.source_id || !field.licence || !field.retrieved_at || field.tier === undefined || field.tier === null,
    );
    if (unsourced) return placeResult("error", [], "placeDetail.unavailable", null);
    const nameField = fieldValue(record, "name");
    const name = typeof nameField?.value === "string" && nameField.value.trim() ? nameField.value : UNKNOWN;
    const detail: PlaceDetail = { id: record.id, name, record, sources: source.sourcesFor(record) };
    return placeResult("ready", [detail], "placeDetail.found", latestRetrieved(record));
  } catch {
    return placeResult("error", [], "placeDetail.unavailable", null);
  }
}

/** The places package is only ready when the data pack can be read. A missing or broken pack stays unavailable, with no invented records. */
async function packIsAvailable(source: PackSource): Promise<boolean> {
  try {
    await source.manifest();
    return true;
  } catch {
    return false;
  }
}

function placesWithPack(source: PackSource, places: PlacesModule): PlacesModule {
  return {
    ...places,
    search: async (query, ctx) => (await packIsAvailable(source) ? places.search(query, ctx) : emptyModuleResult("places", "modules.unavailable")),
    get: async (id, ctx) => (await packIsAvailable(source) ? places.get(id, ctx) : emptyModuleResult("places", "modules.unavailable")),
  };
}

function findersWithPack(source: PackSource, finders: FindersModule): FindersModule {
  return {
    ...finders,
    search: async (query, ctx) => (await packIsAvailable(source) ? finders.search(query, ctx) : emptyModuleResult("finders", "modules.unavailable")),
  };
}

/** The six real modules over one shared data source. Every result goes through guardModules in createModules. */
export function createLinkedModules(source: PackSource): ModuleRegistry {
  const get = (id: string) => getPlaceDetail(source, id);
  const places = placesWithPack(source, { ...createPlacesModule(source), get });
  const guarded = createModules({
    places,
    journey: createJourneyModule(source),
    finders: findersWithPack(source, createFindersModule(source)),
    help: helpShellModule,
  });
  // `get` is checked by getPlaceDetail, so it is set again here in case the guard rebuilt the places module.
  return { ...guarded, places: { ...guarded.places, get: places.get } };
}

let sharedSource: PackSource | null = null;
let sharedModules: ModuleRegistry | null = null;

/** One data source for the whole app, reading from `${BASE_URL}data/`. Created on first use. */
export function getPackSource(): PackSource {
  sharedSource ??= createPackSource({ baseUrl: `${import.meta.env.BASE_URL}data/` });
  return sharedSource;
}

export function getModules(): ModuleRegistry {
  sharedModules ??= createLinkedModules(getPackSource());
  return sharedModules;
}
