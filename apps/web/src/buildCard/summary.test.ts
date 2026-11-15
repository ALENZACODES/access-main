import { describe, expect, it } from "vitest";
import type { CacheEntry, ModuleRegistry } from "@access/shared";
import { createModules } from "../modules/stubs.ts";
import { moduleStates, offlineReadiness, summarizeEntries } from "./summary.ts";

function entry(id: string, overrides: Partial<CacheEntry["provenance"]> = {}, kind: CacheEntry["kind"] = "place"): CacheEntry {
  return {
    id,
    kind,
    title: id,
    stored_at: "2026-11-14T12:00:00Z",
    contains_live_status: false,
    payload: {},
    provenance: {
      source_name: "Source A",
      source_url: null,
      licence: "ODbL-1.0",
      licence_url: null,
      source_date: "2026-11-13",
      retrieved_at: "2026-11-14T12:00:00Z",
      tier: 0,
      prototype_label: "SEEDED-OPEN-DATA",
      freshness: "unknown",
      ...overrides,
    },
  };
}

describe("build card summary", () => {
  it("reports zero honestly for an empty device", () => {
    expect(summarizeEntries([])).toEqual({ total: 0, byKind: [], byTier: [], sources: [], verifiedClaims: 0, undated: 0 });
  });

  it("groups by kind, tier with label, and source, licence, and date", () => {
    const summary = summarizeEntries([
      entry("a"),
      entry("b"),
      entry("c", { source_name: "Source B", licence: "OGL-Toronto-1.0", tier: 1, prototype_label: null }, "finder"),
      entry("d", { source_date: "2026-11-01T09:00:00Z" }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byKind).toEqual([
      { kind: "finder", count: 1 },
      { kind: "place", count: 3 },
    ]);
    expect(summary.byTier).toEqual([
      { tier: "0 · SEEDED-OPEN-DATA", count: 3 },
      { tier: "1", count: 1 },
    ]);
    expect(summary.sources).toEqual([
      { source_name: "Source A", licence: "ODbL-1.0", source_date: "2026-11-01", records: 1 },
      { source_name: "Source A", licence: "ODbL-1.0", source_date: "2026-11-13", records: 2 },
      { source_name: "Source B", licence: "OGL-Toronto-1.0", source_date: "2026-11-13", records: 1 },
    ]);
  });

  it("counts verified claims and undated records instead of hiding them", () => {
    const summary = summarizeEntries([entry("v", { prototype_label: "VERIFIED" }), entry("t3", { tier: 3, prototype_label: null }), entry("u", { source_date: "" })]);
    expect(summary.verifiedClaims).toBe(2);
    expect(summary.undated).toBe(1);
    expect(summary.sources.find((line) => line.source_date === "")?.records).toBe(1);
  });
});

describe("module states", () => {
  it("reports every stub as not connected", async () => {
    const states = await moduleStates(createModules(), "en", "2026-11-14T12:00:00Z");
    expect(Object.values(states)).toEqual(Array(6).fill("not connected"));
  });

  it("reports a ready module as connected and a throwing one as an error", async () => {
    const registry: ModuleRegistry = createModules({
      games: {
        id: "games",
        list: () => Promise.resolve({ moduleId: "games", availability: "ready", items: [], messageKey: "", asOf: null, liveStatus: "unavailable" }),
      },
      journey: { id: "journey", plan: () => Promise.reject(new Error("offline")) },
    });
    const states = await moduleStates(registry, "fr", "2026-11-14T12:00:00Z");
    expect(states.games).toBe("connected");
    expect(states.journey).toBe("error");
    expect(states.places).toBe("not connected");
  });
});

describe("offline readiness", () => {
  it("is ready only when a service worker controls the page", () => {
    expect(offlineReadiness("active")).toBe("ready");
    expect(offlineReadiness("inactive")).toBe("not ready");
    expect(offlineReadiness("unsupported")).toBe("not ready");
    expect(offlineReadiness("unknown")).toBe("unknown");
  });
});
