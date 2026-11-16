import { describe, expect, it } from "vitest";
import type { ModuleResult } from "@access/shared";
import { statusKey } from "./ResultItems.tsx";

function result(
  availability: ModuleResult<unknown>["availability"],
  items: unknown[],
  messageKey = "modules.ready",
): ModuleResult<unknown> {
  return { moduleId: "places", availability, items, messageKey, asOf: null, liveStatus: "unavailable" };
}

describe("statusKey", () => {
  it("uses the linked-records sentence only when a ready list is not empty", () => {
    expect(statusKey(result("ready", [{ id: "one" }]))).toBe("modules.ready");
    expect(statusKey(result("ready", []))).toBe("modules.empty");
    expect(statusKey(result("ready", [], "placeDetail.notFound"))).toBe("modules.empty");
  });

  it("uses no-matches for a ready finder search with zero hits", () => {
    expect(statusKey(result("ready", [], "finder.shell.noMatches"))).toBe("modules.noMatches");
    expect(
      statusKey({
        moduleId: "finders",
        availability: "ready",
        items: [{ id: "one" }],
        messageKey: "finder.shell.noMatches",
        asOf: null,
        liveStatus: "unavailable",
      }),
    ).toBe("modules.ready");
  });

  it("keeps unavailable and error states", () => {
    expect(statusKey(result("stub", []))).toBe("modules.unavailable");
    expect(statusKey(result("error", [], "modules.contractError"))).toBe("modules.contractError");
    expect(statusKey(result("error", []))).toBe("modules.error");
  });
});
