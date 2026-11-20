import { describe, expect, it, vi } from "vitest";
import { lintCopy } from "./copyLint";
import { MAX_SHORTLIST, addToShortlist, type ShortlistEntry } from "./shortlist";
import { addMany, addManySentence, type AddManyResult } from "./streetIndex";
import { lintFrench } from "./typography";

const none: AddManyResult = { added: 0, already: 0, full: 0, invalid: 0 };

/** A list that behaves like the real one: it grows, refuses duplicates and stops at the limit. */
function realAdd(start: readonly string[] = []) {
  let list: readonly ShortlistEntry[] = start.map((id) => ({ id, addedOn: "2026-11-15" }));
  return { add: (id: string) => { const o = addToShortlist(list, id, "2026-11-15"); list = o.list; return o.result; }, ids: () => list.map((e) => e.id) };
}

describe("addMany", () => {
  it("asks add once for each id, in order, and counts each answer", () => {
    const add = vi.fn<(id: string) => "added" | "already" | "full" | "invalid">((id) => (id === "b" ? "already" : "added"));
    expect(addMany(["a", "b", "c"], add)).toEqual({ added: 2, already: 1, full: 0, invalid: 0 });
    expect(add.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
  });
  it("does not stop at the first refusal", () => {
    const answers = ["full", "added", "invalid", "already"] as const;
    let i = 0;
    expect(addMany(["a", "b", "c", "d"], () => answers[i++]!)).toEqual({ added: 1, already: 1, full: 1, invalid: 1 });
  });
  it("gives zero counts for no ids and never calls add", () => {
    const add = vi.fn<(id: string) => "added">(() => "added");
    expect(addMany([], add)).toEqual(none);
    expect(add).not.toHaveBeenCalled();
  });
  it("adds to a real list and leaves what is already there", () => {
    const l = realAdd(["x"]);
    expect(addMany(["x", "y", "z"], l.add)).toEqual({ added: 2, already: 1, full: 0, invalid: 0 });
    expect(l.ids()).toEqual(["x", "y", "z"]);
  });
  it("counts the places a full list cannot take, and does not exceed the limit", () => {
    const start = Array.from({ length: MAX_SHORTLIST - 1 }, (_, i) => `s${i}`);
    const l = realAdd(start);
    expect(addMany(["n1", "n2", "n3"], l.add)).toEqual({ added: 1, already: 0, full: 2, invalid: 0 });
    expect(l.ids()).toHaveLength(MAX_SHORTLIST);
  });
  it("counts an empty id as one that could not be added", () => {
    expect(addMany([""], realAdd().add).invalid).toBe(1);
  });
  it("adding the same street twice adds nothing the second time", () => {
    const l = realAdd();
    addMany(["a", "b"], l.add);
    expect(addMany(["a", "b"], l.add)).toEqual({ added: 0, already: 2, full: 0, invalid: 0 });
  });
});

describe("addManySentence", () => {
  const s = (r: Partial<AddManyResult>, locale: "en" | "fr" = "en") => addManySentence({ ...none, ...r }, "Yonge Street", locale);
  it("says what was added", () => {
    expect(s({ added: 3 })).toBe("Yonge Street: 3 places added.");
    expect(s({ added: 1 })).toBe("Yonge Street: 1 place added.");
  });
  it("says what was already there", () => {
    expect(s({ already: 2 })).toBe("Yonge Street: 2 already on the list.");
  });
  it("says what a full list kept out", () => {
    expect(s({ added: 1, full: 2 })).toBe("Yonge Street: 1 place added, 2 not added because the list is full.");
  });
  it("says what could not be added", () => {
    expect(s({ invalid: 1 })).toBe("Yonge Street: 1 could not be added.");
  });
  it("says every part that is not zero, and only those", () => {
    expect(s({ added: 1, already: 1, full: 1, invalid: 1 })).toBe("Yonge Street: 1 place added, 1 already on the list, 1 not added because the list is full, 1 could not be added.");
  });
  it("says there was nothing to add when there is nothing", () => {
    expect(s({})).toBe("No places to add from Yonge Street.");
  });
  it("is French with agreement and a spaced colon", () => {
    expect(s({ added: 3 }, "fr")).toBe("Yonge Street\u00a0: 3 lieux ajoutés.");
    expect(s({ added: 1 }, "fr")).toBe("Yonge Street\u00a0: 1 lieu ajouté.");
    expect(s({ already: 2, full: 1 }, "fr")).toBe("Yonge Street\u00a0: 2 déjà dans la liste, 1 non ajouté parce que la liste est pleine.");
    expect(s({ invalid: 2 }, "fr")).toBe("Yonge Street\u00a0: 2 n’ont pas pu être ajoutés.");
    expect(s({ invalid: 1 }, "fr")).toBe("Yonge Street\u00a0: 1 n’a pas pu être ajouté.");
    expect(s({}, "fr")).toBe("Aucun lieu à ajouter depuis Yonge Street.");
  });
  it("passes the copy checks and French typography for every combination", () => {
    for (let mask = 0; mask < 16; mask++) {
      const r = { added: mask & 1 ? 2 : 0, already: mask & 2 ? 1 : 0, full: mask & 4 ? 3 : 0, invalid: mask & 8 ? 1 : 0 };
      for (const locale of ["en", "fr"] as const) {
        const text = addManySentence(r, "Rue Peel", locale);
        expect(lintCopy(text, locale), text).toEqual([]);
        if (locale === "fr") expect(lintFrench(text), text).toEqual([]);
        expect(text).not.toMatch(/INCONN/i);
      }
    }
  });
  it("never says which places to choose", () => {
    expect(s({ added: 2, full: 1 })).not.toMatch(/best|should|recommend/i);
  });
});
