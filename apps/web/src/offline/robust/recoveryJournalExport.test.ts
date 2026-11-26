import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { appendRecoveryJournal, captureJournalEntry, emptyRecoveryJournal,
  JOURNAL_LIMITS, type RecoveryJournal } from "./recoveryJournal";
import { encodeRecoveryJournal, formatRecoveryJournal, journalSupportedLicences,
  parseRecoveryJournal, prepareRecoveryJournalExport, recoveryJournalFilename } from "./recoveryJournalExport";

const provenance: Provenance = { source: "Public geographic information",
  licence: "CC BY 4.0", date: "2026-05-05" };
const manifest: RegionManifest = { regionId: "region-east", cells: [
  { id: "a", bytes: 3, provenance }, { id: "b", bytes: 7, provenance },
] };
const inventory: RegionInventory = {
  regionId: "region-east", cells: [
    { id: "a", cause: "present", state: "saved", expectedBytes: 3, provenance },
    { id: "b", cause: "missing", state: "unknown", expectedBytes: 7, provenance },
  ], savedCount: 1, unknownCount: 1, savedBytes: 3, expectedBytes: 10, complete: false,
};
function sample(): RecoveryJournal {
  return appendRecoveryJournal(emptyRecoveryJournal("region-east"),
    captureJournalEntry(manifest, inventory, "2026-11-19T09:00:00Z", "snapshot"));
}
function altered(value: RecoveryJournal, override: Record<string, unknown>): string {
  return JSON.stringify({ ...value, ...override });
}
function firstEntry(value: RecoveryJournal): Record<string, unknown> {
  const item = value.entries[0];
  if (!item) throw new Error("Fixture has no entry");
  return { ...item };
}
function firstCell(value: RecoveryJournal): Record<string, unknown> {
  const item = value.entries[0]?.cells[0];
  if (!item) throw new Error("Fixture has no cell");
  return { ...item };
}
function withFirstEntry(value: RecoveryJournal, entry: Record<string, unknown>): string {
  return altered(value, { entries: [entry] });
}

describe("recovery journal metadata export", () => {
  it("encodes stable JSON with an explicit schema", () => {
    const json = encodeRecoveryJournal(sample());
    expect(json).toContain("offline-recovery-journal-v1");
    expect(json.endsWith("\n")).toBe(true);
    expect(encodeRecoveryJournal(sample())).toBe(json);
  });

  it("does not serialize downloaded payload bytes", () => {
    const json = encodeRecoveryJournal(sample());
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("base64");
    expect(json).not.toContain("data:application");
  });

  it("exports source, licence, date, and UNKNOWN without changing status", () => {
    const json = encodeRecoveryJournal(sample());
    expect(json).toContain("Public geographic information");
    expect(json).toContain("CC BY 4.0");
    expect(json).toContain("2026-05-05");
    expect(json).toContain("UNKNOWN");
  });

  it("parses a round-trip JSON export without elevating state", () => {
    const journal = sample();
    const parsed = parseRecoveryJournal(encodeRecoveryJournal(journal), "region-east");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected a parsed journal");
    expect(parsed.journal).toEqual(journal);
    expect(parsed.journal.entries[0]?.cells[1]?.status).toBe("UNKNOWN");
  });

  it("accepts empty but structurally valid journals", () => {
    const value = emptyRecoveryJournal("region-east");
    const parsed = parseRecoveryJournal(encodeRecoveryJournal(value), "region-east");
    expect(parsed.ok).toBe(true);
  });

  it("rejects unrelated regions", () => {
    const parsed = parseRecoveryJournal(encodeRecoveryJournal(sample()), "region-west");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Unexpected parsed journal");
    expect(parsed.issues).toContain("invalid-region");
  });

  it("rejects malformed JSON without executing content", () => {
    const parsed = parseRecoveryJournal("{bad json", "region-east");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Unexpected parsed journal");
    expect(parsed.issues).toContain("invalid-json");
  });

  it("rejects null JSON and array top-level values", () => {
    for (const text of ["null", "[]", "1", "true", '"text"']) {
      expect(parseRecoveryJournal(text, "region-east").ok).toBe(false);
    }
  });

  it("rejects unrecognized versioned schemas", () => {
    expect(parseRecoveryJournal(altered(sample(), { schema: "unrecognized" }), "region-east").ok)
      .toBe(false);
  });

  it("rejects oversized input before parsing", () => {
    const tooBig = " ".repeat(JOURNAL_LIMITS.maxReportBytes + 1);
    const parsed = parseRecoveryJournal(tooBig, "region-east");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Unexpected parsed journal");
    expect(parsed.issues).toContain("too-large");
  });

  it("rejects excessive entry counts", () => {
    const journal = sample();
    const items = Array.from({ length: JOURNAL_LIMITS.maxEntries + 1 }, () => firstEntry(journal));
    expect(parseRecoveryJournal(altered(journal, { entries: items }), "region-east").ok).toBe(false);
  });

  it("rejects invalid sequence numbers", () => {
    const entry = { ...firstEntry(sample()), sequence: 0 };
    expect(parseRecoveryJournal(withFirstEntry(sample(), entry), "region-east").ok).toBe(false);
  });

  it("rejects timestamp order reversal", () => {
    const journal = sample();
    const first = firstEntry(journal);
    const second = { ...first, sequence: 2, capturedAt: "2026-11-18T08:00:00Z" };
    const parsed = parseRecoveryJournal(altered(journal, { entries: [first, second] }), "region-east");
    expect(parsed.ok).toBe(false);
  });

  it("rejects gaps in journal sequence numbers", () => {
    const journal = sample();
    const first = firstEntry(journal);
    const second = { ...first, sequence: 5, capturedAt: "2026-11-19T10:00:00Z" };
    expect(parseRecoveryJournal(altered(journal, { entries: [first, second] }), "region-east").ok)
      .toBe(false);
  });

  it("rejects invalid capture time", () => {
    const entry = { ...firstEntry(sample()), capturedAt: "2026-02-30T10:00:00Z" };
    expect(parseRecoveryJournal(withFirstEntry(sample(), entry), "region-east").ok).toBe(false);
  });

  it("rejects unexpected event types", () => {
    const entry = { ...firstEntry(sample()), event: "scheduled" };
    expect(parseRecoveryJournal(withFirstEntry(sample(), entry), "region-east").ok).toBe(false);
  });

  it("rejects unrecognized health labels", () => {
    const entry = { ...firstEntry(sample()), health: "fine" };
    expect(parseRecoveryJournal(withFirstEntry(sample(), entry), "region-east").ok).toBe(false);
  });

  it("rejects unrecognized stop reasons", () => {
    const entry = { ...firstEntry(sample()), downloadReason: "all-good" };
    expect(parseRecoveryJournal(withFirstEntry(sample(), entry), "region-east").ok).toBe(false);
  });

  it("rejects cells marked saved without matching source fields", () => {
    const journal = sample();
    const cell = { ...firstCell(journal), status: "saved", provenance: null };
    const entry = { ...firstEntry(journal), cells: [cell] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects cells marked saved with missing status cause", () => {
    const journal = sample();
    const cell = { ...firstCell(journal), status: "saved", cause: "missing" };
    const entry = { ...firstEntry(journal), cells: [cell] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects invalid bytes, including overflow", () => {
    for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const journal = sample();
      const cell = { ...firstCell(journal), bytes };
      const entry = { ...firstEntry(journal), cells: [cell] };
      expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
    }
  });

  it("rejects unsupported licences inside imported metadata", () => {
    const journal = sample();
    const cell = { ...firstCell(journal), provenance: { ...provenance, licence: "Closed" } };
    const entry = { ...firstEntry(journal), cells: [cell] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects duplicate identifiers in imported cells", () => {
    const journal = sample();
    const first = firstCell(journal);
    const entry = { ...firstEntry(journal), cells: [first, first] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects a control-character injection into a source name", () => {
    const journal = sample();
    const cell = { ...firstCell(journal), provenance: { ...provenance, source: "Public\nfalse" } };
    const entry = { ...firstEntry(journal), cells: [cell] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects an incorrect region ID inside an entry", () => {
    const journal = sample();
    const entry = { ...firstEntry(journal), regionId: "foreign" };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("rejects an unsupported warning payload", () => {
    const journal = sample();
    const entry = { ...firstEntry(journal), warnings: ["bad\nwarning"] };
    expect(parseRecoveryJournal(withFirstEntry(journal, entry), "region-east").ok).toBe(false);
  });

  it("renders readable English text and explicitly UNKNOWN copies", () => {
    const text = formatRecoveryJournal(sample(), "en");
    expect(text).toContain("Offline recovery journal");
    expect(text).toContain("Current status: UNKNOWN");
    expect(text).toContain("Source: Public geographic information");
    expect(text).toContain("Licence: CC BY 4.0");
  });

  it("renders French nonbreaking colon spacing", () => {
    const text = formatRecoveryJournal(sample(), "fr");
    expect(text).toContain("État actuel\u00a0: UNKNOWN");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).not.toContain("INCONNU");
  });

  it("keeps text reports free of raw cell data", () => {
    const text = formatRecoveryJournal(sample(), "fr");
    expect(text).not.toContain("Uint8Array");
    expect(text).not.toContain("data:application");
  });

  it("provides bounded filenames for path-shaped region IDs", () => {
    expect(recoveryJournalFilename("../East / West", "txt"))
      .toBe("offline-recovery-journal-east-west.txt");
    expect(recoveryJournalFilename("A".repeat(300), "json").length).toBeLessThan(100);
  });

  it("offers both text and JSON without network endpoints", () => {
    const json = prepareRecoveryJournalExport(sample(), "en", "json");
    const txt = prepareRecoveryJournalExport(sample(), "fr", "txt");
    expect(json.mime).toContain("application/json");
    expect(txt.mime).toContain("text/plain");
    expect(json.filename).toContain("region-east");
    expect(txt.text).toContain("Journal de récupération");
  });

  it("uses the established open-licence allowlist", () => {
    expect(journalSupportedLicences()).toContain("CC BY 4.0");
    expect(journalSupportedLicences()).toContain("CC0 1.0");
    expect(journalSupportedLicences()).not.toContain("Private");
  });
});
