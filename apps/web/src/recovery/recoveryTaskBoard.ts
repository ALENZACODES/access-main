import type { LocalPackRecord } from "./packInventory";
import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** A local planning aid, never a command queue. Nothing here changes a pack. */
export type TaskKind = "inspect" | "download" | "source" | "storage" | "export";
export type TaskState = "pending" | "in-progress" | "paused" | "closed";
export type EvidenceTier = "public" | "self-reported" | "operator-note" | "unknown";
export type TaskRisk = "blocked" | "attention" | "unknown";

export interface TaskProvenance {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: EvidenceTier;
}

export interface RecoveryTask {
  readonly id: string;
  readonly packId: string;
  readonly kind: TaskKind;
  readonly state: TaskState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly note: string;
  readonly provenance: TaskProvenance | null;
}

export interface TaskBoard {
  readonly format: "local-recovery-board";
  readonly version: 1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tasks: readonly RecoveryTask[];
}

export type BoardIssue =
  | "json" | "size" | "shape" | "format" | "date" | "future"
  | "limit" | "duplicate" | "id" | "pack" | "kind" | "state"
  | "chronology" | "text" | "source" | "licence" | "tier" | "unknown-field";

export interface BoardFinding {
  readonly path: string;
  readonly issue: BoardIssue;
}

export type BoardParseResult =
  | { readonly ok: true; readonly board: TaskBoard; readonly findings: readonly [] }
  | { readonly ok: false; readonly board: null; readonly findings: readonly BoardFinding[] };

export interface BoardLimits {
  readonly today: string;
  readonly maxBytes?: number;
  readonly maxTasks?: number;
}

export interface TaskAssessment {
  readonly task: RecoveryTask;
  readonly risk: TaskRisk;
  readonly reasons: readonly string[];
  readonly observedPackState: LocalPackRecord["state"] | "unknown";
}

const MAX_BYTES = 256 * 1024;
const MAX_TASKS = 200;
const MAX_NOTE = 1200;
const MAX_SOURCE = 180;
const taskKinds: readonly TaskKind[] = ["inspect", "download", "source", "storage", "export"];
const taskStates: readonly TaskState[] = ["pending", "in-progress", "paused", "closed"];
const evidenceTiers: readonly EvidenceTier[] = ["public", "self-reported", "operator-note", "unknown"];
const headerKeys = ["format", "version", "createdAt", "updatedAt", "tasks"];
const taskKeys = ["id", "packId", "kind", "state", "createdAt", "updatedAt", "note", "provenance"];
const provenanceKeys = ["name", "licence", "date", "tier"];

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(value, key));
}

function safeText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit &&
    !/[\p{Cc}\p{Cf}]/u.test(value) && !/[<>]/u.test(value);
}

function calendar(value: unknown, today: number): value is string {
  return typeof value === "string" &&
    (parseCalendarDate(value) ?? Number.POSITIVE_INFINITY) <= today;
}

function timestamp(value: unknown, today: number): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value &&
    epoch < today + 86_400_000;
}

function isKind(value: unknown): value is TaskKind {
  return typeof value === "string" && taskKinds.some((item) => item === value);
}

function isState(value: unknown): value is TaskState {
  return typeof value === "string" && taskStates.some((item) => item === value);
}

function isTier(value: unknown): value is EvidenceTier {
  return typeof value === "string" && evidenceTiers.some((item) => item === value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
}

function validateProvenance(value: unknown, path: string, today: number, findings: BoardFinding[]): void {
  if (value === null) return;
  if (!plainObject(value) || !exactKeys(value, provenanceKeys)) {
    findings.push({ path, issue: "source" });
    return;
  }
  if (!safeText(value.name, MAX_SOURCE) || !value.name.trim()) findings.push({ path: `${path}.name`, issue: "source" });
  if (typeof value.licence !== "string" || !isOpenLicence(value.licence)) {
    findings.push({ path: `${path}.licence`, issue: "licence" });
  }
  if (!calendar(value.date, today)) findings.push({ path: `${path}.date`, issue: "date" });
  if (!isTier(value.tier)) findings.push({ path: `${path}.tier`, issue: "tier" });
}

function validateTask(value: unknown, path: string, today: number, findings: BoardFinding[]): void {
  if (!plainObject(value) || !exactKeys(value, taskKeys)) {
    findings.push({ path, issue: "shape" });
    return;
  }
  if (!validId(value.id)) findings.push({ path: `${path}.id`, issue: "id" });
  if (!isSafePackId(value.packId)) findings.push({ path: `${path}.packId`, issue: "pack" });
  if (!isKind(value.kind)) findings.push({ path: `${path}.kind`, issue: "kind" });
  if (!isState(value.state)) findings.push({ path: `${path}.state`, issue: "state" });
  if (!timestamp(value.createdAt, today)) findings.push({ path: `${path}.createdAt`, issue: "date" });
  if (!timestamp(value.updatedAt, today)) findings.push({ path: `${path}.updatedAt`, issue: "date" });
  if (typeof value.createdAt === "string" && typeof value.updatedAt === "string" && value.createdAt > value.updatedAt) {
    findings.push({ path: `${path}.updatedAt`, issue: "chronology" });
  }
  if (!safeText(value.note, MAX_NOTE)) findings.push({ path: `${path}.note`, issue: "text" });
  validateProvenance(value.provenance, `${path}.provenance`, today, findings);
}

/** Never infer a missing field or accept unknown JSON fields. */
export function parseTaskBoard(raw: string, limits: BoardLimits): BoardParseResult {
  const findings: BoardFinding[] = [];
  const today = parseCalendarDate(limits.today);
  if (today === null) return { ok: false, board: null, findings: [{ path: "today", issue: "date" }] };
  const maxBytes = limits.maxBytes ?? MAX_BYTES;
  const maxTasks = limits.maxTasks ?? MAX_TASKS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxTasks) || maxTasks < 1) {
    return { ok: false, board: null, findings: [{ path: "limits", issue: "limit" }] };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, board: null, findings: [{ path: "$", issue: "size" }] };
  }
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch { return { ok: false, board: null, findings: [{ path: "$", issue: "json" }] }; }
  if (!plainObject(value) || !exactKeys(value, headerKeys)) {
    return { ok: false, board: null, findings: [{ path: "$", issue: "shape" }] };
  }
  if (value.format !== "local-recovery-board" || value.version !== 1) findings.push({ path: "format", issue: "format" });
  if (!timestamp(value.createdAt, today)) findings.push({ path: "createdAt", issue: "date" });
  if (!timestamp(value.updatedAt, today)) findings.push({ path: "updatedAt", issue: "date" });
  if (typeof value.createdAt === "string" && typeof value.updatedAt === "string" && value.createdAt > value.updatedAt) {
    findings.push({ path: "updatedAt", issue: "chronology" });
  }
  if (!Array.isArray(value.tasks)) findings.push({ path: "tasks", issue: "shape" });
  else if (value.tasks.length > maxTasks) findings.push({ path: "tasks", issue: "limit" });
  else {
    const ids = new Set<string>();
    for (const [index, task] of value.tasks.entries()) {
      const path = `tasks[${index}]`;
      validateTask(task, path, today, findings);
      if (plainObject(task) && typeof task.id === "string") {
        if (ids.has(task.id)) findings.push({ path: `${path}.id`, issue: "duplicate" });
        ids.add(task.id);
      }
      if (plainObject(task) && typeof task.updatedAt === "string" &&
        typeof value.updatedAt === "string" && task.updatedAt > value.updatedAt) {
        findings.push({ path: `${path}.updatedAt`, issue: "chronology" });
      }
    }
  }
  if (findings.length > 0) return { ok: false, board: null, findings };
  return { ok: true, board: value as unknown as TaskBoard, findings: [] };
}

export function newTaskBoard(now: string): TaskBoard {
  return { format: "local-recovery-board", version: 1, createdAt: now, updatedAt: now, tasks: [] };
}

export type BoardChange =
  | { readonly ok: true; readonly board: TaskBoard }
  | { readonly ok: false; readonly reason: "invalid" | "duplicate" | "missing" | "transition" | "limit" };

function commit(board: TaskBoard, tasks: readonly RecoveryTask[], now: string, today: string): BoardChange {
  const next: TaskBoard = { ...board, updatedAt: now, tasks };
  const result = parseTaskBoard(JSON.stringify(next), { today });
  return result.ok ? { ok: true, board: result.board } : { ok: false, reason: "invalid" };
}

export function addRecoveryTask(
  board: TaskBoard, input: Omit<RecoveryTask, "createdAt" | "updatedAt" | "state">,
  now: string, today: string,
): BoardChange {
  if (board.tasks.length >= MAX_TASKS) return { ok: false, reason: "limit" };
  if (board.tasks.some((task) => task.id === input.id)) return { ok: false, reason: "duplicate" };
  const task: RecoveryTask = { ...input, createdAt: now, updatedAt: now, state: "pending" };
  return commit(board, [...board.tasks, task], now, today);
}

export function updateRecoveryTask(
  board: TaskBoard, id: string, next: TaskState, now: string, today: string,
): BoardChange {
  const current = board.tasks.find((task) => task.id === id);
  if (current === undefined) return { ok: false, reason: "missing" };
  const allowed: Record<TaskState, readonly TaskState[]> = {
    pending: ["in-progress", "paused", "closed"],
    "in-progress": ["paused", "closed"],
    paused: ["in-progress", "closed"],
    closed: [],
  };
  if (!allowed[current.state].includes(next)) return { ok: false, reason: "transition" };
  return commit(board, board.tasks.map((task) => task.id === id ? { ...task, state: next, updatedAt: now } : task), now, today);
}

export function assessRecoveryTasks(
  board: TaskBoard, packs: readonly LocalPackRecord[],
): readonly TaskAssessment[] {
  const byId = new Map(packs.map((pack) => [pack.id, pack]));
  return board.tasks.map((task) => {
    const observed = byId.get(task.packId);
    const reasons: string[] = [];
    if (observed === undefined || observed.state === "unknown") reasons.push("pack-unknown");
    if (observed?.state === "corrupt") reasons.push("pack-damaged");
    if (observed?.state === "absent") reasons.push("pack-absent");
    if (task.provenance === null) reasons.push("source-unknown");
    if (task.provenance?.tier === "unknown") reasons.push("tier-unknown");
    const risk: TaskRisk = reasons.includes("pack-damaged") ? "blocked" : reasons.length > 0 ? "unknown" : "attention";
    return { task, observedPackState: observed?.state ?? "unknown", risk, reasons };
  });
}

export interface BoardMerge {
  readonly accepted: readonly RecoveryTask[];
  readonly identical: readonly string[];
  readonly conflicts: readonly string[];
}

/** Preview-only. Imported tasks cannot overwrite tasks with the same id. */
export function previewTaskMerge(current: TaskBoard, incoming: TaskBoard): BoardMerge {
  const existing = new Map(current.tasks.map((task) => [task.id, task]));
  const accepted: RecoveryTask[] = [];
  const identical: string[] = [];
  const conflicts: string[] = [];
  for (const task of incoming.tasks) {
    const previous = existing.get(task.id);
    if (previous === undefined) accepted.push(task);
    else if (JSON.stringify(previous) === JSON.stringify(task)) identical.push(task.id);
    else conflicts.push(task.id);
  }
  return { accepted, identical, conflicts };
}

export function applyTaskMerge(current: TaskBoard, incoming: TaskBoard, now: string, today: string): BoardChange {
  const preview = previewTaskMerge(current, incoming);
  if (preview.conflicts.length > 0) return { ok: false, reason: "duplicate" };
  if (current.tasks.length + preview.accepted.length > MAX_TASKS) return { ok: false, reason: "limit" };
  return commit(current, [...current.tasks, ...preview.accepted], now, today);
}

export function exportTaskBoard(board: TaskBoard, today: string): string | null {
  const text = JSON.stringify(board, null, 2);
  return parseTaskBoard(text, { today }).ok ? `${text}\n` : null;
}

export function countTaskStates(board: TaskBoard): Readonly<Record<TaskState, number>> {
  const counts: Record<TaskState, number> = { pending: 0, "in-progress": 0, paused: 0, closed: 0 };
  for (const task of board.tasks) counts[task.state] += 1;
  return counts;
}
