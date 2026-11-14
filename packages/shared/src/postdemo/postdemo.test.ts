import { describe, expect, it } from "vitest";
import {
  assembleRun,
  compareSnapshots,
  renderBuildCard,
  renderRun,
  sessionBuildVerdict,
  validateBuildCard,
  validateRun,
  type BuildCardInput,
  type BuildSnapshot,
} from "./index.ts";

/** Synthetic card. The file names and counts are test values, not seed counts. */
function card(): BuildCardInput {
  return {
    buildId: "synthetic-build-7",
    checkedOn: "2000-01-03",
    seedCounts: [
      { file: "synthetic-places.json", tier: "SEEDED-OPEN-DATA", records: 12, basis: "counted" },
      { file: "synthetic-outages.json", tier: "PROTOTYPE-UNVERIFIED", records: 3, basis: "counted" },
    ],
    sources: [{ name: "Synthetic source", licence: "UNKNOWN", retrievedOn: "2000-01-01" }],
    demoJourneys: [
      { name: "Synthetic journey 1", status: "in-build" },
      { name: "Synthetic journey 2", status: "not-in-build", note: "Planner not wired into this build." },
    ],
    fallback: { ready: true, where: "Printed slides beside the device" },
  };
}

describe("build card", () => {
  it("accepts counted actuals and renders English and French", () => {
    expect(validateBuildCard(card())).toEqual([]);
    const english = renderBuildCard(card(), "en");
    expect(english).toContain("Build identifier: **synthetic-build-7**");
    expect(english).toContain("| **Total** | | **15** |");
    expect(english).toContain("no record in this build is verified");
    expect(english).toContain("Synthetic journey 2: not in this build. Planner not wired into this build.");
    expect(english).not.toContain("incomplete");
    const french = renderBuildCard(card(), "fr");
    expect(french).toContain("Identifiant de version : **synthetic-build-7**");
    expect(french).toContain("aucune fiche de cette version n'est vérifiée");
  });

  it("refuses an estimate, a verified tier, a blank licence, a placeholder build, and an unready fallback", () => {
    const value = card();
    value.buildId = "dev";
    value.seedCounts[0]!.basis = "estimate";
    value.seedCounts[1]!.tier = "VERIFIED";
    value.sources[0]!.licence = " ";
    value.demoJourneys[1]!.note = "";
    value.fallback = { ready: false, where: "" };
    expect(validateBuildCard(value).map((problem) => problem.rule)).toEqual([
      "build-id",
      "not-counted",
      "tier",
      "licence",
      "journey-note",
      "fallback-not-ready",
      "fallback-where",
    ]);
    const rendered = renderBuildCard(value);
    expect(rendered.indexOf("**This card is incomplete:**")).toBeLessThan(rendered.indexOf("## Seed records"));
    expect(rendered).toContain("NOT READY");
  });
});

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
