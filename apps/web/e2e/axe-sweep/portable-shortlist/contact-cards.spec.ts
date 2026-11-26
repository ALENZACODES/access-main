import { expect, test } from "@playwright/test";
import { PROV, bare, place } from "../../../src/states/placeFixtures";
import { placeToVcard, placesToVcards } from "../../../src/states/placeSheetExport";
import { readContactCards } from "./contact-cards";

const sep = "\r\n";
// Hand-written specimen for testing the reader independently of production formatting.
const specimen = [
  "BEGIN:VCARD", "VERSION:3.0", "PRODID:-//Ontario accessibility app//Places//EN",
  "FN:Station", "N:Station;;;;", "ORG:transit", "ADR;TYPE=WORK:;;Gate 3;;;;",
  "GEO:48.00000;-80.00000", "NOTE:Information from the pack.",
  "URL:https://example.org/station", "UID:pack-place-example", "END:VCARD", "",
].join(sep);

function replaceLine(line: string, replacement: string): string {
  const before = `${line}${sep}`;
  if (!specimen.includes(before)) throw new Error(`No such specimen line: ${line}`);
  return specimen.replace(before, replacement ? `${replacement}${sep}` : "");
}

test.describe("contact downloads in a contacts reader", () => {
  test("preserves selection order and identifies equally named places by UID", () => {
    const first = place("way/42", { name: "Station", address: "East door", lat: 45.251234, lon: -79.871239 });
    const second = place("way-42", { name: "Station", address: "West door", lat: null, lon: null });
    const cards = readContactCards(placesToVcards([second, first], "en"));
    expect(cards.map(({ name, uid, address, coordinate }) => ({ name, uid, address, coordinate }))).toEqual([
      { name: "Station", uid: "pack-place-way-42", address: "West door", coordinate: null },
      { name: "Station", uid: "pack-place-way~002f42", address: "East door", coordinate: { lat: 45.25123, lon: -79.87124 } },
    ]);
    expect(cards[1]?.url).toBe(PROV.source_url);
    expect(cards[1]?.category).toBe("cafe");
    expect(cards[1]?.note).toBe("Wheelchair tag: Yes. Source: OpenStreetMap, Geofabrik Ontario extract. Licence: ODbL 1.0. This is what the pack reports and not a check of the place.");
  });

  test("returns explicit unknowns and absent properties independently for each place", () => {
    const items = [place("north"), bare("middle"), place("south", { address: null })];
    const cards = readContactCards(placesToVcards(items, "fr"));
    expect(cards).toHaveLength(3);
    expect(cards[0]?.address).toBe("1 Main Street");
    expect(cards[1]).toEqual({
      uid: "pack-place-middle",
      name: "UNKNOWN", category: "UNKNOWN", address: null, coordinate: null, url: null,
      note: "Indication pour fauteuil roulant\u00a0: UNKNOWN. Source\u00a0: UNKNOWN. Licence\u00a0: UNKNOWN. Ceci est ce que le pack indique, pas un contrôle du lieu.",
    });
    expect(cards[2]).toMatchObject({ uid: "pack-place-south", address: null, url: PROV.source_url });
    expect(cards[2]?.note).toContain("Indication pour fauteuil roulant\u00a0: Oui.");
    expect(readContactCards(placesToVcards([], "en"))).toEqual([]);
  });

  test("handles names, categories and street addresses that become empty after cleaning", () => {
    const record = place("blank-fields", {
      name: "\u2066\u2069", category: "\u0000\u0007", address: "\u202e\u202c",
    });
    const [card] = readContactCards(placeToVcard(record, "en"));
    expect(card).toMatchObject({
      uid: "pack-place-blank-fields", name: "UNKNOWN", category: "UNKNOWN", address: null,
      coordinate: { lat: 43.65, lon: -79.38 },
    });
  });

  test("recovers punctuation at escape boundaries in every structured and scalar text field", () => {
    const name = String.raw`Gare\; terminus, entrée: \\`;
    const category = String.raw`transit;bus,rail\station`;
    const address = String.raw`Building A\, room C; 4:15`;
    const provenance = {
      ...PROV, source_name: String.raw`Council; service A,B\C`,
      source_url: "https://example.org/records;a,b:2?unit=A%2FB&ref=abc#door",
    };
    const record = place("local_123", { name, category, address, provenance });
    const [card] = readContactCards(placeToVcard(record, "en"));
    expect(card).toMatchObject({ name, category, address, url: provenance.source_url });
    expect(card?.note).toContain(provenance.source_name);
  });

  test("removes only the fold marker when the next character is an actual space", () => {
    const name = "A".repeat(72) + " B";
    const exported = placeToVcard(place("boundary", { name }), "en");
    expect(exported).toContain(`FN:${"A".repeat(72)}${sep}  B${sep}`);
    expect(readContactCards(exported)[0]?.name).toBe(name);
  });

  test("rejoins an escape pair carried across physical lines before decoding punctuation", () => {
    for (const punctuation of [";", ",", "\\"]) {
      const name = "a".repeat(71) + punctuation + "étage";
      const exported = placeToVcard(place("esc", { name }), "fr");
      expect(exported).toContain(`FN:${"a".repeat(71)}\\${sep} ${punctuation}`);
      expect(readContactCards(exported)[0]?.name).toBe(name);
    }
  });

  test("preserves accents, combining marks and supplementary characters through repeated folds", () => {
    const name = "🚋上e\u0301".repeat(24);
    const longId = "地".repeat(36);
    const exported = placeToVcard(place(longId, { name, address: `Entrée ${name}` }), "fr");
    const [card] = readContactCards(exported);
    expect(card?.name).toBe(name);
    expect(card?.address).toBe(`Entrée ${name}`);
    expect(card?.uid).toBe(`pack-place-${"~5730".repeat(36)}`);
  });

  test("preserves zero and valid extremal positions as actual coordinates", () => {
    const items = [place("north", { lat: 90, lon: -180 }), place("origin", { lat: 0, lon: 0 }), place("south", { lat: -90, lon: 180 })];
    expect(readContactCards(placesToVcards(items, "en")).map((card) => card.coordinate)).toEqual([
      { lat: 90, lon: -180 }, { lat: 0, lon: 0 }, { lat: -90, lon: 180 },
    ]);
  });

  test("does not interpret field or card markers in place names as syntax", () => {
    const item = place("marker", {
      name: "Shelter\r\nEND:VCARD\r\nBEGIN:VCARD", address: "Lobby\nGEO:0;0\nUID:other",
    });
    const cards = readContactCards(placeToVcard(item, "en"));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      name: "Shelter END:VCARD BEGIN:VCARD", address: "Lobby GEO:0;0 UID:other", uid: "pack-place-marker",
      coordinate: { lat: 43.65, lon: -79.38 },
    });
  });
});

test.describe("vCard interoperability failures", () => {
  test("detects incomplete and wrongly delimited downloads", () => {
    const broken = [
      [specimen.slice(0, -2), /expected CRLF/],
      [specimen.replaceAll(sep, "\n"), /expected CRLF/],
      [specimen.replace("FN:Station", "FN:bad\nline"), /control/],
      [specimen.replace("FN:Station", "FN:bad\rline"), /control/],
      [specimen.replace("END:VCARD\r\n", ""), /missing END:VCARD/],
      [specimen + sep, /empty physical line/],
      [`NOTE:before${sep}` + specimen, /outside a card/],
      [specimen + `UID:orphan${sep}`, /outside a card/],
      [replaceLine("FN:Station", "BEGIN:VCARD"), /nested BEGIN/],
    ] as const;
    for (const [input, reason] of broken) expect(() => readContactCards(input)).toThrow(reason);
  });

  test("counts physical octets including the continuation marker", () => {
    const note = "NOTE:Information from the pack.";
    // 5 ASCII bytes + 35 two-byte characters on the first line, 1 + 37 * 2 on the next.
    const edge = `NOTE:${"é".repeat(35)}${sep} ${"é".repeat(37)}`;
    expect(readContactCards(replaceLine(note, edge))[0]?.note).toBe("é".repeat(72));
    expect(() => readContactCards(replaceLine(note, edge + "x"))).toThrow(/exceeds 75 UTF-8 octets/);
    expect(() => readContactCards(replaceLine(note, `NOTE:${"é".repeat(36)}`))).toThrow(/exceeds 75 UTF-8 octets/);
  });

  test("reports the physical line of a malformed property even following a fold", () => {
    const entry = replaceLine("FN:Station", `FN:Sta${sep} tion`);
    const broken = entry.replace("N:Station;;;;", "N:Station;;;additional;");
    expect(() => readContactCards(broken)).toThrow(/line 6: unexpected occupied component/);
    const duplicate = entry.replace("ORG:transit", `ORG:transit${sep}ORG:second`);
    expect(() => readContactCards(duplicate)).toThrow(/line 8: duplicate ORG/);
  });

  test("rejects orphan continuations, empty folds and corrupted text boundaries", () => {
    expect(() => readContactCards(` orphan${sep}` + specimen)).toThrow(/without a preceding line/);
    expect(() => readContactCards(replaceLine("FN:Station", `FN:Station${sep} `))).toThrow(/empty continuation/);
    expect(() => readContactCards(replaceLine("FN:Station", `FN:\ud83d${sep} \ude87`))).toThrow(/surrogate/);
    for (const insert of ["\t", "\u0000", "\u007f", "\u2028", "\u2029", "\u202e", "\u2067"]) {
      expect(() => readContactCards(replaceLine("FN:Station", `FN:Sta${insert}tion`))).toThrow(/control or direction/);
    }
  });

  test("requires scalar fields and rejects conflicting duplicates", () => {
    for (const field of ["VERSION", "PRODID", "FN", "N", "ORG", "NOTE", "UID"]) {
      const property = specimen.split(sep).find((line) => line.startsWith(field + ":"))!;
      expect(() => readContactCards(replaceLine(property, "")), field).toThrow(`missing ${field}`);
      expect(() => readContactCards(replaceLine(property, [property, property].join(sep))), field).toThrow(`duplicate ${field}`);
    }
    expect(() => readContactCards(replaceLine("VERSION:3.0", "VERSION:4.0"))).toThrow(/VERSION:3.0/);
    expect(() => readContactCards(specimen.replace("Ontario accessibility app", "Different exporter"))).toThrow(/PRODID/);
    expect(() => readContactCards(replaceLine("ORG:transit", "ORG"))).toThrow(/property separator/);
    expect(() => readContactCards(replaceLine("ORG:transit", "X-ORG:extra"))).toThrow(/unexpected property/);
  });

  test("distinguishes empty components, unsupported address parameters and unescaped delimiters", () => {
    const address = "ADR;TYPE=WORK:;;Gate 3;;;;";
    const changes = [
      ["N:Station;;;;", "N:Station;;;", /expected 5/],
      ["N:Station;;;;", "N:Station;Additional;;;", /occupied component/],
      ["N:Station;;;;", "N:Other;;;;", /does not match FN/],
      [address, "ADR;TYPE=WORK:;Gate 3;;;;;", /occupied component/],
      [address, "ADR;TYPE=WORK:;;A;B;;;;", /expected 7/],
      [address, "ADR;TYPE=HOME:;;Gate 3;;;;", /unexpected property/],
      ["ORG:transit", "ORG:A,B", /unescaped comma/],
      ["ORG:transit", "ORG:A;B", /expected 1/],
      ["ORG:transit", "ORG:A\\xB", /unexpected text escape/],
      ["ORG:transit", "ORG:transit\\", /incomplete text escape/],
      ["FN:Station", "FN: ", /empty text/],
    ] as const;
    for (const [before, after, reason] of changes) {
      expect(() => readContactCards(replaceLine(before, after)), after).toThrow(reason);
    }
  });

  test("checks axis order, range, decimal precision and the GEO delimiter", () => {
    const cases = ["45.1234;-80.00000", "45.123456;-80.00000", "45.12345,-80.00000", "45.12345;",
      "91.00000;0.00000", "89.00000;-180.00001", "45.12345;NaN", "Infinity;0.00000", "0.00000;0.00000;0.00000"];
    for (const pair of cases) {
      expect(() => readContactCards(replaceLine("GEO:48.00000;-80.00000", `GEO:${pair}`)), pair).toThrow(/GEO/);
    }
  });

  test("checks source links without applying text-field unescaping to URI punctuation", () => {
    const base = "URL:https://example.org/station";
    const accepted = "https://example.org:443/a,b;c?path=x%2Fy#fragment";
    expect(readContactCards(replaceLine(base, "URL:" + accepted))[0]?.url).toBe(accepted);
    for (const url of ["", "station/1", "https://?q=no-host", "https://example.org/a b", "\\server", "mailto:contact@example.org"]) {
      expect(() => readContactCards(replaceLine(base, "URL:" + url))).toThrow(/source link/);
    }
  });

  test("rejects invalid and repeated contact identities anywhere in the download", () => {
    const key = "UID:pack-place-example";
    for (const uid of ["", "pack-place-", "other-id", "pack-place-a b", "pack-place-a~0", "pack-place-A~x020"]) {
      expect(() => readContactCards(replaceLine(key, "UID:" + uid)), uid).toThrow(/place UID/);
    }
    const next = replaceLine(key, "UID:pack-place-next");
    expect(readContactCards(specimen + next).map((card) => card.uid)).toEqual(["pack-place-example", "pack-place-next"]);
    expect(() => readContactCards(specimen + next + specimen)).toThrow(/duplicate UID across cards/);
  });
});
