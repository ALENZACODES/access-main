/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { OSM_CREDIT } from "./dataCredits";
import { PROV, bare, place, varied } from "./placeFixtures";
import { GPX_FILENAMES, GPX_NAMESPACE, VCARDS_FILENAMES, VCARD_FILENAMES, VCARD_LINE_OCTETS, cleanLine, escapeVcard, escapeXml, foldVcardLine, placeNote, placeToVcard, placesToGpx, placesToVcards } from "./placeSheetExport";

const enc = new TextEncoder();
const unfold = (s: string) => s.replace(/\r\n /g, "");
const lines = (s: string) => s.split("\r\n").filter((l) => l !== "");

describe("file names", () => {
  it("are different in the two languages and end in the format's extension", () => {
    expect(VCARD_FILENAMES).toEqual({ en: "place.vcf", fr: "lieu.vcf" });
    expect(VCARDS_FILENAMES).toEqual({ en: "places.vcf", fr: "lieux.vcf" });
    expect(GPX_FILENAMES).toEqual({ en: "places.gpx", fr: "lieux.gpx" });
  });
});

describe("cleanLine", () => {
  it("turns line breaks and tabs into one space and trims", () => {
    expect(cleanLine("  a\r\nb\tc  ")).toBe("a b c");
  });
  it("removes control characters and bidirectional overrides", () => {
    expect(cleanLine("a\u0000b\u0007c\u202ed\u2066e\u007ff")).toBe("abcdef");
  });
  it("collapses runs of spaces", () => {
    expect(cleanLine("a    b")).toBe("a b");
  });
  it("leaves accents and other scripts alone", () => {
    expect(cleanLine("Café 東京")).toBe("Café 東京");
  });
});

describe("escapeVcard", () => {
  it("escapes backslash first, then semicolon and comma", () => {
    expect(escapeVcard("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
  });
  it("makes a line break a space rather than a new content line", () => {
    expect(escapeVcard("one\nEND:VCARD")).toBe("one END:VCARD");
  });
});

describe("foldVcardLine", () => {
  it("leaves a short line alone", () => {
    expect(foldVcardLine("NOTE:short")).toBe("NOTE:short");
  });
  it("leaves a line of exactly 75 octets alone", () => {
    const l = "x".repeat(VCARD_LINE_OCTETS);
    expect(foldVcardLine(l)).toBe(l);
  });
  it("folds a line of 76 octets into two", () => {
    expect(foldVcardLine("x".repeat(76)).split("\r\n")).toHaveLength(2);
  });
  it("makes every physical line at most 75 octets, counting the leading space", () => {
    for (const text of ["x".repeat(500), "é".repeat(200), "東".repeat(120), "a東é😀".repeat(40)]) {
      for (const l of foldVcardLine(text).split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(VCARD_LINE_OCTETS);
    }
  });
  it("begins each continuation with exactly one space", () => {
    const parts = foldVcardLine("x".repeat(300)).split("\r\n");
    expect(parts.slice(1).every((p) => p.startsWith(" ") && !p.startsWith("  "))).toBe(true);
  });
  it("loses nothing: unfolding gives the original", () => {
    for (const text of ["x".repeat(500), "é".repeat(200), "東".repeat(120), "a東é😀".repeat(40)]) expect(unfold(foldVcardLine(text))).toBe(text);
  });
  it("never splits a multi-byte character", () => {
    const folded = foldVcardLine("😀".repeat(60));
    expect(unfold(folded)).toBe("😀".repeat(60));
    expect(folded).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("escapeXml", () => {
  it("escapes the five predefined entities", () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;");
  });
  it("escapes the ampersand first, so an entity in the text is shown, not made", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });
  it("removes characters XML 1.0 does not allow", () => {
    expect(escapeXml("a\u0000b\u0008c")).toBe("abc");
  });
});

describe("placeNote", () => {
  it("states the tag, source and licence and says it is not a check of the place", () => {
    expect(placeNote(place("a"), "en")).toBe("Wheelchair tag: Yes. Source: OpenStreetMap, Geofabrik Ontario extract. Licence: ODbL 1.0. This is what the pack reports and not a check of the place.");
  });
  it("uses UNKNOWN for a missing source and licence", () => {
    expect(placeNote(bare("z"), "en")).toBe("Wheelchair tag: UNKNOWN. Source: UNKNOWN. Licence: UNKNOWN. This is what the pack reports and not a check of the place.");
  });
  it("is in French with the colons spaced", () => {
    const n = placeNote(place("a"), "fr");
    expect(n).toContain("Indication pour fauteuil roulant\u00a0: Oui.");
    expect(n).toContain("Ceci est ce que le pack indique, pas un contrôle du lieu.");
  });
});

describe("placeToVcard", () => {
  const card = placeToVcard(place("a", { tier: 0, wheelchair_description: "ignored here" }), "en");
  it("uses CRLF line ends and ends with one", () => {
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
    expect(card.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("begins and ends the card and gives version 3.0", () => {
    const l = lines(card);
    expect(l[0]).toBe("BEGIN:VCARD");
    expect(l[1]).toBe("VERSION:3.0");
    expect(l.at(-1)).toBe("END:VCARD");
  });
  it("carries the name, structured name, kind, address and position", () => {
    const l = unfold(card);
    expect(l).toContain("\r\nFN:Place a\r\n");
    expect(l).toContain("\r\nN:Place a;;;;\r\n");
    expect(l).toContain("\r\nORG:cafe\r\n");
    expect(l).toContain("\r\nADR;TYPE=WORK:;;1 Main Street;;;;\r\n");
    expect(l).toContain("\r\nGEO:43.65000;-79.38000\r\n");
  });
  it("carries the source link and a stable id", () => {
    const l = unfold(card);
    expect(l).toContain("URL:https://www.openstreetmap.org/way/42");
    expect(l).toContain("UID:pack-place-a");
  });
  it("makes no GEO and no ADR for a place with neither, and says UNKNOWN for name and kind", () => {
    const l = unfold(placeToVcard(bare("z"), "en"));
    expect(l).not.toContain("GEO:");
    expect(l).not.toContain("ADR");
    expect(l).toContain("FN:UNKNOWN");
    expect(l).toContain("ORG:UNKNOWN");
  });
  it("cannot be broken out of by a name with a line break or a card marker", () => {
    const hostile = place("a", { name: "Evil\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Other" });
    const l = lines(placeToVcard(hostile, "en"));
    expect(l.filter((x) => x === "END:VCARD")).toHaveLength(1);
    expect(l.filter((x) => x === "BEGIN:VCARD")).toHaveLength(1);
  });
  it("escapes semicolons and commas in an address", () => {
    const l = unfold(placeToVcard(place("a", { address: "1 Main St, Unit 2; rear" }), "en"));
    expect(l).toContain("ADR;TYPE=WORK:;;1 Main St\\, Unit 2\\; rear;;;;");
  });
  it("keeps the existing identity of portable pack IDs across exports and languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const renamed = place("R_1.a-42", { name: "A new label" });
      expect(lines(placeToVcard(renamed, locale))).toContain("UID:pack-place-R_1.a-42");
    }
  });
  it("gives distinct contacts to punctuation variants, including a literal escape marker", () => {
    const ids = ["way/42", "way-42", "way:42", "way~002f42", "way,42", "way;42"];
    const text = unfold(placesToVcards(ids.map((id) => place(id)), "en"));
    expect(lines(text).filter((line) => line.startsWith("UID:"))).toEqual([
      "UID:pack-place-way~002f42", "UID:pack-place-way-42", "UID:pack-place-way~003a42",
      "UID:pack-place-way~007e002f42", "UID:pack-place-way~002c42", "UID:pack-place-way~003b42",
    ]);
  });
  it("preserves distinct UTF-16 pack IDs even beyond the basic multilingual plane", () => {
    const ids = ["café", "cafe\u0301", "🚲", "\ud83d", "\udc00", "\ufffd", "a\u202eb", "ab"];
    const exportText = unfold(placesToVcards(ids.map((id) => place(id, { name: "Station" })), "fr"));
    const uids = lines(exportText).filter((line) => line.startsWith("UID:"));
    expect(new Set(uids).size).toBe(ids.length);
    expect(uids).toContain("UID:pack-place-~d83d~deb2");
    expect(uids).toContain("UID:pack-place-~d83d");
    expect(uids).toContain("UID:pack-place-a~202eb");
  });
  it("gives a note that says it is not a check", () => {
    expect(unfold(card)).toContain("not a check of the place");
  });
  it("folds every physical line to at most 75 octets", () => {
    const long = placeToVcard(place("a", { name: "東".repeat(150), address: "é".repeat(200) }), "fr");
    for (const l of long.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(VCARD_LINE_OCTETS);
  });
  it("round-trips a long name through unfolding", () => {
    const name = "東".repeat(150);
    expect(unfold(placeToVcard(place("a", { name }), "en"))).toContain(`FN:${name}`);
  });
  it("makes no claim of being checked or complete", () => {
    expect(card).not.toMatch(new RegExp(["ver", "if", "|guar", "antee|real", "-time|part", "ner"].join(""), "i"));
  });
});

describe("placesToVcards", () => {
  it("is the cards one after another, in the order given", () => {
    const ps = [place("b"), place("a")];
    const out = placesToVcards(ps, "en");
    expect(out).toBe(placeToVcard(ps[0]!, "en") + placeToVcard(ps[1]!, "en"));
    expect(out.indexOf("UID:pack-place-b")).toBeLessThan(out.indexOf("UID:pack-place-a"));
  });
  it("is empty for no places", () => {
    expect(placesToVcards([], "en")).toBe("");
  });
  it("has one BEGIN and one END for each place", () => {
    const out = placesToVcards(varied(7, 25), "en");
    expect(out.match(/^BEGIN:VCARD\r$/gm)).toHaveLength(25);
    expect(out.match(/^END:VCARD\r$/gm)).toHaveLength(25);
  });
});

describe("placesToGpx", () => {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
  const ps = [place("a", { name: "A & B <c>" }), place("b", { lat: null, lon: null }), place("c", { lat: 44.1, lon: -80.25 })];
  const doc = parse(placesToGpx(ps, "en"));
  it("is well-formed XML", () => {
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });
  it("is GPX 1.1 in the GPX namespace", () => {
    expect(doc.documentElement.localName).toBe("gpx");
    expect(doc.documentElement.getAttribute("version")).toBe("1.1");
    expect(doc.documentElement.namespaceURI).toBe(GPX_NAMESPACE);
  });
  it("has a waypoint only for each place with a map point, in order", () => {
    const wpts = [...doc.getElementsByTagName("wpt")];
    expect(wpts.map((w) => w.getAttribute("lat"))).toEqual(["43.65000", "44.10000"]);
    expect(wpts.map((w) => w.getAttribute("lon"))).toEqual(["-79.38000", "-80.25000"]);
  });
  it("gives back the name text after escaping", () => {
    expect([...doc.getElementsByTagName("wpt")][0]!.getElementsByTagName("name")[0]!.textContent).toBe("A & B <c>");
  });
  it("counts the places left out in its description and says their position is UNKNOWN", () => {
    const desc = doc.getElementsByTagName("desc")[0]!.textContent!;
    expect(desc).toContain("2 of 3 places have a map point.");
    expect(desc).toContain("1 with no map point are left out; their position is UNKNOWN.");
  });
  it("carries the OpenStreetMap credit exactly", () => {
    expect(OSM_CREDIT).toBe("© OpenStreetMap contributors");
    expect(doc.getElementsByTagName("desc")[0]!.textContent).toContain(OSM_CREDIT);
  });
  it("is valid with no places at all", () => {
    const empty = parse(placesToGpx([], "fr"));
    expect(empty.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(empty.getElementsByTagName("wpt")).toHaveLength(0);
    expect(empty.getElementsByTagName("desc")[0]!.textContent).toContain("0 lieux sur 0");
  });
  it("is French in French", () => {
    const fr = parse(placesToGpx(ps, "fr"));
    expect(fr.getElementsByTagName("name")[0]!.textContent).toBe("Lieux enregistrés");
    expect(fr.getElementsByTagName("desc")[0]!.textContent).toContain("2 lieux sur 3 ont un point de carte.");
  });
  it("gives a link only when the place has a source address", () => {
    const withLink = parse(placesToGpx([place("a")], "en"));
    expect(withLink.getElementsByTagName("link")[0]!.getAttribute("href")).toBe(PROV.source_url);
    const without = parse(placesToGpx([place("a", { provenance: { ...PROV, source_url: undefined } })], "en"));
    expect(without.getElementsByTagName("link")).toHaveLength(0);
  });
  it("cannot be broken out of by hostile text", () => {
    const x = parse(placesToGpx([place("a", { name: `</name><evil/>"'&`, address: "]]>" })], "en"));
    expect(x.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(x.getElementsByTagName("evil")).toHaveLength(0);
  });
});
