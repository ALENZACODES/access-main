import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { assembleRun, renderRun, validateRun, type NotRunCheck } from "../../../packages/shared/src/postdemo/index.ts";

/**
 * Day 28 post-demo regression audit for the shell. Tests carry a `check`
 * annotation whose description is a check id below. The reporter writes the
 * check-by-check table, with the build identifier, to
 * test-results/regression-run.json and .md. A run built with a placeholder
 * identifier (e2e or dev) says it is not gate evidence.
 */
export const SHELL_CHECKS: Record<string, { gate: string; title: string }> = {
  "D25-build": { gate: "Day 25 readiness", title: "Home shows the build identifier, the prototype notice, and the no-endorsement statement" },
  "D25-about": { gate: "Day 25 readiness", title: "About opens by keyboard and shows the on-device record count" },
  "D25-french-shell": { gate: "Day 25 readiness", title: "The French shell persists and is marked as a draft translation" },
  "D25-data-status": { gate: "Day 25 readiness", title: "Data status clears the cache with a confirmation and keeps focus" },
  "G1-place-honesty": { gate: "Gate 1", title: "Module pages show no invented place and say the part is not available" },
  "G2-offline-shell": { gate: "Gate 2", title: "The shell opens again with the network off" },
  "G3-accessibility-routes": { gate: "Gate 3", title: "Every shell route has one heading and no axe violations" },
  "G3-reflow": { gate: "Gate 3", title: "Narrow and enlarged text do not force horizontal scrolling" },
  "P-profile-consent": { gate: "Profile", title: "Onboarding saves a profile only after consent" },
  "P-profile-validation": { gate: "Profile", title: "An invalid width is refused and higher contrast persists" },
  "P-profile-delete": { gate: "Profile", title: "Withdraw clears preferences and delete moves focus to the status" },
  "P-profile-french": { gate: "Profile", title: "The French withdraw dialog returns focus when cancelled" },
};

const NOT_IN_SHELL = "The journey route is a stub in this shell build. The planner is not imported here (docs/module-contracts.md).";

export const SHELL_NOT_RUN: NotRunCheck[] = [
  { id: "G1-journey-core", gate: "Gate 1", title: "Step-free routes with approach legs for the demo pairs", reason: NOT_IN_SHELL },
  { id: "G1-journey-depth", gate: "Gate 1", title: "Entrance, washroom, and parking shown or honestly absent", reason: NOT_IN_SHELL },
  { id: "G2-outage-layer", gate: "Gate 2", title: "Outage warning and reroute on the demo journeys", reason: NOT_IN_SHELL },
  { id: "G2-map-layer", gate: "Gate 2", title: "Map attribution and a complete list equivalent", reason: "The shell does not mount a map (docs/repo-map.md)." },
  { id: "G2-offline-pack", gate: "Gate 2", title: "Core flows work offline from the place pack", reason: "The shell does not bundle place data, so there is no place pack to check here." },
  { id: "G3-demo-journeys", gate: "Gate 3", title: "All three demo journeys pass on the fixed build", reason: NOT_IN_SHELL },
  { id: "G3-games-hub", gate: "Gate 3", title: "Games hub keyboard and notice checks", reason: "Games are not wired into the shell in this build. access-tools runs the games checks." },
  { id: "D28-finders", gate: "Post-demo", title: "Washroom and parking finders", reason: "Finders are not wired into the shell in this build. access-tools runs the finder checks." },
];

interface Options {
  repository?: string;
  buildId?: string;
  outputDir?: string;
}

export default class RegressionReporter implements Reporter {
  private readonly results: { id: string; gate: string; title: string; status: "pass" | "fail" }[] = [];
  private readonly unknown = new Set<string>();

  constructor(private readonly options: Options = {}) {}

  onTestEnd(test: TestCase, result: TestResult): void {
    for (const annotation of test.annotations) {
      if (annotation.type !== "check" || !annotation.description) continue;
      const known = SHELL_CHECKS[annotation.description];
      if (!known) {
        this.unknown.add(annotation.description);
        continue;
      }
      this.results.push({ id: annotation.description, ...known, status: result.status === "passed" ? "pass" : "fail" });
    }
  }

  onEnd(result: FullResult): void {
    if (result.status === "interrupted") return;
    const ranIds = new Set(this.results.map((item) => item.id));
    const missing: NotRunCheck[] = Object.entries(SHELL_CHECKS)
      .filter(([id]) => !ranIds.has(id))
      .map(([id, check]) => ({ id, ...check, reason: "The test for this check did not run in this invocation (filtered or skipped)." }));
    const run = assembleRun({
      repository: this.options.repository ?? "access-main",
      buildId: this.options.buildId ?? "unidentified",
      ranOn: new Date().toISOString().slice(0, 10),
      results: this.results,
      notRun: [...SHELL_NOT_RUN, ...missing],
    });
    const outputDir = this.options.outputDir ?? "test-results";
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "regression-run.json"), `${JSON.stringify(run, null, 2)}\n`);
    writeFileSync(join(outputDir, "regression-run.md"), renderRun(run));
    const problems = validateRun(run);
    const unknown = this.unknown.size ? ` Unknown check ids: ${[...this.unknown].join(", ")}.` : "";
    process.stdout.write(
      `Regression run written to ${join(outputDir, "regression-run.md")}.${problems.length ? ` Not gate evidence: ${problems.map((problem) => problem.rule).join(", ")}.` : ""}${unknown}\n`,
    );
  }

  printsToStdio(): boolean {
    return false;
  }
}
