import { describe, expect, it } from "vitest";
import { CONTACT_SHAPES, checkHelpNumber, isContact } from "./pkHelp";

const rec = (over: Record<string, unknown> = {}) => ({
  id: "x",
  name: { en: "Emergency services", fr: "Services d’urgence" },
  contact: "911",
  how: { en: "Call if someone is in danger.", fr: "Composez le numéro si une personne est en danger." },
  url: null,
  provenance: { source_name: "Desk check", licence: "UNKNOWN" },
  ...over,
});
const codes = (r: unknown): string[] => checkHelpNumber(r).map((p) => p.code);

describe("isContact", () => {
  it.each(["911", "811", "211", "988", "9-8-8", "1-866-531-2600", "1-800-268-9017", "1-833-456-4566", "1-888-000-0000"])("%s is a contact", (c) => expect(isContact(c)).toBe(true));
  it.each(["", "91", "9111", "9 1 1", "416-555-0199", "1-900-555-0199", "1-800-268-901", "18002689017", "(416) 555-0199", "call 911", "1-866-531-2600 ext 2", "+1 866 531 2600"])("%j is not a contact", (c) => expect(isContact(c)).toBe(false));
  it("has three shapes", () => expect(CONTACT_SHAPES).toHaveLength(3));
});

describe("checkHelpNumber", () => {
  it("accepts a complete record", () => expect(codes(rec())).toEqual([]));
  it("gives nothing for a value that is not a record", () => {
    for (const v of [null, undefined, 5, "x", []]) expect(codes(v)).toEqual([]);
  });
  it("finds a contact that is not a short code or a toll-free number, and shows it", () => {
    expect(checkHelpNumber(rec({ contact: "416-555-0199" }))).toEqual([{ code: "pk-help-contact", detail: 'contact "416-555-0199" is not a short code or a toll-free number' }]);
    expect(codes(rec({ contact: 911 }))).toEqual(["pk-help-contact"]);
    expect(codes(rec({ contact: undefined }))).toEqual(["pk-help-contact"]);
  });
  it("finds a name or instructions missing in one language, or blank", () => {
    expect(codes(rec({ name: { en: "Emergency" } }))).toEqual(["pk-help-not-bilingual"]);
    expect(codes(rec({ how: { fr: "x" } }))).toEqual(["pk-help-not-bilingual"]);
    expect(codes(rec({ name: { en: "A", fr: "  " } }))).toEqual(["pk-help-not-bilingual"]);
    expect(codes(rec({ name: "Emergency" }))).toEqual(["pk-help-not-bilingual"]);
    expect(codes(rec({ name: undefined }))).toEqual(["pk-help-not-bilingual"]);
  });
  it("finds both fields when both are missing", () => expect(codes(rec({ name: null, how: null }))).toEqual(["pk-help-not-bilingual", "pk-help-not-bilingual"]));
  it("finds instructions that are the same in both languages, in any case", () => {
    expect(codes(rec({ how: { en: "Call 911 now", fr: "call 911 NOW" } }))).toEqual(["pk-help-same-language"]);
  });
  it("accepts a name that is the same in both languages, such as a service name", () => {
    expect(codes(rec({ name: { en: "Health811", fr: "Health811" } }))).toEqual([]);
    expect(codes(rec({ name: { en: "211 Ontario", fr: "211 Ontario" } }))).toEqual([]);
  });
  it("finds a link given with no source named", () => {
    expect(codes(rec({ url: "https://example.org/", provenance: {} }))).toEqual(["pk-help-url-no-source"]);
    expect(codes(rec({ url: "https://example.org/", provenance: { source_name: " " } }))).toEqual(["pk-help-url-no-source"]);
    expect(codes(rec({ url: "https://example.org/", provenance: undefined }))).toEqual(["pk-help-url-no-source"]);
  });
  it("accepts a link with a source, and no link with none", () => {
    expect(codes(rec({ url: "https://example.org/" }))).toEqual([]);
    expect(codes(rec({ url: null, provenance: {} }))).toEqual([]);
  });
  it("finds every problem of a record", () => expect(codes({ contact: "x", name: null, how: null, url: "u" })).toEqual(["pk-help-contact", "pk-help-not-bilingual", "pk-help-not-bilingual", "pk-help-url-no-source"]));
});
