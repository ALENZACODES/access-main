import { describe, expect, it } from "vitest";
import { auditSnapshotCopy, SNAPSHOT_CHANGE_LABELS, SNAPSHOT_COPY,
  SNAPSHOT_FILTER_LABELS, SNAPSHOT_ORDER_LABELS, snapshotCopy } from "./snapshotComparisonCopy";

describe("snapshot comparison language and safety", () => {
  it("has matching copy keys", () => expect(Object.keys(SNAPSHOT_COPY.en)).toEqual(Object.keys(SNAPSHOT_COPY.fr)));
  it("has no missing or malformed French punctuation", () => expect(auditSnapshotCopy()).toEqual([]));
  it("keeps the literal UNKNOWN status", () => {
    expect(SNAPSHOT_COPY.en.unknown).toBe("UNKNOWN");
    expect(SNAPSHOT_COPY.fr.unknown).toBe("UNKNOWN");
  });
  it("warns about physical conditions", () => {
    expect(SNAPSHOT_COPY.en.intro).toContain("physical");
    expect(SNAPSHOT_COPY.fr.physical).toContain("UNKNOWN");
  });
  it("has consistent change labels", () => expect(Object.keys(SNAPSHOT_CHANGE_LABELS.en)).toEqual(Object.keys(SNAPSHOT_CHANGE_LABELS.fr)));
  it("has consistent filter labels", () => expect(Object.keys(SNAPSHOT_FILTER_LABELS.en)).toEqual(Object.keys(SNAPSHOT_FILTER_LABELS.fr)));
  it("has consistent order labels", () => expect(Object.keys(SNAPSHOT_ORDER_LABELS.en)).toEqual(Object.keys(SNAPSHOT_ORDER_LABELS.fr)));
  it("selects copy by requested language", () => expect(snapshotCopy("fr").title).toBe(SNAPSHOT_COPY.fr.title));
  it("warns of privacy and intentional user export", () => expect(SNAPSHOT_COPY.en.privacy).toContain("Exports"));
  it("does not suggest that data was checked at a place", () => expect(SNAPSHOT_COPY.en.intro).not.toContain("inspected"));
});
