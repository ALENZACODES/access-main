import { describe, expect, it } from "vitest";
import { MAX_TEXT, checkText, frProblems, isCopyKey, isUrlKey } from "./pkText";
import type { PkLang } from "./pkWalk";

const NB = String.fromCodePoint(0xa0);
const NN = String.fromCodePoint(0x202f);
const ZW = String.fromCodePoint(0x200b);
const BIDI = String.fromCodePoint(0x202e);
const SHY = String.fromCodePoint(0xad);
const check = (text: string, key = "name", lang: PkLang | null = null): string[] => checkText({ path: "p", key, text, lang }).map((p) => p.code);

describe("keys", () => {
  it.each(["id", "pack_id", "schema_version", "category", "wheelchair", "licence", "source_url", "url", "tier", "label", "stop_ids", "contact", "sha256", "built_at", "retrieved_at", "checked_at"])("%s is not copy", (k) => expect(isCopyKey(k)).toBe(false));
  it.each(["name", "how", "station", "operator_text", "wheelchair_description", "address", "title", "source_name"])("%s is copy", (k) => expect(isCopyKey(k)).toBe(true));
  it.each(["url", "source_url", "licence_url", "content_path"])("%s holds an address", (k) => expect(isUrlKey(k)).toBe(true));
  it.each(["name", "urls", "curl", "url_note"])("%s does not hold an address", (k) => expect(isUrlKey(k)).toBe(false));
});

describe("checkText: what any text must not hold", () => {
  it("accepts ordinary text", () => expect(check("Sankofa Square, 1 Dundas Street East")).toEqual([]));
  it("finds an empty text", () => expect(check("")).toEqual(["pk-text-empty"]));
  it("finds a space at an end or two in a row", () => {
    expect(check(" a")).toEqual(["pk-text-edge-space"]);
    expect(check("a ")).toEqual(["pk-text-edge-space"]);
    expect(check("a  b")).toEqual(["pk-text-edge-space"]);
    expect(check("a b")).toEqual([]);
  });
  it("finds a control character, a tab or a line break included", () => {
    for (const c of ["\u0001", "\t", "\n", "\r", String.fromCodePoint(0x7f), String.fromCodePoint(0x85)]) expect(check(`a${c}b`), JSON.stringify(c)).toEqual(["pk-text-control"]);
  });
  it("finds a character that cannot be seen", () => {
    for (const c of [ZW, BIDI, SHY, String.fromCodePoint(0xfeff), String.fromCodePoint(0x2066)]) expect(check(`a${c}b`)).toEqual(["pk-text-invisible"]);
  });
  it("does not take a no-break space for invisible", () => expect(check(`a${NB}b`)).toEqual([]));
  it("finds an email address", () => {
    expect(check("write to jo.doe+x@example.org today")).toEqual(["pk-text-email"]);
    expect(check("a@b")).toEqual([]);
  });
  it.each([["call 416-555-0199 now"], ["call (416) 555-0199"], ["1-800-268-9017"], ["+1 416 555 0199"], ["416.555.0199"]])("finds the telephone number in %j outside the contact field", (t) => expect(check(t)).toContain("pk-text-phone"));
  it("allows a telephone number in the contact field", () => expect(check("1-866-531-2600", "contact")).toEqual([]));
  it.each([["911"], ["9-8-8"], ["Open 10:30 to 18:00"], ["12 345 6789"], ["Route 504"]])("does not take %j for a telephone number", (t) => expect(check(t)).not.toContain("pk-text-phone"));
  it("finds nine digits in three groups, the shape of an identification number", () => {
    expect(check("123 456 789")).toEqual(["pk-text-id-number"]);
    expect(check("123-456-789")).toEqual(["pk-text-id-number"]);
    expect(check("1234 567 890")).toEqual([]);
  });
  it("finds a text that is too long", () => {
    expect(check("x".repeat(MAX_TEXT))).toEqual([]);
    expect(check("x".repeat(MAX_TEXT + 1))).toEqual(["pk-text-long"]);
  });
  it("finds every problem of one text", () => expect(check(` a@b.co ${ZW}`).sort()).toEqual(["pk-text-edge-space", "pk-text-email", "pk-text-invisible"]));
});

describe("checkText: wording", () => {
  it.each([["Verified by staff"], ["this is verified"], ["Vérifié par le personnel"], ["vérification faite"], ["verification tier 2"], ["données vérifiées"]])("finds wording about verification in %j", (t) => expect(check(t, "how")).toContain("pk-text-wording"));
  it.each([["Checked on 2026-11-13"], ["Not checked"], ["Unverifiable claims are not shown"], ["Verify with the venue"]])("does not find it in %j", (t) => expect(check(t, "how")).not.toContain("pk-text-wording"));
  it("does not judge the wording of a key that is not copy", () => expect(check("verified", "licence")).toEqual([]));
  it("does not judge the wording of an address", () => expect(check("verified", "source_url")).toEqual([]));
});

describe("frProblems", () => {
  const f = (t: string): string[] => frProblems(t).map((p) => p.code);
  it("accepts French written with the right marks", () => expect(f(`Appelez le 911${NB}: c’est gratuit${NN}!`)).toEqual([]));
  it("finds a straight apostrophe between letters", () => {
    expect(f("Services d'urgence")).toEqual(["pk-fr-apostrophe"]);
    expect(f("l'ascenseur")).toEqual(["pk-fr-apostrophe"]);
    expect(f("Services d’urgence")).toEqual([]);
    expect(f("'quoted'")).toEqual([]);
  });
  it("finds a colon with no no-break space before it", () => {
    expect(f("Note: ok")).toEqual(["pk-fr-colon-space"]);
    expect(f("Note : ok")).toEqual(["pk-fr-colon-space"]);
    expect(f(`Note${NB}: ok`)).toEqual([]);
  });
  it("does not judge a time or an address", () => {
    expect(f("Ouvert à 10:30")).toEqual([]);
    expect(f("voir https://example.org/a")).toEqual([]);
  });
  it("finds ; ! and ? with no narrow no-break space before them", () => {
    for (const m of [";", "!", "?"]) {
      expect(f(`Quoi${m}`), m).toEqual(["pk-fr-mark-space"]);
      expect(f(`Quoi ${m}`), m).toEqual(["pk-fr-mark-space"]);
      expect(f(`Quoi${NN}${m}`), m).toEqual([]);
    }
  });
  it("finds a missing no-break space inside « and »", () => {
    expect(f("«bonjour»")).toEqual(["pk-fr-guillemet-space"]);
    expect(f(`«${NB}bonjour${NB}»`)).toEqual([]);
    expect(f(`«${NN}bonjour${NN}»`)).toEqual([]);
  });
  it("finds straight double quotes", () => expect(f('dit "oui"')).toEqual(["pk-fr-straight-quotes"]));
});

describe("checkText: French rules apply to French copy only", () => {
  it("judges French text under a fr key", () => expect(check("Services d'urgence", "name", "fr")).toEqual(["pk-fr-apostrophe"]));
  it("does not judge the same text in English or in no language", () => {
    expect(check("Services d'urgence", "name", "en")).toEqual([]);
    expect(check("Services d'urgence", "name", null)).toEqual([]);
  });
  it("does not judge French in a key that is not copy", () => expect(check("l'ascenseur", "label", "fr")).toEqual([]));
  it("does not judge French in an address key", () => expect(check("l'ascenseur", "url", "fr")).toEqual([]));
});
