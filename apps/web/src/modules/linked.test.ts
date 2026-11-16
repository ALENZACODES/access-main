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
      const record = data as Record<string, unknown>;
      if (data && typeof data === "object" && !Array.isArray(data) && typeof record.id === "string" && typeof record.tranche === "string" && record.fields) {
        found.push(data);
      } else {
        const list = Array.isArray(data) ? data : [record?.records, record?.venues].find(Array.isArray);
        if (Array.isArray(list)) found.push(...list);
      }
    }
  }
  return found as PackRecord[];
}

function hasKnownName(record: PackRecord): boolean {
  const name = record.fields?.name;
  return (record.tranche === "venue" || record.tranche === "transit") && !!name && typeof name.value === "string" && name.value !== "UNKNOWN" && name.value.trim() !== "" && (name.tier === 0 || name.tier === 1);
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

const lanesReady = existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.lanes/access-maps/packages/places-shell/src/index.ts"));

describe.skipIf(!lanesReady)("linked registry over two real ODbL records", () => {
  it("found two real records in the schema fixtures", () => {
    expect(records).toHaveLength(2);
    expect(sources.length).toBeGreaterThan(0);
  });

  const registry = () => createLinkedModules(createFixtureSource(records, sources));

  it("places: ready, with provenance", async () => {
    const result = await registry().places.search({ text: firstName }, ctx);
    expect(result.availability).toBe("ready");
    expect(result.items.length).toBeGreaterThan(0);
    expectProvenance(result);
  });

  it("finders: ready, with provenance on any item", async () => {
    const result = await registry().finders.search({ kind: "washroom", text: "" }, ctx);
    expect(result.availability).toBe("ready");
    expectProvenance(result);
  });

  it("journey: ready, with provenance on any item", async () => {
    const result = await registry().journey.plan({ originLabel: null, destinationLabel: null, routingPreference: null, offline: false }, ctx);
    expect(result.availability).toBe("ready");
    expectProvenance(result);
  });

  it("navigator, games and help: ready", async () => {
    const modules = registry();
    const noQuery = { ...ctx, query: undefined };
    expect((await modules.navigator.list(noQuery)).availability).toBe("ready");
    expect((await modules.games.list(noQuery)).availability).toBe("ready");
    const help = await modules.help.list(noQuery);
    expect(help.availability).toBe("ready");
    expectProvenance(help);
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
