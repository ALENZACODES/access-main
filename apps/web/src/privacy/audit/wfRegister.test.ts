import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { WF_CODES } from "./wfRules";
import { ACCEPTABLE_CODES, WF_ACCEPTED, WF_REGISTER, assertWf, permString, validateWf, wfCounts, type WfAcceptRow, type WfProblemCode, type WfRow } from "./wfRegister";

const row = (over: Partial<WfRow> = {}): WfRow => ({ path: ".github/workflows/a.yml", state: "active", triggers: ["pull_request"], permissions: "contents:read", jobs: [{ id: "j", timeout: 10 }], note: "A note.", ...over });
const acc = (over: Partial<WfAcceptRow> = {}): WfAcceptRow => ({ path: ".github/workflows/a.yml", code: "no-timeout", count: 1, reason: "A reason.", ...over });
const codes = (rows: readonly WfRow[], accepted: readonly WfAcceptRow[] = []): WfProblemCode[] => validateWf(rows, accepted).map((p) => p.code);

describe("permString", () => {
  it("writes no block as unset, an empty block as none, and the words as they are", () => {
    expect(permString(null)).toBe("unset");
    expect(permString({ kind: "scopes", scopes: {} })).toBe("none");
    expect(permString({ kind: "all", level: "read-all" })).toBe("read-all");
    expect(permString({ kind: "all", level: "write-all" })).toBe("write-all");
  });

  it("writes scopes sorted by name, whatever the order they were written in", () => {
    expect(permString({ kind: "scopes", scopes: { pages: "write", contents: "read", "id-token": "write" } })).toBe("contents:read,id-token:write,pages:write");
  });

  it("marks permissions that were not readable", () => {
    expect(permString({ kind: "unreadable", text: "everything" })).toBe("unreadable:everything");
  });
});

describe("the register as written", () => {
  it("has no problems", () => {
    expect(validateWf(WF_REGISTER, WF_ACCEPTED)).toEqual([]);
    expect(() => assertWf(WF_REGISTER, WF_ACCEPTED)).not.toThrow();
  });

  it("is in path order", () => {
    const p = WF_REGISTER.map((r) => r.path);
    expect(p).toEqual([...p].sort());
  });

  it("has no workflow that runs on a schedule", () => {
    for (const r of WF_REGISTER) expect(r.triggers, r.path).not.toContain("schedule");
  });

  it("keeps the staged workflow outside .github/workflows, and the others inside it", () => {
    for (const r of WF_REGISTER) expect(r.path.startsWith(".github/workflows/"), r.path).toBe(r.state === "active");
  });

  it("gives every note and reason as a sentence that ends in a full stop, with no banned wording", () => {
    for (const r of WF_REGISTER) {
      expect(r.note, r.path).toMatch(/\.$/);
      expect(containsForbiddenOrg(r.note)).toBe(false);
      expect(r.note).not.toMatch(/verified|vérif/i);
    }
    for (const a of WF_ACCEPTED) {
      expect(a.reason, a.path).toMatch(/\.$/);
      expect(containsForbiddenOrg(a.reason)).toBe(false);
    }
  });

  it("does not claim a workflow is safe or secure", () => {
    for (const r of WF_REGISTER) expect(r.note).not.toMatch(/\b(?:safe|secure|trusted|hardened)\b/i);
  });

  it("accepts only codes that can be accepted", () => {
    for (const a of WF_ACCEPTED) expect(ACCEPTABLE_CODES).toContain(a.code);
  });
});

describe("validateWf: rows", () => {
  it("accepts a good row", () => {
    expect(codes([row()])).toEqual([]);
  });

  it("reports a bad path, and a duplicate", () => {
    for (const path of ["a.yml", ".github/workflows/a.txt", ".github/workflows/sub/a.yml", "workflows/a.yml", "../.github/workflows/a.yml", ".github/workflows/.yml"]) expect(codes([row({ path })]), path).toContain("bad-path");
    expect(codes([row(), row()])).toContain("duplicate-path");
  });

  it("reports a state that does not match the folder", () => {
    expect(codes([row({ state: "staged" })])).toContain("wrong-place");
    expect(codes([row({ path: "deploy/a.yml", state: "active" })])).toContain("wrong-place");
    expect(codes([row({ path: "deploy/a.yml", state: "staged" })])).toEqual([]);
    expect(codes([row({ state: "other" as never })])).toContain("bad-state");
  });

  it("reports no triggers, and a schedule", () => {
    expect(codes([row({ triggers: [] })])).toContain("no-triggers");
    expect(codes([row({ triggers: ["push", "schedule"] })])).toContain("scheduled");
  });

  it("reports a permissions text that is not in the fixed form", () => {
    for (const permissions of ["", "read", "contents:", "contents:admin", "Contents:read", "contents:read,", "contents read", "all"]) expect(codes([row({ permissions })]), permissions).toContain("bad-permissions");
    for (const permissions of ["unset", "none", "read-all", "write-all", "contents:read", "contents:read,pages:write", "id-token:write"]) expect(codes([row({ permissions })]), permissions).not.toContain("bad-permissions");
  });

  it("reports no jobs, a bad or repeated job id, and a bad timeout", () => {
    expect(codes([row({ jobs: [] })])).toContain("no-jobs");
    expect(codes([row({ jobs: [{ id: "1a", timeout: 1 }] })])).toContain("bad-job");
    expect(codes([row({ jobs: [{ id: "a", timeout: 1 }, { id: "a", timeout: 2 }] })])).toContain("duplicate-job");
    for (const timeout of [0, -1, 1.5, Number.NaN]) expect(codes([row({ jobs: [{ id: "a", timeout }] })]), String(timeout)).toContain("bad-timeout");
    expect(codes([row({ jobs: [{ id: "a", timeout: null }] })])).toEqual([]);
  });

  it("reports an empty note", () => {
    expect(codes([row({ note: " " })])).toContain("empty-note");
  });
});

describe("validateWf: accepted findings", () => {
  it("accepts a good row", () => {
    expect(codes([row()], [acc()])).toEqual([]);
  });

  it("reports a path that has no row, a code that is not a code, and a code that can never be accepted", () => {
    expect(codes([row()], [acc({ path: ".github/workflows/zzz.yml" })])).toContain("unregistered-path");
    expect(codes([row()], [acc({ code: "nope" as never })])).toContain("bad-code");
    for (const code of WF_CODES.filter((c) => !ACCEPTABLE_CODES.includes(c))) expect(codes([row()], [acc({ code })]), code).toContain("not-acceptable");
  });

  it("never lets a schedule, a secret, a pipe to a shell or an injection be accepted", () => {
    for (const code of ["schedule-trigger", "secret-reference", "pipe-to-shell", "injection", "continue-on-error", "swallowed-failure", "retry", "unpinned-ref", "owner-not-allowed", "docker-action", "yaml-problem"] as const) expect(ACCEPTABLE_CODES, code).not.toContain(code);
  });

  it("reports a count that is not a whole number of at least one, an empty reason, and a repeated row", () => {
    for (const count of [0, -1, 1.5]) expect(codes([row()], [acc({ count })])).toContain("bad-count");
    expect(codes([row()], [acc({ reason: " " })])).toContain("empty-reason");
    expect(codes([row()], [acc(), acc()])).toContain("duplicate-accept");
  });

  it("allows two rows for the same file and different codes", () => {
    expect(codes([row()], [acc(), acc({ code: "no-permissions" })])).toEqual([]);
  });
});

describe("validateWf and assertWf", () => {
  it("gives problems in the order of path, code and detail", () => {
    const p = validateWf([row({ path: ".github/workflows/b.yml", note: "" }), row({ path: ".github/workflows/a.yml", triggers: [] })]);
    expect(p.map((x) => `${x.path} ${x.code}`)).toEqual([".github/workflows/a.yml no-triggers", ".github/workflows/b.yml empty-note"]);
  });

  it("does not change what it is given", () => {
    const rows = [row({ path: ".github/workflows/b.yml" }), row({ path: ".github/workflows/a.yml" })];
    const before = JSON.stringify(rows);
    validateWf(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("throws with each problem named", () => {
    expect(() => assertWf([row({ triggers: [] })], [acc({ count: 0 })])).toThrow(/bad-count.*no-triggers/s);
  });
});

describe("wfCounts", () => {
  it("counts files, states, jobs, jobs with no timeout and accepted findings", () => {
    const c = wfCounts(WF_REGISTER, WF_ACCEPTED);
    expect(c).toEqual({ files: 7, active: 6, staged: 1, jobs: 12, noTimeout: 1, accepted: 10 });
  });

  it("counts nothing for nothing", () => {
    expect(wfCounts([], [])).toEqual({ files: 0, active: 0, staged: 0, jobs: 0, noTimeout: 0, accepted: 0 });
  });
});
