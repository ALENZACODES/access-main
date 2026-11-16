import { describe, expect, it } from "vitest";
import { inspectRecoveryPlan, planImportCopy, type ImportIssue } from "./recoveryPlanImport";

const date = "2026-11-15";
const source = { name: "Community dataset", licence: "CC-BY-4.0", date: "2025-04-01" };
const base = {
  format: "local-recovery-plan-v1", inspectionDate: date,
  outcome: "needs-action",
  entries: [
    { packId: "ontario-east", localState: "corrupt", queueStage: "waiting", source },
    { packId: "ontario-west", localState: "unknown", queueStage: "unknown", source: null },
  ],
  session: { actions: 2, omitted: 0 },
};
function parse(value: unknown, referenceDate = date) {
  return inspectRecoveryPlan(JSON.stringify(value), { referenceDate });
}
function expectIssue(input: unknown, code: ImportIssue): void {
  const result = parse(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.document).toBeNull();
    expect(result.findings.some((f) => f.code === code)).toBe(true);
  }
}

describe("portable plan inspection", () => {
  it("accepts safe plans without performing any action", () => {
    const result = parse(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.entries).toHaveLength(2);
      expect(result.document.entries[0]?.source).toEqual(source);
      expect(result.document.entries[1]?.localState).toBe("unknown");
      expect(result.document.entries[1]?.queueStage).toBe("unknown");
      expect(result.document.session).toEqual({ actions: 2, omitted: 0 });
    }
  });

  it("rejects empty data", () => {
    const result = inspectRecoveryPlan("  ", { referenceDate: date });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings[0]?.code).toBe("empty");
  });

  it("rejects malformed JSON", () => {
    const result = inspectRecoveryPlan("{broken", { referenceDate: date });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings[0]?.code).toBe("invalid-json");
  });

  it("rejects text exceeding a byte bound (not only a UTF-16 length)", () => {
    const result = inspectRecoveryPlan("é".repeat(12), { referenceDate: date, maxBytes: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings.some((f) => f.code === "too-large")).toBe(true);
  });

  it("rejects an unsupported format", () => {
    expectIssue({ ...base, format: "local-recovery-plan-v2" }, "unknown-format");
  });

  it("rejects nonobject root values", () => {
    for (const candidate of [null, true, "abc", 1, [], [base]]) {
      expectIssue(candidate, "invalid-shape");
    }
  });

  it("rejects unexpected root keys, including injected content", () => {
    expectIssue({ ...base, url: "https://example.test/collect" }, "unexpected-field");
    expectIssue({ ...base, location: { latitude: 42 } }, "unexpected-field");
  });

  it("does not allow a plan dated later than the supplied reference", () => {
    expectIssue({ ...base, inspectionDate: "2026-11-16" }, "future-date");
  });

  it("rejects invalid and impossible dates", () => {
    for (const candidate of ["2026-02-30", "11/15/2026", "2026-13-10", "", null]) {
      expectIssue({ ...base, inspectionDate: candidate }, "invalid-date");
    }
  });

  it("rejects an invalid caller reference date", () => {
    const result = parse(base, "2026-99-99");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings.some((f) => f.path === "referenceDate")).toBe(true);
  });

  it("rejects unknown outcome claims", () => {
    for (const outcome of ["complete", "safe", "approved", null, 1]) {
      expectIssue({ ...base, outcome }, "invalid-outcome");
    }
  });

  it("accepts every supported outcome without elevating the state", () => {
    for (const outcome of ["needs-action", "review", "unknown", "no-local-issue"]) {
      const result = parse({ ...base, outcome });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.document.entries[1]?.localState).toBe("unknown");
    }
  });

  it("rejects absent entries and entry overflow", () => {
    expectIssue({ ...base, entries: null }, "invalid-shape");
    expectIssue({ ...base, entries: Array(8).fill(base.entries[0]) }, "duplicate-id");
    const result = inspectRecoveryPlan(JSON.stringify({ ...base, entries: Array(8).fill(base.entries[0]) }),
      { referenceDate: date, maxEntries: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings.some((f) => f.code === "too-many-packs")).toBe(true);
  });

  it("rejects repeated identifiers", () => {
    expectIssue({ ...base, entries: [base.entries[0], base.entries[0]] }, "duplicate-id");
  });

  it("rejects identifiers with traversal or separators", () => {
    for (const packId of ["../secret", "a/b", "x\\y", "", "pack?x=1", "#fragment"]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], packId }] }, "invalid-id");
    }
  });

  it("rejects extra entry properties rather than leaking arbitrary data", () => {
    expectIssue({ ...base, entries: [{ ...base.entries[0], email: "a@example.test" }] }, "invalid-shape");
  });

  it("rejects unsupported local states", () => {
    for (const localState of ["accessible", "success", "complete", "READY", null]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], localState }] }, "invalid-state");
    }
  });

  it("rejects unsupported queue stages", () => {
    for (const queueStage of ["approved", "automatic", "downloaded", "complete", null]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], queueStage }] }, "invalid-stage");
    }
  });

  it("accepts all declared historical queue stages as notes", () => {
    for (const queueStage of ["pending", "selected", "waiting", "recheck", "done", "unknown"]) {
      const result = parse({ ...base, entries: [{ ...base.entries[0], queueStage }] });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects missing source and unsupported shapes", () => {
    const withoutSource: Record<string, unknown> = { ...base.entries[0]! };
    delete withoutSource.source;
    expectIssue({ ...base, entries: [withoutSource] }, "invalid-source");
    for (const replacement of [[], 0, "source", {}, { name: "A", licence: "CC0" }]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], source: replacement }] }, "invalid-source");
    }
  });

  it("requires open licence metadata", () => {
    for (const licence of ["all rights reserved", "proprietary", "restricted", ""]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], source: { ...source, licence } }] },
        licence === "" ? "invalid-source" : "closed-licence");
    }
  });

  it("rejects stale claims expressed with future source dates", () => {
    expectIssue({ ...base, entries: [{ ...base.entries[0], source: { ...source, date: "2026-11-16" } }] },
      "source-future");
  });

  it("rejects impossible source dates", () => {
    expectIssue({ ...base, entries: [{ ...base.entries[0], source: { ...source, date: "2025-02-30" } }] },
      "source-date");
  });

  it("rejects dangerous source markup and control characters", () => {
    for (const name of ["<script>", "A\u0000B", "Bad\nName", "<>" ]) {
      expectIssue({ ...base, entries: [{ ...base.entries[0], source: { ...source, name } }] }, "invalid-source");
    }
  });

  it("rejects extra source keys", () => {
    expectIssue({ ...base, entries: [{ ...base.entries[0], source: { ...source, url: "https://example.test" } }] },
      "invalid-source");
  });

  it("rejects unsafe session totals", () => {
    for (const actions of [-1, 1.2, 1e20, "1", null]) {
      expectIssue({ ...base, session: { actions, omitted: 0 } }, "invalid-session");
    }
  });

  it("rejects unexpected session metadata", () => {
    expectIssue({ ...base, session: { actions: 2, omitted: 0, token: "hidden" } }, "invalid-session");
  });

  it("sorts safely accepted entries by pack identifier", () => {
    const result = parse(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.entries.map((entry) => entry.packId))
      .toEqual(["ontario-east", "ontario-west"]);
  });

  it("has complete bilingual messages for each error", () => {
    const en = planImportCopy("en");
    const fr = planImportCopy("fr");
    for (const key of Object.keys(en.issue) as ImportIssue[]) {
      expect(en.issue[key].length).toBeGreaterThan(8);
      expect(fr.issue[key].length).toBeGreaterThan(8);
    }
    expect(fr.intro).toContain("’");
    expect(en.intro).toContain("past note");
  });
});
