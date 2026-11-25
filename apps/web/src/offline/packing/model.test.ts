import { describe, expect, it } from "vitest";
import {
  addBag, addItem, createPackingList, filterItems, moveItem, nextId, PACKING_LIMITS,
  PackingError, parsePackingList, removeBag, removeItem, renameBag, renameList,
  reorderBag, reorderItem, stageStatus, summarizeBag, summarizeList, updateItem,
  type Bag, type PackingItem, type PackingList, type StageStatus,
} from "./model";

function item(id: string, patch: Partial<PackingItem> = {}): PackingItem {
  return {
    id, name: "Notepad", quantity: 4, packed: null, returned: null, note: "",
    ...patch,
  };
}

function bag(id: string, ...items: PackingItem[]): Bag {
  return { id, name: "Side pocket", items };
}

function list(...bags: Bag[]): PackingList {
  return { schema: "offline-packing-list-v1", title: "Weekend visit", bags };
}

function ids(listToRead: PackingList): string[][] {
  return listToRead.bags.map((entry) => entry.items.map((row) => row.id));
}

function rejects(operation: () => unknown, code: PackingError["code"]) {
  expect(operation).toThrowError(expect.objectContaining({ name: "PackingError", code }));
}

function filledItems(start: number, length: number): PackingItem[] {
  return Array.from({ length }, (_, index) => item("entry-" + (start + index)));
}

describe("packing list import", () => {
  it("accepts an empty list in the current format", () => {
    expect(parsePackingList(list())).toEqual(createPackingList("Weekend visit"));
  });

  it("keeps a fresh copy of every imported object and array", () => {
    const input = list(bag("carry", item("ticket")), bag("spare"));
    const output = parsePackingList(input);
    expect(output).toEqual(input);
    expect(output.bags).not.toBe(input.bags);
    expect(output.bags[0]).not.toBe(input.bags[0]);
    expect(output.bags[0]?.items[0]).not.toBe(input.bags[0]?.items[0]);
    input.bags[0]!.items[0]!.note = "changed on original";
    input.bags[1]!.items.push(item("pencil"));
    input.bags.reverse();
    expect(output.bags[0]?.items[0]?.note).toBe("");
    expect(ids(output)).toEqual([["ticket"], []]);
  });

  it("accepts same names and keeps accented names, leading spaces and multiline notes as entered", () => {
    const original = list(
      { ...bag("A", item("1", { name: "  Carnet d’Éloïse  ", note: "1. Rouge\r\n2. Vert\tbleu" })), name: "Sac" },
      { ...bag("B", item("2", { name: "  Carnet d’Éloïse  " })), name: "Sac" },
    );
    expect(parsePackingList(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it.each([null, false, 0, "", [], { title: "Only a title" }])("rejects incomplete documents", (value) => {
    rejects(() => parsePackingList(value), "shape");
  });

  it("rejects an unsupported discriminator even when all other keys match", () => {
    rejects(() => parsePackingList({ ...list(), schema: "offline-packing-list-v2" }), "schema");
  });

  it("rejects array-shaped bags and items and hides no unknown keys", () => {
    rejects(() => parsePackingList({ ...list(), bags: {} }), "shape");
    rejects(() => parsePackingList({ ...list(), bags: [[]] }), "shape");
    rejects(() => parsePackingList({ ...list(), bags: [{ ...bag("a"), items: null }] }), "shape");
    rejects(() => parsePackingList({ ...list(), bags: [{ ...bag("a"), items: [[]] }] }), "shape");
    rejects(() => parsePackingList({ ...list(), locale: "en" }), "shape");
    rejects(() => parsePackingList({ ...list(), bags: [{ ...bag("a"), copied: true }] }), "shape");
    rejects(() => parsePackingList({ ...list(), bags: [{ ...bag("a"), items: [{ ...item("x"), path: "/" }] }] }), "shape");
  });

  it("requires all item fields, including explicit nulls for counts and a note string", () => {
    for (const field of ["returned", "packed", "note", "id", "name", "quantity"]) {
      const incomplete: Record<string, unknown> = { ...item("x") };
      delete incomplete[field];
      rejects(() => parsePackingList({ ...list(), bags: [{ ...bag("a"), items: [incomplete] }] }), "shape");
    }
  });

  it("does not accept missing own fields from a prototype", () => {
    const input: unknown = Object.assign(Object.create({ title: "Inherited" }), { schema: list().schema, bags: [] });
    rejects(() => parsePackingList(input), "shape");
  });

  it("rejects sparse arrays instead of accepting invisible entries", () => {
    rejects(() => parsePackingList({ ...list(), bags: new Array<Bag>(1) }), "shape");
    rejects(() => parsePackingList(list({ ...bag("a"), items: new Array<PackingItem>(1) })), "shape");
  });

  it.each(["", " ", "\t\n", "First\nSecond", "First\rSecond", "a\u2028b", "a\u2029b", "\u007f", "a\u0090b"])(
    "rejects a blank, multiline or control-bearing title and name",
    (value) => {
      rejects(() => parsePackingList({ ...list(), title: value }), "title");
      rejects(() => parsePackingList(list({ ...bag("a"), name: value })), "name");
      rejects(() => parsePackingList(list(bag("a", item("x", { name: value })))), "name");
    },
  );

  it("supports multiline notes and rejects embedded device control characters", () => {
    const note = "One\r\nTwo\tThree\u2028Four";
    expect(parsePackingList(list(bag("a", item("x", { note })))).bags[0]?.items[0]?.note).toBe(note);
    for (const invalid of ["a\u0000b", "a\u001bb", "a\u007fb", "a\u0085b"]) {
      rejects(() => parsePackingList(list(bag("a", item("x", { note: invalid })))), "note");
    }
  });

  it("enforces the text limits for title, bag name, item name and note", () => {
    const title = "t".repeat(PACKING_LIMITS.title);
    const name = "é".repeat(PACKING_LIMITS.name);
    const note = "👜".repeat(PACKING_LIMITS.note / 2);
    const input = addItem(addBag(createPackingList(title), "bag", name), "bag", item("i", { name, note }));
    expect(parsePackingList(input)).toEqual(input);
    rejects(() => renameList(input, title + "t"), "title");
    rejects(() => renameBag(input, "bag", name + "é"), "name");
    rejects(() => updateItem(input, "i", { name: name + "é" }), "name");
    rejects(() => updateItem(input, "i", { note: note + "." }), "note");
  });

  it.each(["", "-first", "_first", "with spaces", "a/b", "a\n", "é", "i".repeat(PACKING_LIMITS.id + 1)])(
    "requires a bounded portable identifier for bags and items",
    (id) => {
      rejects(() => parsePackingList(list(bag(id))), "id");
      rejects(() => parsePackingList(list(bag("a", item(id)))), "id");
    },
  );

  it("accepts the exact ID bound and ordinary text that resembles object properties", () => {
    const input = list(bag("constructor", item("0" + "-".repeat(PACKING_LIMITS.id - 1)), item("toString")));
    expect(parsePackingList(input)).toEqual(input);
  });

  it.each([
    list(bag("a"), bag("a")),
    list(bag("a", item("i"), item("i"))),
    list(bag("a", item("i")), bag("b", item("i"))),
    list(bag("a", item("a"))),
    list(bag("a", item("b")), bag("b")),
    list(bag("a"), bag("b", item("a"))),
  ])("rejects colliding identifiers independent of traversal order", (input) => {
    rejects(() => parsePackingList(input), "duplicate-id");
  });

  it("bounds the number of bags independently from the item count", () => {
    const input = list(...Array.from({ length: PACKING_LIMITS.bags }, (_, index) => bag("bag-" + index)));
    expect(parsePackingList(input).bags).toHaveLength(PACKING_LIMITS.bags);
    rejects(() => addBag(input, "extra", "Another bag"), "bag-limit");
    rejects(() => parsePackingList(list(...input.bags, bag("extra"))), "bag-limit");
  });

  it("applies the total item limit across bags, while allowing moves at capacity", () => {
    const half = PACKING_LIMITS.items / 2;
    const input = list(bag("a", ...filledItems(0, half)), bag("b", ...filledItems(half, half)));
    expect(parsePackingList(input)).toEqual(input);
    rejects(() => addItem(input, "b", item("extra")), "item-limit");
    rejects(() => parsePackingList(list(...input.bags, bag("c", item("extra")))), "item-limit");
    const moved = moveItem(input, "entry-0", "b");
    expect(moved.bags[1]?.items).toHaveLength(half + 1);
    expect(parsePackingList(moved)).toEqual(moved);
  });

  it("checks the exact limits for all three quantity fields", () => {
    const quantity = PACKING_LIMITS.quantity;
    const entry = item("x", { quantity, packed: quantity, returned: quantity });
    expect(parsePackingList(list(bag("a", entry))).bags[0]?.items[0]).toEqual(entry);
    rejects(() => addItem(list(bag("a")), "a", { ...entry, quantity: quantity + 1 }), "quantity");
    rejects(() => addItem(list(bag("a")), "a", { ...entry, packed: quantity + 1 }), "packed");
    rejects(() => addItem(list(bag("a")), "a", { ...entry, returned: quantity + 1 }), "returned");
  });

  it.each([0, -1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, "2", true, null])(
    "requires a strictly positive whole-number planned quantity",
    (quantity) => {
      const input = { ...list(), bags: [{ ...bag("a"), items: [{ ...item("x"), quantity }] }] };
      rejects(() => parsePackingList(input), "quantity");
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0", false])(
    "rejects invalid observed counts without rounding or coercion",
    (bad) => {
      const row = item("i", { quantity: 2, packed: 2, returned: null });
      for (const field of ["packed", "returned"] as const) {
        const input = { ...list(), bags: [{ ...bag("a"), items: [{ ...row, [field]: bad }] }] };
        rejects(() => parsePackingList(input), field);
      }
    },
  );

  it("rejects impossible return counts without capping them or inferring outbound counts", () => {
    rejects(() => parsePackingList(list(bag("a", item("x", { packed: 5 })))), "packed");
    rejects(() => parsePackingList(list(bag("a", item("x", { packed: 1, returned: 2 })))), "returned");
    rejects(() => parsePackingList(list(bag("a", item("x", { packed: null, returned: 0 })))), "returned");
    rejects(() => parsePackingList(list(bag("a", item("x", { packed: null, returned: 2 })))), "returned");
  });

  it("normalizes signed zero to the same count produced by JSON round-tripping", () => {
    const output = parsePackingList(list(bag("a", item("x", { packed: -0, returned: -0 }))));
    expect(output.bags[0]?.items[0]).toMatchObject({ packed: 0, returned: 0 });
  });
});

describe("editing an outing and its bags", () => {
  it("starts empty, renames the outing and keeps the old list usable", () => {
    const original = createPackingList("On the way out");
    const renamed = renameList(original, "Back from the visit");
    expect(original).toEqual({ schema: "offline-packing-list-v1", title: "On the way out", bags: [] });
    expect(renamed.title).toBe("Back from the visit");
    rejects(() => renameList(renamed, ""), "title");
    expect(parsePackingList(renamed)).toEqual(renamed);
  });

  it("can create and rename two bags with the same label independently", () => {
    const original = list();
    const first = addBag(original, "one", "Carry bag");
    const both = addBag(first, "two", "Carry bag");
    const renamed = renameBag(both, "two", "Outer pocket");
    expect(original.bags).toHaveLength(0);
    expect(first.bags).toHaveLength(1);
    expect(both.bags.map((entry) => entry.name)).toEqual(["Carry bag", "Carry bag"]);
    expect(renamed.bags.map((entry) => entry.name)).toEqual(["Carry bag", "Outer pocket"]);
    expect(renamed.bags.map((entry) => entry.id)).toEqual(["one", "two"]);
  });

  it("allows reordering a full bag in either direction without detaching its contents", () => {
    const original = list(bag("a", item("first")), bag("b"), bag("c", item("last")));
    const swapped = reorderBag(original, "b", -1);
    expect(swapped.bags.map((entry) => entry.id)).toEqual(["b", "a", "c"]);
    expect(ids(swapped)).toEqual([[], ["first"], ["last"]]);
    expect(reorderBag(swapped, "b", 1)).toEqual(original);
    expect(ids(original)).toEqual([["first"], [], ["last"]]);
  });

  it("keeps the same list at reorder boundaries, including a single bag", () => {
    const one = list(bag("a"));
    expect(reorderBag(one, "a", -1)).toBe(one);
    expect(reorderBag(one, "a", 1)).toBe(one);
    const two = addBag(one, "b", "Spare");
    expect(reorderBag(two, "b", 1)).toBe(two);
    expect(reorderBag(two, "a", -1)).toBe(two);
  });

  it("removing a bag also removes its items from summaries", () => {
    const original = list(bag("a", item("ticket", { packed: 2, returned: 2 })), bag("b", item("map")));
    const updated = removeBag(original, "a");
    expect(ids(updated)).toEqual([["map"]]);
    expect(summarizeList(updated, "return")).toMatchObject({ items: 1, complete: 0, unknown: 1 });
    expect(summarizeList(original, "return")).toMatchObject({ items: 2, complete: 1, unknown: 1 });
    expect(removeBag(updated, "b").bags).toEqual([]);
  });

  it("reports stale bag references without modifying the current list", () => {
    const input = list(bag("a", item("x")));
    const snapshot = JSON.stringify(input);
    rejects(() => renameBag(input, "removed", "Spare"), "bag-not-found");
    rejects(() => removeBag(input, "removed"), "bag-not-found");
    rejects(() => reorderBag(input, "removed", 1), "bag-not-found");
    rejects(() => addItem(input, "removed", item("new")), "bag-not-found");
    rejects(() => moveItem(input, "x", "removed"), "bag-not-found");
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("generates unused IDs across entity kinds after restoring a hand-written backup", () => {
    const original = list(bag("item-1", item("bag-1"), item("bag-3")), bag("bag-2"));
    expect(nextId(original, "item")).toBe("item-2");
    expect(nextId(original, "bag")).toBe("bag-4");
    const withItem = addItem(original, "bag-2", item(nextId(original, "item")));
    expect(nextId(withItem, "item")).toBe("item-3");
    expect(nextId(original, "item")).toBe("item-2");
  });

  it("prevents reusing a bag or item ID through an ordinary edit", () => {
    const input = list(bag("a", item("i")), bag("b"));
    rejects(() => addBag(input, "a", "Other"), "duplicate-id");
    rejects(() => addBag(input, "i", "Other"), "duplicate-id");
    rejects(() => addItem(input, "b", item("i")), "duplicate-id");
    rejects(() => addItem(input, "b", item("a")), "duplicate-id");
    expect(ids(input)).toEqual([["i"], []]);
  });
});

describe("packing-item edits and transitions", () => {
  it("adding and updating an item keeps the original list and supplied draft intact", () => {
    const draft = item("i");
    const empty = list(bag("a"));
    const populated = addItem(empty, "a", draft);
    draft.note = "A later draft";
    const updated = updateItem(populated, "i", { name: "Return ticket", note: "Use side pocket" });
    expect(ids(empty)).toEqual([[]]);
    expect(populated.bags[0]?.items[0]).toEqual(item("i"));
    expect(updated.bags[0]?.items[0]).toEqual(item("i", { name: "Return ticket", note: "Use side pocket" }));
  });

  it("records packed and returned counts independently, including an explicit zero", () => {
    const start = list(bag("a", item("i")));
    const outbound = updateItem(start, "i", { packed: 3 });
    const checkedReturn = updateItem(outbound, "i", { returned: 0 });
    const partlyReturned = updateItem(checkedReturn, "i", { returned: 2 });
    const finishedReturn = updateItem(partlyReturned, "i", { returned: 3 });
    expect(summarizeList(start, "packing").unknown).toBe(1);
    expect(summarizeList(outbound, "return").unknown).toBe(1);
    expect(summarizeList(checkedReturn, "return").pending).toBe(1);
    expect(summarizeList(partlyReturned, "return").remainingCount).toBe(1);
    expect(summarizeList(finishedReturn, "return").complete).toBe(1);
    expect(summarizeList(finishedReturn, "packing").partial).toBe(1);
  });

  it("requires an explicit correction of incompatible counts and applies a valid combined edit", () => {
    const original = list(bag("a", item("i", { quantity: 4, packed: 3, returned: 2 })));
    rejects(() => updateItem(original, "i", { quantity: 2 }), "packed");
    rejects(() => updateItem(original, "i", { packed: 1 }), "returned");
    rejects(() => updateItem(original, "i", { packed: null }), "returned");
    const corrected = updateItem(original, "i", { quantity: 1, packed: 1, returned: 0 });
    expect(corrected.bags[0]?.items[0]).toEqual(item("i", { quantity: 1, packed: 1, returned: 0 }));
    const cleared = updateItem(corrected, "i", { packed: null, returned: null });
    expect(cleared.bags[0]?.items[0]).toEqual(item("i", { quantity: 1 }));
    expect(original.bags[0]?.items[0]?.returned).toBe(2);
  });

  it("rejects runtime edits that try to change an existing ID or add an extra field", () => {
    const input = list(bag("a", item("i")), bag("b", item("j")));
    const rekey = { name: "New name", id: "j" };
    const withMetadata = { name: "New name", source: "outside" };
    rejects(() => updateItem(input, "i", rekey), "shape");
    rejects(() => updateItem(input, "i", withMetadata), "shape");
    expect(input.bags[0]?.items[0]?.id).toBe("i");
  });

  it("appends a moved item after the existing items and preserves both counts and its note", () => {
    const entry = item("b", { quantity: 8, packed: 5, returned: 1, note: "Loose in front pocket" });
    const input = list(bag("carry", item("a"), entry, item("c")), bag("other", item("d")), bag("third"));
    const moved = moveItem(input, "b", "other");
    expect(ids(moved)).toEqual([["a", "c"], ["d", "b"], []]);
    expect(moved.bags[1]?.items[1]).toEqual(entry);
    expect(ids(input)).toEqual([["a", "b", "c"], ["d"], []]);
    expect(moved.bags[2]).toBe(input.bags[2]);
    expect(summarizeList(moved, "return")).toEqual(summarizeList(input, "return"));
    expect(moveItem(moved, "b", "other")).toBe(moved);
  });

  it("reorders adjacent items within the same bag without crossing a bag boundary", () => {
    const input = list(bag("left", item("a"), item("b"), item("c")), bag("right", item("d")));
    expect(reorderItem(input, "a", -1)).toBe(input);
    expect(reorderItem(input, "c", 1)).toBe(input);
    expect(reorderItem(input, "d", 1)).toBe(input);
    const earlier = reorderItem(input, "c", -1);
    expect(ids(earlier)).toEqual([["a", "c", "b"], ["d"]]);
    expect(reorderItem(earlier, "c", 1)).toEqual(input);
    expect(earlier.bags[1]).toBe(input.bags[1]);
  });

  it("removes the intended entry when two item labels are identical", () => {
    const original = list(bag("carry", item("a"), item("b")), bag("other", item("c")));
    expect(ids(removeItem(original, "b"))).toEqual([["a"], ["c"]]);
    expect(ids(original)).toEqual([["a", "b"], ["c"]]);
  });

  it("reports an item removed during editing or another move as missing", () => {
    const changed = removeItem(list(bag("a", item("x")), bag("b")), "x");
    rejects(() => updateItem(changed, "x", { returned: null }), "item-not-found");
    rejects(() => removeItem(changed, "x"), "item-not-found");
    rejects(() => reorderItem(changed, "x", -1), "item-not-found");
    rejects(() => moveItem(changed, "x", "b"), "item-not-found");
    expect(ids(changed)).toEqual([[], []]);
  });
});

describe("outbound and return reviews", () => {
  const cases: Array<[number | null, number | null, StageStatus, StageStatus]> = [
    [null, null, "UNKNOWN", "UNKNOWN"],
    [0, null, "pending", "UNKNOWN"],
    [0, 0, "pending", "complete"],
    [2, null, "partial", "UNKNOWN"],
    [2, 0, "partial", "pending"],
    [2, 1, "partial", "partial"],
    [2, 2, "partial", "complete"],
    [4, null, "complete", "UNKNOWN"],
    [4, 3, "complete", "partial"],
    [4, 4, "complete", "complete"],
  ];
  it.each(cases)("classifies outbound %s and returned %s as %s and %s", (packed, returned, outbound, arrival) => {
    const row = item("x", { packed, returned });
    expect(stageStatus(row, "packing")).toBe(outbound);
    expect(stageStatus(row, "return")).toBe(arrival);
  });

  const mixed = bag("main",
    item("unrecorded"),
    item("partly-packed", { packed: 2, returned: 1 }),
    item("back", { packed: 4, returned: 4 }),
    item("unpacked", { packed: 0, returned: null }),
    item("forgotten", { packed: 4, returned: 0 }),
  );

  it("filters the selected stage while preserving the person's order", () => {
    const filtered = (stage: "packing" | "return", filter: Parameters<typeof filterItems>[2]) =>
      filterItems(mixed, stage, filter).map((entry) => entry.id);
    expect(filtered("packing", "all")).toEqual(mixed.items.map((row) => row.id));
    expect(filtered("packing", "outstanding")).toEqual(["unrecorded", "partly-packed", "unpacked"]);
    expect(filtered("return", "outstanding")).toEqual(["unrecorded", "partly-packed", "unpacked", "forgotten"]);
    expect(filtered("packing", "complete")).toEqual(["back", "forgotten"]);
    expect(filtered("return", "complete")).toEqual(["back"]);
    expect(filtered("return", "UNKNOWN")).toEqual(["unrecorded", "unpacked"]);
    expect(filtered("return", "partial")).toEqual(["partly-packed"]);
    expect(filtered("return", "pending")).toEqual(["forgotten"]);
  });

  it("shows known units even when missing counts keep overall remaining quantities UNKNOWN", () => {
    expect(summarizeBag(mixed, "packing")).toEqual({
      items: 5, pending: 1, partial: 1, complete: 2, unknown: 1,
      knownCount: 10, expectedCount: 20, remainingCount: null,
    });
    expect(summarizeBag(mixed, "return")).toEqual({
      items: 5, pending: 1, partial: 1, complete: 1, unknown: 2,
      knownCount: 5, expectedCount: null, remainingCount: null,
    });
  });

  it("calculates the return target from packed units across all bags", () => {
    const completedObservations = list(
      bag("a", item("ticket", { packed: 4, returned: 2 })),
      bag("b", item("paper", { packed: 2, returned: 1 })),
      bag("c", item("empty", { packed: 0, returned: 0 })),
    );
    expect(summarizeList(completedObservations, "packing")).toMatchObject({
      knownCount: 6, expectedCount: 12, remainingCount: 6,
    });
    expect(summarizeList(completedObservations, "return")).toMatchObject({
      knownCount: 3, expectedCount: 6, remainingCount: 3, partial: 2, complete: 1, unknown: 0,
    });
  });

  it("preserves a known return target even when the returned count has not been entered", () => {
    const input = list(bag("first", item("p", { packed: 0 })), bag("second", item("q", { packed: 2, returned: 0 })));
    expect(summarizeList(input, "return")).toMatchObject({
      expectedCount: 2, knownCount: 0, remainingCount: null, unknown: 1, pending: 1,
    });
    const recorded = updateItem(input, "p", { returned: 0 });
    expect(summarizeList(recorded, "return")).toMatchObject({
      expectedCount: 2, knownCount: 0, remainingCount: 2, unknown: 0, complete: 1,
    });
  });

  it("keeps empty collections separate from items with no recorded count", () => {
    const empty = { items: 0, pending: 0, complete: 0, partial: 0, unknown: 0, knownCount: 0, expectedCount: 0, remainingCount: 0 };
    expect(summarizeBag(bag("nothing"), "return")).toEqual(empty);
    expect(summarizeList(list(), "packing")).toEqual(empty);
    expect(summarizeList(list(bag("a"), bag("b")), "return")).toEqual(empty);
    const unseen = list(bag("a", item("b")));
    expect(summarizeList(unseen, "return")).toMatchObject({ items: 1, pending: 0, unknown: 1, expectedCount: null });
  });

  it("keeps an unrecorded quantity unknown regardless of its position in the list", () => {
    const recorded = bag("a", item("p", { packed: 4, returned: 3 }));
    const missing = bag("b", item("q"));
    expect(summarizeList(list(missing, recorded), "return")).toEqual(summarizeList(list(recorded, missing), "return"));
    expect(summarizeList(list(missing, recorded), "return").remainingCount).toBeNull();
  });

  it("keeps every recorded state, order, note and quantity through a complete outing", () => {
    let outing = addBag(createPackingList("Day visit"), "main", "Main bag");
    outing = addBag(outing, "side", "Wheel-side pouch");
    outing = addItem(outing, "main", item("paper", { quantity: 2, note: "For writing the return stop" }));
    outing = addItem(outing, "side", item("tickets", { quantity: 2 }));
    outing = updateItem(outing, "tickets", { packed: 2 });
    outing = updateItem(outing, "paper", { packed: 1 });
    const packed = parsePackingList(JSON.parse(JSON.stringify(outing)));
    expect(summarizeList(packed, "packing").remainingCount).toBe(1);
    expect(summarizeList(packed, "return").remainingCount).toBeNull();
    const repacked = moveItem(packed, "tickets", "main");
    const first = reorderItem(repacked, "tickets", -1);
    const ticketCount = updateItem(first, "tickets", { returned: 1 });
    const returnCount = updateItem(ticketCount, "paper", { returned: 1 });
    expect(summarizeList(returnCount, "return")).toMatchObject({ expectedCount: 3, knownCount: 2, remainingCount: 1 });
    expect(ids(returnCount)).toEqual([["tickets", "paper"], []]);
    expect(filterItems(returnCount.bags[0]!, "return", "outstanding").map((entry) => entry.id)).toEqual(["tickets"]);
    expect(returnCount.bags[0]?.items[1]?.note).toBe("For writing the return stop");
    expect(summarizeList(packed, "return").knownCount).toBe(0);
  });
});
