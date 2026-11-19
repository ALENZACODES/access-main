import { describe, expect, it } from "vitest";
import type { LocalPackRecord } from "./packInventory";
import {
  addRecoveryTask,
  applyTaskMerge,
  assessRecoveryTasks,
  countTaskStates,
  exportTaskBoard,
  newTaskBoard,
  parseTaskBoard,
  previewTaskMerge,
  updateRecoveryTask,
  type RecoveryTask,
  type TaskBoard,
} from "./recoveryTaskBoard";

const today = "2026-11-19";
const t0 = "2026-11-19T01:00:00.000Z";
const t1 = "2026-11-19T02:00:00.000Z";
const source = { name: "Community directory", licence: "CC-BY-4.0", date: today, tier: "public" as const };

function task(overrides: Partial<RecoveryTask> = {}): RecoveryTask {
  return {
    id: "task_one", packId: "toronto", kind: "inspect", state: "pending",
    createdAt: t0, updatedAt: t0, note: "Inspect stored data", provenance: source,
    ...overrides,
  };
}

function board(tasks: readonly RecoveryTask[] = []): TaskBoard {
  return { format: "local-recovery-board", version: 1, createdAt: t0, updatedAt: t1, tasks };
}

function parse(value: unknown) {
  return parseTaskBoard(JSON.stringify(value), { today });
}

const records: readonly LocalPackRecord[] = [
  { id: "toronto", state: "unknown" },
  { id: "ottawa", state: "ready", source: { name: "Open data", licence: "CC-BY-4.0", date: today } },
  { id: "london", state: "corrupt", problem: "digest-mismatch" },
  { id: "windsor", state: "absent", problem: "not-installed" },
];

describe("local recovery task board parsing", () => {
  it("accepts a fully formed document", () => {
    const result = parse(board([task()]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.board.tasks).toHaveLength(1);
  });

  it("accepts explicit unknown provenance without making up a source", () => {
    const result = parse(board([task({ provenance: null })]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.board.tasks[0]?.provenance).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expect(parseTaskBoard("{", { today }).ok).toBe(false);
  });

  it("rejects byte budgets exceeded by multi-byte text", () => {
    const input = JSON.stringify(board([task({ note: "é".repeat(80) })]));
    expect(parseTaskBoard(input, { today, maxBytes: 40 }).ok).toBe(false);
  });

  it("rejects invalid validation limits", () => {
    expect(parseTaskBoard("{}", { today, maxBytes: -1 }).ok).toBe(false);
    expect(parseTaskBoard("{}", { today, maxTasks: 0 }).ok).toBe(false);
    expect(parseTaskBoard("{}", { today: "yesterday" }).ok).toBe(false);
  });

  it("rejects unknown document fields", () => {
    expect(parse({ ...board(), extra: "x" }).ok).toBe(false);
  });

  it("rejects missing document fields", () => {
    const { tasks: unused, ...rest } = board();
    expect(unused).toEqual([]);
    expect(parse(rest).ok).toBe(false);
  });

  it("rejects unsupported versions", () => {
    expect(parse({ ...board(), version: 2 }).ok).toBe(false);
  });

  it("rejects non-array tasks", () => {
    expect(parse({ ...board(), tasks: {} }).ok).toBe(false);
  });

  it("rejects duplicate IDs", () => {
    expect(parse(board([task(), task()])).ok).toBe(false);
  });

  it("rejects more tasks than the supplied cap", () => {
    expect(parseTaskBoard(JSON.stringify(board([task()])), { today, maxTasks: 0 }).ok).toBe(false);
    expect(parseTaskBoard(JSON.stringify(board([task()])), { today, maxTasks: 1 }).ok).toBe(true);
  });

  it.each(["", "../data", "bad space", "x/y", ".", ".."])("rejects unsafe pack IDs: %s", (packId: string) => {
    expect(parse(board([task({ packId })])).ok).toBe(false);
  });

  it.each(["", "id with spaces", "/etc", "a".repeat(90)])("rejects unsafe task IDs: %s", (id: string) => {
    expect(parse(board([task({ id })])).ok).toBe(false);
  });

  it.each(["other", "", "delete", "resume"])("rejects unsupported action: %s", (kind: string) => {
    expect(parse(board([task({ kind: kind as RecoveryTask["kind"] })])).ok).toBe(false);
  });

  it.each(["ready", "downloaded", "unknown", "", "running"])("rejects unsupported task state: %s", (state: string) => {
    expect(parse(board([task({ state: state as RecoveryTask["state"] })])).ok).toBe(false);
  });

  it("rejects extra fields on individual tasks", () => {
    expect(parse(board([{ ...task(), unexpected: true } as unknown as RecoveryTask])).ok).toBe(false);
  });

  it("rejects missing task fields", () => {
    const { note: unused, ...rest } = task();
    expect(unused).toBe("Inspect stored data");
    expect(parse(board([rest as RecoveryTask])).ok).toBe(false);
  });

  it("rejects unexpected provenance fields", () => {
    expect(parse(board([task({ provenance: { ...source, hidden: "x" } as unknown as RecoveryTask["provenance"] })])).ok).toBe(false);
  });

  it("rejects unavailable licence types", () => {
    expect(parse(board([task({ provenance: { ...source, licence: "private" } })])).ok).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(parse(board([task({ provenance: { ...source, date: "2026-02-31" } })])).ok).toBe(false);
  });

  it("rejects future provenance dates", () => {
    expect(parse(board([task({ provenance: { ...source, date: "2099-01-01" } })])).ok).toBe(false);
  });

  it("rejects unknown evidence tier identifiers", () => {
    expect(parse(board([task({ provenance: { ...source, tier: "official" as "public" } })])).ok).toBe(false);
  });

  it("rejects blank source names", () => {
    expect(parse(board([task({ provenance: { ...source, name: "  " } })])).ok).toBe(false);
  });

  it.each(["<script>", "line\nfeed", "x\u0001y", "x\u200by"])("rejects unsafe note text", (note: string) => {
    expect(parse(board([task({ note })])).ok).toBe(false);
  });

  it("rejects notes longer than the bound", () => {
    expect(parse(board([task({ note: "a".repeat(1201) })])).ok).toBe(false);
  });

  it("rejects reversed task timestamps", () => {
    expect(parse(board([task({ createdAt: t1, updatedAt: t0 })])).ok).toBe(false);
  });

  it("rejects tasks updated after the board", () => {
    expect(parse({ ...board([task({ updatedAt: "2026-11-19T04:00:00.000Z" })]), updatedAt: t1 }).ok).toBe(false);
  });

  it("rejects reversed board timestamps", () => {
    expect(parse({ ...board(), createdAt: t1, updatedAt: t0 }).ok).toBe(false);
  });

  it("rejects normalised but impossible timestamps", () => {
    expect(parse(board([task({ createdAt: "2026-11-31T01:00:00.000Z" })])).ok).toBe(false);
  });

  it("never executes content embedded in JSON", () => {
    const malicious = JSON.stringify(board([task({ note: "${fetch('/private')}" })]));
    expect(parseTaskBoard(malicious, { today }).ok).toBe(true);
  });
});

describe("manual task transitions", () => {
  it("starts empty with no tasks", () => {
    expect(newTaskBoard(t0).tasks).toEqual([]);
  });

  it("adds a task without changing the underlying pack", () => {
    const original = board();
    const outcome = addRecoveryTask(original, {
      id: "task_two", packId: "toronto", kind: "download", note: "Review manually", provenance: null,
    }, t1, today);
    expect(outcome.ok).toBe(true);
    expect(original.tasks).toHaveLength(0);
    if (outcome.ok) {
      expect(outcome.board.tasks).toHaveLength(1);
      expect(outcome.board.tasks[0]?.state).toBe("pending");
    }
  });

  it("rejects duplicate IDs without overwrite", () => {
    const outcome = addRecoveryTask(board([task()]), {
      id: "task_one", packId: "ottawa", kind: "export", note: "different", provenance: null,
    }, t1, today);
    expect(outcome).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects invalid provenance on new tasks", () => {
    const outcome = addRecoveryTask(board(), {
      id: "task_three", packId: "toronto", kind: "inspect", note: "", provenance: { ...source, licence: "closed" },
    }, t1, today);
    expect(outcome.ok).toBe(false);
  });

  it("moves a task from pending to in progress", () => {
    const outcome = updateRecoveryTask(board([task()]), "task_one", "in-progress", t1, today);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.board.tasks[0]?.state).toBe("in-progress");
  });

  it("allows a pause and a later resume", () => {
    const paused = updateRecoveryTask(board([task()]), "task_one", "paused", t1, today);
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const resumed = updateRecoveryTask(paused.board, "task_one", "in-progress", t1, today);
    expect(resumed.ok).toBe(true);
  });

  it("does not reopen a closed task", () => {
    const outcome = updateRecoveryTask(board([task({ state: "closed" })]), "task_one", "in-progress", t1, today);
    expect(outcome).toEqual({ ok: false, reason: "transition" });
  });

  it("rejects unchanged transitions", () => {
    const outcome = updateRecoveryTask(board([task()]), "task_one", "pending", t1, today);
    expect(outcome.ok).toBe(false);
  });

  it("rejects missing task IDs", () => {
    expect(updateRecoveryTask(board(), "missing", "closed", t1, today)).toEqual({ ok: false, reason: "missing" });
  });

  it("counts each state without guessing unknown status", () => {
    expect(countTaskStates(board([
      task(), task({ id: "second", state: "paused" }), task({ id: "third", state: "closed" }),
    ]))).toEqual({ pending: 1, "in-progress": 0, paused: 1, closed: 1 });
  });
});

describe("task assessment and offline safety", () => {
  it("preserves UNKNOWN for a pack not listed in the current inventory", () => {
    const result = assessRecoveryTasks(board([task({ packId: "missing-pack" })]), records);
    expect(result[0]?.observedPackState).toBe("unknown");
    expect(result[0]?.risk).toBe("unknown");
  });

  it("does not promote unknown provenance into a trusted source", () => {
    const result = assessRecoveryTasks(board([task({ provenance: null })]), records);
    expect(result[0]?.reasons).toContain("source-unknown");
  });

  it("blocks damaged pack tasks without changing the pack", () => {
    const result = assessRecoveryTasks(board([task({ packId: "london" })]), records);
    expect(result[0]?.risk).toBe("blocked");
    expect(records[2]?.state).toBe("corrupt");
  });

  it("distinguishes absence from completion", () => {
    const result = assessRecoveryTasks(board([task({ packId: "windsor" })]), records);
    expect(result[0]?.reasons).toContain("pack-absent");
  });

  it("never marks a task as complete because the pack is ready", () => {
    const result = assessRecoveryTasks(board([task({ packId: "ottawa" })]), records);
    expect(result[0]?.task.state).toBe("pending");
  });
});

describe("bounded export, preview and non-destructive merging", () => {
  it("round trips through the parser", () => {
    const text = exportTaskBoard(board([task()]), today);
    expect(typeof text).toBe("string");
    if (text) expect(parseTaskBoard(text, { today }).ok).toBe(true);
  });

  it("rejects an export with unsafe input", () => {
    expect(exportTaskBoard(board([task({ note: "<bad>" })]), today)).toBeNull();
  });

  it("only proposes genuinely new IDs", () => {
    const result = previewTaskMerge(board([task()]), board([task(), task({ id: "second" })]));
    expect(result.accepted.map((item) => item.id)).toEqual(["second"]);
    expect(result.identical).toEqual(["task_one"]);
    expect(result.conflicts).toEqual([]);
  });

  it("flags matching IDs with different content", () => {
    const result = previewTaskMerge(board([task()]), board([task({ note: "other" })]));
    expect(result.conflicts).toEqual(["task_one"]);
  });

  it("blocks conflicting imports without altering existing tasks", () => {
    const current = board([task()]);
    const outcome = applyTaskMerge(current, board([task({ note: "different" })]), t1, today);
    expect(outcome).toEqual({ ok: false, reason: "duplicate" });
    expect(current.tasks[0]?.note).toBe("Inspect stored data");
  });

  it("accepts nonconflicting additions", () => {
    const outcome = applyTaskMerge(board([task()]), board([task({ id: "second" })]), t1, today);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.board.tasks).toHaveLength(2);
  });

  it("does not duplicate identical imported tasks", () => {
    const outcome = applyTaskMerge(board([task()]), board([task()]), t1, today);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.board.tasks).toHaveLength(1);
  });
});
