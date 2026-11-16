import { describe, expect, it } from "vitest";
import {
  EMPTY_KINDS,
  ERROR_KINDS,
  MIN_TOUCH_TARGET_PX,
  errorKindFromStatus,
  getEmptyState,
  getErrorState,
  type Locale,
  type StateView,
} from "./index";

const locales: Locale[] = ["en", "fr"];

function allViews(locale: Locale): StateView[] {
  return [
    ...ERROR_KINDS.map((k) => getErrorState(k, locale)),
    ...EMPTY_KINDS.map((k) => getEmptyState(k, locale)),
  ];
}
function strings(v: StateView): string[] {
  return [v.title, v.description, ...v.actions.map((a) => a.label)];
}

describe("state copy", () => {
  it("every state has text and at least one action in both locales", () => {
    for (const l of locales) {
      for (const v of allViews(l)) {
        expect(v.title.length).toBeGreaterThan(0);
        expect(v.description.length).toBeGreaterThan(0);
        expect(v.actions.length).toBeGreaterThan(0);
      }
    }
  });

  it("EN and FR differ and actions match across locales", () => {
    const en = allViews("en");
    const fr = allViews("fr");
    en.forEach((v, i) => {
      expect(fr[i]!.title).not.toBe(v.title);
      expect(fr[i]!.actions.map((a) => a.id)).toEqual(v.actions.map((a) => a.id));
    });
  });

  it("French uses typographic punctuation", () => {
    for (const v of allViews("fr")) {
      for (const s of strings(v)) {
        expect(s).not.toContain("'");
        expect(s).not.toMatch(/ [:;!?»]/);
        expect(s).not.toMatch(/«(?!\u202F)/);
        expect(s).not.toMatch(/(?<!\u202F)[;!?]/);
        expect(s).not.toMatch(/(?<!\u00A0):/);
      }
    }
  });

  it("touch targets are at least 44px", () => {
    for (const v of allViews("en")) {
      for (const a of v.actions) expect(a.minTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }
  });

  it("errors are alerts, empty states are status", () => {
    expect(getErrorState("server", "en").role).toBe("alert");
    expect(getEmptyState("no-results", "en").role).toBe("status");
  });

  it("keeps unknown accessibility as UNKNOWN", () => {
    expect(getEmptyState("accessibility-unknown", "en").title).toContain("UNKNOWN");
    expect(getEmptyState("accessibility-unknown", "fr").title).toContain("INCONNUE");
  });

  it("avoids banned terms and AI mentions in user copy", () => {
    for (const l of locales) {
      for (const v of allViews(l)) {
        for (const s of strings(v)) {
          expect(s).not.toMatch(/scio|sciontario|spinal cord injury ontario/i);
          expect(s).not.toMatch(/\b(AI|IA|artificial|intelligence)\b/);
        }
      }
    }
  });

  it("maps status codes to error kinds", () => {
    expect(errorKindFromStatus(undefined, false)).toBe("offline");
    expect(errorKindFromStatus(404, true)).toBe("not-found");
    expect(errorKindFromStatus(504, true)).toBe("timeout");
    expect(errorKindFromStatus(500, true)).toBe("server");
    expect(errorKindFromStatus(undefined, true)).toBe("unknown");
    expect(errorKindFromStatus(400, true)).toBe("unknown");
  });
});
