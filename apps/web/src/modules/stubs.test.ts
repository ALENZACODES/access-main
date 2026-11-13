import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "@access/shared";
import { modules } from "./stubs.ts";

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
        timing: { maxTimeBetweenWashroomsMin: ctx.profile?.max_time_between_washrooms_min ?? null, maxContinuousTravelMin: null },
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
    }
  });
});
