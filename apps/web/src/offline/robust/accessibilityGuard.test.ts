import { describe, expect, it } from "vitest";
import {
  MIN_TARGET_PX,
  createOfflineAction,
  auditOfflineCopy,
} from "./accessibilityGuard.ts";
import { DASHBOARD_COPY } from "./offlineCopy.ts";

function fakeDocument() {
  const created: Array<Record<string, unknown>> = [];
  const documentRef = {
    createElement(tag: string) {
      expect(tag).toBe("button");
      const button = { type: "", textContent: "", style: {} as Record<string, string> };
      created.push(button);
      return button;
    },
  } as unknown as Document;
  return { documentRef, created };
}

describe("offline panel accessibility and copy guard", () => {
  it("enforces at least 44 CSS pixels for the touch target", () => {
    const { documentRef } = fakeDocument();
    const button = createOfflineAction(documentRef, "Review status");
    expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(button.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    expect(MIN_TARGET_PX).toBe(44);
  });

  it("uses native button semantics rather than a clickable div", () => {
    const { documentRef, created } = fakeDocument();
    const button = createOfflineAction(documentRef, "Retry download");
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Retry download");
    expect(created).toHaveLength(1);
  });

  it("rejects an action without a visible accessible label", () => {
    const { documentRef } = fakeDocument();
    expect(() => createOfflineAction(documentRef, "")).toThrow();
    expect(() => createOfflineAction(documentRef, "  ")).toThrow();
  });

  it("passes the actual English and French dashboard copy", () => {
    expect(auditOfflineCopy()).toEqual([]);
  });

  it("fails on a missing translation", () => {
    const english = { ...DASHBOARD_COPY.en, extra: "Extra action" };
    const french = { ...DASHBOARD_COPY.fr };
    expect(auditOfflineCopy({ en: english, fr: french })).toContain("missing-string");
  });

  it("fails on an unsupported claim in user-facing English", () => {
    const english = { ...DASHBOARD_COPY.en, title: "Guaranteed offline access" };
    expect(auditOfflineCopy({ en: english, fr: DASHBOARD_COPY.fr })).toContain("disallowed-claim");
  });

  it("fails on an unsupported claim in user-facing French", () => {
    const french = { ...DASHBOARD_COPY.fr, title: "Accès vérifié" };
    expect(auditOfflineCopy({ en: DASHBOARD_COPY.en, fr: french })).toContain("disallowed-claim");
  });

  it("fails on straight apostrophes in French", () => {
    const french = { ...DASHBOARD_COPY.fr, title: "L'application" };
    expect(auditOfflineCopy({ en: DASHBOARD_COPY.en, fr: french })).toContain("french-apostrophe");
  });

  it("fails on a missing French nonbreaking space before colon", () => {
    const french = { ...DASHBOARD_COPY.fr, title: "État: INCONNU" };
    expect(auditOfflineCopy({ en: DASHBOARD_COPY.en, fr: french })).toContain("french-colon");
  });

  it("fails on missing narrow nonbreaking punctuation spaces", () => {
    const french = { ...DASHBOARD_COPY.fr, title: "Reprendre!" };
    expect(auditOfflineCopy({ en: DASHBOARD_COPY.en, fr: french })).toContain("french-punctuation");
  });

  it("accepts typographically correct French punctuation", () => {
    const french = { ...DASHBOARD_COPY.fr, title: "État\u00a0: INCONNU\u202f!" };
    expect(auditOfflineCopy({ en: DASHBOARD_COPY.en, fr: french })).toEqual([]);
  });
});
