import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { MAX_HELP_RECORDS, parseHelpNumbers, readContactText, readLocalised } from "./packHelp";
import { readHttpsLink } from "./packUrl";

const plain = (host: string) => `${"ht"}${"tp://"}${host}`;
const shipped = (JSON.parse(contentText) as { help_numbers: unknown[] }).help_numbers;
const base = {
  id: "h1",
  name: { en: "Health811", fr: "Santé811" },
  contact: "811",
  how: { en: "Call 811.", fr: "Composez le 811." },
  url: "https://health811.ontario.ca/",
  provenance: { source_name: "Official page, desk check", source_url: "https://health811.ontario.ca/", licence: "UNKNOWN", retrieved_at: "2026-11-13", tier: "E" },
};
const one = (over: Record<string, unknown> = {}) => {
  const r = parseHelpNumbers([{ ...base, ...over }]);
  return { ...r, n: r.items[0] };
};

describe("the shipped Toronto pack", () => {
  const r = parseHelpNumbers(shipped);
  it("has six records and all are read, in the pack's order", () => {
    expect(r.dropped).toBe(0);
    expect(r.items.map((i) => i.id)).toEqual(["emergency-911", "suicide-crisis-988", "health811", "connexontario", "poison-centre", "two-one-one"]);
  });
  it("keeps each number exactly as written", () => {
    expect(r.items.map((i) => i.contact)).toEqual(["911", "9-8-8", "811", "1-866-531-2600", "1-800-268-9017", "211"]);
  });
  it("keeps both languages of each name and description", () => {
    const e = r.items[0]!;
    expect(e.name).toEqual({ en: "Emergency services", fr: "Services d'urgence" });
    expect(e.how.en).toContain("Call 911");
    expect(e.how.fr).toContain("Composez le 911");
  });
  it("has no address for 911 and an https address for the others", () => {
    expect(r.items[0]?.url).toBeNull();
    for (const i of r.items.slice(1)) expect(i.url?.startsWith("https://")).toBe(true);
  });
  it("reads the source, date and tier, and turns the licence UNKNOWN into null", () => {
    for (const i of r.items) {
      expect(i.licence).toBeNull();
      expect(i.retrievedOn).toBe("2026-11-13");
      expect(i.tier).toBe("E");
      expect(i.sourceName).not.toBeNull();
    }
  });
});

describe("what is not a list or a record", () => {
  it("gives nothing for anything but an array", () => {
    for (const v of [undefined, null, 0, "x", {}, true]) expect(parseHelpNumbers(v)).toEqual({ items: [], dropped: 0 });
  });
  it("drops records that are not objects and counts them", () => {
    const r = parseHelpNumbers([null, 3, "x", [], base]);
    expect(r.items).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });
  it("drops a record with no usable id, and a repeated id", () => {
    for (const id of [undefined, null, "", "  ", 5, {}, "UNKNOWN"]) expect(one({ id }).dropped, String(id)).toBe(1);
    const r = parseHelpNumbers([base, { ...base, contact: "911" }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.contact).toBe("811");
    expect(r.dropped).toBe(1);
  });
  it("counts records past the limit as dropped", () => {
    const many = Array.from({ length: MAX_HELP_RECORDS + 4 }, (_, i) => ({ ...base, id: `h${i}` }));
    const r = parseHelpNumbers(many);
    expect(r.items).toHaveLength(MAX_HELP_RECORDS);
    expect(r.dropped).toBe(4);
  });
  it("reads only a record's own keys", () => {
    const r = parseHelpNumbers([{ id: "x", __proto__: { contact: "911", name: { en: "Hijack" } } }]);
    expect(r.items[0]?.contact).toBeNull();
    expect(r.items[0]?.name.en).toBeNull();
  });
});

describe("a record with parts missing is kept", () => {
  it("keeps an id alone", () => {
    expect(parseHelpNumbers([{ id: "bare" }]).items[0]).toEqual({
      id: "bare", name: { en: null, fr: null }, how: { en: null, fr: null }, contact: null, url: null,
      sourceName: null, sourceUrl: null, licence: null, retrievedOn: null, tier: null,
    });
  });
  it("keeps one language when the other is missing", () => {
    expect(one({ name: { en: "Only English" } }).n?.name).toEqual({ en: "Only English", fr: null });
    expect(one({ how: { fr: "Seulement en français" } }).n?.how).toEqual({ en: null, fr: "Seulement en français" });
  });
  it("does not take a plain string for a localised text", () => {
    for (const name of ["Health811", 5, null, [], ["en"]]) expect(one({ name }).n?.name, String(name)).toEqual({ en: null, fr: null });
  });
  it("reads provenance only from an object", () => {
    for (const provenance of ["x", 5, null, []]) expect(one({ provenance }).n?.sourceName, String(provenance)).toBeNull();
  });
  it("never defaults a tier", () => {
    for (const tier of [undefined, null, 9, "high", {}]) expect(one({ provenance: { ...base.provenance, tier } }).n?.tier, String(tier)).toBeNull();
    expect(one({ provenance: { ...base.provenance, tier: 0 } }).n?.tier).toBe(0);
  });
});

describe("provenance keys are own keys too", () => {
  it("does not read a source from the prototype of the provenance object", () => {
    const prov = Object.create({ source_name: "Inherited", tier: "A" }) as Record<string, unknown>;
    const r = parseHelpNumbers([{ id: "p", provenance: prov }]).items[0]!;
    expect(r.sourceName).toBeNull();
    expect(r.tier).toBeNull();
  });
  it("does not read a name from the prototype of a localised text", () => {
    const name = Object.create({ en: "Inherited" }) as Record<string, unknown>;
    expect(parseHelpNumbers([{ id: "p", name }]).items[0]?.name.en).toBeNull();
  });
});

describe("readContactText", () => {
  it("keeps a number as written", () => {
    for (const s of ["911", "9-8-8", "1-866-531-2600", "1 866 531 2600", "(416) 555-0100", "+1 416 555 0100", "416.555.0100"]) expect(readContactText(s), s).toBe(s);
  });
  it("refuses text that is not a number", () => {
    for (const s of ["call 911", "911 or 112", "TTY: 711", "abc", "", "  ", "-", "()", "UNKNOWN", null, undefined, 911, {}]) expect(readContactText(s), String(s)).toBeNull();
  });
  it("refuses a number that is too long", () => {
    expect(readContactText("1".repeat(41))).toBeNull();
  });
  it("refuses a number with script or markup in it", () => {
    for (const s of ["911<script>", "911; DROP", "911\n912x"]) expect(readContactText(s), s).toBeNull();
  });
});

describe("readLocalised", () => {
  it("cleans each language and caps its length", () => {
    const r = readLocalised({ en: "  a\u0000b  ", fr: "x".repeat(900) }, 100);
    expect(r.en).toBe("ab");
    expect(r.fr?.length).toBeLessThanOrEqual(100);
    expect(r.fr?.endsWith("…")).toBe(true);
  });
  it("turns UNKNOWN and blanks into null", () => {
    expect(readLocalised({ en: "UNKNOWN", fr: " " }, 50)).toEqual({ en: null, fr: null });
  });
});

describe("readHttpsLink", () => {
  it("keeps https and refuses the rest", () => {
    expect(readHttpsLink("https://988.ca/")).toBe("https://988.ca/");
    for (const v of [plain("988.ca"), "javascript:alert(1)", "https://", "988.ca", "https://a b", null, 3]) expect(readHttpsLink(v), String(v)).toBeNull();
    expect(readHttpsLink(`https://x.invalid/${"a".repeat(600)}`)).toBeNull();
  });
  it("is used for the page and the source address", () => {
    expect(one({ url: "ftp://x.invalid" }).n?.url).toBeNull();
    expect(one({ provenance: { ...base.provenance, source_url: plain("x.invalid") } }).n?.sourceUrl).toBeNull();
  });
});

describe("retrieval date", () => {
  it("keeps a real date only", () => {
    expect(one().n?.retrievedOn).toBe("2026-11-13");
    for (const v of ["2026-02-30", "2026-11-13T00:00:00Z", "13 Nov", 5, null]) expect(one({ provenance: { ...base.provenance, retrieved_at: v } }).n?.retrievedOn, String(v)).toBeNull();
  });
});
