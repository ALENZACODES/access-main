import { describe, expect, it } from "vitest";
import type { LocalPackRecord } from "./packInventory";
import { planPackRepairs, repairPolicyCopy, type PolicyFlag } from "./recoveryPolicy";

const day = "2026-11-15";
const source = { name: "Ontario open source", licence: "OGL-ON-1.0", date: "2026-10-10" };
const ready: LocalPackRecord = {
  id: "a", state: "ready", byteLength: 12, source,
};
const inspect = (records: readonly LocalPackRecord[]) => planPackRepairs(records, { date: day });

describe("pack repair policy", () => {
  it("allows content-ready only for an inspected ready record", () => {
    const result = inspect([ready]);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.contentReady).toBe(true);
    expect(result.recommendations[0]?.priority).toBe("none");
    expect(result.recommendations[0]?.kind).toBe("none");
    expect(result.totals).toEqual({ blocked: 0, review: 0, none: 1 });
  });

  it.each(["absent", "corrupt", "unknown"] as const)(
    "never promotes a %s record to content-ready", (state) => {
      const result = inspect([{ ...ready, state }]);
      expect(result.recommendations[0]?.contentReady).toBe(false);
      expect(result.recommendations[0]?.priority).toBe("blocked");
    },
  );

  it.each([
    ["absent", "redownload", "absent"],
    ["corrupt", "redownload", "damaged"],
    ["unknown", "inspect", "unknown"],
  ] as const)("returns a %s repair path", (state, kind, flag) => {
    const item = inspect([{ ...ready, state }]).recommendations[0]!;
    expect(item.kind).toBe(kind);
    expect(item.flags).toContain(flag);
  });

  it("keeps missing provenance visible while preserving local file state", () => {
    const item = inspect([{ id: "missing", state: "ready", byteLength: 10 }]).recommendations[0]!;
    expect(item.state).toBe("ready");
    expect(item.flags).toContain("missing-source");
    expect(item.priority).toBe("review");
    expect(item.contentReady).toBe(true);
    expect(item.source).toBeUndefined();
  });

  it("does not infer a licence when one is absent", () => {
    const item = inspect([{ ...ready, source: { ...source, licence: "" } }]).recommendations[0]!;
    expect(item.flags).toContain("closed-licence");
    expect(item.source?.licence).toBe("");
    expect(item.priority).toBe("review");
  });

  it.each(["CC-BY-NC-4.0", "Proprietary", "MIT", "CC-BY-4.0-extra", "?"])(
    "flags unsupported licence %s", (licence) => {
      const item = inspect([{ ...ready, source: { ...source, licence } }]).recommendations[0]!;
      expect(item.flags).toContain("closed-licence");
      expect(item.priority).toBe("review");
    },
  );

  it.each(["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"])(
    "accepts the open licence %s", (licence) => {
      const item = inspect([{ ...ready, source: { ...source, licence } }]).recommendations[0]!;
      expect(item.flags).not.toContain("closed-licence");
    },
  );

  it.each(["", "2026-02-30", "2026-13-01", "yesterday", "2026/01/01"])(
    "rejects invalid source date %s", (date) => {
      const item = inspect([{ ...ready, source: { ...source, date } }]).recommendations[0]!;
      expect(item.flags).toContain("bad-date");
    },
  );

  it("flags a future source date without changing it", () => {
    const item = inspect([{ ...ready, source: { ...source, date: "2026-11-16" } }]).recommendations[0]!;
    expect(item.flags).toContain("future-date");
    expect(item.source?.date).toBe("2026-11-16");
  });

  it("does not label a source date as future when no valid inspection date exists", () => {
    const result = planPackRepairs([
      { ...ready, source: { ...source, date: "2027-01-01" } },
    ], { date: "invalid" });
    expect(result.date).toBeNull();
    expect(result.recommendations[0]?.flags).not.toContain("future-date");
  });

  it.each(["", "../unsafe", "a/b", "a\\b", " name", "..", "."])(
    "blocks unsafe pack identifier %s", (id) => {
      const item = inspect([{ ...ready, id }]).recommendations[0]!;
      expect(item.priority).toBe("blocked");
      expect(item.kind).toBe("inspect");
      expect(item.contentReady).toBe(false);
      expect(item.flags).toContain("invalid-id");
    },
  );

  it("treats repeated identifiers as a blocker", () => {
    const result = inspect([ready, ready]);
    expect(result.recommendations[0]?.contentReady).toBe(true);
    expect(result.recommendations[1]?.contentReady).toBe(false);
    expect(result.recommendations[1]?.flags).toContain("duplicate-id");
    expect(result.totals.blocked).toBe(1);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "blocks an invalid byte length %s", (byteLength) => {
      const item = inspect([{ ...ready, byteLength }]).recommendations[0]!;
      expect(item.flags).toContain("size-invalid");
      expect(item.contentReady).toBe(false);
      expect(item.kind).toBe("storage");
    },
  );

  it("distinguishes an absent byte length from invalid byte length", () => {
    const item = inspect([{ id: "unknown-size", state: "unknown" }]).recommendations[0]!;
    expect(item.bytes).toBeNull();
    expect(item.flags).toContain("size-unknown");
    expect(item.flags).not.toContain("size-invalid");
  });

  it("enforces an aggregate capacity ceiling", () => {
    const result = planPackRepairs([
      { ...ready, id: "a", byteLength: 9 },
      { ...ready, id: "b", byteLength: 9 },
    ], { date: day, maximumKnownBytes: 12 });
    expect(result.recommendations[0]?.contentReady).toBe(true);
    expect(result.recommendations[1]?.flags).toContain("capacity-limit");
    expect(result.recommendations[1]?.contentReady).toBe(false);
  });

  it("enforces the pack count ceiling and reports overflow", () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ ...ready, id: `p-${i}` }));
    const result = planPackRepairs(records, { date: day, maximumPacks: 3 });
    expect(result.recommendations).toHaveLength(3);
    expect(result.overflow).toBe(7);
    expect(result.recommendations.map((x) => x.id)).toEqual(["p-0", "p-1", "p-2"]);
  });

  it("uses bounded defaults for invalid caller limits", () => {
    const records = Array.from({ length: 550 }, (_, i) => ({ ...ready, id: `p-${i}` }));
    const result = planPackRepairs(records, {
      date: day, maximumPacks: Number.POSITIVE_INFINITY,
      maximumKnownBytes: -1,
    });
    expect(result.recommendations).toHaveLength(500);
    expect(result.overflow).toBe(50);
  });

  it("does not mutate the supplied inventory", () => {
    const records = Object.freeze([Object.freeze({ ...ready })]);
    const first = inspect(records);
    const second = inspect(records);
    expect(first).toEqual(second);
    expect(records).toHaveLength(1);
  });

  it("emits one finding for each code", () => {
    const result = inspect([{ ...ready, state: "corrupt", source: undefined, byteLength: undefined }]);
    expect(new Set(result.findings.map((f) => f.flag))).toEqual(
      new Set<PolicyFlag>(["damaged", "size-unknown", "missing-source"]),
    );
    expect(result.findings.every((finding) => finding.packId === "a")).toBe(true);
  });

  it("supplies a complete, separate translation for every flag", () => {
    const en = repairPolicyCopy("en");
    const fr = repairPolicyCopy("fr");
    const flags: readonly PolicyFlag[] = [
      "absent", "damaged", "unknown", "missing-source", "closed-licence",
      "bad-date", "future-date", "invalid-id", "duplicate-id", "size-unknown",
      "size-invalid", "capacity-limit",
    ];
    for (const flag of flags) {
      expect(en.flags[flag].length).toBeGreaterThan(5);
      expect(fr.flags[flag].length).toBeGreaterThan(5);
      expect(en.flags[flag]).not.toBe(fr.flags[flag]);
    }
  });
});
