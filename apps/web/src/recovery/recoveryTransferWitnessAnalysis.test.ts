import { describe, expect, it } from "vitest";
import {
  compareWitnessDocuments, groupWitnessPacks, groupWitnessSources,
  witnessAcknowledgementIsAuthority, witnessCoverage, witnessFindings,
  witnessPeriods, witnessReport, witnessReviewSteps, witnessTextReport,
  witnessTimeline,
} from "./recoveryTransferWitnessAnalysis";
import {
  emptyWitnessDocument, type WitnessDocument, type WitnessEvent,
  type WitnessSource, type WitnessTransfer,
} from "./recoveryTransferWitness";

const source: WitnessSource = {
  name: "User supplied notes", licence: "Example licence", retrievedOn: "2026-11-19",
  tier: "UNKNOWN", reference: "source-1",
};
const make = (id: string, values: Partial<WitnessTransfer> = {}): WitnessTransfer => ({
  id, packId: "pack-a", label: `Observation ${id}`,
  kind: "recovery-report", channel: "UNKNOWN", condition: "UNKNOWN",
  phase: "draft", recordedAt: "2026-11-19T09:00:00.000Z", source,
  note: "Locally reported", suppliedDigest: null, suppliedBytes: null,
  ...values,
});
const event = (id: string, transferId: string, values: Partial<WitnessEvent> = {}): WitnessEvent => ({
  id, transferId, action: "note", at: "2026-11-19T10:00:00.000Z",
  note: "Manual note", source, ...values,
});
const doc = (transfers: WitnessTransfer[], events: WitnessEvent[] = []): WitnessDocument => ({
  ...emptyWitnessDocument(), transfers, events,
});
const sample = doc([
  make("transfer-1"),
  make("transfer-2", { packId: "pack-b", channel: "paper", condition: "partial", phase: "offered", kind: "handoff-note" }),
  make("transfer-3", { packId: "pack-a", channel: "conversation", condition: "interrupted", phase: "acknowledged", kind: "evidence-list", source: { ...source, tier: "documented" } }),
  make("transfer-4", { packId: "pack-c", condition: "not-accessible", phase: "disputed", suppliedBytes: 10, suppliedDigest: "provided" }),
], [event("event-1", "transfer-1")]);

describe("recovery transfer witness pack groups", () => {
  it("returns no groups for an empty document", () => {
    expect(groupWitnessPacks(emptyWitnessDocument())).toEqual([]);
  });
  it("sorts pack identifiers", () => {
    expect(groupWitnessPacks(sample).map((item) => item.packId)).toEqual(["pack-a", "pack-b", "pack-c"]);
  });
  it("counts transfers for each pack", () => {
    expect(groupWitnessPacks(sample)[0]?.transfers).toBe(2);
  });
  it("distinguishes open phases from acknowledged or withdrawn", () => {
    expect(groupWitnessPacks(sample)[0]?.open).toBe(1);
  });
  it("counts disputed records separately", () => {
    expect(groupWitnessPacks(sample).find((item) => item.packId === "pack-c")?.disputed).toBe(1);
  });
  it("preserves multiple reported conditions", () => {
    expect(groupWitnessPacks(sample)[0]?.conditions).toEqual(["UNKNOWN", "interrupted"]);
  });
  it("tracks distinct kinds by pack", () => {
    expect(groupWitnessPacks(sample)[0]?.kinds).toEqual(["evidence-list", "recovery-report"]);
  });
  it("does not change unknown conditions while grouping", () => {
    expect(groupWitnessPacks(sample)[0]?.unknown).toBe(1);
  });
  it("never claims readiness at group level", () => {
    expect(groupWitnessPacks(sample).every((item) => item.contentReady === false)).toBe(true);
  });
  it("groups one transfer with a unique pack correctly", () => {
    expect(groupWitnessPacks(doc([make("transfer-x", { packId: "solo" })]))[0]?.transfers).toBe(1);
  });
});

describe("source reconciliation without source upgrades", () => {
  it("returns no sources for no records", () => {
    expect(groupWitnessSources(emptyWitnessDocument())).toEqual([]);
  });
  it("groups records by exact provenance metadata", () => {
    expect(groupWitnessSources(sample)).toHaveLength(2);
  });
  it("keeps the exact licence string", () => {
    expect(groupWitnessSources(sample).every((item) => item.source.licence === "Example licence")).toBe(true);
  });
  it("does not alter the source tier", () => {
    expect(groupWitnessSources(sample).some((item) => item.source.tier === "UNKNOWN")).toBe(true);
  });
  it("separates sources with different references", () => {
    const cases = doc([make("one"), make("two", { source: { ...source, reference: "source-2" } })]);
    expect(groupWitnessSources(cases)).toHaveLength(2);
  });
  it("separates sources with a different retrieval date", () => {
    const cases = doc([make("one"), make("two", { source: { ...source, retrievedOn: "2026-11-18" } })]);
    expect(groupWitnessSources(cases)).toHaveLength(2);
  });
  it("sorts identifiers inside a group", () => {
    const cases = doc([make("zeta"), make("alpha")]);
    expect(groupWitnessSources(cases)[0]?.identifiers).toEqual(["alpha", "zeta"]);
  });
  it("counts the number of records linked to one source", () => {
    const cases = doc([make("one"), make("two")]);
    expect(groupWitnessSources(cases)[0]?.transfers).toBe(2);
  });
  it("preserves the source reference for audit", () => {
    expect(groupWitnessSources(sample).some((item) => item.references.includes("source-1"))).toBe(true);
  });
});

describe("manual recovery transfer witness timelines", () => {
  it("returns an empty timeline for an empty document", () => {
    expect(witnessTimeline(emptyWitnessDocument())).toEqual([]);
  });
  it("includes an initial event for each recorded transfer", () => {
    expect(witnessTimeline(sample).filter((item) => item.action === "created")).toHaveLength(4);
  });
  it("includes supplied manual notes", () => {
    expect(witnessTimeline(sample).some((item) => item.action === "note")).toBe(true);
  });
  it("keeps the source name for the initial event", () => {
    expect(witnessTimeline(sample)[0]?.source).toBe("User supplied notes");
  });
  it("keeps the source tier unchanged", () => {
    expect(witnessTimeline(sample).some((item) => item.sourceTier === "UNKNOWN")).toBe(true);
  });
  it("returns only the chosen transfer when filtered", () => {
    expect(witnessTimeline(sample, "transfer-2")).toHaveLength(1);
  });
  it("returns nothing for an unknown transfer identifier", () => {
    expect(witnessTimeline(sample, "missing-transfer")).toEqual([]);
  });
  it("sorts timeline events by timestamp", () => {
    const points = witnessTimeline(sample);
    expect(points.map((item) => item.at)).toEqual([...points.map((item) => item.at)].sort());
  });
  it("infers the state of an offered event only as a recorded state", () => {
    const cases = doc([make("one")], [event("e", "one", { action: "offered" })]);
    expect(witnessTimeline(cases).find((item) => item.action === "offered")?.phase).toBe("offered");
  });
  it("keeps a disputed event separate from acknowledgement", () => {
    const cases = doc([make("one")], [event("e", "one", { action: "disputed" })]);
    expect(witnessTimeline(cases).find((item) => item.action === "disputed")?.phase).toBe("disputed");
  });
  it("keeps the manual event note readable", () => {
    expect(witnessTimeline(sample).some((item) => item.note === "Manual note")).toBe(true);
  });
  it("supports more than one timestamp per transfer", () => {
    const cases = doc([make("one")], [event("e1", "one"), event("e2", "one", { at: "2026-11-19T11:00:00.000Z" })]);
    expect(witnessTimeline(cases, "one")).toHaveLength(3);
  });
});

describe("daily witness activity summaries", () => {
  it("returns no periods for no observations", () => {
    expect(witnessPeriods(emptyWitnessDocument())).toEqual([]);
  });
  it("groups all same-day events into one period", () => {
    expect(witnessPeriods(sample)).toHaveLength(1);
  });
  it("counts created transfers on the correct day", () => {
    expect(witnessPeriods(sample)[0]?.transfers).toBe(4);
  });
  it("counts manual events on the correct day", () => {
    expect(witnessPeriods(sample)[0]?.events).toBe(1);
  });
  it("does not infer a receipt from a note event", () => {
    expect(witnessPeriods(sample)[0]?.acknowledgements).toBe(0);
  });
  it("does not infer a dispute from a disputed phase without an event", () => {
    expect(witnessPeriods(sample)[0]?.disputes).toBe(0);
  });
  it("counts explicit acknowledgement events", () => {
    const cases = doc([make("one")], [event("e", "one", { action: "acknowledged" })]);
    expect(witnessPeriods(cases)[0]?.acknowledgements).toBe(1);
  });
  it("counts explicit dispute events", () => {
    const cases = doc([make("one")], [event("e", "one", { action: "disputed" })]);
    expect(witnessPeriods(cases)[0]?.disputes).toBe(1);
  });
  it("sorts periods chronologically", () => {
    const cases = doc([make("late"), make("early", { recordedAt: "2026-11-17T09:00:00.000Z" })]);
    expect(witnessPeriods(cases).map((item) => item.day)).toEqual(["2026-11-17", "2026-11-19"]);
  });
  it("includes days consisting only of a manual event", () => {
    const cases = doc([make("one")], [event("e", "one", { at: "2026-11-20T09:00:00.000Z" })]);
    expect(witnessPeriods(cases)).toHaveLength(2);
  });
});

describe("review findings and non-authoritative coverage", () => {
  it("returns no findings for empty reports", () => {
    expect(witnessFindings(emptyWitnessDocument(), "2026-11-20")).toEqual([]);
  });
  it("reports a literal UNKNOWN condition", () => {
    expect(witnessFindings(sample, "2026-11-20").some((item) => item.code === "unknown-condition")).toBe(true);
  });
  it("reports an UNKNOWN evidence tier without reclassifying it", () => {
    expect(witnessFindings(sample, "2026-11-20").some((item) => item.code === "unknown-tier")).toBe(true);
  });
  it("flags offered transfers without a recorded acknowledgement", () => {
    expect(witnessFindings(sample, "2026-11-20").some((item) => item.code === "no-receipt")).toBe(true);
  });
  it("reports explicit disputed phases", () => {
    expect(witnessFindings(sample, "2026-11-20").some((item) => item.code === "disputed")).toBe(true);
  });
  it("reports partial observations without upgrading them", () => {
    expect(witnessFindings(sample, "2026-11-20").some((item) => item.code === "partial")).toBe(true);
  });
  it("flags source retrieval dates after the observation", () => {
    const cases = doc([make("one", { source: { ...source, retrievedOn: "2026-11-20" } })]);
    expect(witnessFindings(cases, "2026-11-20").some((item) => item.code === "stale-source")).toBe(true);
  });
  it("flags future transfer times relative to the report day", () => {
    expect(witnessFindings(sample, "2026-11-18").some((item) => item.code === "future-event")).toBe(true);
  });
  it("flags future events relative to the report day", () => {
    const cases = doc([make("one")], [event("e", "one", { at: "2026-11-25T10:00:00.000Z" })]);
    expect(witnessFindings(cases, "2026-11-20").some((item) => item.code === "future-event")).toBe(true);
  });
  it("detects different conditions for identical pack, kind and channel", () => {
    const cases = doc([make("one"), make("two", { condition: "partial" })]);
    expect(witnessFindings(cases, "2026-11-20").filter((item) => item.code === "conflicting-transfer")).toHaveLength(2);
  });
  it("does not conflate unrelated pack identifiers", () => {
    const cases = doc([make("one"), make("two", { packId: "pack-b", condition: "partial" })]);
    expect(witnessFindings(cases, "2026-11-20").some((item) => item.code === "conflicting-transfer")).toBe(false);
  });
  it("does not conflate different transfer kinds", () => {
    const cases = doc([make("one"), make("two", { kind: "handoff-note", condition: "partial" })]);
    expect(witnessFindings(cases, "2026-11-20").some((item) => item.code === "conflicting-transfer")).toBe(false);
  });
  it("counts known and unknown conditions separately", () => {
    expect(witnessCoverage(sample).conditionUnknown).toBe(1);
    expect(witnessCoverage(sample).conditionKnown).toBe(3);
  });
  it("counts supplied digests without claiming they are checked", () => {
    expect(witnessCoverage(sample).withDigest).toBe(1);
  });
  it("counts supplied byte lengths separately", () => {
    expect(witnessCoverage(sample).withBytes).toBe(1);
  });
  it("counts entries with a manual event", () => {
    expect(witnessCoverage(sample).withEvents).toBe(1);
  });
  it("counts UNKNOWN source tiers literally", () => {
    expect(witnessCoverage(sample).sourceTiers.UNKNOWN).toBe(3);
  });
  it("does not treat acknowledgement as proof of usability", () => {
    expect(witnessCoverage(sample).contentReady).toBe(false);
  });
  it("returns actionable manual review entries", () => {
    expect(witnessReviewSteps(sample, "2026-11-20").length).toBeGreaterThan(0);
  });
  it("prioritizes attention findings above low-priority review", () => {
    expect(witnessReviewSteps(sample, "2026-11-20")[0]?.priority).toBe("high");
  });
  it("never treats a review step as permission to open a pack", () => {
    expect(witnessReviewSteps(sample, "2026-11-20").every((step) => step.contentReady === false)).toBe(true);
  });
  it("reports the supplied date instead of inventing a refresh time", () => {
    expect(witnessReport(sample, "2026-11-20").createdFor).toBe("2026-11-20");
  });
  it("includes all packs in the report", () => {
    expect(witnessReport(sample, "2026-11-20").packs).toHaveLength(3);
  });
  it("does not claim that any report establishes readiness", () => {
    expect(witnessReport(sample, "2026-11-20").contentReady).toBe(false);
  });
  it("reports new identifiers in a comparison", () => {
    expect(compareWitnessDocuments(emptyWitnessDocument(), sample).added).toHaveLength(4);
  });
  it("reports removed identifiers", () => {
    expect(compareWitnessDocuments(sample, emptyWitnessDocument()).removed).toHaveLength(4);
  });
  it("reports changes to source provenance", () => {
    const first = doc([make("one")]);
    const second = doc([make("one", { source: { ...source, tier: "documented" } })]);
    expect(compareWitnessDocuments(first, second).changedSources).toEqual(["one"]);
  });
  it("reports state changes independently from source changes", () => {
    const first = doc([make("one")]);
    const second = doc([make("one", { phase: "offered" })]);
    expect(compareWitnessDocuments(first, second).changedPhases).toEqual(["one"]);
  });
  it("does not invent a changed identifier for an identical record", () => {
    const first = doc([make("one")]);
    expect(compareWitnessDocuments(first, first).changed).toEqual([]);
  });
  it("never assigns authority to an acknowledgement", () => {
    expect(witnessAcknowledgementIsAuthority(event("e", "one", { action: "acknowledged" }))).toBe(false);
  });
});

describe("bilingual transfer witness report text", () => {
  it("keeps the literal UNKNOWN in English", () => {
    expect(witnessTextReport(sample, "2026-11-20", "en")).toContain("UNKNOWN");
  });
  it("keeps the literal UNKNOWN in French", () => {
    expect(witnessTextReport(sample, "2026-11-20", "fr")).toContain("UNKNOWN");
  });
  it("includes a caution that packs are not authorized in English", () => {
    expect(witnessTextReport(sample, "2026-11-20", "en")).toContain("never establishes");
  });
  it("includes the corresponding caution in French", () => {
    expect(witnessTextReport(sample, "2026-11-20", "fr")).toContain("n’établit jamais");
  });
  it("uses a no-break space before a French colon", () => {
    expect(witnessTextReport(sample, "2026-11-20", "fr")).toContain("\u00a0:");
  });
  it("uses French typographic apostrophes", () => {
    expect(witnessTextReport(sample, "2026-11-20", "fr")).toContain("’");
  });
  it("includes the requested report date in English", () => {
    expect(witnessTextReport(sample, "2026-11-20", "en")).toContain("2026-11-20");
  });
  it("includes the requested report date in French", () => {
    expect(witnessTextReport(sample, "2026-11-20", "fr")).toContain("2026-11-20");
  });
  it("does not include unsupported assurance language", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(witnessTextReport(sample, "2026-11-20", locale)).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b/i);
    }
  });
});
