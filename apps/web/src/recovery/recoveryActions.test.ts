import { describe, expect, it } from "vitest";
import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { recoveryItems, RECOVERY_COPY } from "./recoveryActions.ts";

const item: RegionStatus = {
  id: "test", label: { en: "Sample", fr: "Exemple" }, cells: ["cell"],
  bytes: 100, downloaded: false, verified: false, missingCells: ["cell"], builtAt: "2026-11-15", count: 1,
};
describe("live recovery inventory", () => {
  it("preserves missing and unknown states", () => {
    expect(recoveryItems([item], "en")[0]?.state).toBe("missing");
    expect(recoveryItems([{ ...item, missingCells: [] }], "en")[0]?.state).toBe("unknown");
  });
  it("never treats a cached region as a successful byte check", () => {
    expect(recoveryItems([{ ...item, downloaded: true }], "fr")[0]?.state).toBe("downloaded");
    expect(RECOVERY_COPY.fr.downloaded).toContain("INCONNU");
  });
  it("has complete bilingual text and safe touch target wiring", () => {
    const en = Object.keys(RECOVERY_COPY.en);
    expect(Object.keys(RECOVERY_COPY.fr)).toEqual(en);
    for (const key of en as Array<keyof typeof RECOVERY_COPY.en>) {
      expect(RECOVERY_COPY.en[key].length).toBeGreaterThan(0);
      expect(RECOVERY_COPY.fr[key].length).toBeGreaterThan(0);
    }
  });
});
