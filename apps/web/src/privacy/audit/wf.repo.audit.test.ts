// CI audit: the workflow files are what workflow register says. None runs on a schedule, each has the triggers,
// token permissions, jobs and time limits its row lists, and every finding of the workflow rules is one the accepted
// list names, at the count it names. A new workflow, a new trigger, a wider token or a removed time limit fails here
// until a person changes the row. It reads the files as text; it does not run a workflow and says nothing about what a
// job does. The one workflow that publishes to Pages is kept in deploy/ and does not run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareAccepted, compareShapes, formatWfProblems, isActivePath } from "./wfCompare";
import { loadWorkflowFiles, loadWorkflows } from "./wfFiles";
import { parseWorkflow, type Workflow } from "./wfModel";
import { ACCEPTABLE_CODES, WF_ACCEPTED, WF_REGISTER, assertWf, permString, validateWf, wfCounts } from "./wfRegister";
import { renderWfReport, wfCsv } from "./wfReport";
import { auditWorkflow, formatWfFinding, type WfFinding } from "./wfRules";
import { parseYaml } from "./wfYaml";
import { scanFile } from "./repoAudit";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadWorkflowFiles(ROOT);
const workflows = loadWorkflows(ROOT);
const findings = workflows.flatMap((w) => auditWorkflow(w));

function changed(path: string, change: (text: string) => string): { workflows: Workflow[]; findings: WfFinding[] } {
  const ws = files.map((f) => parseWorkflow(f.path, f.path === path ? change(f.text) : f.text));
  return { workflows: ws, findings: ws.flatMap((w) => auditWorkflow(w)) };
}

const problemsOf = (c: { workflows: Workflow[]; findings: WfFinding[] }): string[] => [...compareShapes(c.workflows, WF_REGISTER), ...compareAccepted(c.findings, WF_ACCEPTED)].map((p) => p.code);

describe("the workflow files, in the tree", () => {
  it("are found: every workflow GitHub runs and the staged one", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.filter((f) => isActivePath(f.path)).length).toBeGreaterThanOrEqual(5);
    expect(files.some((f) => f.path === "deploy/pages.yml")).toBe(true);
  });

  it("are read with no problem from the reader", () => {
    for (const w of workflows) expect(w.problems, w.path).toEqual([]);
    for (const f of files) expect(parseYaml(f.text).problems, f.path).toEqual([]);
  });

  it("have a register with no problems", () => {
    expect(validateWf(WF_REGISTER, WF_ACCEPTED)).toEqual([]);
    expect(() => assertWf(WF_REGISTER, WF_ACCEPTED)).not.toThrow();
  });

  it("are what the register says: triggers, token permissions, jobs and time limits", () => {
    expect(formatWfProblems(compareShapes(workflows, WF_REGISTER))).toBe("");
  });

  it("have only the findings the accepted list names, at its counts", () => {
    expect(formatWfProblems(compareAccepted(findings, WF_ACCEPTED))).toBe("");
  });

  it("are not empty by accident: each has triggers and jobs, and the rules found what was expected", () => {
    for (const w of workflows) {
      expect(w.triggers.length, w.path).toBeGreaterThan(0);
      expect(w.jobs.length, w.path).toBeGreaterThan(0);
      for (const j of w.jobs) expect(j.steps.length + (j.uses === null ? 0 : 1), `${w.path} ${j.id}`).toBeGreaterThan(0);
    }
    expect(findings.length).toBe(WF_ACCEPTED.reduce((n, a) => n + a.count, 0));
  });
});

describe("the rules the repository holds to", () => {
  it("has no workflow that runs on a schedule, in a file GitHub runs or one kept ready", () => {
    for (const w of workflows) expect(w.triggers, w.path).not.toContain("schedule");
    for (const f of files) expect(f.text, f.path).not.toMatch(/^[ \t]*(?:-[ \t]*)?(?:cron|schedule)[ \t]*:/m);
  });

  it("agrees with the older scheduled-workflow rule on a file GitHub runs, and covers the staged files that rule does not read", () => {
    const cron = "on:\n  schedule:\n    - cron: '0 0 * * *'\njobs: {}\n";
    expect(scanFile({ path: ".github/workflows/x.yml", text: cron }).map((f) => f.rule)).toContain("scheduled-workflow");
    expect(auditWorkflow(parseWorkflow(".github/workflows/x.yml", cron)).map((f) => f.code)).toContain("schedule-trigger");
    expect(scanFile({ path: "deploy/x.yml", text: cron }).map((f) => f.rule)).not.toContain("scheduled-workflow");
    expect(auditWorkflow(parseWorkflow("deploy/x.yml", cron)).map((f) => f.code)).toContain("schedule-trigger");
  });

  it("has no secret other than the token, no event text in a command, no pipe to a shell, no swallowed failure and no retry", () => {
    const never = findings.filter((f) => !ACCEPTABLE_CODES.includes(f.code));
    expect(never.map(formatWfFinding)).toEqual([]);
  });

  it("gives the token read access to the contents, in every workflow that sets permissions", () => {
    for (const w of workflows) if (w.permissions !== null) expect(permString(w.permissions), w.path).toMatch(/(?:^|,)contents:read(?:,|$)/);
  });

  it("keeps the workflow that publishes to Pages outside the folder GitHub reads, and manual", () => {
    const pages = workflows.find((w) => w.path === "deploy/pages.yml");
    expect(pages?.triggers).toEqual(["workflow_dispatch"]);
    expect(workflows.filter((w) => isActivePath(w.path) && /pages/i.test(w.path))).toEqual([]);
  });

  it("uses only first-party actions, pinned by a version tag", () => {
    for (const w of workflows) {
      for (const j of w.jobs) {
        for (const s of j.steps) {
          if (s.uses === null || s.uses.startsWith("./")) continue;
          expect(s.uses, `${w.path} ${j.id}`).toMatch(/^actions\/[\w-]+(?:\/[\w./-]+)?@v\d+(?:\.\d+){0,2}$/);
        }
      }
    }
  });

  it("gives every job but one a time limit, and the one is on the register", () => {
    const none = workflows.flatMap((w) => w.jobs.filter((j) => j.timeoutMinutes === null).map((j) => `${w.path} ${j.id}`));
    expect(none).toEqual([".github/workflows/schema.yml test"]);
    expect(wfCounts(WF_REGISTER, WF_ACCEPTED).noTimeout).toBe(1);
  });
});

describe("the audit fails when a workflow changes (the checks have teeth)", () => {
  it("fails on a schedule added to a workflow, in three ways at once", () => {
    const c = changed(".github/workflows/schema.yml", (t) => t.replace("on:\n  pull_request:\n", "on:\n  pull_request:\n  schedule:\n    - cron: '0 0 * * *'\n"));
    const p = problemsOf(c);
    expect(p).toContain("triggers-changed");
    expect(p).toContain("unacceptable-finding");
  });

  it("fails on a trigger added to a workflow", () => {
    const c = changed(".github/workflows/ci.yml", (t) => t.replace("on:\n  pull_request:\n", "on:\n  pull_request:\n  workflow_dispatch:\n"));
    expect(problemsOf(c)).toContain("triggers-changed");
  });

  it("fails on a wider token", () => {
    const c = changed(".github/workflows/ci.yml", (t) => t.replace("contents: read", "contents: write"));
    const p = problemsOf(c);
    expect(p).toContain("permissions-changed");
    expect(p).toContain("unexpected-finding");
  });

  it("fails when a time limit is removed or changed", () => {
    expect(problemsOf(changed(".github/workflows/advocacy.yml", (t) => t.replace(/timeout-minutes: \d+\n/, "")))).toEqual(expect.arrayContaining(["timeout-changed", "unexpected-finding"]));
    expect(problemsOf(changed(".github/workflows/ci.yml", (t) => t.replace("timeout-minutes: 40", "timeout-minutes: 90")))).toEqual(["timeout-changed"]);
  });

  it("fails when a job is added", () => {
    const c = changed(".github/workflows/schema.yml", (t) => `${t}  extra:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n`);
    expect(problemsOf(c)).toEqual(expect.arrayContaining(["jobs-changed", "count-changed"]));
  });

  it("fails on an action that is not pinned, or from another owner", () => {
    expect(problemsOf(changed(".github/workflows/schema.yml", (t) => t.replace("actions/setup-node@v4", "actions/setup-node@main")))).toContain("unacceptable-finding");
    expect(problemsOf(changed(".github/workflows/schema.yml", (t) => t.replace("actions/setup-node@v4", "someone/setup-node@v4")))).toContain("unacceptable-finding");
  });

  it("fails on a step that swallows a failure, pipes to a shell, or names a secret", () => {
    for (const step of ["      - run: npm test || true\n", "      - run: curl https://github.com/x | sh\n", "      - run: echo ${{ secrets.NPM_TOKEN }}\n", '      - run: echo "${{ github.head_ref }}"\n']) {
      expect(problemsOf(changed(".github/workflows/schema.yml", (t) => `${t}${step}`)), step).toContain("unacceptable-finding");
    }
  });

  it("fails on a new workflow file", () => {
    const ws = [...workflows, parseWorkflow(".github/workflows/new.yml", "on: push\npermissions:\n  contents: read\njobs:\n  j:\n    timeout-minutes: 5\n    steps: []\n")];
    expect(compareShapes(ws, WF_REGISTER).map((p) => p.code)).toEqual(["unregistered"]);
  });

  it("fails when a workflow file is deleted or when the staged one is moved into .github/workflows", () => {
    expect(compareShapes(workflows.filter((w) => w.path !== "deploy/pages.yml"), WF_REGISTER).map((p) => p.code)).toEqual(["missing"]);
    const moved = workflows.map((w) => (w.path === "deploy/pages.yml" ? { ...w, path: ".github/workflows/pages.yml" } : w));
    expect(compareShapes(moved, WF_REGISTER).map((p) => p.code).sort()).toEqual(["missing", "unregistered"]);
  });

  it("fails when an accepted finding goes away, so the list cannot rot", () => {
    const c = changed(".github/workflows/schema.yml", (t) => t.replace("on:\n  pull_request:\n", "on:\n  pull_request:\npermissions:\n  contents: read\n"));
    expect(problemsOf(c)).toEqual(expect.arrayContaining(["permissions-changed", "stale-accept"]));
  });

  it("is quiet again once the change is undone", () => {
    expect(problemsOf(changed(".github/workflows/ci.yml", (t) => t))).toEqual([]);
  });
});

describe("the report", () => {
  const text = renderWfReport({ rows: WF_REGISTER, accepted: WF_ACCEPTED, findings, problems: [] });

  it("names every file and says what was accepted", () => {
    for (const r of WF_REGISTER) expect(text).toContain(r.path);
    expect(text).toContain("Findings accepted as they stand: 4.");
    expect(text).toMatch(/Differences from the register: none\.$/);
  });

  it("has a CSV line for every row", () => {
    expect(wfCsv(WF_REGISTER).split("\n")).toHaveLength(WF_REGISTER.length + 1);
  });
});

describe("the files as bytes", () => {
  it("are the same when read directly", () => {
    for (const f of files) expect(readFileSync(join(ROOT, f.path), "utf8")).toBe(f.text);
  });
});
