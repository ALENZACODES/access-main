import { describe, expect, it } from "vitest";
import { emptyChain, parseChain, serializeChain, CHAIN_LIMITS } from "../recoveryHandoffChain";
import { emptyDrillDocument, parseDrills, serializeDrills, DRILL_LIMITS } from "../recoveryDrillRun";
import { exportPacket, importPacket, PACKET_LIMITS } from "../recoveryEvidencePacket";
import {
  beginGuidedCase, emptyGuidedDocument, parseGuidedDocument, recordGuidedStep,
  serializeGuidedDocument, GUIDED_LIMITS,
} from "../recoveryGuidedReview";
import { emptyReceiptDocument, exportReceiptDocument, importReceiptDocument, RECEIPT_LIMITS } from "../recoveryReceiptLedger";
import {
  newReconciliationDocument, parseReconciliation, serializeReconciliation, RECONCILIATION_LIMITS,
} from "../recoveryReconciliation";
import { emptyRefreshDocument, exportRefreshDocument, parseRefreshDocument, REFRESH_LIMITS } from "../recoverySourceRefresh";
import {
  addBriefObservation, addBriefQuestion, beginBrief, emptyBriefDocument, exportBriefs,
  importBriefs, BRIEF_LIMITS,
} from "../recoverySupportBrief";
import {
  emptyWitnessDocument, parseWitnessDocument, serializeWitnessDocument, WITNESS_LIMITS,
} from "../recoveryTransferWitness";
import { byteCap, classifyRecoveryText, type RecoveryKind } from "./formats";
import { inspectMember, openBundle } from "./model";
import { bundleFile, packetWith, valueOf, wireEntry } from "./bundleTestSupport";

type NativeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: string };

function native<T>(result: NativeResult<T>): T {
  if (!result.ok) throw new Error(`Native tool rejected its sample: ${result.issue}`);
  return result.value;
}

const start = "2026-10-07T10:00:00.000Z";
const followup = "2026-10-07T11:00:00.000Z";
const source = {
  name: "Local example", licence: "CC0", retrievedOn: "2026-10-05",
  reference: "record-a", tier: "UNKNOWN",
} as const;
const packId = "sample-1";
const note = "État inconnu";
const provenance = {
  source: source.name, licence: source.licence, retrievedOn: source.retrievedOn,
  reference: source.reference, tier: source.tier,
};

const receipt = exportReceiptDocument({
  ...emptyReceiptDocument(),
  entries: [{
    id: "r", packId, operation: "handoff", stage: "sent", createdAt: start, source,
    observation: { condition: "UNKNOWN", summary: note, expectedBytes: null, observedBytes: null, digest: null },
    handoffRole: "reviewer", handoffReference: "desk",
  }],
  events: [{ id: "s", entryId: "r", action: "sent", at: followup, note, source }],
});
const witness = serializeWitnessDocument({
  ...emptyWitnessDocument(),
  transfers: [{
    id: "w", packId, label: "Transfer", kind: "handoff-note", channel: "UNKNOWN",
    condition: "UNKNOWN", phase: "draft", recordedAt: start, source, note,
    suppliedBytes: null, suppliedDigest: null,
  }],
  events: [{ id: "e", transferId: "w", action: "note", at: followup, note, source }],
});
const origin = {
  id: "from", packId, role: "origin", title: "Origin", state: "UNKNOWN",
  phase: "draft", note, recordedAt: start, source,
} as const;
const chain = serializeChain({
  ...emptyChain(),
  nodes: [origin, { ...origin, id: "to", role: "recipient", title: "Recipient" }],
  links: [{ id: "l", fromId: "from", toId: "to", state: "UNKNOWN", note, recordedAt: followup, source }],
  events: [{ id: "e", nodeId: "to", action: "noted", at: followup, note, source }],
});
const reconciliation = serializeReconciliation({
  ...newReconciliationDocument(),
  cases: [{
    id: "c", packId, operation: "export", status: "open", disposition: "UNKNOWN",
    openedAt: start, title: "Interrupted export", summary: note, source,
  }],
  observations: [{ id: "o", caseId: "c", condition: "UNKNOWN", recordedAt: followup, source, note }],
  events: [{ id: "e", caseId: "c", action: "noted", at: followup, note, source }],
});
const drill = serializeDrills({
  ...emptyDrillDocument(),
  runs: [{
    id: "d", packId, kind: "offline-open", phase: "draft", title: "Check local export",
    openedAt: start, condition: "UNKNOWN", provenance,
  }],
  steps: [{
    id: "s", runId: "d", label: "Read local file", condition: "UNKNOWN", outcome: "not-run",
    note, recordedAt: followup, provenance,
  }],
  events: [{ id: "e", runId: "d", at: followup, kind: "note", note, stepId: null, provenance }],
});
const guidedCase = native(beginGuidedCase(emptyGuidedDocument(), {
  id: "g", packId, openedAt: start, condition: "UNKNOWN", phase: "draft", title: "Offline review", source,
}));
const guided = native(recordGuidedStep(guidedCase, {
  id: "step", caseId: "g", topic: "transfer", evidence: "UNKNOWN", outcome: "UNKNOWN",
  capturedAt: followup, note, source,
}));
const briefCase = native(beginBrief(emptyBriefDocument(), {
  id: "b", packId, title: "Review transfer", operation: "transfer", condition: "UNKNOWN",
  openedAt: start, state: "draft", source,
}));
const observed = native(addBriefObservation(briefCase, {
  id: "o", briefId: "b", capturedAt: followup, condition: "UNKNOWN", summary: note, source,
}));
const brief = native(addBriefQuestion(observed, {
  id: "q", briefId: "b", topic: "what-happened", state: "UNKNOWN",
  question: "Quel fichier\u00a0?", response: "", capturedAt: followup, source,
}));
const refresh = {
  ...emptyRefreshDocument(),
  subjects: [{ id: "s", packId, topic: "integrity", title: "Inspect metadata", startedAt: start }],
  observations: [{ id: "o", subjectId: "s", observedAt: start, condition: "UNKNOWN", source, note }],
  reviews: [{ id: "r", subjectId: "s", at: followup, decision: "review-needed", note }],
} as const;

interface Example {
  kind: RecoveryKind;
  write: NativeResult<string>;
  read: (text: string) => NativeResult<unknown>;
  cap: number;
  records: number;
  parent: string;
}

const examples: Example[] = [
  { kind: "receipt", write: receipt, read: importReceiptDocument, cap: RECEIPT_LIMITS.bytes, records: 2, parent: "entries" },
  { kind: "witness", write: witness, read: parseWitnessDocument, cap: WITNESS_LIMITS.bytes, records: 2, parent: "transfers" },
  { kind: "chain", write: chain, read: parseChain, cap: CHAIN_LIMITS.bytes, records: 4, parent: "nodes" },
  { kind: "reconciliation", write: reconciliation, read: parseReconciliation, cap: RECONCILIATION_LIMITS.bytes, records: 3, parent: "cases" },
  { kind: "drill", write: drill, read: parseDrills, cap: DRILL_LIMITS.bytes, records: 3, parent: "runs" },
  { kind: "packet", write: exportPacket(packetWith(note)), read: importPacket, cap: PACKET_LIMITS.bytes, records: 2, parent: "entries" },
  { kind: "guided", write: serializeGuidedDocument(guided), read: parseGuidedDocument, cap: GUIDED_LIMITS.bytes, records: 3, parent: "cases" },
  { kind: "brief", write: exportBriefs(brief), read: importBriefs, cap: BRIEF_LIMITS.bytes, records: 6, parent: "briefs" },
  { kind: "refresh", write: exportRefreshDocument(refresh), read: parseRefreshDocument, cap: REFRESH_LIMITS.bytes, records: 3, parent: "subjects" },
];

describe.each(examples)("transfer adapter for $kind", ({ kind, write, read, cap, records, parent }) => {
  it("counts child records from the actual desk export and recovers a file its reader accepts", async () => {
    const text = native(write);
    expect(classifyRecoveryText(text)).toEqual({ kind, recordCount: records });
    const [member] = valueOf(await openBundle(bundleFile(wireEntry(text, kind))));
    expect(member?.recordCount).toBe(records);
    if (!member) throw new Error("Missing restored file");
    const extracted = await member.file.text();
    expect(extracted).toBe(text);
    expect(native(read(extracted))).toEqual(native(read(text)));
  });

  it("applies the same native check to orphaned child rows on direct selection and transfer", async () => {
    const document = JSON.parse(native(write)) as Record<string, unknown>;
    const orphan = JSON.stringify({ ...document, [parent]: [] });
    expect(read(orphan).ok).toBe(false);
    expect(await inspectMember(new Blob([orphan]))).toEqual({ ok: false, problem: { code: "native-format" } });
    expect(await openBundle(bundleFile(wireEntry(orphan, kind)))).toEqual({
      ok: false, problem: { code: "native-format", slot: 1 },
    });
  });

  it("checks the original UTF-8 byte count at the native tool's file limit", async () => {
    expect(byteCap(kind)).toBe(cap);
    const text = native(write);
    const amount = cap - Buffer.byteLength(text, "utf8");
    const exact = text + " ".repeat(amount);
    expect(Buffer.byteLength(exact)).toBe(cap);
    expect(classifyRecoveryText(exact)).toEqual({ kind, recordCount: records });
    expect(classifyRecoveryText(exact + " ")).toBe("member-size");
    expect(await inspectMember(new Blob([exact, " "]))).toEqual({
      ok: false, problem: { code: "member-size" },
    });
  });
});

describe("source evidence after reconciliation", () => {
  it("preserves the link between a recorded step and its generated event", async () => {
    const text = native(serializeGuidedDocument(guided));
    const [member] = valueOf(await openBundle(bundleFile(wireEntry(text, "guided"))));
    const restored = native(parseGuidedDocument(await member!.file.text()));
    expect(restored.events[0]?.stepId).toBe(restored.steps[0]?.id);
    expect(restored.steps[0]?.source).toEqual(source);
    expect(restored.steps[0]?.evidence).toBe("UNKNOWN");
    expect(restored.steps[0]?.outcome).toBe("UNKNOWN");
    const cut = { ...restored, steps: [] };
    expect(classifyRecoveryText(JSON.stringify(cut))).toBeNull();
  });

  it("preserves unanswered support questions together with their original audit events", async () => {
    const text = native(exportBriefs(brief));
    const [member] = valueOf(await openBundle(bundleFile(wireEntry(text, "brief"))));
    const restored = native(importBriefs(await member!.file.text()));
    expect(restored.questions[0]).toMatchObject({ state: "UNKNOWN", response: "", source });
    expect(restored.events.find(event => event.action === "question-added")?.referenceId).toBe("q");
    const detached = restored.events.filter(event => event.action !== "question-added");
    expect(classifyRecoveryText(JSON.stringify({ ...restored, events: detached }))).toBeNull();
  });

  it("keeps the source refresh decision distinct from the unknown observed condition", async () => {
    const text = native(exportRefreshDocument(refresh));
    const [member] = valueOf(await openBundle(bundleFile(wireEntry(text, "refresh"))));
    const restored = native(parseRefreshDocument(await member!.file.text()));
    expect(restored.observations[0]).toMatchObject({ condition: "UNKNOWN", source });
    expect(restored.reviews[0]?.decision).toBe("review-needed");
    const missingEvidence = { ...restored, observations: [] };
    expect(classifyRecoveryText(JSON.stringify(missingEvidence))).toBeNull();
  });

  it("opens all nine distinct desk exports side by side in selection order", async () => {
    const entries = examples.map(item => wireEntry(native(item.write), item.kind));
    const members = valueOf(await openBundle(bundleFile(...entries)));
    expect(members.map(member => member.kind)).toEqual(examples.map(item => item.kind));
    expect(members.map(member => member.recordCount)).toEqual(examples.map(item => item.records));
    expect(new Set(members.map(member => member.digest)).size).toBe(entries.length);
  });

  it("accepts one BOM and rejects a second one that the native import would see as data", async () => {
    const text = native(receipt);
    const once = "\ufeff" + text;
    const twice = "\ufeff" + once;
    expect(classifyRecoveryText(once)).toEqual({ kind: "receipt", recordCount: 2 });
    expect(classifyRecoveryText(twice)).toBeNull();
    expect(await inspectMember(new Blob([twice]))).toEqual({ ok: false, problem: { code: "native-format" } });
    expect(await openBundle(bundleFile(wireEntry(twice, "receipt")))).toEqual({
      ok: false, problem: { code: "native-format", slot: 1 },
    });
    expect(valueOf(await inspectMember(new Blob([once]))).byteLength).toBe(Buffer.byteLength(once));
  });
});
