import { describe, expect, it } from "vitest";
import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import type { CellReport } from "../offline/robust/index.ts";
import { assessStoredRegion } from "./regionRecheck.ts";

const region: RegionStatus = {
  id: "region", label: { en: "Area", fr: "Région" },
  cells: ["a"], bytes: 20, downloaded: true, verified: true,
  missingCells: [], builtAt: "2026-11-15", count: 1,
};
const available: CellReport = {
  id: "a", lookup: { status: "available", provenance: {
    source: "Example", licence: "CC0-1.0", date: "2026-11-15",
  } },
};

describe("stored-region recheck", () => {
  it("never upgrades cached status to a byte-integrity conclusion", () => {
    expect(assessStoredRegion(region, [available])).toEqual({
      status: "unknown", reason: "no-byte-digest",
    });
  });
  it("catches missing stored cells despite a downloaded flag", () => {
    expect(assessStoredRegion(region, [{ id: "a", lookup: { status: "missing" } }])).toEqual({
      status: "corrupt", reason: "inconsistent-storage",
    });
    expect(assessStoredRegion({ ...region, missingCells: ["a"] }, [available]).status).toBe("corrupt");
  });
  it("keeps uncertain reads UNKNOWN", () => {
    expect(assessStoredRegion(region, [{ id: "a", lookup: { status: "unknown" } }]).status).toBe("unknown");
    expect(assessStoredRegion(undefined, [available]).status).toBe("unknown");
    expect(assessStoredRegion(region, undefined).status).toBe("unknown");
  });
  it("does not treat absent downloads as corrupted evidence", () => {
    expect(assessStoredRegion({ ...region, downloaded: false }, [available]).status).toBe("unknown");
  });
  it("flags a stale cell as inconsistent with downloaded status", () => {
    const stale: CellReport = { id: "a", lookup: {
      status: "stale",
      stored: { source: "Example", licence: "CC0-1.0", date: "2026-11-14" },
      expected: { source: "Example", licence: "CC0-1.0", date: "2026-11-15" },
    } };
    expect(assessStoredRegion(region, [stale]).status).toBe("corrupt");
  });
});
