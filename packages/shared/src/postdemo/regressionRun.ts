/**
 * Day 28 post-demo regression run. The format matches
 * access-help `packages/followup` (`regression-run-1.0.0`) and the access-tools
 * reporter, so the three repositories' runs can be read together.
 */
export interface RegressionCheck {
  id: string;
  gate: string;
  title: string;
  status: "pass" | "fail" | "not-run";
  buildId: string;
  reason?: string;
}

export interface RegressionRun {
  format: "regression-run-1.0.0";
  repository: string;
  buildId: string;
  ranOn: string;
  checks: RegressionCheck[];
}

/** A check this repository cannot run, with the reason. */
export interface NotRunCheck {
  id: string;
  gate: string;
  title: string;
  reason: string;
}

/** Build identifiers that name a test or local build, not a deployed one. */
export const PLACEHOLDER_BUILD = /^(?:dev|e2e|unknown|unidentified|)$/i;

export interface RunProblem {
  ref: string;
  rule: string;
  detail: string;
}

export function validateRun(run: RegressionRun): RunProblem[] {
  const problems: RunProblem[] = [];
  if (PLACEHOLDER_BUILD.test(run.buildId.trim())) {
    problems.push({ ref: run.repository, rule: "build-unidentified", detail: `Build "${run.buildId}" is a placeholder. This run is not gate evidence.` });
  }
  if (run.checks.length === 0) problems.push({ ref: run.repository, rule: "no-checks", detail: "The run has no checks." });
  const seen = new Set<string>();
  for (const check of run.checks) {
    if (seen.has(check.id)) problems.push({ ref: check.id, rule: "duplicate-check", detail: "Check ids must be unique." });
    seen.add(check.id);
    if (check.buildId !== run.buildId) problems.push({ ref: check.id, rule: "evidence-from-other-build", detail: `Ran on ${check.buildId}, not ${run.buildId}.` });
    if (check.status === "not-run" && !check.reason?.trim()) problems.push({ ref: check.id, rule: "not-run-without-reason", detail: "Say why the check was not run." });
  }
  return problems;
}

/**
 * Combines executed checks with declared not-run checks. When the same id has
 * several results (for example a retry), a failure wins over a pass.
 */
export function assembleRun(input: {
  repository: string;
  buildId: string;
  ranOn: string;
  results: { id: string; gate: string; title: string; status: "pass" | "fail" }[];
  notRun: NotRunCheck[];
}): RegressionRun {
  const byId = new Map<string, RegressionCheck>();
  for (const result of input.results) {
    const existing = byId.get(result.id);
    if (existing && existing.status === "fail") continue;
    byId.set(result.id, { ...result, buildId: input.buildId });
  }
  for (const item of input.notRun) {
    if (!byId.has(item.id)) byId.set(item.id, { ...item, status: "not-run", buildId: input.buildId });
  }
  const checks = [...byId.values()].sort((a, b) => a.gate.localeCompare(b.gate) || a.id.localeCompare(b.id));
  return { format: "regression-run-1.0.0", repository: input.repository, buildId: input.buildId, ranOn: input.ranOn, checks };
}

export function renderRun(run: RegressionRun): string {
  const counts = { pass: 0, fail: 0, "not-run": 0 };
  for (const check of run.checks) counts[check.status] += 1;
  const problems = validateRun(run);
  const escape = (value: string) => value.replace(/\|/g, "\\|");
  return [
    `# Regression run: ${run.repository}`,
    "",
    `Build ${run.buildId}, run ${run.ranOn}. ${counts.pass} passed, ${counts.fail} failed, ${counts["not-run"]} not run.`,
    "",
    ...(problems.length ? ["**Not usable as gate evidence yet:**", "", ...problems.map((problem) => `- ${problem.ref}: ${problem.detail}`), ""] : []),
    "| Check | Gate | Title | Status | Build | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...run.checks.map((check) => `| ${check.id} | ${check.gate} | ${escape(check.title)} | ${check.status} | ${check.buildId} | ${escape(check.reason ?? "")} |`),
    "",
  ].join("\n");
}
