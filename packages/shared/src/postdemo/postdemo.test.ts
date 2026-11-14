import { describe, expect, it } from "vitest";
import {
  assembleRun,
  compareSnapshots,
  renderRun,
  sessionBuildVerdict,
  validateRun,
  type BuildSnapshot,
} from "./index.ts";

describe("session build lock", () => {
  const before: BuildSnapshot = { format: "build-snapshot-1.0.0", buildId: "b1", takenAt: "t0", files: { "index.html": "a", "sw.js": "b" } };

  it("passes an unchanged build", () => {
    const comparison = compareSnapshots(before, { ...before, takenAt: "t1" });
    expect(comparison.unchanged).toBe(true);
    expect(sessionBuildVerdict(comparison).pass).toBe(true);
  });

  it("fails a silent change and passes a recorded fallback change", () => {
    const after: BuildSnapshot = { ...before, buildId: "b2", files: { "index.html": "c", "new.js": "d" } };
    const comparison = compareSnapshots(before, after);
    expect(comparison).toMatchObject({ unchanged: false, buildIdChanged: true, added: ["new.js"], removed: ["sw.js"], changed: ["index.html"] });
    expect(sessionBuildVerdict(comparison)).toMatchObject({ pass: false });
    expect(sessionBuildVerdict(comparison, { failure: "Journey page crashed.", action: "Switched to fallback slides.", fallbackUsed: false }).pass).toBe(false);
    const recorded = sessionBuildVerdict(comparison, { failure: "Journey page crashed.", action: "Switched to fallback slides.", fallbackUsed: true });
    expect(recorded.pass).toBe(true);
    expect(recorded.detail).toContain("build identifier changed, 1 file(s) added, 1 file(s) removed, 1 file(s) changed");
  });
});

describe("regression run", () => {
  it("records every check against one build and keeps a failure over a retry pass", () => {
    const run = assembleRun({
      repository: "access-main",
      buildId: "synthetic-build-7",
      ranOn: "2000-01-06",
      results: [
        { id: "G2-offline-shell", gate: "Gate 2", title: "Offline", status: "fail" },
        { id: "G2-offline-shell", gate: "Gate 2", title: "Offline", status: "pass" },
        { id: "D25-build", gate: "Day 25 readiness", title: "Build", status: "pass" },
      ],
      notRun: [
        { id: "G2-map-layer", gate: "Gate 2", title: "Map", reason: "No map in the shell." },
        { id: "D25-build", gate: "Day 25 readiness", title: "Build", reason: "should be ignored because it ran" },
      ],
    });
    expect(run.checks.map((check) => [check.id, check.status])).toEqual([
      ["D25-build", "pass"],
      ["G2-map-layer", "not-run"],
      ["G2-offline-shell", "fail"],
    ]);
    expect(run.checks.every((check) => check.buildId === "synthetic-build-7")).toBe(true);
    expect(validateRun(run)).toEqual([]);
    expect(renderRun(run)).toContain("1 passed, 1 failed, 1 not run.");
  });

  it("says a placeholder build is not gate evidence and refuses a check from another build", () => {
    const run = assembleRun({ repository: "access-main", buildId: "e2e", ranOn: "2000-01-06", results: [], notRun: [] });
    expect(validateRun(run).map((problem) => problem.rule)).toEqual(["build-unidentified", "no-checks"]);
    const mixed = assembleRun({ repository: "r", buildId: "b2", ranOn: "2000-01-06", results: [{ id: "x", gate: "g", title: "t", status: "pass" }], notRun: [] });
    mixed.checks[0]!.buildId = "b1";
    expect(validateRun(mixed).map((problem) => problem.rule)).toEqual(["evidence-from-other-build"]);
    expect(renderRun(run)).toContain("**Not usable as gate evidence yet:**");
  });
});
