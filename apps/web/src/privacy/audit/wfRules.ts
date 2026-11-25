// Rules for workflow files, each reading the model of one workflow and returning findings. A finding is a fact about the
// file ("this job has no timeout", "this step names a secret"), not a verdict: audit/wfRegister.ts lists the findings the
// repository accepts today, with a reason, and the audit test fails on any other. Node only (tests and CI), never shipped.

import { allSteps, expressionsIn, isCommitSha, parseUses, type Perms, type WfJob, type WfStep, type Workflow } from "./wfModel";

export type WfCode =
  | "yaml-problem"
  | "schedule-trigger"
  | "risky-trigger"
  | "no-permissions"
  | "broad-permissions"
  | "write-permission"
  | "unpinned-ref"
  | "mutable-ref"
  | "owner-not-allowed"
  | "docker-action"
  | "invalid-uses"
  | "continue-on-error"
  | "swallowed-failure"
  | "retry"
  | "no-timeout"
  | "injection"
  | "secret-reference"
  | "pipe-to-shell"
  | "unpinned-global-install"
  | "host-not-allowed";

export const WF_CODES: readonly WfCode[] = [
  "yaml-problem",
  "schedule-trigger",
  "risky-trigger",
  "no-permissions",
  "broad-permissions",
  "write-permission",
  "unpinned-ref",
  "mutable-ref",
  "owner-not-allowed",
  "docker-action",
  "invalid-uses",
  "continue-on-error",
  "swallowed-failure",
  "retry",
  "no-timeout",
  "injection",
  "secret-reference",
  "pipe-to-shell",
  "unpinned-global-install",
  "host-not-allowed",
];

export interface WfFinding {
  code: WfCode;
  path: string;
  line: number;
  /** The job the finding is in, when it is in one. */
  job?: string;
  detail: string;
}

export interface WfPolicy {
  /** Owners whose actions may be pinned by version tag. Anyone else must pin to a full commit hash. */
  firstPartyOwners: readonly string[];
  /** Owners whose actions may be used at all. */
  allowedOwners: readonly string[];
  /** Secret names a workflow may name. */
  allowedSecrets: readonly string[];
  /** Hosts a run step may name in an address. */
  allowedHosts: readonly string[];
  /** Triggers that run with more rights than the change that started them. */
  riskyTriggers: readonly string[];
  /** Refs that move: a branch name stands for whatever is on it today. */
  movingRefs: readonly string[];
}

export const WF_POLICY: WfPolicy = {
  firstPartyOwners: ["actions"],
  allowedOwners: ["actions", "ALENZACODES"],
  allowedSecrets: ["GITHUB_TOKEN"],
  allowedHosts: ["github.com", "api.github.com", "registry.npmjs.org", "nodejs.org"],
  riskyTriggers: ["pull_request_target", "workflow_run", "issue_comment"],
  movingRefs: ["main", "master", "latest", "dev", "develop", "head", "trunk", "stable", "next"],
};

type Add = (code: WfCode, line: number, detail: string, job?: string) => void;

const UNTRUSTED = /\b(?:github\.event\.|github\.head_ref|github\.ref_name|inputs\.)/;

/** The one-line commands of a run text, with the line each starts on counted from the step's line. */
function runLines(step: WfStep): Array<{ text: string; line: number }> {
  if (step.run === null) return [];
  const lines = step.run.split("\n");
  // A block run starts on the line after its key; a one-line run starts on the key's line.
  const base = step.run.includes("\n") || /\n$/.test(step.run) ? 1 : 0;
  return lines.map((t, i) => ({ text: t, line: step.line + base + i }));
}

function permissionFindings(w: Workflow, add: Add): void {
  const check = (p: Perms | null, line: number, where: string, job?: string): void => {
    if (p === null) return;
    if (p.kind === "all") add("broad-permissions", line, `${where}: ${p.level}`, job);
    else if (p.kind === "unreadable") add("broad-permissions", line, `${where}: permissions are not a word or a list of scopes`, job);
    else for (const [scope, level] of Object.entries(p.scopes)) if (level === "write") add("write-permission", line, `${where}: ${scope}: write`, job);
  };
  check(w.permissions, w.permissionsLine ?? 1, "workflow");
  for (const j of w.jobs) check(j.permissions, j.line, `job ${j.id}`, j.id);
  for (const j of w.jobs) if (w.permissions === null && j.permissions === null) add("no-permissions", j.line, `job ${j.id} and its workflow set no permissions, so the token has the repository default`, j.id);
}

function usesFindings(j: WfJob, policy: WfPolicy, add: Add, uses: string | null, line: number): void {
  if (uses === null) return;
  const u = parseUses(uses);
  if (u.kind === "local") return;
  if (u.kind === "docker") {
    add("docker-action", line, uses, j.id);
    return;
  }
  if (u.kind === "invalid") {
    add("invalid-uses", line, uses, j.id);
    return;
  }
  if (!policy.allowedOwners.includes(u.owner)) add("owner-not-allowed", line, `${u.owner}/${u.repo}`, j.id);
  if (u.ref === "" || policy.movingRefs.includes(u.ref.toLowerCase())) add("unpinned-ref", line, uses, j.id);
  else if (!isCommitSha(u.ref) && !policy.firstPartyOwners.includes(u.owner)) add("mutable-ref", line, uses, j.id);
  if (/retry/i.test(`${u.owner}/${u.repo}/${u.subpath}`)) add("retry", line, uses, j.id);
}

function runFindings(j: WfJob, s: WfStep, policy: WfPolicy, add: Add): void {
  for (const l of runLines(s)) {
    if (/\b(?:curl|wget)\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/.test(l.text)) add("pipe-to-shell", l.line, l.text.trim().slice(0, 80), j.id);
    if (/\|\|\s*(?:true\b|exit\s+0\b|:(?=\s|$))|\bset\s+\+e\b|;\s*true\s*$/.test(l.text)) add("swallowed-failure", l.line, l.text.trim().slice(0, 80), j.id);
    const g = /\bnpm\s+(?:i|install|add)\s+(?:(?:-g|--global)\s+)(.*)$/.exec(l.text);
    const g2 = /\bnpm\s+(?:i|install|add)\s+(.*?)\s(?:-g|--global)\b/.exec(l.text);
    for (const tail of [g?.[1], g2?.[1]]) {
      if (tail === undefined) continue;
      for (const tok of tail.split(/\s+/).filter((t) => t !== "" && !t.startsWith("-") && !/^[|&;<>]/.test(t))) {
        if (!/^@?[^@\s]+@[^@\s]+$/.test(tok)) add("unpinned-global-install", l.line, tok, j.id);
      }
    }
    for (const m of l.text.matchAll(/\bhttps?:\/\/([^\s/:"'`)]+)/g)) {
      const host = (m[1] ?? "").toLowerCase();
      if (host.includes("$") || host === "") continue;
      if (!policy.allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) add("host-not-allowed", l.line, host, j.id);
    }
  }
  if (s.run !== null) {
    for (const e of expressionsIn(s.run)) if (UNTRUSTED.test(e)) add("injection", s.line, e.slice(0, 80), j.id);
  }
}

function secretFindings(w: Workflow, policy: WfPolicy, add: Add): void {
  const seen = (text: string, line: number, job?: string): void => {
    for (const e of expressionsIn(text)) {
      for (const m of e.matchAll(/\bsecrets\.([A-Za-z_][\w]*)/g)) {
        const name = m[1] ?? "";
        if (!policy.allowedSecrets.includes(name)) add("secret-reference", line, name, job);
      }
      if (/\bsecrets\s*\[|\btoJSON\(\s*secrets\s*\)|\bsecrets\s*(?:\}|$)/.test(e)) add("secret-reference", line, "all secrets", job);
    }
  };
  for (const v of Object.values(w.env)) seen(v, w.permissionsLine ?? 1);
  for (const { job, step } of allSteps(w)) {
    if (step.run !== null) seen(step.run, step.line, job.id);
    for (const v of [...Object.values(step.with), ...Object.values(step.env)]) seen(v, step.line, job.id);
  }
}

/** Every finding for one workflow, in the order of line, then code, then detail. */
export function auditWorkflow(w: Workflow, policy: WfPolicy = WF_POLICY): WfFinding[] {
  const out: WfFinding[] = [];
  const add: Add = (code, line, detail, job) => void out.push({ code, path: w.path, line, ...(job === undefined ? {} : { job }), detail });
  for (const p of w.problems) add("yaml-problem", p.line, p.message);
  for (const t of w.triggers) {
    const line = w.triggerLines[t] ?? 1;
    if (t === "schedule") add("schedule-trigger", line, "the workflow runs on a schedule");
    if (policy.riskyTriggers.includes(t)) add("risky-trigger", line, t);
  }
  permissionFindings(w, add);
  for (const j of w.jobs) {
    if (j.uses === null && j.timeoutMinutes === null) add("no-timeout", j.line, `job ${j.id} has no timeout-minutes`, j.id);
    if (j.continueOnError !== null && j.continueOnError.trim() !== "false") add("continue-on-error", j.line, `job ${j.id}: ${j.continueOnError}`, j.id);
    usesFindings(j, policy, add, j.uses, j.line);
    for (const s of j.steps) {
      usesFindings(j, policy, add, s.uses, s.line);
      runFindings(j, s, policy, add);
      if (s.continueOnError !== null && s.continueOnError.trim() !== "false") add("continue-on-error", s.line, `step ${s.index} of ${j.id}: ${s.continueOnError}`, j.id);
    }
  }
  secretFindings(w, policy, add);
  const order = (f: WfFinding): string => `${String(f.line).padStart(8, "0")}\u0000${f.code}\u0000${f.job ?? ""}\u0000${f.detail}`;
  return out.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
}

export function formatWfFinding(f: WfFinding): string {
  return `${f.code} ${f.path}:${f.line} ${f.detail}`;
}
