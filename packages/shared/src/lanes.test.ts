import { describe, expect, it } from "vitest";
import { LANE_BINDINGS, laneBindingList } from "./lanes.ts";
import { MODULE_IDS } from "./modules.ts";

describe("lane bindings", () => {
  it("assigns every shell module to one route and one package", () => {
    expect(laneBindingList().map((binding) => binding.id)).toEqual([...MODULE_IDS]);
    const routes = new Set(laneBindingList().map((binding) => binding.route));
    expect(routes.size).toBe(MODULE_IDS.length);
    const repos = new Set(laneBindingList().map((binding) => binding.repository));
    expect(repos).toEqual(new Set(["ALENZACODES/access-maps", "ALENZACODES/access-tools", "ALENZACODES/access-help"]));
    for (const binding of laneBindingList()) {
      expect(binding.route).toBe(`/${binding.id}`);
      expect(binding.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(binding.packageName.length).toBeGreaterThan(0);
      expect(LANE_BINDINGS[binding.id]).toBe(binding);
    }
  });
});
