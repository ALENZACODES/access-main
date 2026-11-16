import { describe, expect, it } from "vitest";
import { pressureView, type PressureState } from "./storagePressure";
import type { DownloadResult } from "./regionDownload";

const partial: DownloadResult = {
  regionId: "sample",
  available: ["cell-one"],
  missing: ["cell-two"],
  completed: false,
  reason: "quota",
};

describe("offline storage-pressure status", () => {
  it("handles idle and working states without dereferencing a null result", () => {
    for (const language of ["en", "fr"] as const) {
      const idle: PressureState = { phase: "idle", result: null };
      const working: PressureState = { phase: "working", result: null };
      expect(pressureView(idle, language).disabled).toBe(false);
      expect(pressureView(working, language).disabled).toBe(true);
      expect(pressureView(idle, language).details).toBe("");
    }
  });

  it("does not treat partial downloads as complete", () => {
    const state: PressureState = { phase: "stopped", result: partial };
    for (const language of ["en", "fr"] as const) {
      const view = pressureView(state, language);
      expect(view.disabled).toBe(false);
      expect(view.details).toContain("1");
      expect(view.details).toContain(language === "fr" ? "INCONNUES" : "UNKNOWN");
      expect(view.message).not.toBe("");
    }
  });

  it("disables retry only for a completed result", () => {
    const completed: DownloadResult = {
      ...partial, missing: [], completed: true, reason: "complete",
    };
    expect(pressureView({ phase: "stopped", result: completed }, "en").disabled).toBe(true);
    expect(pressureView({ phase: "stopped", result: completed }, "fr").disabled).toBe(true);
  });
});
