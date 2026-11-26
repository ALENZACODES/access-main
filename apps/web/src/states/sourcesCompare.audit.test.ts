import { describe, expect, it } from "vitest";
import { MAX_COMPARE, compareRouteView } from "./compare";
import { collectSources, sourcesRouteView } from "./sourcesPage";
import { MAX_EMAIL_LENGTH, MAX_NOTE_LENGTH, FIELD_ERROR_MESSAGES, FIELD_ORDER, SUGGESTED_VALUES, buildSubmission, isSubmissionId, isTruthyForm, validateCorrection, type CorrectionResult } from "./correction";
import { CATALOG } from "./messages";
import { FEATURE_IDS } from "./dataStatus";
import { initialConnectivity } from "./offline";
import { lintCopy } from "./copyLint";
import { LOC_PROV, PROV, TODAY, mkRecord } from "./testHelpers";

const online = { locale: "en", connectivity: initialConnectivity(true) } as const;
const offline = { locale: "fr", connectivity: initialConnectivity(false) } as const;
const A = mkRecord("place-a", "Alpha Hall", { elevator: "yes", "automatic-door": "no" });
const B = mkRecord("place-b", "Beta Library", { elevator: "yes", "automatic-door": "unknown" });
const C = mkRecord("place-c", "Gamma Hub", { elevator: "no" });
const D = mkRecord("place-d", "Delta Court", {});

describe("compareRouteView", () => {
  it("turns a failed load into an error view", () => expect(compareRouteView({ status: "error", httpStatus: 500 }, [], online).kind).toBe("error"));
  it("asks for two places when fewer than two are found, and says how many were missing", () => {
    const none = compareRouteView({ status: "ok", places: [A, B] }, [], online);
    expect(none.kind).toBe("too-few");
    const one = compareRouteView({ status: "ok", places: [A, B] }, ["place-a"], online);
    expect(one.kind).toBe("too-few");
    const gone = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "nope"], online);
    expect(gone.kind === "too-few" && gone.notices).toHaveLength(1);
  });
  it("has no notice when everything asked for was found", () => {
    const v = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], online);
    expect(v.kind === "table" && v.notices).toEqual([]);
  });
  it("keeps the order asked for, not the order in the list", () => {
    const v = compareRouteView({ status: "ok", places: [A, B, C] }, ["place-c", "place-a"], online);
    expect(v.kind === "table" && v.columns.map((c) => c.id)).toEqual(["place-c", "place-a"]);
  });
  it("counts a place asked for twice once", () => {
    const v = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-a", "place-b"], online);
    expect(v.kind === "table" && v.columns.map((c) => c.id)).toEqual(["place-a", "place-b"]);
  });
  it("compares at most three, and says so when more were asked for", () => {
    const v = compareRouteView({ status: "ok", places: [A, B, C, D] }, ["place-a", "place-b", "place-c", "place-d"], online);
    expect(MAX_COMPARE).toBe(3);
    expect(v.kind === "table" && v.columns).toHaveLength(3);
    expect(v.kind === "table" && v.notices).toHaveLength(1);
    expect(v.kind === "table" && v.notices[0]).toContain("3");
  });
  it("gives one row per feature, in the fixed order, with one cell per place", () => {
    const v = compareRouteView({ status: "ok", places: [A, B, C] }, ["place-a", "place-b", "place-c"], online);
    if (v.kind !== "table") throw new Error("table");
    expect(v.rows.map((r) => r.feature)).toEqual([...FEATURE_IDS]);
    for (const r of v.rows) {
      expect(r.cells.map((c) => c.placeId)).toEqual(["place-a", "place-b", "place-c"]);
      expect(r.differs).toBe(r.differsText !== null);
    }
  });
  it("calls UNKNOWN different from a reported value, and the same as UNKNOWN", () => {
    const v = compareRouteView({ status: "ok", places: [A, B, D] }, ["place-a", "place-b", "place-d"], online);
    if (v.kind !== "table") throw new Error("table");
    const row = (f: string) => v.rows.find((r) => r.feature === f)!;
    expect(row("elevator").differs).toBe(true);
    expect(row("automatic-door").differs).toBe(true);
    expect(row("accessible-parking").differs).toBe(false);
    expect(row("accessible-parking").cells.every((c) => c.status === "unknown")).toBe(true);
  });
  it("says the same for two places with the same value", () => {
    const v = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], online);
    if (v.kind !== "table") throw new Error("table");
    expect(v.rows.find((r) => r.feature === "elevator")!.differs).toBe(false);
  });
  it("gives a source line only to a reported value, and fills nothing in for UNKNOWN", () => {
    const v = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], online);
    if (v.kind !== "table") throw new Error("table");
    for (const r of v.rows) for (const c of r.cells) expect(c.sourceLine === null, `${r.feature}/${c.placeId}`).toBe(c.status === "unknown");
    const unknownCell = v.rows.find((r) => r.feature === "automatic-door")!.cells[1]!;
    expect(unknownCell.statusText).toMatch(/unknown/i);
  });
  it("names the places in the caption, joined for the language", () => {
    const en = compareRouteView({ status: "ok", places: [A, B, C] }, ["place-a", "place-b", "place-c"], online);
    for (const n of ["Alpha Hall", "Beta Library", "Gamma Hub"]) expect(en.kind === "table" && en.caption).toContain(n);
    const fr = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], { locale: "fr", connectivity: initialConnectivity(true) });
    expect(fr.kind === "table" && fr.caption).toContain("Alpha Hall");
    expect(fr.kind === "table" && fr.caption).toContain("Beta Library");
  });
  it("shows the offline notice only when offline", () => {
    const a = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], online);
    const b = compareRouteView({ status: "ok", places: [A, B] }, ["place-a", "place-b"], offline);
    expect(a.kind === "table" && a.banner).toBeNull();
    expect(b.kind === "table" && b.banner).not.toBeNull();
  });
  it("passes the copy lint in both languages", () => {
    for (const ctx of [online, offline]) {
      const v = compareRouteView({ status: "ok", places: [A, B, C, D] }, ["place-a", "place-b", "place-c", "place-d", "x"], ctx);
      if (v.kind !== "table") throw new Error("table");
      for (const s of [v.heading, v.caption, v.detailHeader, ...v.notices, ...v.rows.flatMap((r) => [r.label, r.differsText ?? "", ...r.cells.map((c) => c.statusText)])]) expect(lintCopy(s, ctx.locale), s).toEqual([]);
    }
  });
});

describe("collectSources", () => {
  const loc = { lat: 43.7, lon: -79.4, provenance: LOC_PROV };
  it("gives nothing for no places and for places with only UNKNOWN", () => {
    expect(collectSources([])).toEqual([]);
    expect(collectSources([D])).toEqual([]);
  });
  it("counts one detail per reported value and one per known location", () => {
    const r = collectSources([mkRecord("x", "X", { elevator: "yes", "level-path": "no" }, loc)]);
    expect(r.find((s) => s.source === PROV.source)!.details).toBe(2);
    expect(r.find((s) => s.source === LOC_PROV.source)!.details).toBe(1);
  });
  it("does not count a location with no source", () => expect(collectSources([mkRecord("x", "X", {}, { lat: 43.7, lon: -79.4 })])).toEqual([]));
  it("joins the same source and licence, and keeps the earliest and latest retrieval", () => {
    const early = { ...PROV, retrievedOn: "2026-01-05" };
    const late = { ...PROV, retrievedOn: "2026-09-09" };
    const r = collectSources([
      { id: "a", name: "A", features: [{ feature: "elevator", value: "yes", provenance: late }] },
      { id: "b", name: "B", features: [{ feature: "elevator", value: "yes", provenance: early }] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ details: 2, earliest: "2026-01-05", latest: "2026-09-09" });
  });
  it("keeps a source apart when the licence differs", () => {
    const r = collectSources([
      { id: "a", name: "A", features: [{ feature: "elevator", value: "yes", provenance: PROV }] },
      { id: "b", name: "B", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, licence: "ODbL-1.0" } }] },
    ]);
    expect(r).toHaveLength(2);
  });
  it("keeps an address when any record of the source has one", () => {
    const r = collectSources([
      { id: "a", name: "A", features: [{ feature: "elevator", value: "yes", provenance: PROV }] },
      { id: "b", name: "B", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, url: "https://a.example/x" } }] },
    ]);
    expect(r[0]!.url).toBe("https://a.example/x");
    expect(collectSources([A])[0]!.url).toBeNull();
  });
  it("sorts by source name, then licence, whatever the input order", () => {
    const mk = (source: string, licence: "ODbL-1.0" | "CC-BY-4.0") => ({ id: source + licence, name: "n", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, source, licence } }] });
    const places = [mk("Zed", "ODbL-1.0"), mk("Alpha", "ODbL-1.0"), mk("Alpha", "CC-BY-4.0")] as never[];
    const sorted = collectSources(places).map((s) => `${s.source}/${s.licence}`);
    expect(sorted).toEqual(["Alpha/CC-BY-4.0", "Alpha/ODbL-1.0", "Zed/ODbL-1.0"]);
    expect(collectSources([...places].reverse()).map((s) => `${s.source}/${s.licence}`)).toEqual(sorted);
  });
  it("gives the licence its full name", () => expect(collectSources([A])[0]!.licenceName.length).toBeGreaterThan(5));
});

describe("sourcesRouteView", () => {
  it("shows an error view for a failed load", () => expect(sourcesRouteView({ status: "error" }, online).kind).toBe("error"));
  it("shows an empty state when no place has a source", () => {
    const v = sourcesRouteView({ status: "ok", places: [D] }, online);
    expect(v.kind).toBe("empty");
  });
  it("shows a table, with the latest date written for the language", () => {
    const en = sourcesRouteView({ status: "ok", places: [A] }, online);
    const fr = sourcesRouteView({ status: "ok", places: [A] }, { locale: "fr", connectivity: initialConnectivity(true) });
    expect(en.kind === "table" && en.rows[0]!.latestText).toBe("1 October 2026");
    expect(fr.kind === "table" && fr.rows[0]!.latestText).toBe("1er octobre 2026");
  });
  it("passes the lint and shows the banner only offline", () => {
    for (const ctx of [online, offline]) {
      const v = sourcesRouteView({ status: "ok", places: [A, B] }, ctx);
      if (v.kind !== "table") throw new Error("table");
      for (const s of [v.heading, v.intro, v.caption, ...Object.values(v.headers)]) expect(lintCopy(s, ctx.locale), s).toEqual([]);
      expect(v.banner === null).toBe(ctx.connectivity.status === "online");
    }
  });
});

const ids = new Set(["place-a", "place-b"]);
const ok = { placeId: "place-a", feature: "elevator", suggested: "no", note: "", contact: "", consent: "" };
const errs = (r: CorrectionResult): string[] => (r.ok ? [] : Object.keys(r.errors));

describe("validateCorrection", () => {
  it("accepts a suggestion with no note and no contact", () => expect(validateCorrection(ok, ids).ok).toBe(true));
  it("accepts every feature and every suggested value", () => {
    for (const feature of FEATURE_IDS) for (const suggested of SUGGESTED_VALUES) expect(validateCorrection({ ...ok, feature, suggested }, ids).ok, `${feature}/${suggested}`).toBe(true);
  });
  it("rejects a place that is not in the list, or not an id at all", () => {
    for (const placeId of ["place-z", "", "has space", "../x", undefined]) expect(errs(validateCorrection({ ...ok, placeId }, ids)), String(placeId)).toEqual(["place"]);
  });
  it("rejects a feature or value it does not know", () => {
    expect(errs(validateCorrection({ ...ok, feature: "teleporter" }, ids))).toEqual(["feature"]);
    expect(errs(validateCorrection({ ...ok, feature: undefined }, ids))).toEqual(["feature"]);
    for (const suggested of ["maybe", "YES", "", undefined]) expect(errs(validateCorrection({ ...ok, suggested }, ids)), String(suggested)).toEqual(["suggested"]);
  });
  it("allows a note of exactly the limit and rejects one more", () => {
    expect(validateCorrection({ ...ok, note: "a".repeat(MAX_NOTE_LENGTH) }, ids).ok).toBe(true);
    expect(errs(validateCorrection({ ...ok, note: "a".repeat(MAX_NOTE_LENGTH + 1) }, ids))).toEqual(["note"]);
  });
  it("trims the note before it counts it", () => expect(validateCorrection({ ...ok, note: ` ${"a".repeat(MAX_NOTE_LENGTH)} ` }, ids).ok).toBe(true));
  it("strips control characters from every field, but keeps tabs inside text as they are removed only at the ends", () => {
    const r = validateCorrection({ ...ok, note: "a\u0000b\u0007c\u007fd" }, ids);
    expect(r.ok && r.value.note).toBe("abcd");
    const nl = validateCorrection({ ...ok, note: "line one\nline two" }, ids);
    expect(nl.ok && nl.value.note).toBe("line one\nline two");
  });
  it("needs consent to keep an email, and says consent, not contact, when the email is fine", () => {
    expect(errs(validateCorrection({ ...ok, contact: "a@b.co" }, ids))).toEqual(["consent"]);
    expect(validateCorrection({ ...ok, contact: "a@b.co", consent: "on" }, ids).ok).toBe(true);
  });
  it("needs no consent when there is no email", () => expect(validateCorrection({ ...ok, consent: "" }, ids).ok).toBe(true));
  it("rejects an email that is not one, and one that is too long", () => {
    for (const contact of ["a", "a@b", "a b@c.de", "@b.co", "a@@b.co", "a@b.c o"]) expect(errs(validateCorrection({ ...ok, contact, consent: "on" }, ids)), contact).toEqual(["contact"]);
    const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@b.co`;
    expect(errs(validateCorrection({ ...ok, contact: long, consent: "on" }, ids))).toEqual(["contact"]);
  });
  it("reports every failed field at once, each with a message that exists", () => {
    const r = validateCorrection({ placeId: "no", feature: "no", suggested: "bad", note: "x".repeat(600), contact: "bad", consent: "" }, ids);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["contact", "feature", "note", "place", "suggested"]);
    for (const m of Object.values(r.errors)) expect(CATALOG).toHaveProperty(m as string);
  });
  it("hands the cleaned values back with an error, so the form can be shown again", () => {
    const r = validateCorrection({ ...ok, placeId: "zzz", note: "  keep me  " }, ids);
    expect(!r.ok && r.values.note).toBe("keep me");
  });
  it("reads on, 1 and true as consent and nothing else", () => {
    for (const v of ["on", "1", "true"]) expect(isTruthyForm(v)).toBe(true);
    for (const v of ["", "off", "0", "false", "yes", "ON", undefined]) expect(isTruthyForm(v), String(v)).toBe(false);
  });
  it("has a message for every field, in the order the form shows them", () => {
    expect(FIELD_ORDER).toEqual(["place", "feature", "suggested", "note", "contact", "consent"]);
    for (const f of FIELD_ORDER) expect(CATALOG).toHaveProperty(FIELD_ERROR_MESSAGES[f]);
  });
});

describe("buildSubmission", () => {
  const value = (over: Record<string, string> = {}) => {
    const r = validateCorrection({ ...ok, ...over }, ids);
    if (!r.ok) throw new Error("not ok");
    return r.value;
  };
  const meta = { id: "abcd-1234", createdOn: TODAY };
  it("starts pending, with no attempts and no wait", () => {
    expect(buildSubmission(value(), meta)).toMatchObject({ id: "abcd-1234", createdOn: TODAY, status: "pending", attempts: 0, nextAttemptAt: 0 });
  });
  it("keeps the email only with consent", () => {
    expect(buildSubmission(value({ contact: "a@b.co", consent: "on" }), meta).payload.contact).toBe("a@b.co");
    expect(buildSubmission(value(), meta).payload.contact).toBeNull();
  });
  it("copies only the fields of a suggestion, not the consent flag", () => {
    expect(Object.keys(buildSubmission(value(), meta).payload).sort()).toEqual(["contact", "feature", "note", "placeId", "suggested"]);
  });
  it("throws for an id that is not safe to use as a key", () => {
    for (const id of ["short", "has space!", "a".repeat(65), "", "../../x12345"]) expect(() => buildSubmission(value(), { ...meta, id }), id).toThrow("Invalid submission id");
  });
  it("accepts ids of 8 to 64 letters, digits and hyphens", () => {
    for (const id of ["abcdefgh", "A1-b2-C3-d4", "a".repeat(64)]) expect(isSubmissionId(id), id).toBe(true);
    for (const id of [undefined, 12345678, "abc_defgh", "abcdefg"]) expect(isSubmissionId(id), String(id)).toBe(false);
  });
  it("survives a round trip through JSON, which is how the queue stores it", () => {
    const s = buildSubmission(value({ note: "ramp is steep", contact: "a@b.co", consent: "1" }), meta);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
