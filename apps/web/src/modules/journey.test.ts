import { createFixtureSource } from "@access-main/data-client";
import { guardModules, type ModuleContext, type PackFieldValue } from "@access/shared";
import { describe, expect, it } from "vitest";
import { createJourneyModule } from "./lane-adapters.ts";
import { createLinkedModules } from "./linked.ts";
import { foldName, recordPosition, resolvePoint, resolveRecord, type ResolveSource } from "./journey-resolve.ts";
import { LANE_STRINGS } from "./strings.ts";
import type { PackRecord, PackSourceEntry } from "./types.ts";

/**
 * Labelled fixture pack: every record and source below is test data, not a
 * real place or a real accessibility fact. The coordinates only give the
 * planner something to measure.
 */
const SOURCE_ID = "fixture-test";
const sources: PackSourceEntry[] = [{
  sourceId: SOURCE_ID, name: "Fixture source (test data)", licence: "ODbL-1.0", licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  attribution: "© OpenStreetMap contributors", retrieved: "2026-11-01", shareAlike: true, inWebPack: true, heldReason: null,
}];

function field(value: PackFieldValue["value"], tier: PackFieldValue["tier"] = 1): PackFieldValue {
  return { value, source_id: SOURCE_ID, licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier };
}

function venue(id: string, name: string, lat?: PackFieldValue | number, lon?: PackFieldValue | number): PackRecord {
  const fields: Record<string, PackFieldValue> = { name: field(name) };
  if (lat !== undefined) fields.lat = typeof lat === "number" ? field(lat) : lat;
  if (lon !== undefined) fields.lon = typeof lon === "number" ? field(lon) : lon;
  return { id, tranche: "venue", region: "fixture", fields };
}

function path(id: string, line: Array<[number, number]>, extra: Record<string, string> = { highway: "footway", surface: "asphalt", kerb: "flush" }): PackRecord {
  const fields: Record<string, PackFieldValue> = { geometry: field(line) };
  for (const [key, value] of Object.entries(extra)) fields[key] = field(value);
  return { id, tranche: "path", region: "fixture", fields };
}

const A = { lat: 43.65, lon: -79.38 };
const B = { lat: 43.651, lon: -79.38 };
const baseRecords: PackRecord[] = [
  venue("fixture:a", "Fixture place A", A.lat, A.lon),
  venue("fixture:b", "Fixture place B", B.lat, B.lon),
  venue("fixture:twin-1", "Fixture twin", A.lat, A.lon),
  venue("fixture:twin-2", "Fixture twin", B.lat, B.lon),
  venue("fixture:nopos", "Fixture no position"),
  venue("fixture:unknownpos", "Fixture unknown position", field("UNKNOWN"), field("UNKNOWN")),
  venue("fixture:unsourced", "Fixture unsourced position", { ...field(A.lat), source_id: "" }, A.lon),
  venue("fixture:far", "Fixture far place", 43.7, -79.38),
  venue("fixture:outside", "Fixture outside place", 45.5, -75.7),
  venue("fixture:island", "Fixture island place", 43.6505, -79.37),
  path("fixture:path-1", [[A.lon, A.lat], [-79.38, 43.6505], [B.lon, B.lat]]),
];

const ctx = (locale: "en" | "fr" = "en"): ModuleContext => ({ locale, offline: false, profile: null, nowIso: "2026-11-16T12:00:00Z" });

/** The data-client fixture source, with a region box and a path cell in its manifest. */
function pack(records = baseRecords, options: { pathCells?: boolean; downloaded?: boolean } = {}) {
  const source = createFixtureSource(records, sources);
  return {
    ...source,
    manifest: async () => ({
      ...(await source.manifest() as Record<string, unknown>),
      regions: [{ id: "fixture", label: { en: "Fixture", fr: "Exemple" }, bbox: [-80, 43.5, -79, 44], cells: ["fixture"] }],
      tranches: options.pathCells === false ? {} : { path: { cells: { fixture: { bbox: [-80, 43.5, -79, 44], parts: [{ path: "paths/fixture.ndjson.gz", bytes: 1, sha256: "0", count: 1, sourceId: SOURCE_ID }] } } } },
    }),
    regions: async () => [{ id: "fixture", label: { en: "Fixture", fr: "Exemple" }, cells: ["fixture"], bytes: 0, downloaded: options.downloaded ?? true, verified: true, missingCells: [], builtAt: "2026-11-01T00:00:00Z", count: records.length }],
  };
}

const request = (origin: string | null, destination: string | null, ids: { originId?: string; destinationId?: string } = {}, offline = false) =>
  ({ originLabel: origin, destinationLabel: destination, routingPreference: null, offline, ...ids });

describe("resolvePoint and resolveRecord", () => {
  const source = pack() as unknown as ResolveSource;

  it("folds names the way the pack search index does", () => {
    expect(foldName("  Café-Place  A ")).toBe("cafe place a");
  });

  it("takes the record's own sourced lat and lon on an exact name match", async () => {
    const place = await resolvePoint(source, "fixture place a");
    expect(place).toMatchObject({ status: "resolved", id: "fixture:a", name: "Fixture place A", point: { lat: A.lat, lon: A.lon } });
  });

  it("never uses the search hit's coordinate", async () => {
    // A search index that sets a missing coordinate to 0, as the shell's does.
    const zeroed: ResolveSource = {
      search: async () => [{ id: "fixture:nopos", name: "Fixture no position", nameNorm: "fixture no position", lat: 0, lon: 0 } as { id: string; name: string; nameNorm: string }],
      get: source.get,
    };
    expect(await resolvePoint(zeroed, "Fixture no position")).toEqual({ status: "no-position", id: "fixture:nopos", name: "Fixture no position" });
  });

  it("reports none, and several records with one name for the person to choose", async () => {
    expect(await resolvePoint(source, "Fixture place")).toEqual({ status: "not-found" });
    expect(await resolvePoint(source, "   ")).toEqual({ status: "not-found" });
    const twins = await resolvePoint(source, "Fixture twin");
    expect(twins.status).toBe("ambiguous");
    expect(twins.status === "ambiguous" ? twins.options.map((option) => option.id).sort() : []).toEqual(["fixture:twin-1", "fixture:twin-2"]);
  });

  it("has no position without lat, with Unknown lat, or with a lat that has no source", async () => {
    expect((await resolvePoint(source, "Fixture no position")).status).toBe("no-position");
    expect((await resolvePoint(source, "Fixture unknown position")).status).toBe("no-position");
    expect((await resolvePoint(source, "Fixture unsourced position")).status).toBe("no-position");
    expect(recordPosition(venue("x", "x", field(91), field(0)))).toBeNull();
    expect(recordPosition(venue("x", "x", { ...field(A.lat), tier: 7 as unknown as 1 }, A.lon))).toBeNull();
  });

  it("resolves a chosen id even when the name is shared", async () => {
    expect(await resolveRecord(source, "fixture:twin-2", "Fixture twin")).toMatchObject({ status: "resolved", id: "fixture:twin-2", point: { lat: B.lat } });
    expect(await resolveRecord(source, "fixture:missing", "x")).toEqual({ status: "not-found" });
  });
});

describe("journey adapter over the labelled fixture pack", () => {
  it("is unavailable when the pack cannot be read", async () => {
    const module = createJourneyModule({ ...pack(), manifest: async () => { throw new Error("manifest response"); } });
    expect(await module.plan(request("Fixture place A", "Fixture place B"), ctx())).toMatchObject({ availability: "stub", items: [], messageKey: "modules.unavailable" });
  });

  it("waits for two places", async () => {
    const module = createJourneyModule(pack());
    expect(await module.plan(request(null, null), ctx())).toMatchObject({ availability: "ready", items: [], messageKey: "journey.awaiting" });
    expect(await module.plan(request("Fixture place A", " "), ctx())).toMatchObject({ availability: "ready", items: [], messageKey: "journey.needBoth" });
  });

  it("names not-found, ambiguous and no-position places without planning", async () => {
    const module = createJourneyModule(pack());
    expect((await module.plan(request("Nowhere fixture", "Fixture place B"), ctx())).messageKey).toBe("journey.notFound");
    expect((await module.plan(request("Fixture twin", "Fixture place B"), ctx())).messageKey).toBe("journey.ambiguous");
    const none = await module.plan(request("Fixture place A", "Fixture no position"), ctx());
    expect(none).toMatchObject({ availability: "ready", items: [], messageKey: "journey.noCoordinates" });
  });

  it("is not offered where no region or no path data covers the area", async () => {
    expect((await createJourneyModule(pack()).plan(request("Fixture place A", "Fixture outside place"), ctx())).messageKey).toBe("journey.noArea");
    expect((await createJourneyModule(pack(baseRecords, { pathCells: false })).plan(request("Fixture place A", "Fixture place B"), ctx())).messageKey).toBe("journey.noArea");
    // Offline with the region not downloaded: the planner reports the region missing.
    expect((await createJourneyModule(pack(baseRecords, { downloaded: false })).plan(request("Fixture place A", "Fixture place B", {}, true), ctx())).messageKey).toBe("journey.noArea");
  });

  it.each(["en", "fr"] as const)("maps a planned rolling route with its weakest evidence and the planner's notes (%s)", async (locale) => {
    const result = await createJourneyModule(pack()).plan(request("Fixture place A", "Fixture place B"), ctx(locale));
    expect(result).toMatchObject({ availability: "ready", messageKey: "journey.planned", asOf: "2026-11-01T00:00:00Z", liveStatus: "unavailable" });
    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    const copy = LANE_STRINGS[locale].journey;
    expect(item.summary).toContain(copy.stepFree);
    expect(item.summary).toMatch(locale === "en" ? /^Rolling route: 111 m\./ : /^Parcours en fauteuil\u00a0: 111\u00a0m\./);
    expect(item.provenance).toMatchObject({ source_name: "Fixture source (test data)", licence: "ODbL-1.0", tier: 1, prototype_label: "PROTOTYPE-UNVERIFIED", source_date: "2026-11-01" });
    expect(item.endpoints?.map((end) => [end.role, end.id, end.position.source_name, end.position.tier])).toEqual([
      ["origin", "fixture:a", "Fixture source (test data)", 1],
      ["destination", "fixture:b", "Fixture source (test data)", 1],
    ]);
    // No timetable source is pinned: the planner says so instead of inventing times.
    expect(item.notices?.some((notice) => /timetable|horaires/i.test(notice) || /stops|arrêt/i.test(notice))).toBe(true);
  });

  it("keeps Unknown fields Unknown and does not confirm step-free access", async () => {
    const records = [...baseRecords.filter((record) => record.tranche !== "path"), path("fixture:path-2", [[A.lon, A.lat], [B.lon, B.lat]], { highway: "footway", kerb: "flush" })];
    const result = await createJourneyModule(pack(records)).plan(request("Fixture place A", "Fixture place B"), ctx());
    const item = result.items[0]!;
    expect(item.summary).toContain(LANE_STRINGS.en.journey.unknownAccess);
    expect(item.summary).not.toContain(LANE_STRINGS.en.journey.stepFree);
    expect(item.notices).toContain("1 segments with unknown surface");
    expect(item.notices).toContain("An unknown field is not a confirmation of access");
  });

  it("reports no route and too far instead of drawing a line", async () => {
    expect((await createJourneyModule(pack()).plan(request("Fixture place A", "Fixture island place"), ctx())).messageKey).toBe("journey.noRoute");
    expect((await createJourneyModule(pack()).plan(request("Fixture place A", "Fixture far place"), ctx())).messageKey).toBe("journey.tooFar");
  });

  it("uses the chosen record ids over the typed labels", async () => {
    const result = await createJourneyModule(pack()).plan(request("Fixture twin", "Fixture twin", { originId: "fixture:twin-1", destinationId: "fixture:twin-2" }), ctx());
    expect(result.messageKey).toBe("journey.planned");
    expect(result.items[0]?.endpoints?.map((end) => end.id)).toEqual(["fixture:twin-1", "fixture:twin-2"]);
  });

  it("passes the shell's contract check through the linked registry", async () => {
    const modules = createLinkedModules(pack());
    const result = await modules.journey.plan(request("Fixture place A", "Fixture place B"), ctx());
    expect(result).toMatchObject({ availability: "ready", messageKey: "journey.planned" });
    const guarded = await guardModules(modules).journey.plan(request("Fixture place A", "Fixture no position"), ctx("fr"));
    expect(guarded).toMatchObject({ availability: "ready", items: [], messageKey: "journey.noCoordinates" });
  });
});
