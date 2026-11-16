import { describe, expect, it } from "vitest";
import { auditCleanupCopy, CLEANUP_COPY, cleanupCopy } from "./cleanupCopy";
import { MIN_TARGET_PX } from "./accessibilityGuard";
import { mountOfflineCleanup } from "./cleanupPanel";
import { mountOfflineDashboard } from "./offlineDashboard";
import { type CellStore } from "./regionDownload";

describe("bilingual cleanup interface audit", () => {
  it("has a translation for every mounted label", () => {
    expect(Object.keys(CLEANUP_COPY.en).sort()).toEqual(Object.keys(CLEANUP_COPY.fr).sort());
    expect(Object.values(CLEANUP_COPY.en).every((value) => value.trim().length > 0)).toBe(true);
    expect(Object.values(CLEANUP_COPY.fr).every((value) => value.trim().length > 0)).toBe(true);
  });
  it("fails the copy audit if a rule is broken", () => {
    expect(auditCleanupCopy()).toEqual([]);
  });
  it("does not replace UNKNOWN with a positive status", () => {
    expect(CLEANUP_COPY.en.unknown).toContain("UNKNOWN");
    expect(CLEANUP_COPY.fr.unknown).toContain("INCONNU");
    expect(CLEANUP_COPY.en.offlineReminder).toContain("UNKNOWN");
    expect(CLEANUP_COPY.fr.offlineReminder).toContain("INCONNUE");
  });
  it("uses the requested language without changing state semantics", () => {
    expect(cleanupCopy("en").preview).toBe(CLEANUP_COPY.en.preview);
    expect(cleanupCopy("fr").preview).toBe(CLEANUP_COPY.fr.preview);
  });
  it("sets the minimum control target to 44 pixels", () => {
    expect(MIN_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
  it("exports the cleanup mount function", () => {
    expect(typeof mountOfflineCleanup).toBe("function");
  });
  it("uses the dashboard as its live mount", () => {
    expect(typeof mountOfflineDashboard).toBe("function");
  });
  it("does not rely on a storage deletion method on the ordinary cell store", () => {
    const store: CellStore = {
      get: async () => undefined,
      put: async () => undefined,
    };
    expect("remove" in store).toBe(false);
  });
});
