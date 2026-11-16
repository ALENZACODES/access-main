import { describe, expect, it } from "vitest";
import {
  classifyRecoveryError,
  classifyPackDownloadError,
  RecoveryNotice,
  type RecoveryFailure,
} from "./index";

describe("public recovery imports", () => {
  it("exposes all three live entry points through the package barrel", () => {
    expect(typeof RecoveryNotice).toBe("function");
    expect(typeof classifyRecoveryError).toBe("function");
    expect(typeof classifyPackDownloadError).toBe("function");
  });

  it("keeps unexpected failures unknown", () => {
    const failure: RecoveryFailure = classifyRecoveryError("export", new Error("unexpected"));
    expect(failure).toEqual({ operation: "export", reason: "unknown" });
  });

  it("maps integrity failures without exposing raw details", () => {
    const error = { code: "sha256", message: "internal" };
    const result = classifyPackDownloadError(error, true);
    expect(result).toEqual({ operation: "download", reason: "invalid-data" });
    expect(JSON.stringify(result)).not.toContain("internal");
  });

  it("does not guess whether a network failure is offline", () => {
    const error = { code: "network" };
    expect(classifyPackDownloadError(error, true).reason).toBe("unknown");
    expect(classifyPackDownloadError(error, false).reason).toBe("offline");
  });
});
