import { describe, expect, it } from "vitest";
import { normalizeText } from "./filters";
import { lcg, varied } from "./placeFixtures";
import { filterBySearch, matchPackSearch, matchSearchTerm } from "./packSearchMatch";
import { parsePackSearch } from "./packSearchParse";
import { idsOf, searchPlaces } from "./packSearchFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const places = searchPlaces();
const find = (q: string) => idsOf(filterBySearch(places, parsePackSearch(q)));

/** The way the list searched before there were operators: every word somewhere in name, address or kind. */
function oldSearch(list: readonly PackPlaceRecord[], text: string): string[] {
  const words = normalizeText(text).split(" ").filter(Boolean);
  return list.filter((p) => words.length === 0 || words.every((w) => normalizeText([p.name, p.address, p.category].filter(Boolean).join(" ")).includes(w))).map((p) => p.id);
}

describe("plain words are searched as they always were", () => {
  it("gives every place for an empty search", () => {
    expect(find("")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(find("   ")).toEqual(find(""));
  });
  it("needs every word, in the name, address or kind", () => {
    expect(find("main")).toEqual(["a", "b", "g"]);
    expect(find("main street")).toEqual(["a", "b", "g"]);
    expect(find("main cafe")).toEqual(["a"]);
    expect(find("cafe")).toEqual(["a", "f"]);
  });
  it("is blind to case and accents, both ways", () => {
    expect(find("CAFE")).toEqual(["a", "f"]);
    expect(find("etoile")).toEqual(["f"]);
    expect(find("Étoile")).toEqual(["f"]);
  });
  it("finds a word inside a longer word, as before", () => {
    expect(find("fas")).toEqual(["c"]);
    expect(find("pharm")).toEqual(["e"]);
  });
  it("does not look in the note or the tag with a plain word", () => {
    expect(find("ramp")).toEqual([]);
    expect(find("limited")).toEqual([]);
  });
  it("gives the same places as the old search for any words, on generated places and queries", () => {
    const pool = ["cafe", "museum", "library", "main", "street", "unit", "rear", "name", "place", "p01", "a", "é", "xyz", "东京", "'", "&", "<b>", "1", "20"];
    for (let seed = 1; seed <= 120; seed++) {
      const next = lcg(seed);
      const list = varied(seed, 25);
      const q = Array.from({ length: Math.floor(next() * 4) }, () => pool[Math.floor(next() * pool.length)]!).join(" ");
      expect(idsOf(filterBySearch(list, parsePackSearch(q))), q).toEqual(oldSearch(list, q));
    }
  });
});

describe("phrases", () => {
  it("needs the words together, in order, in one field's text", () => {
    expect(find('"main street"')).toEqual(["a", "b", "g"]);
    expect(find('"street main"')).toEqual([]);
    expect(find('"dundas street east"')).toEqual(["c"]);
  });
  it("is found across the name, address and kind text joined as before", () => {
    expect(find('"alpha cafe 1 main street cafe"')).toEqual(["a"]);
  });
});

describe("leaving out", () => {
  it("leaves out places that match", () => {
    expect(find("main -books")).toEqual(["a", "b"]);
    expect(find("-main")).toEqual(["c", "d", "e", "f", "h"]);
  });
  it("leaves out a phrase", () => {
    expect(find('main -"main street books"')).toEqual(["a", "b"]);
  });
  it("gives the whole pack for a search that only leaves out something nothing has", () => {
    expect(find("-zzz")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("OR", () => {
  it("finds places that match either side", () => {
    expect(find("cafe OR bar")).toEqual(["a", "b", "f"]);
    expect(find("cafe OR bar OR hotel")).toEqual(["a", "b", "f", "h"]);
  });
  it("needs the other clauses as well", () => {
    expect(find("cafe OR bar main")).toEqual(["a", "b"]);
  });
  it("lets a leaving-out be one side", () => {
    expect(find("kind:bar OR -main")).toEqual(["b", "c", "d", "e", "f", "h"]);
  });
});

describe("fields", () => {
  it("name looks only at the name, and a place with no name has nothing there", () => {
    expect(find("name:alpha")).toEqual(["a"]);
    expect(find("name:main")).toEqual(["g"]);
    expect(find("name:pharmacy")).toEqual([]);
  });
  it("address looks only at the address, and a place with none has nothing there", () => {
    expect(find("address:dundas")).toEqual(["c"]);
    expect(find("street:main")).toEqual(["a", "b"]);
    expect(find("rue:principale")).toEqual(["f"]);
    expect(find("address:cafe")).toEqual([]);
  });
  it("kind reads underscores as spaces, in the value as well", () => {
    expect(find("kind:fast")).toEqual(["c"]);
    expect(find("kind:fast_food")).toEqual(["c"]);
    expect(find('kind:"fast food"')).toEqual(["c"]);
    expect(find("genre:cafe")).toEqual(["a", "f"]);
  });
  it("kind finds nothing for a place with no kind", () => {
    expect(find("kind:books")).toEqual([]);
  });
  it("note looks only at the note", () => {
    expect(find("note:ramp")).toEqual(["a"]);
    expect(find("note:washroom")).toEqual(["c"]);
    expect(find("note:steps")).toEqual(["c"]);
    expect(find("note:cafe")).toEqual([]);
  });
  it("note can be left out", () => {
    expect(find("-note:steps kind:fast")).toEqual([]);
    expect(find("-note:ramp cafe")).toEqual(["f"]);
  });
});

describe("tags", () => {
  it("finds a tag value, and UNKNOWN is its own value (a place with no source has no usable tag)", () => {
    expect(find("tag:yes")).toEqual(["a", "f"]);
    expect(find("tag:limited")).toEqual(["b", "g"]);
    expect(find("tag:no")).toEqual(["c"]);
    expect(find("tag:designated")).toEqual(["e"]);
    expect(find("tag:unknown")).toEqual(["d", "h"]);
  });
  it("reads French tag words", () => {
    expect(find("indication:oui")).toEqual(["a", "f"]);
    expect(find("indication:non")).toEqual(["c"]);
    expect(find("indication:limite")).toEqual(["b", "g"]);
  });
  it("leaves out a tag value, without dropping a place whose tag is UNKNOWN", () => {
    expect(find("-tag:yes")).toEqual(["b", "c", "d", "e", "g", "h"]);
  });
  it("is more than one tag with OR", () => {
    expect(find("tag:yes OR tag:no")).toEqual(["a", "c", "f"]);
  });
});

describe("has and no", () => {
  it("finds places that have a detail", () => {
    expect(find("has:note")).toEqual(["a", "c"]);
    expect(find("has:address")).toEqual(["a", "b", "c", "e", "f", "g", "h"]);
    expect(find("has:name")).toEqual(["a", "b", "c", "d", "f", "g", "h"]);
    expect(find("has:kind")).toEqual(["a", "b", "c", "d", "e", "f", "h"]);
    expect(find("has:source")).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(find("has:location")).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
  it("counts a tag as there when it is anything but UNKNOWN", () => {
    expect(find("has:tag")).toEqual(["a", "b", "c", "e", "f", "g"]);
    expect(find("no:tag")).toEqual(["d", "h"]);
  });
  it("finds places that lack a detail", () => {
    expect(find("no:address")).toEqual(["d"]);
    expect(find("no:note")).toEqual(["b", "d", "e", "f", "g", "h"]);
    expect(find("sans:nom")).toEqual(["e"]);
  });
  it("lets no and a leaving-out turn round again", () => {
    expect(find("-no:note")).toEqual(find("has:note"));
    expect(find("-has:note")).toEqual(find("no:note"));
  });
});

describe("together", () => {
  it("needs every clause", () => {
    expect(find("tag:yes has:note")).toEqual(["a"]);
    expect(find("kind:cafe -note:ramp")).toEqual(["f"]);
    expect(find('"main street" tag:limited')).toEqual(["b", "g"]);
  });
  it("gives nothing when a combination is not found", () => {
    expect(find("tag:no kind:cafe")).toEqual([]);
  });
  it("ignores a part it could not read and uses the rest", () => {
    expect(find("tag:yess cafe")).toEqual(["a", "f"]);
    expect(find("tag:yess")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
  it("searches an unknown field as the literal text, which is found nowhere", () => {
    expect(find("colour:red")).toEqual([]);
  });
});

describe("matchSearchTerm and matchPackSearch", () => {
  it("answers one place at a time, the same as filterBySearch", () => {
    for (const q of ["cafe", "tag:yes", "-main", "cafe OR bar", "has:note kind:cafe"]) {
      const p = parsePackSearch(q);
      expect(places.filter((x) => matchPackSearch(x, p)).map((x) => x.id), q).toEqual(find(q));
    }
    expect(matchSearchTerm(places[0]!, { type: "tag", value: "yes", negated: false })).toBe(true);
    expect(matchSearchTerm(places[0]!, { type: "tag", value: "yes", negated: true })).toBe(false);
  });
  it("does not change the places or the list it is given", () => {
    const before = JSON.stringify(places);
    find("cafe OR bar -main tag:yes has:note");
    expect(JSON.stringify(places)).toBe(before);
    const copy = filterBySearch(places, parsePackSearch(""));
    expect(copy).toEqual(places);
    expect(copy).not.toBe(places);
  });
  it("never finds a place that is not in the list, and keeps the list's order", () => {
    const order = idsOf([...places].reverse());
    const out = idsOf(filterBySearch([...places].reverse(), parsePackSearch("main")));
    expect(out).toEqual(order.filter((id) => out.includes(id)));
  });
});
