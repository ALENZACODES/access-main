import { describe, expect, it } from "vitest";
import { setConsent, type Purpose } from "./consent";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { reconcile } from "./reconcile";
import { createMemoryStorage } from "./storage";
import { buildSupportSummary } from "./supportSummary";

const NOW = new Date(2026, 10, 15, 9, 30);
const PURPOSES: readonly Purpose[] = [
  { id: "saved-places", label: { en: "Saved places", fr: "Lieux enregistrés" }, description: { en: "Remember places", fr: "Garder des lieux" }, wordingVersion: 1 },
  { id: "map-hints", label: { en: "Map hints", fr: "Indices de carte" }, description: { en: "Show hints", fr: "Afficher des indices" }, wordingVersion: 2 },
];
const SECRET = "Jo Tremblay, 12 Rue Exemple, wheelchair user";

function build(locale: "en" | "fr", consent = {}) {
  const storage = createMemoryStorage({ "app.places.v1": SECRET, "app.mystery": "x" });
  const inv = FIXTURE.map((e) => (e.id === "saved-places" ? { ...e, storageKeys: ["places.v1"] } : e));
  return buildSupportSummary({
    locale,
    now: NOW,
    stored: reconcile(storage, PREFIX, inv),
    inventoryCount: inv.length,
    purposes: PURPOSES,
    consent,
    activity: [{ at: NOW.toISOString(), kind: "export", count: 1 }],
    blocked: { since: NOW.toISOString(), hosts: [{ host: "evil.example.net", count: 2, lastAt: NOW.toISOString() }] },
  });
}

describe("buildSupportSummary", () => {
  it("lists names and sizes but never contents or labels", () => {
    const f = build("en");
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-support-2026-11-15.txt");
    expect(f.text).toContain("places.v1");
    expect(f.text).toContain("mystery");
    expect(f.text).not.toContain(SECRET);
    expect(f.text).not.toContain("Jo Tremblay");
    for (const e of FIXTURE) expect(f.text).not.toContain(e.label.en);
  });
  it("reports counts", () => {
    const f = build("en");
    expect(f.text).toContain("Items stored: 2");
    expect(f.text).toContain("Entries in the data list: 3");
    expect(f.text).toContain("Privacy actions listed: 1");
    expect(f.text).toContain("Addresses with stopped requests: 1");
    expect(f.count).toBe(2);
  });
  it("keeps unknown as Unknown, and shows decided choices with their date", () => {
    expect(build("en").text).toContain("- saved-places: Unknown");
    const c = setConsent(setConsent({}, PURPOSES[0]!, "granted", NOW), PURPOSES[1]!, "declined", NOW);
    const t = build("en", c).text;
    expect(t).toContain("- saved-places: Allowed (2026-11-15)");
    expect(t).toContain("- map-hints: Not allowed (2026-11-15)");
  });
  it("treats a choice made under older wording as Unknown", () => {
    const old = setConsent({}, { ...PURPOSES[1]!, wordingVersion: 1 }, "granted", NOW);
    expect(build("en", old).text).toContain("- map-hints: Unknown");
  });
  it("is French in French, with a non-breaking space before colons", () => {
    const f = build("fr");
    expect(f.filename).toBe("l-app-aide-2026-11-15.txt");
    expect(f.text).toContain("Éléments conservés\u00a0: 2");
    expect(f.text).toContain("- saved-places\u00a0: Inconnu");
    expect(f.text).not.toMatch(/ : /);
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("says what the file does not contain", () => {
    expect(build("en").text).toContain("no contents of your data");
    expect(build("fr").text).toContain("ne contient pas vos données");
  });
  it("handles an empty device", () => {
    const f = buildSupportSummary({
      locale: "en",
      now: NOW,
      stored: reconcile(createMemoryStorage(), PREFIX, FIXTURE),
      inventoryCount: 0,
      purposes: [],
      consent: {},
      activity: [],
      blocked: { hosts: [] },
    });
    expect(f.text).toContain("- None");
    expect(f.count).toBe(0);
  });
});
