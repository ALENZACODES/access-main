import { describe, expect, it } from "vitest";
import {
  RECOVERY_FILTERS, RECOVERY_GUIDE_COPY, RECOVERY_ORDERS,
  auditRecoveryGuideCopy, recoveryActionLabel, recoveryBytes,
  recoveryFilterLabel, recoveryGateLabel, recoveryGuideCopy,
  recoveryIssueLabel, recoveryOrderLabel,
} from "./recoveryGuideCopy";
import type { GuideIssue } from "./recoveryGuide";

describe("recovery guide bilingual copy", () => {
  it("includes a non-empty translation for every English label", () => {
    const english = Object.keys(RECOVERY_GUIDE_COPY.en).sort();
    const french = Object.keys(RECOVERY_GUIDE_COPY.fr).sort();
    expect(french).toEqual(english);
    for (const key of english) {
      expect((RECOVERY_GUIDE_COPY.en as Record<string, string>)[key]?.trim()).toBeTruthy();
      expect((RECOVERY_GUIDE_COPY.fr as Record<string, string>)[key]?.trim()).toBeTruthy();
    }
  });

  it("keeps UNKNOWN unchanged in English and French", () => {
    expect(RECOVERY_GUIDE_COPY.en.unknown).toBe("UNKNOWN");
    expect(RECOVERY_GUIDE_COPY.fr.unknown).toBe("UNKNOWN");
    expect(RECOVERY_GUIDE_COPY.fr.notKnown).toBe("UNKNOWN");
  });

  it("passes the built-in bilingual copy audit", () => {
    expect(auditRecoveryGuideCopy()).toEqual([]);
  });

  it("avoids straight apostrophes in French user copy", () => {
    for (const value of Object.values(RECOVERY_GUIDE_COPY.fr)) {
      expect(value.includes("'")).toBe(false);
    }
  });

  it("does not add ordinary spaces before French colons", () => {
    for (const value of Object.values(RECOVERY_GUIDE_COPY.fr)) {
      expect(value).not.toMatch(/(?<!\u00a0):/u);
    }
  });

  it("does not add ordinary spaces before French high punctuation", () => {
    for (const value of Object.values(RECOVERY_GUIDE_COPY.fr)) {
      expect(value).not.toMatch(/(?<!\u202f)[;!?]/u);
    }
  });

  it("has a plain-language data disclaimer in both languages", () => {
    expect(RECOVERY_GUIDE_COPY.en.disclaimer).toContain("does not describe");
    expect(RECOVERY_GUIDE_COPY.fr.disclaimer).toContain("ne décrit pas");
  });

  it("has specific unknown-capacity wording in both languages", () => {
    expect(RECOVERY_GUIDE_COPY.en.storageUnknown).toContain("UNKNOWN");
    expect(RECOVERY_GUIDE_COPY.fr.storageUnknown).toContain("UNKNOWN");
  });

  it("does not imply that requesting a download has already saved it", () => {
    expect(RECOVERY_GUIDE_COPY.en.requestStarted).toContain("Check");
    expect(RECOVERY_GUIDE_COPY.fr.requestStarted).toContain("Examinez");
  });

  it("returns the requested locale catalogue", () => {
    expect(recoveryGuideCopy("en")).toEqual(RECOVERY_GUIDE_COPY.en);
    expect(recoveryGuideCopy("fr")).toEqual(RECOVERY_GUIDE_COPY.fr);
  });

  it("names every issue in both languages", () => {
    const issues: GuideIssue[] = [
      "missing", "stale", "unreadable", "metadata-conflict",
      "invalid-listing", "inventory-unavailable", "duplicate",
      "unlisted", "storage-unknown", "storage-low",
    ];
    for (const issue of issues) {
      expect(recoveryIssueLabel(issue, "en").length).toBeGreaterThan(0);
      expect(recoveryIssueLabel(issue, "fr").length).toBeGreaterThan(0);
    }
  });

  it("labels the no-issue case without claiming future recovery success", () => {
    expect(recoveryIssueLabel(null, "en")).toBe(RECOVERY_GUIDE_COPY.en.noIssue);
    expect(recoveryIssueLabel(null, "fr")).toBe(RECOVERY_GUIDE_COPY.fr.noIssue);
  });

  it("labels each action in both languages", () => {
    for (const action of ["none", "retry", "inspect", "review-source", "free-space"] as const) {
      expect(recoveryActionLabel(action, "en")).toBeTruthy();
      expect(recoveryActionLabel(action, "fr")).toBeTruthy();
    }
  });

  it("does not imply that the retry action is automatic", () => {
    expect(recoveryActionLabel("retry", "en")).toContain("manual");
    expect(recoveryActionLabel("retry", "fr")).toContain("manuelle");
  });

  it("labels all three readiness gate states", () => {
    for (const gate of ["ready", "blocked", "UNKNOWN"] as const) {
      expect(recoveryGateLabel(gate, "en")).toBeTruthy();
      expect(recoveryGateLabel(gate, "fr")).toBeTruthy();
    }
  });

  it("never describes an UNKNOWN gate as ready", () => {
    expect(recoveryGateLabel("UNKNOWN", "en")).toContain("UNKNOWN");
    expect(recoveryGateLabel("UNKNOWN", "fr")).toContain("UNKNOWN");
  });

  it("exposes every filter with a non-empty label", () => {
    expect(new Set(RECOVERY_FILTERS).size).toBe(RECOVERY_FILTERS.length);
    for (const filter of RECOVERY_FILTERS) {
      expect(recoveryFilterLabel(filter, "en")).toBeTruthy();
      expect(recoveryFilterLabel(filter, "fr")).toBeTruthy();
    }
  });

  it("exposes every sort option with a non-empty label", () => {
    expect(new Set(RECOVERY_ORDERS).size).toBe(RECOVERY_ORDERS.length);
    for (const order of RECOVERY_ORDERS) {
      expect(recoveryOrderLabel(order, "en")).toBeTruthy();
      expect(recoveryOrderLabel(order, "fr")).toBeTruthy();
    }
  });

  it("formats UNKNOWN bytes without substituting zero", () => {
    expect(recoveryBytes(null, "en")).toBe("UNKNOWN");
    expect(recoveryBytes(null, "fr")).toBe("UNKNOWN");
  });

  it("formats invalid negative bytes as UNKNOWN", () => {
    expect(recoveryBytes(-1, "en")).toBe("UNKNOWN");
    expect(recoveryBytes(-100, "fr")).toBe("UNKNOWN");
  });

  it("formats invalid fractional bytes as UNKNOWN", () => {
    expect(recoveryBytes(1.5, "en")).toBe("UNKNOWN");
    expect(recoveryBytes(Number.NaN, "fr")).toBe("UNKNOWN");
  });

  it("formats zero bytes as zero without inventing content", () => {
    expect(recoveryBytes(0, "en")).toBe("0 B");
    expect(recoveryBytes(0, "fr")).toBe("0 o");
  });

  it("uses the correct English unit for a positive count", () => {
    expect(recoveryBytes(12, "en")).toBe("12 B");
  });

  it("uses the correct French unit for a positive count", () => {
    expect(recoveryBytes(12, "fr")).toBe("12 o");
  });

  it("formats large counts with locale-aware grouping", () => {
    expect(recoveryBytes(1000, "en")).toContain("1,000");
    expect(recoveryBytes(1000, "fr")).toContain("1");
  });

  it("does not include any external location address or private account ID", () => {
    const text = JSON.stringify(RECOVERY_GUIDE_COPY);
    expect(text).not.toContain("https://");
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("account-number");
  });

  it("has retry controls and descriptive error labels in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = recoveryGuideCopy(locale);
      expect(copy.retry.length).toBeGreaterThan(5);
      expect(copy.retryBlocked.length).toBeGreaterThan(5);
      expect(copy.exportError.length).toBeGreaterThan(5);
      expect(copy.refreshError.length).toBeGreaterThan(5);
    }
  });

  it("keeps missing and stale labels distinct", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(recoveryIssueLabel("missing", locale)).not.toBe(
        recoveryIssueLabel("stale", locale),
      );
    }
  });

  it("keeps metadata conflicts distinct from unreadable copies", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(recoveryIssueLabel("metadata-conflict", locale)).not.toBe(
        recoveryIssueLabel("unreadable", locale),
      );
    }
  });
});
