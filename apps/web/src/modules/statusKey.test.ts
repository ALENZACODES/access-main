import { describe, expect, it } from "vitest";
import type { ModuleResult } from "@access/shared";
import { statusKey } from "./ResultItems.tsx";

function result(availability: ModuleResult<unknown>["availability"], items: unknown[]): ModuleResult<unknown> {
  return { moduleId: "places", availability, items, messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" };
}

describe("statusKey", () => {
  it("uses the linked-records sentence only when the list is not empty", () => {
    expect(statusKey(result("ready", [{ id: "one" }]))).toBe("modules.ready");
    expect(statusKey(result("ready", []))).toBe("modules.empty");
  });

  it("keeps unavailable and error states", () => {
    expect(statusKey(result("stub", []))).toBe("modules.unavailable");
    expect(statusKey({ ...result("error", []), messageKey: "modules.contractError" })).toBe("modules.contractError");
    expect(statusKey(result("error", []))).toBe("modules.error");
  });
});
