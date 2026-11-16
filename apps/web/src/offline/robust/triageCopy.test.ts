import { describe, expect, it } from "vitest";
import { TRIAGE_COPY, triageCopy } from "./triageCopy";
import { auditOfflineCopy, MIN_TARGET_PX } from "./accessibilityGuard";

describe("offline triage copy", () => {
  it("provides matching keys in both languages", () => {
    expect(Object.keys(TRIAGE_COPY.en).sort()).toEqual(Object.keys(TRIAGE_COPY.fr).sort());
  });

  it("provides nonempty translations for every control", () => {
    for (const key of Object.keys(TRIAGE_COPY.en) as (keyof typeof TRIAGE_COPY.en)[]) {
      expect(TRIAGE_COPY.en[key].trim().length).toBeGreaterThan(0);
      expect(TRIAGE_COPY.fr[key].trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the requested language", () => {
    expect(triageCopy("en")).toBe(TRIAGE_COPY.en);
    expect(triageCopy("fr")).toBe(TRIAGE_COPY.fr);
  });

  it("passes the same user-copy audit as the dashboard", () => {
    expect(auditOfflineCopy(TRIAGE_COPY)).toEqual([]);
  });

  it("does not promise an accessible physical route", () => {
    expect(TRIAGE_COPY.en.policy).toContain("does not establish physical accessibility");
    expect(TRIAGE_COPY.fr.policy).toContain("ne constituent pas une preuve");
  });

  it("uses an UNKNOWN label in both languages", () => {
    expect(TRIAGE_COPY.en.unknown).toContain("UNKNOWN");
    expect(TRIAGE_COPY.fr.unknown).toContain("INCONNUE");
  });

  it("provides a visible, labelled retry control", () => {
    expect(TRIAGE_COPY.en.retry).toMatch(/Download/);
    expect(TRIAGE_COPY.fr.retry).toMatch(/Télécharger/);
  });

  it("explains that search does not discover extra cells", () => {
    expect(TRIAGE_COPY.en.searchHint).toContain("listed");
    expect(TRIAGE_COPY.fr.searchHint).toContain("répertoriées");
  });

  it("explains that saved cells are left untouched", () => {
    expect(TRIAGE_COPY.en.scope).toContain("unchanged");
    expect(TRIAGE_COPY.fr.scope).toContain("inchangées");
  });

  it("has distinct labels for missing, stale and unreadable copies", () => {
    const en = TRIAGE_COPY.en;
    expect(new Set([en.missing, en.stale, en.unreadable]).size).toBe(3);
    const fr = TRIAGE_COPY.fr;
    expect(new Set([fr.missing, fr.stale, fr.unreadable]).size).toBe(3);
  });

  it("includes selected-item and size labels in both languages", () => {
    for (const copy of [TRIAGE_COPY.en, TRIAGE_COPY.fr]) {
      expect(copy.selected.length).toBeGreaterThan(5);
      expect(copy.unknownSize.length).toBeGreaterThan(5);
      expect(copy.selectionLimit.length).toBeGreaterThan(10);
    }
  });

  it("prohibits unsupported user-facing claims", () => {
    const text = Object.values(TRIAGE_COPY).flatMap((copy) => Object.values(copy)).join("\n");
    const restricted = /\b(?:verif(?:y|ied)|vérifi\w*|real-time|partnership|guarantee|AAA-conformant)\b/iu;
    expect(restricted.test(text)).toBe(false);
  });

  it("contains no straight French apostrophes", () => {
    for (const text of Object.values(TRIAGE_COPY.fr)) expect(text).not.toContain("'");
  });

  it("uses nonbreaking French punctuation where present", () => {
    for (const text of Object.values(TRIAGE_COPY.fr)) {
      expect(/(?<!\u00a0):/u.test(text)).toBe(false);
      expect(/(?<!\u202f)[;!?]/u.test(text)).toBe(false);
    }
  });

  it("requires at least 44 pixel touch targets", () => {
    expect(MIN_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
