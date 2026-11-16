import { describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH, buildSubmission, isSubmissionId, validateCorrection } from "./index";

const ids = new Set(["hall", "cafe"]);
const ok = { placeId: "hall", feature: "elevator", suggested: "yes", note: "", contact: "", consent: undefined };

describe("validateCorrection", () => {
  it("accepts a minimal suggestion", () => {
    const r = validateCorrection(ok, ids);
    expect(r.ok).toBe(true);
  });
  it.each([
    [{ ...ok, placeId: "nope" }, "place"],
    [{ ...ok, placeId: "../x" }, "place"],
    [{ ...ok, feature: "teleporter" }, "feature"],
    [{ ...ok, feature: "" }, "feature"],
    [{ ...ok, suggested: "maybe" }, "suggested"],
    [{ ...ok, note: "x".repeat(MAX_NOTE_LENGTH + 1) }, "note"],
    [{ ...ok, contact: "not-an-email", consent: "on" }, "contact"],
    [{ ...ok, contact: "a@b.co" }, "consent"],
  ])("rejects %j on %s", (input, field) => {
    const r = validateCorrection(input, ids);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toContain(field);
  });
  it("reports several errors at once with message ids", () => {
    const r = validateCorrection({ placeId: "x" }, ids);
    if (r.ok) throw new Error("should fail");
    expect(r.errors).toMatchObject({ place: "report.err.place", feature: "report.err.feature", suggested: "report.err.suggested" });
  });
  it("accepts a contact with consent and trims text", () => {
    const r = validateCorrection({ ...ok, note: "  ramp is steep \u0000 ", contact: " a@b.co ", consent: "on" }, ids);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.note).toBe("ramp is steep");
      expect(r.value.contact).toBe("a@b.co");
      expect(r.value.consent).toBe(true);
    }
  });
  it("keeps entered values for redisplay on failure", () => {
    const r = validateCorrection({ ...ok, feature: "bad", note: "keep me" }, ids);
    expect(!r.ok && r.values.note).toBe("keep me");
  });
});

describe("buildSubmission", () => {
  const value = (consent: boolean, contact: string) => {
    const r = validateCorrection({ ...ok, contact, consent: consent ? "on" : undefined }, ids);
    if (!r.ok) throw new Error("valid input expected");
    return r.value;
  };
  it("creates a pending submission with no contact unless consent was given", () => {
    const s = buildSubmission(value(true, "a@b.co"), { id: "sub-12345678", createdOn: "2026-11-15" });
    expect(s).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: 0, payload: { contact: "a@b.co", feature: "elevator" } });
    expect(buildSubmission(value(false, ""), { id: "sub-12345678", createdOn: "2026-11-15" }).payload.contact).toBeNull();
  });
  it("rejects unsafe ids", () => {
    expect(isSubmissionId("short")).toBe(false);
    expect(() => buildSubmission(value(false, ""), { id: "bad id!!", createdOn: "2026-11-15" })).toThrow();
  });
});
