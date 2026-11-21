import { describe, expect, it } from "vitest";
import { compareAccepted, compareShapes, countFindings, formatWfProblem, formatWfProblems, isActivePath } from "./wfCompare";
import { parseWorkflow } from "./wfModel";
import type { WfAcceptRow, WfRow } from "./wfRegister";
import type { WfCode, WfFinding } from "./wfRules";

const SRC = "on:\n  pull_request:\n  push:\npermissions:\n  contents: read\njobs:\n  a:\n    timeout-minutes: 10\n    steps: []\n  b:\n    timeout-minutes: 20\n    steps: []\n";
const P = ".github/workflows/x.yml";
const wf = (src = SRC, path = P) => parseWorkflow(path, src);
const row = (over: Partial<WfRow> = {}): WfRow => ({ path: P, state: "active", triggers: ["push", "pull_request"], permissions: "contents:read", jobs: [{ id: "a", timeout: 10 }, { id: "b", timeout: 20 }], note: "n.", ...over });
const fin = (code: WfCode, line = 1, path = P): WfFinding => ({ code, path, line, detail: "d" });
const acc = (code: WfCode, count = 1, path = P): WfAcceptRow => ({ path, code, count, reason: "r." });

describe("isActivePath", () => {
  it("is true only for a file directly in .github/workflows", () => {
    expect(isActivePath(".github/workflows/a.yml")).toBe(true);
    expect(isActivePath(".github/workflows/a.yaml")).toBe(true);
    for (const p of ["deploy/a.yml", ".github/workflows/sub/a.yml", ".github/a.yml", ".github/workflows/a.txt", "x/.github/workflows/a.yml"]) expect(isActivePath(p), p).toBe(false);
  });
});

describe("compareShapes", () => {
  it("is empty when the file is what the row says, whatever the order of triggers and jobs", () => {
    expect(compareShapes([wf()], [row()])).toEqual([]);
    expect(compareShapes([wf()], [row({ triggers: ["pull_request", "push"], jobs: [{ id: "b", timeout: 20 }, { id: "a", timeout: 10 }] })])).toEqual([]);
  });

  it("finds a file with no row", () => {
    expect(compareShapes([wf()], [])).toEqual([{ code: "unregistered", path: P, detail: "triggers [pull_request, push]" }]);
  });

  it("finds a row with no file", () => {
    expect(compareShapes([], [row()])).toEqual([{ code: "missing", path: P, detail: "the file is not there" }]);
  });

  it("finds a trigger that was added or removed", () => {
    const f = compareShapes([wf(SRC.replace("  push:\n", "  push:\n  workflow_dispatch:\n"))], [row()]);
    expect(f).toEqual([{ code: "triggers-changed", path: P, detail: "was [pull_request, push], now [pull_request, push, workflow_dispatch]" }]);
    expect(compareShapes([wf(SRC.replace("  push:\n", ""))], [row()])[0]?.code).toBe("triggers-changed");
  });

  it("finds a schedule added to a workflow, as a change of triggers", () => {
    const f = compareShapes([wf(SRC.replace("  push:\n", "  schedule:\n    - cron: x\n"))], [row()]);
    expect(f[0]).toMatchObject({ code: "triggers-changed" });
    expect(f[0]?.detail).toContain("schedule");
  });

  it("finds a change in what the token may do", () => {
    expect(compareShapes([wf(SRC.replace("contents: read", "contents: write"))], [row()])).toEqual([{ code: "permissions-changed", path: P, detail: "was contents:read, now contents:write" }]);
    expect(compareShapes([wf(SRC.replace("permissions:\n  contents: read\n", ""))], [row()])[0]?.detail).toBe("was contents:read, now unset");
  });

  it("finds a job that was added, removed or renamed", () => {
    expect(compareShapes([wf(SRC + "  c:\n    timeout-minutes: 5\n    steps: []\n")], [row()])[0]).toMatchObject({ code: "jobs-changed", detail: "was [a, b], now [a, b, c]" });
    expect(compareShapes([wf(SRC.replace("  a:", "  z:"))], [row()]).map((p) => p.code)).toEqual(["jobs-changed"]);
  });

  it("finds a time limit that changed, was added or was removed", () => {
    expect(compareShapes([wf(SRC.replace("timeout-minutes: 20", "timeout-minutes: 60"))], [row()])).toEqual([{ code: "timeout-changed", path: P, detail: "b: was 20, now 60" }]);
    expect(compareShapes([wf(SRC.replace("    timeout-minutes: 20\n", ""))], [row()])[0]?.detail).toBe("b: was 20, now none");
    expect(compareShapes([wf(SRC)], [row({ jobs: [{ id: "a", timeout: null }, { id: "b", timeout: 20 }] })])[0]?.detail).toBe("a: was none, now 10");
  });

  it("finds a file moved into or out of the folder GitHub reads", () => {
    expect(compareShapes([wf(SRC, "deploy/x.yml")], [row({ path: "deploy/x.yml" })]).map((p) => p.code)).toEqual(["state-changed"]);
    expect(compareShapes([wf(SRC, P)], [row({ state: "staged" })]).map((p) => p.code)).toEqual(["state-changed"]);
  });

  it("reports each difference of one file, and gives them in a fixed order", () => {
    const f = compareShapes([wf(SRC.replace("contents: read", "contents: write").replace("timeout-minutes: 10", "timeout-minutes: 11"))], [row()]);
    expect(f.map((p) => p.code)).toEqual(["permissions-changed", "timeout-changed"]);
  });

  it("does not change what it is given", () => {
    const rows = [row()];
    const before = JSON.stringify(rows);
    compareShapes([wf()], rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("countFindings", () => {
  it("counts findings by file and code", () => {
    const m = countFindings([fin("no-timeout"), fin("no-timeout", 4), fin("write-permission"), fin("no-timeout", 1, "other.yml")]);
    expect(m.get(`${P}\u0000no-timeout`)).toBe(2);
    expect(m.get(`${P}\u0000write-permission`)).toBe(1);
    expect(m.get("other.yml\u0000no-timeout")).toBe(1);
    expect(m.size).toBe(3);
  });
});

describe("compareAccepted", () => {
  it("is empty when every finding is accepted at its count, and every row has findings", () => {
    expect(compareAccepted([fin("no-timeout"), fin("write-permission", 2), fin("write-permission", 3)], [acc("no-timeout"), acc("write-permission", 2)])).toEqual([]);
  });

  it("is empty for no findings and no rows", () => {
    expect(compareAccepted([], [])).toEqual([]);
  });

  it("finds a finding no row accepts, with its count and lines", () => {
    expect(compareAccepted([fin("no-timeout", 3), fin("no-timeout", 9)], [])).toEqual([{ code: "unexpected-finding", path: P, detail: "no-timeout ×2 at line 3, 9" }]);
  });

  it("finds a count that is not the file's, up or down", () => {
    expect(compareAccepted([fin("no-timeout"), fin("no-timeout")], [acc("no-timeout", 1)])).toEqual([{ code: "count-changed", path: P, detail: "no-timeout: list says 1, found 2" }]);
    expect(compareAccepted([fin("no-timeout")], [acc("no-timeout", 3)])[0]?.detail).toBe("no-timeout: list says 3, found 1");
  });

  it("finds a row with no finding left", () => {
    expect(compareAccepted([], [acc("no-timeout")])).toEqual([{ code: "stale-accept", path: P, detail: "no-timeout: no such finding any more" }]);
  });

  it("finds a finding of a code that can never be accepted, even when a row names it", () => {
    for (const code of ["schedule-trigger", "secret-reference", "pipe-to-shell", "injection"] as const) {
      expect(compareAccepted([fin(code, 7)], [acc(code)]).map((p) => p.code), code).toEqual(["unacceptable-finding"]);
      expect(compareAccepted([fin(code, 7)], []).map((p) => p.code), code).toEqual(["unacceptable-finding"]);
    }
  });

  it("says which lines an unacceptable finding is on", () => {
    expect(compareAccepted([fin("schedule-trigger", 3)], [])[0]?.detail).toBe("schedule-trigger at line 3");
  });

  it("keeps files apart", () => {
    expect(compareAccepted([fin("no-timeout", 1, "a.yml")], [acc("no-timeout", 1, "b.yml")]).map((p) => `${p.code} ${p.path}`)).toEqual(["unexpected-finding a.yml", "stale-accept b.yml"]);
  });
});

describe("formatting", () => {
  it("writes one problem on a line, and a list on lines", () => {
    const p = { code: "missing" as const, path: "a.yml", detail: "gone" };
    expect(formatWfProblem(p)).toBe("missing a.yml (gone)");
    expect(formatWfProblems([p, { ...p, path: "b.yml" }])).toBe("missing a.yml (gone)\nmissing b.yml (gone)");
    expect(formatWfProblems([])).toBe("");
  });
});
