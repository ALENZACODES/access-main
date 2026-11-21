import { describe, expect, it } from "vitest";
import { allSteps, expressionsIn, isCommitSha, parseUses, parseWorkflow, readPerms } from "./wfModel";
import { get, parseYaml } from "./wfYaml";

const SAMPLE = `name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    name: The tests
    runs-on: ubuntu-latest
    timeout-minutes: 40
    needs: [lint, build]
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm ci
        env:
          CI: "true"
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
        continue-on-error: true
        if: always()
  deploy:
    runs-on: [self-hosted, linux]
    environment:
      name: github-pages
    strategy:
      fail-fast: false
    permissions:
      pages: write
    steps: []
`;

describe("parseWorkflow", () => {
  const w = parseWorkflow(".github/workflows/ci.yml", SAMPLE);

  it("reads the name, the triggers in order, and the line of each", () => {
    expect(w.path).toBe(".github/workflows/ci.yml");
    expect(w.name).toBe("CI");
    expect(w.triggers).toEqual(["pull_request", "push"]);
    expect(w.triggerLines).toEqual({ pull_request: 4, push: 5 });
  });

  it("reads the permissions and the line they start on", () => {
    expect(w.permissions).toEqual({ kind: "scopes", scopes: { contents: "read" } });
    expect(w.permissionsLine).toBe(8);
  });

  it("reads each job with its settings", () => {
    expect(w.jobs.map((j) => j.id)).toEqual(["test", "deploy"]);
    const t = w.jobs[0]!;
    expect(t).toMatchObject({ name: "The tests", runsOn: ["ubuntu-latest"], timeoutMinutes: 40, needs: ["lint", "build"], permissions: null, uses: null });
    expect(t.line).toBe(12);
  });

  it("reads a list of runners, an environment given as a map, fail-fast and job permissions", () => {
    const d = w.jobs[1]!;
    expect(d.runsOn).toEqual(["self-hosted", "linux"]);
    expect(d.environment).toBe("github-pages");
    expect(d.failFast).toBe("false");
    expect(d.permissions).toEqual({ kind: "scopes", scopes: { pages: "write" } });
    expect(d.timeoutMinutes).toBeNull();
    expect(d.steps).toEqual([]);
  });

  it("reads each step with its position and line", () => {
    const s = w.jobs[0]!.steps;
    expect(s.map((x) => x.index)).toEqual([1, 2, 3]);
    expect(s[0]).toMatchObject({ uses: "actions/checkout@v4", run: null, name: null, line: 18 });
    expect(s[1]).toMatchObject({ name: "Install", run: "npm ci", env: { CI: "true" } });
    expect(s[2]).toMatchObject({ uses: "actions/setup-node@v4", with: { "node-version": "22", cache: "npm" }, continueOnError: "true", ifCond: "always()" });
  });

  it("gives no problems for a file that reads cleanly", () => {
    expect(w.problems).toEqual([]);
  });

  it("reads a single trigger written as a word or as a list", () => {
    expect(parseWorkflow("a.yml", "on: push\njobs: {}\n").triggers).toEqual(["push"]);
    expect(parseWorkflow("a.yml", "on: [push, pull_request]\njobs: {}\n").triggers).toEqual(["push", "pull_request"]);
    expect(parseWorkflow("a.yml", "on:\n  - push\njobs: {}\n").triggers).toEqual(["push"]);
  });

  it("reads a trigger with a schedule and keeps it as a trigger", () => {
    const x = parseWorkflow("a.yml", "on:\n  schedule:\n    - cron: '0 0 * * *'\njobs: {}\n");
    expect(x.triggers).toEqual(["schedule"]);
    expect(x.triggerLines["schedule"]).toBe(2);
  });

  it("reads timeouts only when they are numbers", () => {
    const x = parseWorkflow("a.yml", "jobs:\n  a:\n    timeout-minutes: 15\n  b:\n    timeout-minutes: ${{ vars.T }}\n  c:\n    timeout-minutes: 2.5\n");
    expect(x.jobs.map((j) => j.timeoutMinutes)).toEqual([15, null, 2.5]);
  });

  it("reads a job that calls another workflow", () => {
    const x = parseWorkflow("a.yml", "jobs:\n  call:\n    uses: ./.github/workflows/other.yml\n");
    expect(x.jobs[0]).toMatchObject({ uses: "./.github/workflows/other.yml", steps: [] });
  });

  it("reads the workflow's own env", () => {
    expect(parseWorkflow("a.yml", "env:\n  VITE_BASE: /access-main/\n  N: 1\njobs: {}\n").env).toEqual({ VITE_BASE: "/access-main/", N: "1" });
  });

  it("gives a workflow with nothing in it for text that is not a map, and passes on the problems", () => {
    const x = parseWorkflow("a.yml", "- a\n- b\n");
    expect(x).toMatchObject({ name: null, triggers: [], jobs: [], permissions: null });
    const y = parseWorkflow("a.yml", "a: &x 1\njobs: {}\n");
    expect(y.problems).toHaveLength(1);
  });

  it("copes with jobs written as something other than a map", () => {
    expect(parseWorkflow("a.yml", "jobs: []\n").jobs).toEqual([]);
    expect(parseWorkflow("a.yml", "jobs: nope\n").jobs).toEqual([]);
    expect(parseWorkflow("a.yml", "jobs:\n  a: x\n").jobs[0]?.steps).toEqual([]);
  });
});

describe("readPerms", () => {
  const node = (src: string) => get(parseYaml(`p: ${src}`).root, "p");

  it("reads read-all and write-all", () => {
    expect(readPerms(node("read-all"))).toEqual({ kind: "all", level: "read-all" });
    expect(readPerms(node("write-all"))).toEqual({ kind: "all", level: "write-all" });
  });

  it("reads a map of scopes, and an empty map as no access", () => {
    expect(readPerms(node("{contents: read, pages: write}"))).toEqual({ kind: "scopes", scopes: { contents: "read", pages: "write" } });
    expect(readPerms(node("{}"))).toEqual({ kind: "scopes", scopes: {} });
  });

  it("treats a key with nothing after it as no access", () => {
    const w = parseWorkflow("a.yml", "permissions:\njobs: {}\n");
    expect(w.permissions).toEqual({ kind: "scopes", scopes: {} });
  });

  it("marks any other word or a list as unreadable, and gives null for no block", () => {
    expect(readPerms(node("everything"))).toEqual({ kind: "unreadable", text: "everything" });
    expect(readPerms(node("[a]"))).toEqual({ kind: "unreadable", text: "a list" });
    expect(readPerms(undefined)).toBeNull();
  });
});

describe("parseUses", () => {
  const cases: Array<[string, ReturnType<typeof parseUses>]> = [
    ["actions/checkout@v4", { kind: "remote", owner: "actions", repo: "checkout", subpath: "", ref: "v4" }],
    ["actions/cache/restore@v4", { kind: "remote", owner: "actions", repo: "cache", subpath: "restore", ref: "v4" }],
    ["a/b/c/d@main", { kind: "remote", owner: "a", repo: "b", subpath: "c/d", ref: "main" }],
    ["owner/repo", { kind: "remote", owner: "owner", repo: "repo", subpath: "", ref: "" }],
    ["o/r@0123456789abcdef0123456789abcdef01234567", { kind: "remote", owner: "o", repo: "r", subpath: "", ref: "0123456789abcdef0123456789abcdef01234567" }],
    ["./local/action", { kind: "local", owner: "", repo: "", subpath: "local/action", ref: "" }],
    ["./.github/workflows/x.yml", { kind: "local", owner: "", repo: "", subpath: ".github/workflows/x.yml", ref: "" }],
    ["docker://alpine:3.19", { kind: "docker", owner: "", repo: "alpine:3.19", subpath: "", ref: "" }],
  ];
  for (const [text, want] of cases) {
    it(`reads ${text}`, () => {
      expect(parseUses(text)).toEqual(want);
    });
  }

  for (const bad of ["", "checkout@v4", "a//b@v1", "a/b/../c@v1", "a b/c@v1", "/a/b@v1", "@v1"]) {
    it(`calls ${JSON.stringify(bad)} invalid`, () => {
      expect(parseUses(bad).kind).toBe("invalid");
    });
  }

  it("takes the part after the last @ as the ref", () => {
    expect(parseUses("a/b@c@d").ref).toBe("d");
  });
});

describe("expressionsIn, isCommitSha and allSteps", () => {
  it("lists each ${{ }} expression, trimmed, in order", () => {
    expect(expressionsIn("a ${{ x.y }} b ${{secrets.T}} ${{ a == 'b' && c }}")).toEqual(["x.y", "secrets.T", "a == 'b' && c"]);
    expect(expressionsIn("no expression")).toEqual([]);
    expect(expressionsIn("${{ unclosed")).toEqual([]);
  });

  it("reads an expression that runs over lines", () => {
    expect(expressionsIn("${{\n  a.b\n}}")).toEqual(["a.b"]);
  });

  it("accepts only a full lowercase hex hash as a commit", () => {
    expect(isCommitSha("0123456789abcdef0123456789abcdef01234567")).toBe(true);
    for (const r of ["v4", "main", "0123456", "0123456789ABCDEF0123456789ABCDEF01234567", "0123456789abcdef0123456789abcdef012345678", "", "g123456789abcdef0123456789abcdef01234567"]) expect(isCommitSha(r), r).toBe(false);
  });

  it("lists every step with its job", () => {
    const w = parseWorkflow("a.yml", SAMPLE);
    expect(allSteps(w).map((x) => `${x.job.id}#${x.step.index}`)).toEqual(["test#1", "test#2", "test#3"]);
  });
});
