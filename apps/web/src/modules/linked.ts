import { createPackSource, fieldValue, type PackSource } from "@access-main/data-client";
import { createJourneyModule } from "@access-maps/journey-data";
import { createPlacesModule } from "@access-maps/places-shell";
import type { FindersModule, HelpModule, ModuleRegistry, ModuleResult } from "@access/shared";
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

/**
 * Load finders and help only when those modules run. A static import of the
 * package entry points pulled the help article corpus, the finders React
 * pages, and Ajv onto every ModulePage visit, including place search and
 * journey plan (Day 22 first-result path).
 */
function deferredFinders(source: PackSource): FindersModule {
  let pending: Promise<FindersModule> | undefined;
  const load = () => {
    pending ??= import("@access-tools/finders/shell").then((mod) => ({
      id: "finders" as const,
      search: (query: Parameters<FindersModule["search"]>[0], ctx: Parameters<FindersModule["search"]>[1]) =>
        mod.searchFindersForShell(source, query, ctx),
    }));
    return pending;
  };
  return {
    id: "finders",
    search: async (query, ctx) => (await load()).search(query, ctx),
  };
}

function deferredHelp(): HelpModule {
  let pending: Promise<HelpModule> | undefined;
  const load = () => {
    pending ??= import("@access/help/shell").then((mod) => mod.helpShellModule);
    return pending;
  };
  return {
    id: "help",
    list: async (ctx) => (await load()).list(ctx),
  };
}

/** The six real modules over one shared data source. Every result goes through guardModules in createModules. */
export function createLinkedModules(source: PackSource): ModuleRegistry {
  const get = (id: string) => getPlaceDetail(source, id);
  const guarded = createModules({
    places: { ...createPlacesModule(source), get },
    journey: createJourneyModule(source),
    finders: deferredFinders(source),
    help: deferredHelp(),
  });
  // `get` is checked by getPlaceDetail, so it is set again here in case the guard rebuilt the places module.
  return { ...guarded, places: { ...guarded.places, get } };
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
