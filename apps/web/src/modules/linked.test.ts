/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureSource } from "@access-main/data-client";
import type { ModuleContext, ModuleResult } from "@access/shared";
import { describe, expect, it } from "vitest";
import { createLinkedModules, getPlaceDetail } from "./linked.ts";
import type { PackRecord, PackSourceEntry } from "./types.ts";

/**
 * Two real records read from packages/schema/fixtures/import/real/. They are
 * read at run time, not copied, so no place fact is written in this file.
 * Their sources carry the ODbL attribution the data requires.
 */
const REAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/schema/fixtures/import/real");

function readRecords(dir: string): PackRecord[] {
  const found: unknown[] = [];
  for (const file of readdirSync(dir).sort()) {
    const text = readFileSync(path.join(dir, file), "utf8");
    if (file.endsWith(".ndjson")) {
      for (const line of text.split("\n")) if (line.trim()) found.push(JSON.parse(line));
    } else if (file.endsWith(".json")) {
      const data = JSON.parse(text) as unknown;
      if (Array.isArray(data)) found.push(...data);
      else if (data && typeof data === "object") {
        const record = data as Record<string, unknown>;
        const list = [record.records, record.venues].find(Array.isArray);
        if (Array.isArray(list)) found.push(...list);
        else if (typeof record.id === "string" && typeof record.tranche === "string" && record.fields && typeof record.fields === "object") {
          found.push(record);
        }
      }
    }
  }
  return found as PackRecord[];
}

function hasKnownName(record: PackRecord): boolean {
  const name = record.fields?.name;
  return !!name && typeof name.value === "string" && name.value !== "UNKNOWN" && name.value.trim() !== "" && (name.tier === 0 || name.tier === 1);
}

function sourceFor(record: PackRecord): PackSourceEntry {
  const field = record.fields.name;
  if (!field) throw new Error(`record ${record.id} has no name field`);
  const osm = /osm|openstreetmap/i.test(field.source_id);
  return {
    sourceId: field.source_id,
    name: field.source_id,
    licence: field.licence,
    licenceUrl: /^ODbL/i.test(field.licence) ? "https://opendatacommons.org/licenses/odbl/1-0/" : "",
    attribution: osm ? "© OpenStreetMap contributors, ODbL" : `${field.source_id}, ${field.licence}`,
    retrieved: field.retrieved_at,
    shareAlike: /^ODbL/i.test(field.licence),
    inWebPack: true,
    heldReason: null,
  };
}

const real = existsSync(REAL_DIR) ? readRecords(REAL_DIR).filter(hasKnownName) : [];
const records = real.slice(0, 2);
const sources = [...new Map(records.flatMap((record) => {
  const field = record.fields.name;
  return field ? [[field.source_id, sourceFor(record)] as const] : [];
})).values()];
const firstName = String(records[0]?.fields.name?.value ?? "");

const ctx: ModuleContext = { locale: "en", offline: false, profile: null, nowIso: "2026-11-15T12:00:00.000Z", query: firstName };

function expectProvenance(result: ModuleResult<unknown>) {
  for (const item of result.items as Array<{ provenance?: Record<string, unknown> }>) {
    expect(item.provenance, "every item carries provenance").toBeDefined();
    expect(item.provenance).toMatchObject({ source_name: expect.any(String), licence: expect.any(String), source_date: expect.any(String) });
    expect(item.provenance?.tier).not.toBeUndefined();
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const mapsReady = existsSync(path.resolve(here, "../../../../.lanes/access-maps/packages/places-shell/src/index.ts"));
const toolsReady = existsSync(path.resolve(here, "../../../../.lanes/access-tools/packages/finders/src/index.ts"));
const helpReady = existsSync(path.resolve(here, "../../../../.lanes/access-help/packages/help/src/index.ts"));
const registry = () => createLinkedModules(createFixtureSource(records, sources));

describe("linked registry fixtures", () => {
  it("found two real records in the schema fixtures", () => {
    expect(records).toHaveLength(2);
    expect(sources.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!mapsReady)("linked registry over two real ODbL records (maps)", () => {
  it("places: ready, with provenance", async () => {
    const result = await registry().places.search({ text: firstName }, ctx);
    expect(result.availability).toBe("ready");
    expect(result.items.length).toBeGreaterThan(0);
    expectProvenance(result);
  });

  it("journey: unavailable until origin and destination coordinates are wired, with no invented trip", async () => {
    const result = await registry().journey.plan({ originLabel: null, destinationLabel: null, routingPreference: null, offline: false }, ctx);
    expect(result).toMatchObject({ availability: "stub", items: [], messageKey: "modules.unavailable" });
  });

  it("places stays unavailable when the pack cannot be read", async () => {
    const source = createFixtureSource(records, sources);
    const modules = createLinkedModules({
      ...source,
      manifest: async () => {
        throw new Error("manifest response");
      },
    });
    const search = await modules.places.search({ text: firstName }, ctx);
    expect(search).toMatchObject({ availability: "stub", items: [], messageKey: "modules.unavailable" });
    const detail = await modules.places.get(records[0]!.id, ctx);
    expect(detail).toMatchObject({ availability: "stub", items: [], messageKey: "modules.unavailable" });
  });

  it("places.get returns the record with its sources, and nothing for an unknown id", async () => {
    const modules = registry();
    const first = records[0];
    expect(first).toBeDefined();
    const found = await modules.places.get(first!.id, ctx);
    expect(found.availability).toBe("ready");
    expect(found.items).toHaveLength(1);
    expect(found.items[0]?.record.id).toBe(first!.id);
    expect(found.items[0]?.sources.length).toBeGreaterThan(0);
    expect(found.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const missing = await modules.places.get("no-such-record", ctx);
    expect(missing).toMatchObject({ availability: "ready", items: [], messageKey: "placeDetail.notFound" });
  });

  it("places.get shows nothing for a record whose fact has no licence", async () => {
    const first = records[0];
    expect(first).toBeDefined();
    const broken = structuredClone(first) as PackRecord;
    const name = broken.fields.name;
    expect(name).toBeDefined();
    name!.licence = "";
    const result = await getPlaceDetail(createFixtureSource([broken], sources), broken.id);
    expect(result).toMatchObject({ availability: "error", items: [] });
  });
});

describe.skipIf(!toolsReady)("linked registry over two real ODbL records (tools)", () => {
  it("finders: ready, with provenance on any item", async () => {
    const result = await registry().finders.search({ kind: "washroom", text: "" }, ctx);
    expect(result.availability).toBe("ready");
    expectProvenance(result);
  });

});

describe.skipIf(!toolsReady)("linked registry: games and navigator (tools)", () => {
  const noQuery = { ...ctx, query: undefined };

  it("games: the nineteen games of the pinned package, none with a clinical claim or a flash", async () => {
    const games = await registry().games.list(noQuery);
    expect(games).toMatchObject({ moduleId: "games", availability: "ready", liveStatus: "unavailable", asOf: null });
    expect(games.items).toHaveLength(19);
    expect(new Set(games.items.map((item) => item.id)).size).toBe(19);
    for (const item of games.items) {
      expect(item.title.trim()).not.toBe("");
      expect(item).toMatchObject({ clinicalClaim: false, seizureRiskFlash: false, keyboardOperable: true });
    }
  });

  it("navigator: every directory record carries its source, licence note, read date and tier, and gives no eligibility answer", async () => {
    const nav = await registry().navigator.list(noQuery);
    expect(nav).toMatchObject({ moduleId: "navigator", availability: "ready", liveStatus: "unavailable" });
    expect(nav.asOf).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(nav.items.length).toBeGreaterThan(0);
    for (const item of nav.items as unknown as Array<Record<string, unknown>>) {
      expect(String(item.sourceName ?? "").trim(), String(item.id)).not.toBe("");
      expect(String(item.licenceNote ?? "").trim(), String(item.id)).not.toBe("");
      expect(String(item.retrievedOn ?? ""), String(item.id)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.verificationTier, String(item.id)).toBe("administrator_page");
      expect(item.notEligibilityAdvice, String(item.id)).toBe(true);
    }
  });

  it("navigator: a search that matches nothing returns an empty list, not an invented record", async () => {
    const nav = await registry().navigator.list({ ...ctx, query: "zzzz-no-such-programme-zzzz" });
    expect(nav).toMatchObject({ availability: "ready", items: [] });
  });
});

describe.skipIf(!helpReady)("linked registry over two real ODbL records (help)", () => {
  it("help: ready, with provenance on any item", async () => {
    const help = await registry().help.list({ ...ctx, query: undefined });
    expect(help.availability).toBe("ready");
    expectProvenance(help);
  });
});
