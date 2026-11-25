// The workflow files, written down: when each runs, what its token may do, and its jobs with their time limits; and the
// findings from audit/wfRules.ts that the repository accepts today, each with a reason. audit/wfCompare.ts compares this
// with the files, and audit/wf.repo.audit.test.ts fails when they disagree. A workflow that is added, or one whose
// triggers, permissions, jobs or time limits change, fails until a person changes the row. A row records what the file
// says today. It does not say the workflow is right, and it does not say what a job does.

import type { Perms } from "./wfModel";
import { WF_CODES, type WfCode } from "./wfRules";

/** "active": under .github/workflows, so GitHub runs it. "staged": kept elsewhere (deploy/), so GitHub never runs it. */
export type WfState = "active" | "staged";

export interface WfJobRow {
  id: string;
  /** The timeout-minutes of the job, or null when it has none. */
  timeout: number | null;
}

export interface WfRow {
  path: string;
  state: WfState;
  /** The events under "on". */
  triggers: string[];
  /** What the token may do, as written by permString: "unset", "none", "read-all", "write-all" or "scope:level,scope:level". */
  permissions: string;
  jobs: WfJobRow[];
  note: string;
}

export interface WfAcceptRow {
  path: string;
  code: WfCode;
  /** How many findings of this code the file has. */
  count: number;
  reason: string;
}

/**
 * The permissions of a workflow in one fixed form. A workflow with no permissions block is "unset", which means the
 * repository's default token; a block with no scopes is "none".
 */
export function permString(p: Perms | null): string {
  if (p === null) return "unset";
  if (p.kind === "all") return p.level;
  if (p.kind === "unreadable") return `unreadable:${p.text}`;
  const parts = Object.entries(p.scopes)
    .map(([k, v]) => `${k}:${v}`)
    .sort();
  return parts.length === 0 ? "none" : parts.join(",");
}

export const WF_REGISTER: readonly WfRow[] = [
  { path: ".github/workflows/advocacy.yml", state: "active", triggers: ["pull_request"], permissions: "contents:read", jobs: [{ id: "advocacy", timeout: 10 }], note: "Runs the advocacy package's checks on a pull request." },
  { path: ".github/workflows/caregiver.yml", state: "active", triggers: ["pull_request"], permissions: "contents:read", jobs: [{ id: "test", timeout: 10 }], note: "Runs the caregiver package's checks on a pull request." },
  {
    path: ".github/workflows/ci.yml",
    state: "active",
    triggers: ["pull_request", "push"],
    permissions: "contents:read",
    jobs: [
      { id: "test", timeout: 40 },
      { id: "e2e-perf", timeout: 40 },
      { id: "e2e", timeout: 40 },
      { id: "e2e-packages", timeout: 40 },
    ],
    note: "The main checks, on every pull request and every push to main.",
  },
  { path: ".github/workflows/controls.yml", state: "active", triggers: ["pull_request"], permissions: "contents:read", jobs: [{ id: "controls", timeout: 15 }], note: "Runs the controls package's checks on a pull request." },
  { path: ".github/workflows/schema.yml", state: "active", triggers: ["pull_request"], permissions: "unset", jobs: [{ id: "test", timeout: null }], note: "Runs the schema package's tests on a pull request." },
  {
    path: "deploy/pages.yml",
    state: "staged",
    triggers: ["workflow_dispatch"],
    permissions: "contents:read,id-token:write,pages:write",
    jobs: [
      { id: "build", timeout: 30 },
      { id: "deploy", timeout: 10 },
    ],
    note: "Publishes the App to GitHub Pages. Kept outside .github/workflows, so GitHub does not run it, until the owner asks.",
  },
];

export const WF_ACCEPTED: readonly WfAcceptRow[] = [
  { path: ".github/workflows/schema.yml", code: "no-permissions", count: 1, reason: "The file sets no permissions, so its token has the repository default. Accepted as it stands; adding contents: read is a change to the file." },
  { path: ".github/workflows/schema.yml", code: "no-timeout", count: 1, reason: "The job has no timeout-minutes, so it has the default limit. Accepted as it stands." },
  { path: "deploy/pages.yml", code: "write-permission", count: 2, reason: "Publishing to Pages needs pages: write and id-token: write. The file is staged outside .github/workflows and does not run." },
];

/** The findings that can be accepted with a reason. Every other code is a rule of the repository and cannot be listed. */
export const ACCEPTABLE_CODES: readonly WfCode[] = ["no-permissions", "no-timeout", "write-permission", "broad-permissions", "mutable-ref", "unpinned-global-install", "host-not-allowed", "risky-trigger"];

export type WfProblemCode =
  | "bad-path"
  | "duplicate-path"
  | "wrong-place"
  | "bad-state"
  | "scheduled"
  | "no-triggers"
  | "bad-permissions"
  | "no-jobs"
  | "bad-job"
  | "duplicate-job"
  | "bad-timeout"
  | "empty-note"
  | "bad-code"
  | "not-acceptable"
  | "bad-count"
  | "empty-reason"
  | "duplicate-accept"
  | "unregistered-path";

export interface WfProblem {
  code: WfProblemCode;
  path: string;
  detail?: string;
}

const ACTIVE_RE = /^\.github\/workflows\/[\w.-]+\.ya?ml$/;
const STAGED_RE = /^deploy\/[\w.-]+\.ya?ml$/;
const PERM_RE = /^(?:unset|none|read-all|write-all|(?:[a-z-]+:(?:read|write|none))(?:,[a-z-]+:(?:read|write|none))*)$/;

export function validateWf(rows: readonly WfRow[], accepted: readonly WfAcceptRow[] = []): WfProblem[] {
  const out: WfProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { path: r.path };
    if (!ACTIVE_RE.test(r.path) && !STAGED_RE.test(r.path)) out.push({ code: "bad-path", ...at });
    if (seen.has(r.path)) out.push({ code: "duplicate-path", ...at });
    seen.add(r.path);
    if (r.state !== "active" && r.state !== "staged") out.push({ code: "bad-state", ...at, detail: String(r.state) });
    else if ((r.state === "active") !== ACTIVE_RE.test(r.path)) out.push({ code: "wrong-place", ...at, detail: r.state });
    if (r.triggers.length === 0) out.push({ code: "no-triggers", ...at });
    if (r.triggers.includes("schedule")) out.push({ code: "scheduled", ...at });
    if (!PERM_RE.test(r.permissions)) out.push({ code: "bad-permissions", ...at, detail: r.permissions });
    if (r.jobs.length === 0) out.push({ code: "no-jobs", ...at });
    const ids = new Set<string>();
    for (const j of r.jobs) {
      if (!/^[A-Za-z_][\w-]*$/.test(j.id)) out.push({ code: "bad-job", ...at, detail: j.id });
      if (ids.has(j.id)) out.push({ code: "duplicate-job", ...at, detail: j.id });
      ids.add(j.id);
      if (j.timeout !== null && (!Number.isInteger(j.timeout) || j.timeout < 1)) out.push({ code: "bad-timeout", ...at, detail: `${j.id}: ${j.timeout}` });
    }
    if (r.note.trim() === "") out.push({ code: "empty-note", ...at });
  }
  const keys = new Set<string>();
  for (const a of accepted) {
    const at = { path: a.path };
    if (!seen.has(a.path)) out.push({ code: "unregistered-path", ...at });
    if (!WF_CODES.includes(a.code)) out.push({ code: "bad-code", ...at, detail: String(a.code) });
    else if (!ACCEPTABLE_CODES.includes(a.code)) out.push({ code: "not-acceptable", ...at, detail: a.code });
    if (!Number.isInteger(a.count) || a.count < 1) out.push({ code: "bad-count", ...at, detail: `${a.code}: ${a.count}` });
    if (a.reason.trim() === "") out.push({ code: "empty-reason", ...at, detail: a.code });
    const k = `${a.path}\u0000${a.code}`;
    if (keys.has(k)) out.push({ code: "duplicate-accept", ...at, detail: a.code });
    keys.add(k);
  }
  const key = (x: WfProblem): string => `${x.path}\u0000${x.code}\u0000${x.detail ?? ""}`;
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertWf(rows: readonly WfRow[], accepted: readonly WfAcceptRow[] = []): void {
  const p = validateWf(rows, accepted);
  if (p.length > 0) throw new Error(`Workflow register is wrong: ${p.map((x) => `${x.code} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface WfCounts {
  files: number;
  active: number;
  staged: number;
  jobs: number;
  /** Jobs with no timeout-minutes. */
  noTimeout: number;
  accepted: number;
}

export function wfCounts(rows: readonly WfRow[], accepted: readonly WfAcceptRow[]): WfCounts {
  const jobs = rows.flatMap((r) => r.jobs);
  return {
    files: rows.length,
    active: rows.filter((r) => r.state === "active").length,
    staged: rows.filter((r) => r.state === "staged").length,
    jobs: jobs.length,
    noTimeout: jobs.filter((j) => j.timeout === null).length,
    accepted: accepted.reduce((n, a) => n + a.count, 0),
  };
}
