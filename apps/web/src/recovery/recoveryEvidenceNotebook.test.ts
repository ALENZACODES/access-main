import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITS,
  addEvidenceEntry,
  emptyEvidenceNotebook,
  exportEvidenceNotebook,
  mergeEvidenceNotebook,
  parseEvidenceNotebook,
  previewEvidenceMerge,
  reviewEvidenceEntry,
  summarizeEvidenceNotebook,
  validateEvidenceNotebook,
  type EvidenceEntry,
  type EvidenceNotebook,
} from "./recoveryEvidenceNotebook";

const t0 = "2026-11-01T00:00:00.000Z";
const t1 = "2026-11-02T00:00:00.000Z";
const t2 = "2026-11-03T00:00:00.000Z";
const source = { source: "Public sample", licence: "CC-BY-4.0", date: "2026-10-31", tier: "community" as const };

function blank(): EvidenceNotebook {
  const result = emptyEvidenceNotebook(t0);
  if (!result.ok) throw new Error("Fixture failed");
  return result.notebook;
}

function withEntry(id = "entry-1", value: string | number | boolean = "UNKNOWN"): EvidenceNotebook {
  const result = addEvidenceEntry(blank(), id, { packId: "toronto", field: "file.count", value, provenance: source }, t1);
  if (!result.ok) throw new Error("Fixture failed");
  return result.notebook;
}

function altered(entry: EvidenceEntry, changes: Record<string, unknown>): EvidenceNotebook {
  return { ...withEntry(), entries: [{ ...entry, ...changes }] };
}

function issue(value: unknown): string {
  const result = validateEvidenceNotebook(value);
  return result.ok ? "OK" : result.reason;
}

describe("recovery evidence document", () => {
  it("starts empty and keeps UNKNOWN counts at zero", () => {
    const notebook = blank();
    expect(notebook.entries).toEqual([]);
    expect(summarizeEvidenceNotebook(notebook).total).toBe(0);
  });

  it("refuses invalid creation timestamps", () => {
    expect(emptyEvidenceNotebook("today").ok).toBe(false);
    expect(emptyEvidenceNotebook("2026-11-35T00:00:00.000Z").ok).toBe(false);
  });

  it("preserves UNKNOWN without converting it to a positive claim", () => {
    const notebook = withEntry();
    expect(notebook.entries[0]?.value).toBe("UNKNOWN");
    expect(summarizeEvidenceNotebook(notebook)).toMatchObject({ total: 1, known: 0, unknown: 1 });
  });

  it("keeps accepted evidence distinct from a pack readiness status", () => {
    const result = reviewEvidenceEntry(withEntry(), "entry-1", "accepted", t2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notebook.entries[0]?.value).toBe("UNKNOWN");
    expect(result.notebook.entries[0]?.decision).toBe("accepted");
  });

  it.each(["official", "community", "self-reported", "unknown"] as const)("accepts tier %s", (tier: "official" | "community" | "self-reported" | "unknown") => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId: "toronto", field: "file.count", value: false,
      provenance: { ...source, tier },
    }, t1);
    expect(result.ok).toBe(true);
  });

  it.each(["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"])("allows open licence %s", (licence: string) => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId: "toronto", field: "file.count", value: "UNKNOWN",
      provenance: { ...source, licence },
    }, t1);
    expect(result.ok).toBe(true);
  });

  it("rejects a licence outside the supported open set", () => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId: "toronto", field: "file.count", value: "UNKNOWN",
      provenance: { ...source, licence: "Private" },
    }, t1);
    expect(result).toMatchObject({ ok: false, reason: "closed-licence" });
  });

  it.each(["2026-02-30", "2026-13-01", "2027-01-01", "not-a-date"])("rejects bad or future source date %s", (date: string) => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId: "toronto", field: "file.count", value: "UNKNOWN",
      provenance: { ...source, date },
    }, t1);
    expect(result.ok).toBe(false);
  });

  it.each(["__proto__", "../other", "", "space name", "a/b"])("rejects unsafe pack ID %s", (packId: string) => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId, field: "file.count", value: "UNKNOWN", provenance: source,
    }, t1);
    expect(result.ok).toBe(false);
  });

  it.each(["File Count", "file/count", "a b", "", "Upper"])("rejects an invalid key %s", (field: string) => {
    const result = addEvidenceEntry(blank(), "entry-1", {
      packId: "toronto", field, value: "UNKNOWN", provenance: source,
    }, t1);
    expect(result.ok).toBe(false);
  });

  it("rejects repeated IDs", () => {
    const first = withEntry();
    const next = addEvidenceEntry(first, "entry-1", { packId: "toronto", field: "size", value: 1, provenance: source }, t2);
    expect(next).toMatchObject({ ok: false, reason: "duplicate-id" });
  });

  it("does not permit an event preceding the latest update", () => {
    const result = addEvidenceEntry(withEntry(), "entry-2", {
      packId: "toronto", field: "size", value: 1, provenance: source,
    }, t0);
    expect(result).toMatchObject({ ok: false, reason: "invalid-timestamp" });
  });

  it("uses a fixed timestamp and data shape in export", () => {
    const notebook = withEntry();
    const exported = exportEvidenceNotebook(notebook);
    expect(exported).not.toBeNull();
    const restored = parseEvidenceNotebook(exported ?? "");
    expect(restored).toEqual({ ok: true, notebook });
  });

  it("counts packs, fields, sources and known fields separately", () => {
    const one = withEntry("first", 2);
    const second = addEvidenceEntry(one, "second", {
      packId: "ottawa", field: "file.count", value: "UNKNOWN", provenance: source,
    }, t2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(summarizeEvidenceNotebook(second.notebook)).toMatchObject({
      total: 2, packs: 2, fields: 2, sources: 1, known: 1, unknown: 1,
    });
  });

  it("allows an open review to close", () => {
    const result = reviewEvidenceEntry(withEntry(), "entry-1", "dismissed", t2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeEvidenceNotebook(result.notebook).closed).toBe(1);
  });

  it("refuses reopening or changing a closed review", () => {
    const closed = reviewEvidenceEntry(withEntry(), "entry-1", "dismissed", t2);
    if (!closed.ok) throw new Error("Fixture failed");
    expect(reviewEvidenceEntry(closed.notebook, "entry-1", "accepted", t2)).toMatchObject({ ok: false, reason: "invalid-history" });
    expect(reviewEvidenceEntry(closed.notebook, "entry-1", "open", t2)).toMatchObject({ ok: false, reason: "invalid-history" });
  });

  it("refuses to change an unknown entry", () => {
    expect(reviewEvidenceEntry(withEntry(), "missing", "accepted", t2)).toMatchObject({ ok: false, reason: "invalid-id" });
  });
});

describe("untrusted JSON import", () => {
  it("rejects invalid JSON", () => {
    expect(parseEvidenceNotebook("{")).toMatchObject({ ok: false, reason: "invalid-shape" });
  });

  it("rejects an excessive byte count before parsing", () => {
    expect(parseEvidenceNotebook("x".repeat(EVIDENCE_LIMITS.maxBytes + 1))).toMatchObject({ ok: false, reason: "too-large" });
  });

  it("rejects a wrong format version", () => {
    expect(issue({ ...blank(), format: "other" })).toBe("invalid-version");
  });

  it("rejects unknown document properties", () => {
    expect(issue({ ...blank(), unexpected: true })).toBe("invalid-shape");
  });

  it("rejects a nonarray list", () => {
    expect(issue({ ...blank(), entries: {} })).toBe("invalid-shape");
  });

  it("rejects a list above the entry limit", () => {
    expect(issue({ ...blank(), entries: Array.from({ length: EVIDENCE_LIMITS.maxEntries + 1 }, () => ({})) })).toBe("too-many");
  });

  it("rejects duplicate IDs in an imported file", () => {
    const notebook = withEntry();
    expect(issue({ ...notebook, entries: [notebook.entries[0], notebook.entries[0]] })).toBe("duplicate-id");
  });

  it("rejects extra entry properties", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { other: "unexpected" }))).toBe("invalid-shape");
  });

  it("rejects unknown provenance properties", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { provenance: { ...source, other: true } }))).toBe("invalid-source");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2 ** 54, null, [], {}])("rejects invalid values", (value: unknown) => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { value }))).toBe("invalid-value");
  });

  it("rejects markup in a value", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { value: "<img>" }))).toBe("invalid-value");
  });

  it("rejects control characters in a note", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { note: "line\u0001" }))).toBe("invalid-note");
  });

  it("rejects an update earlier than creation", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { updatedAt: t0 }))).toBe("invalid-timestamp");
  });

  it("rejects an entry updated after document time", () => {
    const notebook = withEntry();
    expect(issue(altered(notebook.entries[0]!, { updatedAt: t2 }))).toBe("invalid-timestamp");
  });

  it("does not mutate the original object", () => {
    const notebook = withEntry();
    const result = validateEvidenceNotebook(notebook);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notebook).not.toBe(notebook);
    expect(result.notebook.entries[0]).not.toBe(notebook.entries[0]);
    expect(result.notebook.entries[0]?.provenance).not.toBe(notebook.entries[0]?.provenance);
  });
});

describe("non-destructive import preview", () => {
  it("reports an identical entry as a duplicate", () => {
    expect(previewEvidenceMerge(withEntry(), withEntry())).toMatchObject({ added: 0, duplicates: 1, conflicts: [] });
  });

  it("rejects a same-ID different-history collision", () => {
    const incoming = withEntry("entry-1", 9);
    const current = withEntry("entry-1", 1);
    const preview = previewEvidenceMerge(current, incoming);
    expect(preview.conflicts).toEqual([{ id: "entry-1", kind: "different-history" }]);
    expect(mergeEvidenceNotebook(current, incoming, t2)).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("refuses a same-field same-time collision under another ID", () => {
    const current = withEntry("one");
    const incoming = withEntry("two");
    expect(previewEvidenceMerge(current, incoming).conflicts).toEqual([{ id: "two", kind: "field-collision" }]);
  });

  it("merges nonconflicting fields", () => {
    const current = withEntry("one");
    const incoming = addEvidenceEntry(blank(), "two", {
      packId: "ottawa", field: "file.bytes", value: 55, provenance: source,
    }, t1);
    if (!incoming.ok) throw new Error("Fixture failed");
    const merged = mergeEvidenceNotebook(current, incoming.notebook, t2);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.notebook.entries.map((entry) => entry.id)).toEqual(["one", "two"]);
    expect(current.entries).toHaveLength(1);
  });

  it("requires merge time not to precede incoming or current time", () => {
    expect(mergeEvidenceNotebook(withEntry(), withEntry(), t0)).toMatchObject({ ok: false, reason: "invalid-timestamp" });
  });
});
