import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Guard against routing re-download through the destructive confirmation. */
const source = readFileSync(new URL("../offline/RegionPackPage.tsx", import.meta.url), "utf8");

describe("offline region recovery wiring", () => {
  it("provides a typed source injection point for route tests", () => {
    expect(source).toContain("packSource?: PackSource");
    expect(source).toContain("const source = packSource");
  });

  it("mounts the recovery centre with its required local store", () => {
    expect(source).toContain("<RecoveryCenter locale={language} store={recoveryStore} />");
  });

  it("starts the checked re-download on the retry button, not deletion", () => {
    expect(source).toContain("onRedownload={() => { if (packRegion) void redownload(packRegion);");
    expect(source).not.toContain("setConfirmation(packRegion)");
  });

  it("keeps failed and unknown checks visible in the corresponding row", () => {
    expect(source).toContain("setCheckedStatuses");
    expect(source).toContain('checkedStatuses[region.id] === "unknown"');
    expect(source).toContain('checkedStatuses[region.id] === "corrupt"');
  });
});
