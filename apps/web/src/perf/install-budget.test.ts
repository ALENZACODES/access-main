import { describe, expect, it } from "vitest";
import {
  INSTALL_BUDGET_BYTES,
  InstallBudgetError,
  assertInstallBudget,
  assertInstallBudgetFromJson,
  evaluateInstallBudget,
} from "./index";

describe("install budget", () => {
  it("accepts the exact inclusive boundary", () => {
    const result = assertInstallBudget([
      { path: "index.html", bytes: 875 },
      { path: "assets/app.js", bytes: 4_717_717 },
    ]);
    expect(INSTALL_BUDGET_BYTES).toBe(4_718_592);
    expect(result.totalBytes).toBe(4_718_592);
    expect(result.remainingBytes).toBe(0);
    expect(result.withinBudget).toBe(true);
    expect(result.assets).toBe(2);
  });

  it("rejects one byte over, including optional installed chunks", () => {
    expect(() => assertInstallBudget([
      { path: "main.js", bytes: 4_717_717 },
      { path: "lazy.js", bytes: 876 },
    ])).toThrow(InstallBudgetError);
    expect(evaluateInstallBudget([
      { path: "app.js", bytes: 4_718_593 },
    ]).remainingBytes).toBe(-1);
  });

  it("rejects duplicate paths and unsafe sizes", () => {
    expect(() => assertInstallBudget([
      { path: "a", bytes: 1 }, { path: "a", bytes: 1 },
    ])).toThrow(InstallBudgetError);
    for (const bytes of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => evaluateInstallBudget([{ path: "a", bytes }])).toThrow(InstallBudgetError);
    }
    expect(() => evaluateInstallBudget([{ path: " ", bytes: 1 }])).toThrow(InstallBudgetError);
    expect(() => evaluateInstallBudget([
      { path: "a", bytes: Number.MAX_SAFE_INTEGER },
      { path: "b", bytes: 1 },
    ])).toThrow(InstallBudgetError);
  });

  it("validates unknown JSON values", () => {
    expect(assertInstallBudgetFromJson([{ path: "a", bytes: 10 }]).totalBytes).toBe(10);
    for (const bad of [{}, [null], [{ path: "a", bytes: "10" }]]) {
      expect(() => assertInstallBudgetFromJson(bad)).toThrow(InstallBudgetError);
    }
  });
});
