import { describe, expect, it, vi } from "vitest";
import {
  classifyRecoveryError,
  getRecoveryMessage,
  runRecoverable,
  type RecoveryOperation,
  type RecoveryReason,
} from "./index";

const operations: readonly RecoveryOperation[] = ["pack", "download", "export"];
const reasons: readonly RecoveryReason[] = [
  "offline", "quota", "permission", "interrupted", "invalid-data", "unknown",
];

describe("recovery messages", () => {
  it("has complete EN and FR copy and matching actions", () => {
    for (const operation of operations) {
      for (const reason of reasons) {
        const failure = { operation, reason };
        const en = getRecoveryMessage(failure, "en");
        const fr = getRecoveryMessage(failure, "fr");
        for (const message of [en, fr]) {
          expect(message.title.trim()).not.toBe("");
          expect(message.description.trim()).not.toBe("");
          expect(message.actionLabel.trim()).not.toBe("");
          expect(message.dismissLabel.trim()).not.toBe("");
        }
        expect(en.action).toBe(fr.action);
      }
    }
  });

  it("does not claim knowledge of unknown failures", () => {
    for (const operation of operations) {
      expect(getRecoveryMessage({ operation, reason: "unknown" }, "en").description).toContain("unknown");
      expect(getRecoveryMessage({ operation, reason: "unknown" }, "fr").description).toContain("inconnue");
    }
  });
});

describe("error classification", () => {
  it.each([
    ["QuotaExceededError", "quota"],
    ["NotAllowedError", "permission"],
    ["SecurityError", "permission"],
    ["AbortError", "interrupted"],
    ["DataError", "invalid-data"],
    ["SyntaxError", "invalid-data"],
    ["NetworkError", "offline"],
  ] as const)("maps %s to %s", (name, reason) => {
    const error = new Error("internal details");
    error.name = name;
    expect(classifyRecoveryError("download", error).reason).toBe(reason);
  });

  it("keeps unrecognised failures unknown and preserves only supplied provenance", () => {
    expect(classifyRecoveryError("pack", "unexpected").reason).toBe("unknown");
    const source = { name: "Example", licence: "CC BY 4.0", date: "2026-11-15" };
    expect(classifyRecoveryError("pack", new Error("x"), source).source).toEqual(source);
    expect(classifyRecoveryError("pack", new Error("x")).source).toBeUndefined();
  });
});

describe("recoverable operations", () => {
  it("returns a successful operation result", async () => {
    const task = vi.fn(async () => "done");
    expect(await runRecoverable("export", task)).toEqual({ ok: true, value: "done" });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("returns a structured error without retrying or leaking exception text", async () => {
    const error = new Error("sensitive diagnostic");
    error.name = "QuotaExceededError";
    const task = vi.fn(async (): Promise<string> => { throw error; });
    const result = await runRecoverable("download", task);
    expect(task).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, failure: { operation: "download", reason: "quota" } });
    expect(JSON.stringify(result)).not.toContain("sensitive diagnostic");
  });

  it("never reports an interrupted pack as complete", async () => {
    const error = new Error("stopped");
    error.name = "AbortError";
    const result = await runRecoverable("pack", async (): Promise<void> => { throw error; });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("interrupted");
  });
});
