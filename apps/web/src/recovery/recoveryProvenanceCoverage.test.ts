import { describe, expect, it } from "vitest";
import {
  fieldOverviews, requestedFieldCoverage, type LedgerDocument,
  type LedgerStatement, type LedgerValue,
} from "./recoveryProvenanceLedger";

const first: LedgerStatement = {
  id: "a", packId: "north", field: "door.width", value: "UNKNOWN",
  phase: "draft", note: "", recordedAt: "2026-11-19T12:00:00.000Z",
  source: { name: "Open source A", licence: "OGL-ON-1.0", date: "2026-11-19", tier: "UNKNOWN", reference: "" },
};
const doc = (...entries: LedgerStatement[]): LedgerDocument => ({ format: "local-source-ledger-v1", entries });
const variant = (id: string, value: LedgerValue): LedgerStatement => ({ ...first, id, value });

describe("field summary is not an accessibility conclusion", () => {
  it("returns no fields for an empty journal", () => {
    expect(fieldOverviews(doc())).toEqual([]);
  });
  it("reports UNKNOWN for a single uncertain statement", () => {
    expect(fieldOverviews(doc(first))[0]?.outcome).toBe("UNKNOWN");
  });
  it("reports a single claim as reported, not ready", () => {
    expect(fieldOverviews(doc(variant("b", "present")))[0]?.outcome).toBe("reported");
  });
  it("does not infer a definitive status from conflicting claims", () => {
    const result = fieldOverviews(doc(variant("b", "present"), variant("c", "absent")));
    expect(result[0]?.outcome).toBe("disputed");
  });
  it("groups statements by pack and field", () => {
    const result = fieldOverviews(doc(first, { ...first, id: "b", packId: "south" }, { ...first, id: "c", field: "door.plate" }));
    expect(result).toHaveLength(3);
  });
  it("deduplicates source names without fabricating new sources", () => {
    const result = fieldOverviews(doc(first, variant("b", "present")));
    expect(result[0]?.sources).toEqual(["Open source A"]);
  });
  it("records distinct open licences per group", () => {
    const second = { ...first, id: "b", source: { ...first.source, licence: "CC0-1.0" } };
    expect(fieldOverviews(doc(first, second))[0]?.licences).toEqual(["CC0-1.0", "OGL-ON-1.0"]);
  });
  it("keeps explicit evidence tiers", () => {
    const second = { ...first, id: "b", source: { ...first.source, tier: "source-document" as const } };
    expect(fieldOverviews(doc(first, second))[0]?.tiers).toEqual(["UNKNOWN", "source-document"]);
  });
  it("reports the latest supplied source date", () => {
    const older = { ...first, id: "b", source: { ...first.source, date: "2026-11-01" } };
    expect(fieldOverviews(doc(first, older))[0]?.latestSourceDate).toBe("2026-11-19");
  });
  it("counts review states without rewriting older statements", () => {
    const reviewed = { ...first, id: "b", phase: "reviewed" as const };
    expect(fieldOverviews(doc(first, reviewed))[0]?.reviewedCount).toBe(1);
  });
  it("counts the number of explicitly unknown claims", () => {
    expect(fieldOverviews(doc(first, variant("b", "present")))[0]?.unknownCount).toBe(1);
  });
});

describe("requested coverage remains UNKNOWN when missing", () => {
  it("accepts an empty list", () => {
    expect(requestedFieldCoverage(doc(), [])).toEqual({ ok: true, value: [] });
  });
  it("does not infer a requested missing field", () => {
    const result = requestedFieldCoverage(doc(first), [{ packId: "north", field: "stepCount" }]);
    expect(result).toEqual({ ok: true, value: [{ packId: "north", field: "stepCount", outcome: "UNKNOWN", sourceCount: 0, latestSourceDate: null }] });
  });
  it("reports an observed field without claiming access", () => {
    const result = requestedFieldCoverage(doc(variant("b", "present")), [{ packId: "north", field: "door.width" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value[0]?.outcome).toBe("reported");
    expect(result.value[0]?.sourceCount).toBe(1);
  });
  it("does not substitute another pack's field", () => {
    const result = requestedFieldCoverage(doc(first), [{ packId: "south", field: "door.width" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value[0]?.outcome).toBe("UNKNOWN");
  });
  it("does not substitute a similarly named field", () => {
    const result = requestedFieldCoverage(doc(first), [{ packId: "north", field: "door.width2" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value[0]?.sourceCount).toBe(0);
  });
  it("retains conflicting status for requested fields", () => {
    const result = requestedFieldCoverage(doc(variant("b", "present"), variant("c", "absent")), [{ packId: "north", field: "door.width" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value[0]?.outcome).toBe("disputed");
  });
  it("preserves request ordering", () => {
    const req = [{ packId: "north", field: "steps" }, { packId: "north", field: "door.width" }];
    const result = requestedFieldCoverage(doc(first), req);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.map((item) => item.field)).toEqual(["steps", "door.width"]);
  });
  it("rejects duplicate requests", () => {
    const req = [{ packId: "north", field: "door.width" }, { packId: "north", field: "door.width" }];
    expect(requestedFieldCoverage(doc(first), req)).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects invalid pack IDs", () => {
    expect(requestedFieldCoverage(doc(first), [{ packId: "../escape", field: "width" }])).toEqual({ ok: false, issue: "identifier" });
  });
  it("rejects invalid field keys", () => {
    expect(requestedFieldCoverage(doc(first), [{ packId: "north", field: "a/b" }])).toEqual({ ok: false, issue: "identifier" });
  });
  it("keeps source dates attached to coverage", () => {
    const result = requestedFieldCoverage(doc(first), [{ packId: "north", field: "door.width" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value[0]?.latestSourceDate).toBe("2026-11-19");
  });
  it("never adds fields that were not requested", () => {
    const result = requestedFieldCoverage(doc(first), [{ packId: "north", field: "other" }]);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value).toHaveLength(1);
  });
});
