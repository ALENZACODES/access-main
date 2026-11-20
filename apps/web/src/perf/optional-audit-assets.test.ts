import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSTALL_BUDGET_BYTES, evaluateInstallBudget } from "./install-budget";
import {
  isOnDemandAuditAsset, ON_DEMAND_AUDIT_GLOB, ON_DEMAND_AUDIT_URL_PATTERN,
} from "./optional-audit-assets";

const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../../scripts/check-install-budget.ts", import.meta.url), "utf8");

const auditFiles = [
  "assets/NarrowAuditPage-BDwRN0T-.js",
  "assets/NarrowAuditPage-DOQWGW3s.js",
  "assets/NarrowAuditPage-BDwRN0T_.js",
];

describe("optional narrow-screen audit install policy", () => {
  it("matches the hashed route chunk in the flat web-dist directory", () => {
    expect(ON_DEMAND_AUDIT_GLOB).toBe("**/NarrowAuditPage-*.js");
    for (const asset of auditFiles) expect(isOnDemandAuditAsset(asset)).toBe(true);
  });

  it("matches root and subpath deployments for the runtime cache", () => {
    for (const base of ["/", "/access-main/", "/nested/the-app/"]) {
      for (const asset of auditFiles) {
        expect(ON_DEMAND_AUDIT_URL_PATTERN.test(base + asset)).toBe(true);
      }
    }
  });

  it("never treats recovery, pack-management or unrelated chunks as optional", () => {
    for (const path of [
      "assets/RecoveryCenter-aaa.js",
      "assets/RecoveryReceiptLedgerPanel-aaa.js",
      "assets/RecoveryGuidedReviewPanel-aaa.js",
      "assets/RecoverySupportBriefPanel-aaa.js",
      "assets/OfflinePackPage-aaa.js",
      "assets/NarrowAuditPage.js",
      "assets/NarrowAuditPage-.css",
      "assets/NarrowAuditPage-aaa.js.map",
      "other/NarrowAuditPage-aaa.js",
    ]) {
      expect(isOnDemandAuditAsset(path)).toBe(false);
      expect(ON_DEMAND_AUDIT_URL_PATTERN.test("/" + path)).toBe(false);
    }
  });

  it("excludes only the audit bundle from the initial precache", () => {
    expect(vite).toContain("ON_DEMAND_AUDIT_GLOB]");
    expect(vite).toContain('globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"]');
    expect(vite).not.toContain('globIgnores: ["**/*.js"]');
  });

  it("uses a dedicated post-visit cache before the generic shell route", () => {
    const optional = vite.indexOf("urlPattern: ON_DEMAND_AUDIT_URL_PATTERN");
    const general = vite.indexOf('cacheName: "shell-pages"');
    expect(optional).toBeGreaterThan(0);
    expect(general).toBeGreaterThan(optional);
    expect(vite).toContain('cacheName: "optional-narrow-audit"');
    expect(vite).toContain('handler: "CacheFirst"');
  });

  it("keeps a budget guard for an accidentally precached optional chunk", () => {
    expect(guard).toContain("isOnDemandAuditAsset(assetPath)");
    expect(guard).toContain("const misplaced = urls.filter((url) => isOnDemand(url))");
    expect(guard).toContain("const onDemand = walk(dist).filter((file) => isOnDemand(file))");
  });

  it("does not change or bypass the existing fixed byte budget", () => {
    expect(INSTALL_BUDGET_BYTES).toBe(4_141_875);
    const previous = 4_169_310;
    const optionalChunk = 451_211;
    const result = evaluateInstallBudget([
      { path: "precached-assets", bytes: previous - optionalChunk },
    ]);
    expect(previous).toBeGreaterThan(INSTALL_BUDGET_BYTES);
    expect(result.withinBudget).toBe(true);
    expect(result.remainingBytes).toBeGreaterThan(0);
  });
});
