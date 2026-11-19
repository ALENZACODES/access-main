// CI audit: every browser storage key the App's source uses has a row in storageRegister.ts.
// A new key without a row fails here, so saving something new is always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVACY_STORAGE_PREFIX } from "../panel/live";
import { loadFiles } from "./repoFiles";
import { STORAGE_REGISTER, UNSCANNED } from "../panel/storageRegister";
import { checkReach, checkRegister, compareToRegister, formatComparison, panelCoverage, scanStorageKeys } from "./storageKeys";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("storage keys in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanStorageKeys(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((x) => x.path)).toContain("apps/web/src/i18n/index.ts");
    expect(found.map((x) => x.key)).toContain("access.language");
    expect(found.map((x) => x.key)).toContain(PRIVACY_STORAGE_PREFIX + "routeReports.v1");
  });

  it("matches the register in both directions", () => {
    const c = compareToRegister(found, STORAGE_REGISTER);
    expect(c, `\n${formatComparison(c)}\n`).toEqual({ unregistered: [], stale: [], moved: [] });
  });

  it("has a well-formed register", () => {
    expect(checkRegister(STORAGE_REGISTER)).toEqual([]);
  });

  it("lists the storage it cannot scan with the key marked UNKNOWN", () => {
    expect(UNSCANNED.length).toBeGreaterThan(0);
    for (const u of UNSCANNED) expect(u.key).toBe("UNKNOWN");
  });

  it("only marks a key as gated when the live gate has a rule for it", async () => {
    const { LIVE_RULES } = await import("../panel/live");
    const ruled = new Set(LIVE_RULES.map((r) => r.key));
    for (const r of STORAGE_REGISTER) expect(r.gated, r.key).toBe(ruled.has(r.key));
  });

  it("never marks a key under the panel prefix as outside the panel", () => {
    expect(checkReach(STORAGE_REGISTER, PRIVACY_STORAGE_PREFIX)).toEqual([]);
  });

  it("records which keys the panel covers and which it leaves out, so the gap stays visible", () => {
    const { covered, outside } = panelCoverage(STORAGE_REGISTER);
    expect(covered.map((r) => r.key)).toEqual([
      "access.language",
      "access.language.set",
      "access.routeReports.v1",
      "app.corrections.v1",
      "app.preferences.v1",
      "data-status:history:v1",
      "data-status:saved-views:v1",
      "data-status:snapshot:v1",
    ]);
    expect(outside.map((r) => r.key)).toEqual(["__map_tile_list"]);
  });
});
