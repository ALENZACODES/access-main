import { describe, expect, it } from "vitest";
import { LIST_CODE_HEADER, MAX_CODE_CHARS, MAX_CODE_LINES, importSummary, listToCode, parseListCode, planImport } from "./listTransfer";
import { MAX_SHORTLIST } from "./shortlist";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const P = (id: string, name: string | null = `Name ${id}`) => ({ id, name });
const pack = (...ids: string[]) => new Set(ids);

describe("listToCode", () => {
  it("starts with the header and has one line per place", () => {
    expect(listToCode([P("a"), P("b")])).toBe("LIST v1\n- a | Name a\n- b | Name b\n");
  });
  it("is just the header for an empty list", () => {
    expect(listToCode([])).toBe("LIST v1\n");
  });
  it("writes UNKNOWN for a place with no name", () => {
    expect(listToCode([P("a", null)])).toBe("LIST v1\n- a | UNKNOWN\n");
    expect(listToCode([P("a", "  ")])).toBe("LIST v1\n- a | UNKNOWN\n");
  });
  it("keeps the name on one line and cannot add a place line", () => {
    const out = listToCode([P("a", "Evil\n- b | Other")]);
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });
  it("replaces a bar in a name so the id stays the first field", () => {
    expect(listToCode([P("a", "A | B")])).toBe("LIST v1\n- a | A / B\n");
  });
  it("removes control and bidirectional characters from names", () => {
    expect(listToCode([P("a", "x\u0000y\u202ez")])).toBe("LIST v1\n- a | x y z\n");
  });
  it("leaves out an id that could not be read back", () => {
    expect(listToCode([P("has space"), P("ok")])).toBe("LIST v1\n- ok | Name ok\n");
  });
  it("ends with one newline and uses LF only", () => {
    const out = listToCode([P("a"), P("b")]);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).not.toContain("\r");
  });
});

describe("parseListCode", () => {
  it("reads the ids in the order written, with the header seen", () => {
    expect(parseListCode("LIST v1\n- b | B\n- a | A\n")).toEqual({ ids: ["b", "a"], ignored: 0, hadHeader: true, cut: false });
  });
  it("reads a code without its header", () => {
    expect(parseListCode("- a | A")).toMatchObject({ ids: ["a"], hadHeader: false });
  });
  it("accepts bullets, numbers and none", () => {
    expect(parseListCode("* a | A\n1. b | B\n2) c | C\n\u2022 d | D\ne | E").ids).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("accepts CRLF and CR line ends", () => {
    expect(parseListCode("- a | A\r\n- b | B\r- c | C").ids).toEqual(["a", "b", "c"]);
  });
  it("keeps an id once however often it is written", () => {
    expect(parseListCode("- a | A\n- a | A again\n- b | B\n- a | x").ids).toEqual(["a", "b"]);
  });
  it("ignores blank lines without counting them", () => {
    expect(parseListCode("\n\n- a | A\n   \n")).toMatchObject({ ids: ["a"], ignored: 0 });
  });
  it("counts lines that are not place lines, and does not read prose as ids", () => {
    const p = parseListCode("Hello there\nplease add these\n- a | A");
    expect(p.ids).toEqual(["a"]);
    expect(p.ignored).toBe(2);
  });
  it("needs the bar, so a bare word is not an id", () => {
    expect(parseListCode("alpha").ids).toEqual([]);
  });
  it("takes only the id before the first bar, so a name cannot add ids", () => {
    expect(parseListCode("- a | b | c").ids).toEqual(["a"]);
  });
  it("is the same for a name with odd characters", () => {
    expect(parseListCode("- a | <script>x</script> 😀").ids).toEqual(["a"]);
  });
  it("gives nothing for empty or whitespace text", () => {
    for (const s of ["", "   ", "\n\n"]) expect(parseListCode(s)).toEqual({ ids: [], ignored: 0, hadHeader: false, cut: false });
  });
  it("counts an id with a control character as ignored", () => {
    expect(parseListCode("- a\u0007b | x")).toMatchObject({ ids: [], ignored: 1 });
  });
  it("reads only the first lines and says it cut", () => {
    const text = Array.from({ length: MAX_CODE_LINES + 50 }, (_, i) => `- id${i} | n`).join("\n");
    const p = parseListCode(text);
    expect(p.ids).toHaveLength(MAX_CODE_LINES);
    expect(p.cut).toBe(true);
  });
  it("reads only the first characters of a huge paste and says it cut", () => {
    const p = parseListCode(`- a | ${"x".repeat(MAX_CODE_CHARS * 2)}`);
    expect(p.cut).toBe(true);
    expect(p.ids).toEqual(["a"]);
  });
  it("does not cut a paste exactly at the limit", () => {
    expect(parseListCode(`- a | ${"x".repeat(MAX_CODE_CHARS - 6)}`).cut).toBe(false);
  });
  it("round-trips a list made by listToCode", () => {
    const places = [P("one", "Un | deux"), P("two", null), P("three", "Café 東京")];
    expect(parseListCode(listToCode(places)).ids).toEqual(["one", "two", "three"]);
  });
});

describe("planImport", () => {
  it("adds ids the pack holds, in order", () => {
    expect(planImport(["a", "b"], [], pack("a", "b"))).toEqual({ toAdd: ["a", "b"], alreadyListed: [], notInPack: [], overCapacity: [] });
  });
  it("leaves out a place already on the list", () => {
    expect(planImport(["a", "b"], ["a"], pack("a", "b"))).toMatchObject({ toAdd: ["b"], alreadyListed: ["a"] });
  });
  it("leaves out an id the pack does not hold, and keeps it as a count", () => {
    expect(planImport(["a", "zz"], [], pack("a"))).toMatchObject({ toAdd: ["a"], notInPack: ["zz"] });
  });
  it("fits only the room left, and the rest are over capacity, in order", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `p${i}`);
    const plan = planImport(ids, ["x", "y"], pack(...ids), 4);
    expect(plan.toAdd).toEqual(["p0", "p1"]);
    expect(plan.overCapacity).toEqual(["p2", "p3", "p4"]);
  });
  it("uses the shortlist limit by default", () => {
    const ids = Array.from({ length: MAX_SHORTLIST + 3 }, (_, i) => `p${i}`);
    const plan = planImport(ids, [], pack(...ids));
    expect(plan.toAdd).toHaveLength(MAX_SHORTLIST);
    expect(plan.overCapacity).toHaveLength(3);
  });
  it("has no room when the list is full", () => {
    const listed = Array.from({ length: MAX_SHORTLIST }, (_, i) => `l${i}`);
    expect(planImport(["a"], listed, pack("a"))).toMatchObject({ toAdd: [], overCapacity: ["a"] });
  });
  it("never counts the same id in two groups", () => {
    const ids = ["a", "b", "c", "d", "e", "zz"];
    const plan = planImport(ids, ["b"], pack("a", "b", "c", "d", "e"), 3);
    const all = [...plan.toAdd, ...plan.alreadyListed, ...plan.notInPack, ...plan.overCapacity];
    expect(all.sort()).toEqual([...ids].sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it("does not change what it is given", () => {
    const ids = ["a", "b"];
    const listed = ["c"];
    planImport(ids, listed, pack("a", "b"));
    expect([ids, listed]).toEqual([["a", "b"], ["c"]]);
  });
  it("is empty for no ids", () => {
    expect(planImport([], [], pack("a"))).toEqual({ toAdd: [], alreadyListed: [], notInPack: [], overCapacity: [] });
  });
});

describe("importSummary", () => {
  const code = (ids: string[], extra = {}) => ({ ids, ignored: 0, hadHeader: true, cut: false, ...extra });
  it("says when no places were found and how a code starts", () => {
    expect(importSummary(planImport([], [], pack()), code([]), "en")).toBe("No places found in this text. A list code starts with LIST v1 and has one line for each place.");
  });
  it("counts what would be added, singular and plural", () => {
    expect(importSummary(planImport(["a"], [], pack("a")), code(["a"]), "en")).toBe("1 place would be added.");
    expect(importSummary(planImport(["a", "b"], [], pack("a", "b")), code(["a", "b"]), "en")).toBe("2 places would be added.");
  });
  it("adds a sentence for each group that is not empty, in a fixed order", () => {
    const ids = ["a", "b", "zz", "q"];
    const plan = planImport(ids, ["b"], pack("a", "b", "q"), 2);
    expect(importSummary(plan, code(ids, { ignored: 2 }), "en")).toBe("1 place would be added. 1 is already on your list. 1 is not in the pack on this device. 1 does not fit: a list holds at most 12 places. 2 lines were not understood and left out.");
  });
  it("says when the paste was cut", () => {
    expect(importSummary(planImport(["a"], [], pack("a")), code(["a"], { cut: true }), "en")).toContain("The text was long, so only the start was read.");
  });
  it("is French with spaced colons, agreeing for one and several", () => {
    const ids = ["a", "b", "zz", "q"];
    const plan = planImport(ids, ["b"], pack("a", "b", "q"), 2);
    const s = importSummary(plan, code(ids, { ignored: 1 }), "fr");
    expect(s).toContain("1 lieu serait ajouté.");
    expect(s).toContain("1 est déjà dans votre liste.");
    expect(s).toContain("1 ne tient pas\u00a0: une liste compte au plus 12 lieux.");
    expect(s).toContain("1 ligne n’a pas été comprise et a été laissée de côté.");
    expect(importSummary(planImport(["a", "b"], [], pack("a", "b")), code(["a", "b"]), "fr")).toBe("2 lieux seraient ajoutés.");
  });
  it("passes the copy checks in both languages for every group", () => {
    const ids = ["a", "b", "zz", "q", "r"];
    const plan = planImport(ids, ["b"], pack("a", "b", "q", "r"), 2);
    for (const locale of ["en", "fr"] as const) {
      const s = importSummary(plan, code(ids, { ignored: 3, cut: true }), locale);
      expect(lintCopy(s, locale), s).toEqual([]);
      if (locale === "fr") expect(lintFrench(s), s).toEqual([]);
    }
  });
  it("never says a place is good to add, and uses the header it names", () => {
    const s = importSummary(planImport(["a"], [], pack("a")), code(["a"]), "en");
    expect(s).not.toMatch(/\b(best|recommended|safe|good)\b/i);
    expect(LIST_CODE_HEADER).toBe("LIST v1");
  });
});

describe("identifiers containing list-code separators", () => {
  it("keeps the common format byte-for-byte for ids that need no quoting", () => {
    const list = [
      { id: "north-1", name: "North" },
      { id: "osm:node/12", name: null },
    ];
    expect(listToCode(list)).toBe("LIST v1\n- north-1 | North\n- osm:node/12 | UNKNOWN\n");
  });

  it("imports a separator-bearing id without substituting any of its neighbours", () => {
    const places = [P("floor|west", "Office"), P("floor", "Hall"), P("|", "Door")];
    const code = listToCode(places);
    const read = parseListCode(code);
    expect(read.ids).toEqual(["floor|west", "floor", "|"]);
    expect(read.ignored).toBe(0);
    expect(planImport(read.ids, ["floor"], pack("floor", "|", "floor|west"))).toEqual({
      toAdd: ["floor|west", "|"],
      alreadyListed: ["floor"],
      notInPack: [],
      overCapacity: [],
    });
  });

  it("retains exact identifiers at both sides of a JSON escape", () => {
    const ids = [
      'room|"quoted"',
      "room|\\backslash",
      "plain%7Cpercent",
      "accent|é",
      "accent|e\u0301",
      "||double||",
    ];
    expect(parseListCode(listToCode(ids.map((id) => P(id)))).ids).toEqual(ids);
  });

  it("counts malformed tagged rows without interpreting their labels", () => {
    const badRows = [
      'PLACE ["ends|here"',
      'PLACE [["not|text"],"Name"]',
      'PLACE ["has space","Name"]',
      'PLACE ["too|many","Name","extra"]',
      'PLACE ["missing|name"]',
      'PLACE ["valid|id",null]',
      'PLACE ["valid|id",{"id":"other"}]',
      'PLACE ["line\\nbreak","Name"]',
    ];
    const text = ["LIST v1", ...badRows, "- ok | Last row"].join("\n");
    expect(parseListCode(text)).toEqual({
      ids: ["ok"],
      ignored: badRows.length,
      hadHeader: true,
      cut: false,
    });
  });

  it("accepts old exports that printed the full identifier unquoted", () => {
    const legacy = [
      "LIST v1",
      "- before | First",
      "- osm/1|entrance | West",
      "- |end| | East",
    ].join("\r\n");
    const current = listToCode([P("osm/1|entrance"), P("after")]);
    expect(parseListCode(legacy + "\n" + current).ids).toEqual([
      "before",
      "osm/1|entrance",
      "|end|",
      "after",
    ]);
  });

  it("leaves the familiar compact and numbered input forms available", () => {
    const text = "a|A\n2. b | B\n* c | C\n- d | Also | part of the name";
    expect(parseListCode(text).ids).toEqual(["a", "b", "c", "d"]);
    expect(parseListCode("PLACE | a place whose literal id is PLACE").ids).toEqual(["PLACE"]);
  });

  it("does not import a different id from an incomplete tagged row at the input ceiling", () => {
    const partial = 'PLACE ["main|west","' + "label".repeat(MAX_CODE_CHARS) + '"]';
    const parsed = parseListCode("- accepted | OK\n" + partial);
    expect(parsed.cut).toBe(true);
    expect(parsed.ignored).toBe(1);
    expect(parsed.ids).toEqual(["accepted"]);
  });

  it("keeps a multiline display label on one row in either encoding", () => {
    const code = listToCode([
      P("left|right", "Room\n- extra | name"),
      P("second", "Line\r\nPLACE [\"extra|id\",\"room\"]"),
    ]);
    expect(code.trimEnd().split("\n")).toHaveLength(3);
    expect(parseListCode(code).ids).toEqual(["left|right", "second"]);
  });

  it("counts an overlength id once and continues to the next entry", () => {
    const invalid = "|".repeat(201);
    const valid = "|".repeat(200);
    const text = "PLACE " + JSON.stringify([invalid, "Too long"]) + "\n" + listToCode([P(valid)]);
    expect(parseListCode(text)).toMatchObject({ ids: [valid], ignored: 1 });
  });
});
