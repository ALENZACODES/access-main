import { describe, expect, it } from "vitest";
import budget from "../budget.json";
import fixture from "../fixtures/demo-install.json";
import { checkInstall, isBudget, isReport, type InstallAsset } from "./checker.ts";

const assets: InstallAsset[] = fixture.assets as InstallAsset[];

describe("installation budgets", () => {
  it("validates the draft 2020-12 schemas and passes the invented fixture", () => {
    expect(isBudget(budget)).toBe(true);
    expect(budget.maxPrecacheBytes).toBe(5_242_880);
    const report = checkInstall(assets, budget);
    expect(report.status).toBe("pass");
    expect(report.fixture).toBe(true);
    expect(report.totals.precacheBytes).toBe(1062000);
    expect(report.totals.totalJsBytes).toBe(846000);
    expect(isReport(report)).toBe(true);
  });

  it("identifies an over-budget CSS dimension and affected paths", () => {
    const report = checkInstall(assets, { ...budget, maxTotalCssBytes: 90000 });
    expect(report.status).toBe("fail");
    expect(report.violations).toEqual([{
      dimension: "total_css", actualBytes: 94000, limitBytes: 90000, paths: ["assets/main-c3.css"],
    }]);
  });

  it("reports empty fixtures as failing, not as a false zero-byte success", () => {
    const report = checkInstall([], budget);
    expect(report.status).toBe("fail");
    expect(report.totals.assetCount).toBe(0);
    expect(report.violations[0]?.dimension).toBe("empty_manifest");
  });

  it("reports every oversized asset path", () => {
    const report = checkInstall([{ path: "large.png", bytes: 800000, kind: "image" }], budget);
    expect(report.violations).toContainEqual({
      dimension: "asset", actualBytes: 800000, limitBytes: budget.maxAssetBytes, paths: ["large.png"],
    });
  });

  it("rejects duplicate, unsafe and malformed entries", () => {
    expect(() => checkInstall([assets[0]!, assets[0]!], budget)).toThrow(TypeError);
    expect(() => checkInstall([{ path: "../secret", kind: "js", bytes: 12 }], budget)).toThrow(TypeError);
    expect(() => checkInstall([{ path: "ok", kind: "css", bytes: -1 }], budget)).toThrow(TypeError);
    expect(isBudget({ ...budget, maxTotalJsBytes: -1 })).toBe(false);
    expect(isReport({ status: "pass" })).toBe(false);
  });
});
