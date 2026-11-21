// A workflow file as a plain object: when it runs, what the token may do, and each job with its steps. Built from the
// reader in wfYaml.ts; a field the file does not have is null, an empty list or an empty record, never a default made
// up here. Node only (tests and CI), never shipped.

import { get, items, keys, lineOfKey, parseYaml, text, texts, type YNode, type YProblem } from "./wfYaml";

/** What the token may do: "read-all", "write-all", or a list of scopes with their level. An empty list of scopes means no access. */
export type Perms = { kind: "all"; level: "read-all" | "write-all" } | { kind: "scopes"; scopes: Record<string, string> } | { kind: "unreadable"; text: string };

export interface WfStep {
  /** 1-based position among the steps of the job. */
  index: number;
  line: number;
  name: string | null;
  uses: string | null;
  run: string | null;
  with: Record<string, string>;
  env: Record<string, string>;
  ifCond: string | null;
  continueOnError: string | null;
  timeoutMinutes: number | null;
}

export interface WfJob {
  id: string;
  line: number;
  name: string | null;
  runsOn: string[];
  timeoutMinutes: number | null;
  permissions: Perms | null;
  needs: string[];
  steps: WfStep[];
  continueOnError: string | null;
  ifCond: string | null;
  environment: string | null;
  /** A job that calls another workflow has "uses" and no steps. */
  uses: string | null;
  failFast: string | null;
}

export interface Workflow {
  path: string;
  name: string | null;
  /** The event names under "on", in the order written. */
  triggers: string[];
  /** The line of each trigger, by name. */
  triggerLines: Record<string, number>;
  permissions: Perms | null;
  permissionsLine: number | null;
  env: Record<string, string>;
  jobs: WfJob[];
  problems: YProblem[];
}

function record(node: YNode | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (node === undefined || node.kind !== "map") return out;
  for (const e of node.entries) out[e.key] = e.value.kind === "scalar" ? e.value.text : "";
  return out;
}

/** Permissions as written: a word, or a map of scope to level. A value of another shape is "unreadable". */
export function readPerms(node: YNode | undefined): Perms | null {
  if (node === undefined) return null;
  if (node.kind === "scalar") {
    const t = node.text.trim();
    return t === "read-all" || t === "write-all" ? { kind: "all", level: t } : { kind: "unreadable", text: t };
  }
  if (node.kind === "map") return { kind: "scopes", scopes: record(node) };
  if (node.kind === "null") return { kind: "scopes", scopes: {} };
  return { kind: "unreadable", text: "a list" };
}

const num = (node: YNode | undefined): number | null => {
  const t = text(node);
  if (t === null || !/^\d+(?:\.\d+)?$/.test(t.trim())) return null;
  return Number(t);
};

function step(node: YNode, index: number): WfStep {
  return {
    index,
    line: node.line,
    name: text(get(node, "name")),
    uses: text(get(node, "uses")),
    run: text(get(node, "run")),
    with: record(get(node, "with")),
    env: record(get(node, "env")),
    ifCond: text(get(node, "if")),
    continueOnError: text(get(node, "continue-on-error")),
    timeoutMinutes: num(get(node, "timeout-minutes")),
  };
}

function job(id: string, node: YNode, line: number): WfJob {
  const perms = get(node, "permissions");
  return {
    id,
    line,
    name: text(get(node, "name")),
    runsOn: texts(get(node, "runs-on")),
    timeoutMinutes: num(get(node, "timeout-minutes")),
    permissions: readPerms(perms),
    needs: texts(get(node, "needs")),
    steps: items(get(node, "steps")).map((s, i) => step(s, i + 1)),
    continueOnError: text(get(node, "continue-on-error")),
    ifCond: text(get(node, "if")),
    environment: text(get(node, "environment")) ?? text(get(get(node, "environment"), "name")),
    uses: text(get(node, "uses")),
    failFast: text(get(get(node, "strategy"), "fail-fast")),
  };
}

/** The workflow in the text. A file that is not a map still gives a workflow, with no triggers and no jobs, and the problems. */
export function parseWorkflow(path: string, source: string): Workflow {
  const doc = parseYaml(source);
  const root = doc.root;
  const on = get(root, "on");
  const triggers = on === undefined ? [] : on.kind === "map" ? keys(on) : texts(on);
  const triggerLines: Record<string, number> = {};
  if (on !== undefined && on.kind === "map") for (const e of on.entries) triggerLines[e.key] = e.line;
  else for (const t of triggers) triggerLines[t] = on?.line ?? 0;
  const jobsNode = get(root, "jobs");
  const jobs: WfJob[] = [];
  if (jobsNode !== undefined && jobsNode.kind === "map") for (const e of jobsNode.entries) jobs.push(job(e.key, e.value, e.line));
  return {
    path,
    name: text(get(root, "name")),
    triggers,
    triggerLines,
    permissions: readPerms(get(root, "permissions")),
    permissionsLine: lineOfKey(root, "permissions") ?? null,
    env: record(get(root, "env")),
    jobs,
    problems: doc.problems,
  };
}

export type UsesKind = "local" | "docker" | "remote" | "invalid";

export interface UsesRef {
  kind: UsesKind;
  owner: string;
  repo: string;
  /** The folder inside the repository, for an action that lives in a sub-folder. */
  subpath: string;
  /** What follows "@", or "" when there is none. */
  ref: string;
}

/** An action reference: "./local", "docker://image", "owner/repo/path@ref". */
export function parseUses(value: string): UsesRef {
  const v = value.trim();
  const none = { owner: "", repo: "", subpath: "", ref: "" };
  if (v.startsWith("./")) return { kind: "local", ...none, subpath: v.slice(2) };
  if (v.startsWith("docker://")) return { kind: "docker", ...none, repo: v.slice("docker://".length) };
  const at = v.lastIndexOf("@");
  const path = at < 0 ? v : v.slice(0, at);
  const ref = at < 0 ? "" : v.slice(at + 1);
  const parts = path.split("/");
  const owner = parts[0] ?? "";
  const repo = parts[1] ?? "";
  if (!/^[A-Za-z0-9][\w.-]*$/.test(owner) || !/^[\w.-]+$/.test(repo) || parts.slice(2).some((p) => p === "" || p === "..")) return { kind: "invalid", ...none, ref };
  return { kind: "remote", owner, repo, subpath: parts.slice(2).join("/"), ref };
}

/** The expressions written as ${{ ... }} in a text, trimmed, in order. */
export function expressionsIn(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) out.push((m[1] ?? "").trim());
  return out;
}

/** Whether a ref is a full commit hash. */
export const isCommitSha = (ref: string): boolean => /^[0-9a-f]{40}$/.test(ref);

/** Every step of every job, with its job. */
export function allSteps(w: Workflow): Array<{ job: WfJob; step: WfStep }> {
  return w.jobs.flatMap((j) => j.steps.map((s) => ({ job: j, step: s })));
}
