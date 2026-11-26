import { describe, expect, it } from "vitest";
import {
  RECOVERY_JOURNAL_COPY, auditRecoveryJournalCopy, journalCauseLabel,
  journalChangeLabel, journalCopy, journalEventLabel, journalHealthLabel,
  journalStatusLabel,
} from "./recoveryJournalCopy";
import type { JournalCause, JournalChange, JournalEvent, JournalHealth } from "./recoveryJournal";

const causes: readonly JournalCause[] = ["present", "missing", "stale", "unreadable",
  "not-inspected", "metadata-conflict", "unlisted", "invalid-listing"];
const changes: readonly JournalChange[] = ["new", "became-saved", "became-unknown",
  "cause-changed", "source-changed", "size-changed", "unchanged", "removed"];
const events: readonly JournalEvent[] = ["snapshot", "after-download", "before-cleanup", "manual-review"];
const health: readonly JournalHealth[] = ["complete", "partial", "UNKNOWN"];

describe("recovery journal bilingual copy", () => {
  it("has a paired translation for every user-visible key", () => {
    expect(Object.keys(RECOVERY_JOURNAL_COPY.en).sort())
      .toEqual(Object.keys(RECOVERY_JOURNAL_COPY.fr).sort());
  });

  it("never ships an empty translation", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(journalCopy(language))) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("passes the common bilingual copy audit", () => {
    expect(auditRecoveryJournalCopy()).toEqual([]);
  });

  it("uses UNKNOWN literally in both languages", () => {
    expect(journalCopy("en").unknown).toBe("UNKNOWN");
    expect(journalCopy("fr").unknown).toBe("UNKNOWN");
    expect(journalStatusLabel("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(journalStatusLabel("UNKNOWN", "fr")).toBe("UNKNOWN");
  });

  it("does not introduce a different French UNKNOWN token", () => {
    for (const value of Object.values(RECOVERY_JOURNAL_COPY.fr)) {
      expect(value).not.toContain("INCONNU");
    }
  });

  it("uses the correct French apostrophe throughout the catalogue", () => {
    for (const value of Object.values(RECOVERY_JOURNAL_COPY.fr)) {
      expect(value).not.toContain("'");
    }
  });

  it("requires a nonbreaking space before every literal French colon", () => {
    for (const value of Object.values(RECOVERY_JOURNAL_COPY.fr)) {
      expect(/(?<!\u00a0):/u.test(value)).toBe(false);
    }
  });

  it("requires a narrow nonbreaking space before French punctuation", () => {
    for (const value of Object.values(RECOVERY_JOURNAL_COPY.fr)) {
      expect(/(?<!\u202f)[;!?]/u.test(value)).toBe(false);
    }
  });

  it("does not claim physical accessibility from saved bytes", () => {
    expect(journalCopy("en").caution).toContain("not physical accessibility");
    expect(journalCopy("fr").caution).toContain("non l’accessibilité physique");
  });

  it("states that snapshots remain in this page", () => {
    expect(journalCopy("en").privacy).toContain("this page");
    expect(journalCopy("fr").privacy).toContain("cette page");
  });

  it("labels every cause in both languages", () => {
    for (const cause of causes) {
      expect(journalCauseLabel(cause, "en").length).toBeGreaterThan(0);
      expect(journalCauseLabel(cause, "fr").length).toBeGreaterThan(0);
    }
  });

  it("keeps unknown causes from becoming saved labels", () => {
    expect(journalCauseLabel("unreadable", "en")).not.toBe(journalCopy("en").saved);
    expect(journalCauseLabel("metadata-conflict", "fr")).not.toBe(journalCopy("fr").saved);
  });

  it("labels every comparison kind", () => {
    for (const change of changes) {
      expect(journalChangeLabel(change, "en").length).toBeGreaterThan(0);
      expect(journalChangeLabel(change, "fr").length).toBeGreaterThan(0);
    }
  });

  it("separates newly saved from newly UNKNOWN", () => {
    expect(journalChangeLabel("became-saved", "en"))
      .not.toBe(journalChangeLabel("became-unknown", "en"));
    expect(journalChangeLabel("became-saved", "fr"))
      .not.toBe(journalChangeLabel("became-unknown", "fr"));
  });

  it("labels every manual event type", () => {
    for (const event of events) {
      expect(journalEventLabel(event, "en").length).toBeGreaterThan(0);
      expect(journalEventLabel(event, "fr").length).toBeGreaterThan(0);
    }
  });

  it("never calls a missing reading complete", () => {
    expect(journalHealthLabel("UNKNOWN", "en")).toContain("UNKNOWN");
    expect(journalHealthLabel("UNKNOWN", "fr")).toContain("UNKNOWN");
  });

  it("labels all three region-copy health states", () => {
    for (const state of health) {
      expect(journalHealthLabel(state, "en")).not.toBe("");
      expect(journalHealthLabel(state, "fr")).not.toBe("");
    }
  });

  it("uses only native text for actions, not embedded markup", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(journalCopy(language))) {
        expect(value).not.toContain("<script");
        expect(value).not.toContain("<iframe");
      }
    }
  });
});
