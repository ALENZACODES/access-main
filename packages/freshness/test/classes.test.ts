import { describe, expect, it } from "vitest";

import {
  DAY,
  HOUR,
  DEFAULT_EXPIRY_MS,
  badgeFor,
  classForField,
  durationFor,
  evaluate,
  tasks,
  sortTasks,
  type AccessibilityFact,
  type ClassId,
} from "../src";

const NOW = new Date("2026-11-15T12:00:00.000Z");

function fact(
  retrievedAt: string | null,
  overrides: Partial<AccessibilityFact> = {},
): AccessibilityFact {
  return {
    value: true,
    source_id: "synthetic-source",
    licence: "CC0",
    retrieved_at: retrievedAt,
    tier: 1,
    ...overrides,
  };
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

describe("expiry classes", () => {
  const cases: Array<{
    classId: ClassId;
    field: string;
    duration: number;
  }> = [
    {
      classId: "elevator",
      field: "elevator_status",
      duration: 4 * HOUR,
    },
    {
      classId: "condition",
      field: "curb_snowbank",
      duration: 24 * HOUR,
    },
    {
      classId: "washroom",
      field: "washroom_usability",
      duration: 180 * DAY,
    },
    {
      classId: "geometry",
      field: "door_width",
      duration: 365 * DAY,
    },
    {
      classId: "operatorHours",
      field: "operator_hours",
      duration: 90 * DAY,
    },
  ];

  it.each(cases)(
    "$classId uses the expected default expiry",
    ({ classId, field, duration }) => {
      expect(DEFAULT_EXPIRY_MS[classId]).toBe(duration);
      expect(classForField(field)).toBe(classId);
      expect(durationFor(classId)).toBe(duration);

      const checked = new Date(NOW.getTime() - duration + 1);
      const current = evaluate(fact(checked.toISOString()), NOW, classId);

      expect(current.state).toBe("current");
      expect(current.expiresAt).toBe(
        new Date(NOW.getTime() + 1).toISOString(),
      );

      const boundary = new Date(NOW.getTime() - duration);
      const expired = evaluate(fact(boundary.toISOString()), NOW, classId);

      expect(expired.state).toBe("needs-check");
      expect(expired.expiresAt).toBe(NOW.toISOString());

      const older = new Date(NOW.getTime() - duration - 1);
      expect(
        evaluate(fact(older.toISOString()), NOW, classId).state,
      ).toBe("needs-check");
    },
  );

  it("supports explicit policy overrides", () => {
    const policy = {
      durations: { elevator: 2 * HOUR },
      fieldClasses: { platform_lift: "elevator" as const },
    };

    expect(classForField("platform_lift", policy)).toBe("elevator");
    expect(durationFor("elevator", policy)).toBe(2 * HOUR);
    expect(
      evaluate(fact(hoursAgo(3)), NOW, "elevator", policy).state,
    ).toBe("needs-check");
    expect(
      evaluate(fact(hoursAgo(3)), NOW, "elevator").state,
    ).toBe("current");
  });

  it("does not give unknown fields an implicit expiry class", () => {
    expect(classForField("unclassified_accessibility_claim")).toBeNull();
    expect(classForField("benefit_renewal_date")).toBeNull();
  });

  it("rejects invalid policy durations", () => {
    for (const duration of [0, -1, 1.5, Infinity, NaN]) {
      expect(
        durationFor("elevator", { durations: { elevator: duration } }),
      ).toBeNull();
      expect(
        evaluate(fact(hoursAgo(1)), NOW, "elevator", {
          durations: { elevator: duration },
        }).state,
      ).toBe("unknown");
    }
  });
});

describe("unknown and evidence protection", () => {
  it.each([
    null,
    "",
    "not-a-date",
    "2026-11-15",
    "2026-11-15T12:00:00",
    "2026-11-99T12:00:00Z",
  ])("treats an absent or invalid date as unknown: %s", (date) => {
    const result = evaluate(fact(date), NOW, "elevator");

    expect(result).toEqual({
      state: "unknown",
      lastChecked: null,
      expiresAt: null,
    });
  });

  it("does not accept a future retrieval date", () => {
    expect(
      evaluate(fact("2026-11-16T12:00:00Z"), NOW, "elevator").state,
    ).toBe("unknown");
  });

  it("treats UNKNOWN and missing values as unknown", () => {
    expect(
      evaluate(fact(hoursAgo(1), { value: "UNKNOWN" }), NOW, "elevator")
        .state,
    ).toBe("unknown");
    expect(
      evaluate(fact(hoursAgo(1), { value: null }), NOW, "elevator").state,
    ).toBe("unknown");
    expect(evaluate(null, NOW, "elevator").state).toBe("unknown");
  });

  it("does not publish tier-0 drafts as current facts", () => {
    expect(
      evaluate(fact(hoursAgo(1), { tier: 0 }), NOW, "elevator").state,
    ).toBe("unknown");
  });

  it("requires source and licence provenance", () => {
    expect(
      evaluate(fact(hoursAgo(1), { source_id: "" }), NOW, "elevator")
        .state,
    ).toBe("unknown");
    expect(
      evaluate(fact(hoursAgo(1), { licence: "" }), NOW, "elevator").state,
    ).toBe("unknown");
  });

  it("does not promote evidence tiers", () => {
    const original = fact(hoursAgo(1), { tier: 1 });
    const before = structuredClone(original);

    evaluate(original, NOW, "elevator");

    expect(original).toEqual(before);
    expect(original.tier).toBe(1);
  });
});

describe("honest badges", () => {
  it("shows last checked wording for a current field", () => {
    const item = fact(hoursAgo(1), { tier: 2 });
    const result = evaluate(item, NOW, "elevator");
    const badge = badgeFor(result, item, "en");

    expect(badge.state).toBe("current");
    expect(badge.label).toContain("Last checked");
    expect(badge.verified).toBe(true);
  });

  it("does not mark tier 1 as verified", () => {
    const item = fact(hoursAgo(1), { tier: 1 });
    const badge = badgeFor(evaluate(item, NOW, "elevator"), item, "en");

    expect(badge.verified).toBe(false);
  });

  it("never marks an expired tier-3 field as verified", () => {
    const item = fact(hoursAgo(5), { tier: 3 });
    const badge = badgeFor(evaluate(item, NOW, "elevator"), item, "en");

    expect(badge).toEqual({
      label: "Needs check",
      state: "needs-check",
      verified: false,
    });
  });
});

describe("needs-check tasks", () => {
  it("creates tasks only for expired fields with a known last-checked date", () => {
    const expired = fact(hoursAgo(5));
    const current = fact(hoursAgo(1));
    const unknown = fact(null);
    const pending = tasks([
      {
        recordId: "synthetic-place-1",
        fields: {
          elevator_status: expired,
          door_width: current,
          curb_snowbank: unknown,
        },
      },
    ], NOW);
    expect(pending).toEqual([
      {
        recordId: "synthetic-place-1",
        field: "elevator_status",
        lastChecked: expired.retrieved_at,
        reason: "expired",
      },
    ]);
  });

  it("does not emit duplicate record/field tasks", () => {
    const expired = fact(hoursAgo(5));
    const pending = tasks([
      { recordId: "a", fields: { elevator_status: expired } },
      { recordId: "a", fields: { elevator_status: expired } },
    ], NOW);
    expect(pending).toHaveLength(1);
  });

  it("sorts by record then field and keeps equal keys stable", () => {
    const sorted = sortTasks([
      { recordId: "b", field: "z", lastChecked: "1", reason: "expired" },
      { recordId: "a", field: "z", lastChecked: "1", reason: "expired" },
      { recordId: "a", field: "a", lastChecked: "1", reason: "expired" },
    ]);
    expect(sorted.map((item) => `${item.recordId}:${item.field}`)).toEqual([
      "a:a",
      "a:z",
      "b:z",
    ]);
  });
});
