import { describe, expect, it } from "vitest";
import { createEmptyProfile, emptyModuleResult, type PlacesModule } from "@access/shared";
import { createModules, modules } from "./stubs.ts";

const ctx = {
  locale: "en" as const,
  offline: true,
  profile: createEmptyProfile("2026-11-13T12:00:00.000Z", "en"),
  nowIso: "2026-11-13T12:00:00.000Z",
};

describe("module stubs", () => {
  it("does not invent a place, a route, a washroom, a benefit, a game, or a help article", async () => {
    const places = await modules.places.search({ text: "Toronto City Hall" }, ctx);
    const journey = await modules.journey.plan(
      {
        originLabel: "home",
        destinationLabel: "clinic",
        routingPreference: null,
        offline: true,
      },
      ctx,
    );
    const finders = await modules.finders.search({ kind: "washroom", text: "downtown" }, ctx);
    const directory = await modules.navigator.list(ctx);
    const games = await modules.games.list(ctx);
    const help = await modules.help.list(ctx);
    for (const result of [places, journey, finders, directory, games, help]) {
      expect(result.items).toEqual([]);
      expect(result.availability).toBe("stub");
      expect(result.liveStatus).toBe("unavailable");
      expect(result.messageKey).toBe("modules.unavailable");
    }
  });

  it("uses a linked places module and leaves the other routes empty", async () => {
    const places: PlacesModule = {
      id: "places",
      search: () =>
        Promise.resolve({
          ...emptyModuleResult("places", "modules.resultCount"),
          availability: "ready",
          items: [{ id: "linked", name: "Linked record", provenance: {
            source_name: "test",
            source_url: null,
            licence: "UNKNOWN",
            licence_url: null,
            source_date: "2026-11-01",
            retrieved_at: "2026-11-13T12:00:00.000Z",
            tier: 0,
            prototype_label: "SEEDED-OPEN-DATA",
            freshness: "unknown",
          } }],
        }),
    };
    const linked = createModules({ places });
    const found = await linked.places.search({ text: "Linked record" }, ctx);
    expect(found.availability).toBe("ready");
    expect(found.items).toHaveLength(1);
    const directory = await linked.navigator.list(ctx);
    expect(directory.items).toEqual([]);
  });
});
