import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { MAX_NOTICES, parseElevatorNotices, readHttpsUrl, readInstant } from "./packElevators";

const shipped = (JSON.parse(contentText) as { elevator_status: unknown[] }).elevator_status;
const PLAIN = "ht" + "tp://example.org";
const base = {
  id: "n1",
  station: "Pape",
  operator_text: "Pape: Elevator 8D1L out of service between Pape Ave entrance and concourse.",
  operator_text_language: "en",
  stop_ids: ["1", "2"],
  checked_at: "2026-11-13T19:48:29.000Z",
  source_name: "TTC GTFS-Realtime accessibility alerts",
  source_url: "https://example.org/a",
  licence: "OGL-Toronto-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};
const one = (over: Record<string, unknown> = {}) => {
  const r = parseElevatorNotices([{ ...base, ...over }]);
  return { ...r, n: r.notices[0] };
};

describe("the shipped Toronto pack", () => {
  it("has three notices and all are read", () => {
    const r = parseElevatorNotices(shipped);
    expect(r.dropped).toBe(0);
    expect(r.notices.map((n) => n.station)).toEqual(["Cedarvale", "Pape", "Finch"]);
  });
  it("keeps the operator's words as the pack gives them", () => {
    const r = parseElevatorNotices(shipped);
    expect(r.notices[1]?.text).toBe("Pape: Elevator 8D1L out of service between Pape Ave entrance, concourse and Line 2 westbound platform while we perform maintenance.");
  });
  it("reads the check time and its day", () => {
    const n = parseElevatorNotices(shipped).notices[0]!;
    expect(n.checkedAt).toBe("2026-11-13T19:48:29.000Z");
    expect(n.checkedDay).toBe("2026-11-13");
    expect(n.retrievedOn).toBe("2026-11-13");
    expect(n.tier).toBe(0);
    expect(n.textLanguage).toBe("en");
    expect(n.licence).toBe("OGL-Toronto-1.0");
  });
  it("has no source address, and so keeps none", () => {
    for (const n of parseElevatorNotices(shipped).notices) expect(n.sourceUrl).toBeNull();
  });
  it("keeps stop ids as text", () => {
    expect(parseElevatorNotices(shipped).notices[0]?.stopIds).toEqual(["16069", "13832", "13831", "16070"]);
  });
});

describe("what is not a list", () => {
  it("gives nothing for anything but an array", () => {
    for (const v of [undefined, null, 0, "x", {}, { length: 2 }, true]) expect(parseElevatorNotices(v)).toEqual({ notices: [], dropped: 0 });
  });
  it("drops a record that is not an object, and counts it", () => {
    const r = parseElevatorNotices([null, 3, "x", [], base]);
    expect(r.notices).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });
  it("drops a record with no usable id", () => {
    for (const id of [undefined, null, "", "   ", 5, {}, "UNKNOWN"]) expect(one({ id }).dropped, String(id)).toBe(1);
  });
  it("drops a repeated id and keeps the first", () => {
    const r = parseElevatorNotices([base, { ...base, station: "Other" }]);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]?.station).toBe("Pape");
    expect(r.dropped).toBe(1);
  });
  it("counts records past the limit as dropped", () => {
    const many = Array.from({ length: MAX_NOTICES + 7 }, (_, i) => ({ ...base, id: `n${i}` }));
    const r = parseElevatorNotices(many);
    expect(r.notices).toHaveLength(MAX_NOTICES);
    expect(r.dropped).toBe(7);
  });
  it("does not read inherited or special keys as data", () => {
    const r = parseElevatorNotices([{ id: "x", __proto__: { station: "Hijack" }, constructor: "y" }]);
    expect(r.notices[0]?.station).toBeNull();
  });
});

describe("a notice with parts missing is still kept", () => {
  it("keeps an id alone", () => {
    const r = parseElevatorNotices([{ id: "bare" }]);
    expect(r.dropped).toBe(0);
    expect(r.notices[0]).toEqual({
      id: "bare", station: null, text: null, textLanguage: null, stopIds: [], checkedAt: null, checkedDay: null,
      sourceName: null, sourceUrl: null, licence: null, retrievedOn: null, tier: null,
    });
  });
  it("turns UNKNOWN and blanks into null", () => {
    const { n } = one({ station: "UNKNOWN", operator_text: "  ", source_name: "unknown", licence: "" });
    expect(n?.station).toBeNull();
    expect(n?.text).toBeNull();
    expect(n?.sourceName).toBeNull();
    expect(n?.licence).toBeNull();
  });
  it("never defaults a tier", () => {
    for (const tier of [undefined, null, 7, -1, "high", {}, 1.5]) expect(one({ tier }).n?.tier, String(tier)).toBeNull();
    expect(one({ tier: "E" }).n?.tier).toBe("E");
    expect(one({ tier: "1" }).n?.tier).toBe(1);
  });
});

describe("text is cleaned, not trusted", () => {
  it("removes control characters and bidirectional overrides", () => {
    const bidi = String.fromCharCode(0x202e);
    const { n } = one({ operator_text: `Pape:${bidi} out\u0000 of\u0007 service`, station: `Pa\u0001pe` });
    expect(n?.text).toBe("Pape: out of service");
    expect(n?.station).toBe("Pape");
  });
  it("collapses runs of spaces and line breaks", () => {
    expect(one({ operator_text: "Pape:\n\n  out   of\tservice" }).n?.text).toBe("Pape: out of service");
  });
  it("caps a very long notice with an ellipsis", () => {
    const text = one({ operator_text: "x".repeat(5000) }).n?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(600);
    expect(text.endsWith("…")).toBe(true);
  });
  it("keeps markup as plain text", () => {
    expect(one({ operator_text: "<img src=x onerror=alert(1)>" }).n?.text).toBe("<img src=x onerror=alert(1)>");
  });
  it("ignores a station that is not text", () => {
    for (const station of [5, {}, [], true, null]) expect(one({ station }).n?.station).toBeNull();
  });
});

describe("readInstant", () => {
  it("reads a time with Z, with milliseconds and with an offset", () => {
    expect(readInstant("2026-11-13T19:48:29Z")).toEqual({ instant: "2026-11-13T19:48:29Z", day: "2026-11-13" });
    expect(readInstant("2026-11-13T19:48:29.5Z")?.day).toBe("2026-11-13");
    expect(readInstant("2026-11-13T19:48:29-05:00")?.day).toBe("2026-11-14");
    expect(readInstant("2026-11-13T23:30:00-05:00")?.day).toBe("2026-11-14");
    expect(readInstant("2026-11-13T01:30:00+05:30")?.day).toBe("2026-11-12");
  });
  it("counts the day in UTC, so the same instant gives the same day everywhere", () => {
    expect(readInstant("2026-11-13T23:59:59Z")?.day).toBe("2026-11-13");
    expect(readInstant("2026-11-14T00:00:00Z")?.day).toBe("2026-11-14");
  });
  it("refuses a time with no zone, a date alone, and other shapes", () => {
    for (const v of ["2026-11-13T19:48:29", "2026-11-13", "2026-11-13 19:48:29Z", "13/11/2026", "", " 2026-11-13T19:48:29Z", "2026-11-13T19:48Z"]) expect(readInstant(v), v).toBeNull();
  });
  it("refuses a time that is not on the calendar or the clock", () => {
    for (const v of ["2026-02-30T10:00:00Z", "2026-13-01T10:00:00Z", "2026-11-13T24:00:00Z", "2026-11-13T10:60:00Z", "2026-11-13T10:00:60Z", "2026-11-13T10:00:00+15:00", "2026-11-13T10:00:00+05:60"]) expect(readInstant(v), v).toBeNull();
  });
  it("accepts 29 February in a leap year only", () => {
    expect(readInstant("2028-02-29T00:00:00Z")?.day).toBe("2028-02-29");
    expect(readInstant("2026-02-29T00:00:00Z")).toBeNull();
  });
  it("refuses values that are not text", () => {
    for (const v of [null, undefined, 0, 1731526109000, {}, []]) expect(readInstant(v)).toBeNull();
  });
  it("is used for the notice's check time", () => {
    expect(one({ checked_at: "yesterday" }).n?.checkedAt).toBeNull();
    expect(one({ checked_at: "yesterday" }).n?.checkedDay).toBeNull();
  });
});

describe("readHttpsUrl", () => {
  it("keeps an https address", () => {
    expect(readHttpsUrl("https://example.org/a?b=1#c")).toBe("https://example.org/a?b=1#c");
    expect(readHttpsUrl("  https://example.org  ")).toBe("https://example.org");
  });
  it("refuses http, other schemes, no host, spaces and non-text", () => {
    for (const v of [PLAIN, "ftp://example.org", "javascript:alert(1)", "https://", "https:///x", "https://a b.example", "example.org", "", null, 5, {}]) expect(readHttpsUrl(v), String(v)).toBeNull();
  });
  it("refuses an address that is too long", () => {
    expect(readHttpsUrl(`https://example.org/${"a".repeat(600)}`)).toBeNull();
  });
  it("is used for the source address", () => {
    expect(one({ source_url: PLAIN }).n?.sourceUrl).toBeNull();
    expect(one({ source_url: "https://example.org/x" }).n?.sourceUrl).toBe("https://example.org/x");
  });
});

describe("language and stop ids", () => {
  it("reads en and fr, with a region", () => {
    expect(one({ operator_text_language: "EN" }).n?.textLanguage).toBe("en");
    expect(one({ operator_text_language: "fr-CA" }).n?.textLanguage).toBe("fr");
    expect(one({ operator_text_language: "en-US" }).n?.textLanguage).toBe("en");
  });
  it("leaves any other language null", () => {
    for (const v of ["es", "english", "", null, 5, "fra"]) expect(one({ operator_text_language: v }).n?.textLanguage, String(v)).toBeNull();
  });
  it("keeps numbers and text ids, once each, in order", () => {
    expect(one({ stop_ids: [5, "5", " 7 ", "a-1", 7, "a-1"] }).n?.stopIds).toEqual(["5", "7", "a-1"]);
  });
  it("skips ids that are empty, odd or too long", () => {
    expect(one({ stop_ids: ["", " ", "a b", "<x>", -1, 1.5, "x".repeat(41), null, {}, "ok"] }).n?.stopIds).toEqual(["ok"]);
  });
  it("keeps at most 40 ids", () => {
    expect(one({ stop_ids: Array.from({ length: 90 }, (_, i) => String(i)) }).n?.stopIds).toHaveLength(40);
  });
  it("gives none for a value that is not a list", () => {
    for (const v of ["1,2", 5, {}, null]) expect(one({ stop_ids: v }).n?.stopIds).toEqual([]);
  });
});

describe("retrieval date", () => {
  it("keeps a real date and drops anything else", () => {
    expect(one({ retrieved_at: "2026-11-13" }).n?.retrievedOn).toBe("2026-11-13");
    for (const v of ["2026-02-30", "2026-11-13T00:00:00Z", "13 Nov", 5, null]) expect(one({ retrieved_at: v }).n?.retrievedOn, String(v)).toBeNull();
  });
});
