import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { DashboardState } from "./offlineDashboard";
import { createRecoveryJournalController } from "./recoveryJournalPanel";

const provenance = { source: "Open local data", licence: "CC BY 4.0", date: "2026-10-05" };
const manifest: RegionManifest = { regionId: "east", cells: [
  { id: "one", bytes: 20, provenance }, { id: "two", bytes: 30, provenance },
] };
function state(phase: DashboardState["phase"] = "ready"): DashboardState {
  return {
    phase, expanded: false, page: 0, plan: null, lastResult: null,
    inventory: {
      regionId: "east", complete: false, savedCount: 1,
      unknownCount: 1, savedBytes: 20, expectedBytes: 50,
      cells: [
        { id: "one", state: "saved", cause: "present", expectedBytes: 20, provenance },
        { id: "two", state: "unknown", cause: "missing", expectedBytes: 30, provenance },
      ],
    },
  };
}

describe("manual recovery journal panel controller", () => {
  it("does not capture on construction", () => {
    const controller = createRecoveryJournalController(manifest);
    expect(controller.getJournal().entries).toHaveLength(0);
  });

  it("records only an explicit manual capture", () => {
    const controller = createRecoveryJournalController(manifest);
    const journal = controller.capture(state(), "2026-11-19T10:00:00Z", "snapshot");
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]?.event).toBe("snapshot");
  });

  it("does not capture while download is running", () => {
    const controller = createRecoveryJournalController(manifest);
    expect(() => controller.capture(state("downloading"), "2026-11-19T10:00:00Z", "after-download"))
      .toThrow();
    expect(controller.getJournal().entries).toHaveLength(0);
  });

  it("does not capture while storage is being inspected", () => {
    const controller = createRecoveryJournalController(manifest);
    expect(() => controller.capture(state("checking"), "2026-11-19T10:00:00Z", "snapshot"))
      .toThrow();
    expect(controller.getJournal().entries).toHaveLength(0);
  });

  it("keeps missing local copies UNKNOWN even after an explicit capture", () => {
    const controller = createRecoveryJournalController(manifest);
    const journal = controller.capture(state(), "2026-11-19T10:00:00Z", "manual-review");
    expect(journal.entries[0]?.cells[1]?.status).toBe("UNKNOWN");
  });

  it("distinguishes recording before cleanup from recording after a download", () => {
    const controller = createRecoveryJournalController(manifest);
    controller.capture(state(), "2026-11-19T10:00:00Z", "before-cleanup");
    controller.capture(state(), "2026-11-19T10:00:01Z", "after-download");
    expect(controller.getJournal().entries.map((entry) => entry.event))
      .toEqual(["before-cleanup", "after-download"]);
  });

  it("clears only this journal and retains its region ID", () => {
    const controller = createRecoveryJournalController(manifest);
    controller.capture(state(), "2026-11-19T10:00:00Z", "snapshot");
    const cleared = controller.clear();
    expect(cleared.regionId).toBe("east");
    expect(cleared.entries).toEqual([]);
  });

  it("does not mutate caller's dashboard state", () => {
    const dashboard = state();
    const snapshot = JSON.stringify(dashboard);
    const controller = createRecoveryJournalController(manifest);
    controller.capture(dashboard, "2026-11-19T10:00:00Z", "snapshot");
    expect(JSON.stringify(dashboard)).toBe(snapshot);
  });

  it("rejects invalid timestamps rather than forging a date", () => {
    const controller = createRecoveryJournalController(manifest);
    expect(() => controller.capture(state(), "today", "snapshot")).toThrow();
  });

  it("does not promote absent inventory to saved", () => {
    const controller = createRecoveryJournalController(manifest);
    const result = controller.capture({ ...state(), inventory: null }, "2026-11-19T10:00:00Z", "snapshot");
    expect(result.entries[0]?.health).toBe("UNKNOWN");
    expect(result.entries[0]?.cells.every((cell) => cell.status === "UNKNOWN")).toBe(true);
  });

  it("keeps the controller separate from any browser persistence API", () => {
    const controller = createRecoveryJournalController(manifest);
    expect(Object.keys(controller).sort()).toEqual(["capture", "clear", "getJournal"]);
  });
});
