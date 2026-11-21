import { describe, expect, it } from "vitest";
import { auditBriefPrivacy, briefExportAllowed, briefPrivacyCodes } from "./recoverySupportPrivacy";
import { addBriefObservation, addBriefQuestion, beginBrief, emptyBriefDocument, type BriefDocument, type BriefCase } from "./recoverySupportBrief";
const source = { name: "Local source", licence: "Example", reference: "file-ref", tier: "UNKNOWN" as const, retrievedOn: "2026-11-19" };
const now = "2026-11-19T10:00:00.000Z";
const entry: BriefCase = { id: "case-1", packId: "pack-a", title: "Stopped transfer", operation: "transfer", condition: "UNKNOWN", openedAt: now, state: "draft", source };
const make = (): BriefDocument => {
  const result = beginBrief(emptyBriefDocument(), entry);
  if (!result.ok) throw Error(result.issue);
  return result.value;
};
const changed = (title: string): BriefDocument => {
  const result = beginBrief(emptyBriefDocument(), { ...entry, title });
  if (!result.ok) throw Error(result.issue);
  return result.value;
};

describe("privacy cues in locally authored handoff notes", () => {
  it("does not flag ordinary recovery wording", () => { expect(briefPrivacyCodes("Pack status UNKNOWN")).toEqual([]); });
  it("does not flag a plain pack ID", () => { expect(briefPrivacyCodes("pack-a_01")).toEqual([]); });
  it("recognizes an email address", () => { expect(briefPrivacyCodes("contact: example@example.com")).toContain("email"); });
  it("recognizes an uppercase email address", () => { expect(briefPrivacyCodes("EXAMPLE@EXAMPLE.COM")).toContain("email"); });
  it("recognizes a Canadian telephone number", () => { expect(briefPrivacyCodes("416-555-0100")).toContain("phone"); });
  it("recognizes phone punctuation", () => { expect(briefPrivacyCodes("(416) 555 0100")).toContain("phone"); });
  it("recognizes phone numbers with country code", () => { expect(briefPrivacyCodes("+1 416-555-0100")).toContain("phone"); });
  it("recognizes password fields", () => { expect(briefPrivacyCodes("password: test" )).toContain("credential"); });
  it("recognizes an API key-like field", () => { expect(briefPrivacyCodes("api_key=example")).toContain("credential"); });
  it("recognizes an access token field", () => { expect(briefPrivacyCodes("access-token: masked")).toContain("credential"); });
  it("recognizes token-bearing URLs", () => { expect(briefPrivacyCodes("https://example.test/view?token=abc")).toContain("link-with-token"); });
  it("does not reject ordinary public URLs", () => { expect(briefPrivacyCodes("https://example.test/public")).toEqual([]); });
  it("can return multiple independent privacy cues", () => { expect(briefPrivacyCodes("example@example.com and 416-555-0100")).toEqual(["email", "phone"]); });
  it("does not store or alter the inspected text", () => { const value = "example@example.com"; briefPrivacyCodes(value); expect(value).toBe("example@example.com"); });
  it("does not guess that UNKNOWN denotes a phone number", () => { expect(briefPrivacyCodes("UNKNOWN")).toEqual([]); });
});

describe("manual export preflight", () => {
  it("returns no findings for an empty document", () => { expect(auditBriefPrivacy(emptyBriefDocument()).findings).toEqual([]); });
  it("allows a clean example brief", () => { expect(briefExportAllowed(make())).toBe(true); });
  it("does not infer content readiness from privacy clearance", () => { expect(auditBriefPrivacy(make()).contentReady).toBe(false); });
  it("fails a brief title with contact details", () => { expect(briefExportAllowed(changed("Call 416-555-0100"))).toBe(false); });
  it("records a field path instead of revealing the matched content", () => { expect(auditBriefPrivacy(changed("Call 416-555-0100")).findings[0]?.path).toBe("briefs:case-1:title"); });
  it("keeps privacy-finding advice actionable", () => { expect(auditBriefPrivacy(changed("Call 416-555-0100")).findings[0]?.advice).toBe("review-before-export"); });
  it("flags a suspicious case reference", () => { const x = changed("Local test"); expect(briefExportAllowed({ ...x, briefs: [{ ...x.briefs[0]!, source: { ...source, reference: "password: value" } }] })).toBe(false); });
  it("flags an observation with an email", () => {
    const added = addBriefObservation(make(), { id: "obs-1", briefId: "case-1", capturedAt: now, condition: "UNKNOWN", summary: "example@example.com", source });
    if (!added.ok) throw Error(added.issue);
    expect(auditBriefPrivacy(added.value).findings.map((item) => item.code)).toContain("email");
  });
  it("flags a question containing phone digits", () => {
    const added = addBriefQuestion(make(), { id: "question-1", briefId: "case-1", topic: "handoff", state: "UNKNOWN", question: "Contact 416-555-0100?", response: "", capturedAt: now, source });
    if (!added.ok) throw Error(added.issue);
    expect(briefExportAllowed(added.value)).toBe(false);
  });
  it("does not mutate the case while auditing", () => { const x = make(); const before = JSON.stringify(x); auditBriefPrivacy(x); expect(JSON.stringify(x)).toBe(before); });
  it("does not send data or request a permission", () => { expect(auditBriefPrivacy(make()).safeToShare).toBe(true); });
  it("keeps an UNKNOWN condition unchanged", () => { const x = make(); auditBriefPrivacy(x); expect(x.briefs[0]?.condition).toBe("UNKNOWN"); });
  it("reports no findings after removing a contact string", () => { expect(auditBriefPrivacy(changed("Pack status unclear")).findings).toEqual([]); });
  it("uses a field-specific path for every finding", () => { expect(auditBriefPrivacy(changed("example@example.com and 416-555-0100")).findings.every((item) => item.path === "briefs:case-1:title")).toBe(true); });
});
