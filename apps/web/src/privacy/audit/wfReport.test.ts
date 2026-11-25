import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadWorkflowFiles, loadWorkflows } from "./wfFiles";
import { renderWfReport, wfCsv, type WfReportInput } from "./wfReport";
import type { WfRow } from "./wfRegister";

const row = (over: Partial<WfRow> = {}): WfRow => ({ path: ".github/workflows/a.yml", state: "active", triggers: ["pull_request", "push"], permissions: "contents:read", jobs: [{ id: "t", timeout: 40 }, { id: "u", timeout: null }], note: "A note.", ...over });
const input = (over: Partial<WfReportInput> = {}): WfReportInput => ({
  rows: [row(), row({ path: "deploy/p.yml", state: "staged", triggers: ["workflow_dispatch"], jobs: [{ id: "d", timeout: 10 }] })],
  accepted: [{ path: ".github/workflows/a.yml", code: "no-timeout", count: 1, reason: "A reason." }],
  findings: [{ code: "no-timeout", path: ".github/workflows/a.yml", line: 9, job: "u", detail: "job u has no timeout-minutes" }],
  problems: [],
  ...over,
});

describe("renderWfReport", () => {
  it("counts files, how many GitHub runs, jobs, and jobs with no timeout", () => {
    expect(renderWfReport(input())).toContain("Workflow files: 2 (1 run by GitHub, 1 kept ready and not run), 3 jobs, 1 with no timeout.");
  });

  it("writes each file with when it runs, its token and its jobs with their limits", () => {
    expect(renderWfReport(input())).toContain(".github/workflows/a.yml [active]: runs on pull_request, push; token contents:read; jobs t 40 min, u no timeout.");
    expect(renderWfReport(input())).toContain("deploy/p.yml [staged]: runs on workflow_dispatch;");
  });

  it("lists each finding under its file, indented", () => {
    const lines = renderWfReport(input()).split("\n");
    const i = lines.findIndex((l) => l.startsWith(".github/workflows/a.yml ["));
    expect(lines[i + 1]).toBe("  no-timeout .github/workflows/a.yml:9 job u has no timeout-minutes");
  });

  it("lists the accepted findings with their reasons", () => {
    const t = renderWfReport(input());
    expect(t).toContain("Findings accepted as they stand: 1.");
    expect(t).toContain("  .github/workflows/a.yml — no-timeout ×1: A reason.");
  });

  it("says there is no difference, or lists each", () => {
    expect(renderWfReport(input())).toMatch(/Differences from the register: none\.$/);
    const t = renderWfReport(input({ problems: [{ code: "missing", path: "x.yml", detail: "gone" }] }));
    expect(t).toMatch(/Differences from the register: 1\.\n {2}missing x\.yml \(gone\)$/);
  });

  it("has no trailing line break and no empty line", () => {
    const t = renderWfReport(input());
    expect(t.endsWith("\n")).toBe(false);
    expect(t.split("\n").every((l) => l !== "")).toBe(true);
  });

  it("does not say verified, safe or secure", () => {
    expect(renderWfReport(input())).not.toMatch(/verified|vérif|\bsafe\b|\bsecure\b/i);
  });

  it("copes with nothing", () => {
    expect(renderWfReport({ rows: [], accepted: [], findings: [], problems: [] })).toBe("Workflow files: 0 (0 run by GitHub, 0 kept ready and not run), 0 jobs, 0 with no timeout.\nFindings accepted as they stand: 0.\nDifferences from the register: none.");
  });
});

describe("wfCsv", () => {
  it("writes a header and a line for each row", () => {
    expect(wfCsv([row()]).split("\n")).toEqual(["path,state,triggers,permissions,jobs,note", ".github/workflows/a.yml,active,pull_request | push,contents:read,t:40 | u:none,A note."]);
  });

  it("quotes a cell with a comma, a quote or a line break", () => {
    expect(wfCsv([row({ permissions: "contents:read,pages:write", note: 'Says "x".' })]).split("\n")[1]).toBe('.github/workflows/a.yml,active,pull_request | push,"contents:read,pages:write",t:40 | u:none,"Says ""x""."');
  });

  it("gives only the header for no rows", () => {
    expect(wfCsv([])).toBe("path,state,triggers,permissions,jobs,note");
  });
});

describe("loading workflow files", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  function checkout(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "wf-audit-"));
    dirs.push(root);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }

  it("reads .yml and .yaml files directly in .github/workflows and deploy, in path order", () => {
    const root = checkout({
      ".github/workflows/b.yml": "on: push\n",
      ".github/workflows/a.yaml": "on: push\n",
      ".github/workflows/notes.md": "x",
      ".github/workflows/sub/c.yml": "x",
      "deploy/p.yml": "on: workflow_dispatch\n",
      "deploy/lock-commit.mjs": "x",
      "other/q.yml": "x",
    });
    expect(loadWorkflowFiles(root).map((f) => f.path)).toEqual([".github/workflows/a.yaml", ".github/workflows/b.yml", "deploy/p.yml"]);
  });

  it("skips a folder that is not there", () => {
    expect(loadWorkflowFiles(checkout({ "package.json": "{}" }))).toEqual([]);
    expect(loadWorkflowFiles(checkout({ "deploy/p.yml": "on: push\n" })).map((f) => f.path)).toEqual(["deploy/p.yml"]);
  });

  it("does not take a folder named like a workflow file for a file", () => {
    expect(loadWorkflowFiles(checkout({ "deploy/dir.yml/inner.txt": "x" }))).toEqual([]);
  });

  it("gives each file as a workflow", () => {
    const w = loadWorkflows(checkout({ ".github/workflows/a.yml": "name: A\non: push\njobs:\n  j:\n    steps: []\n" }));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ path: ".github/workflows/a.yml", name: "A", triggers: ["push"] });
  });
});
