import { describe, expect, it } from "vitest";
import {
  addCard,
  editCard,
  emptyDeck,
  MAX_CARDS,
  MAX_CARD_LENGTH,
  moveCard,
  removeCard,
  type CardDeck,
} from "./model";
import {
  applyDeckImport,
  encodeDeck,
  exportDeckText,
  MAX_BACKUP_BYTES,
  previewDeckImport,
} from "./transfer";

const entrance = { id: "entrance", en: "Where is the lift?", fr: "Où est l’ascenseur\u202f?" };
const wait = { id: "wait", en: "I need a moment.", fr: "" };
const directions = { id: "directions", en: "", fr: "Pouvez-vous écrire le nom de la rue\u202f?" };

function original(): CardDeck {
  let deck = addCard(emptyDeck(), entrance.id, entrance);
  deck = addCard(deck, wait.id, wait);
  return addCard(deck, directions.id, directions);
}

function source(cards: unknown, version: unknown = 1): string {
  return JSON.stringify({ format: "offline-communication-cards", version, cards });
}

describe("portable backups", () => {
  it("round-trips order, IDs and a missing phrase without modifying either input", () => {
    const existing = original();
    const serialized = encodeDeck(existing);
    const preview = previewDeckImport(serialized, emptyDeck());
    expect(preview.added).toBe(3);
    expect(preview.deck).toEqual(existing);
    expect(preview.deck).not.toBe(existing);
    expect(preview.deck.cards[1]?.fr).toBe("");
    const restored = applyDeckImport(preview, emptyDeck());
    expect(encodeDeck(restored)).toBe(serialized);
  });

  it("writes a versioned interchange document with no additional application state", () => {
    const withLocalMetadata = { ...wait, internalLabel: "not part of the card" };
    const input = { cards: [withLocalMetadata], selection: "wait" };
    const restored: unknown = JSON.parse(encodeDeck(input));
    expect(restored).toEqual({ format: "offline-communication-cards", version: 1, cards: [wait] });
  });

  it("accepts a UTF-8 BOM, pretty-printed JSON and equivalent key order", () => {
    const example = { cards: [{ fr: entrance.fr, en: entrance.en, id: entrance.id }], version: 1, format: "offline-communication-cards" };
    const preview = previewDeckImport("\uFEFF" + JSON.stringify(example, null, 2) + "\n", emptyDeck());
    expect(preview.deck.cards).toEqual([entrance]);
  });

  it("round-trips quotes, line breaks, symbols, accents and ordinary markup as literal text", () => {
    const en = 'Say "A" or "B"\n<Desk> & reception 🍁';
    const fr = "Indiquez l’étage\u00a0: «\u202frez-de-chaussée\u202f».";
    const deck = addCard(emptyDeck(), "desk", { en, fr });
    const restored = previewDeckImport(encodeDeck(deck), emptyDeck()).deck;
    expect(restored.cards[0]).toEqual({ id: "desk", en, fr });
  });

  it("exports and restores a full deck with the maximum text in both languages", () => {
    const phrase = "界".repeat(MAX_CARD_LENGTH);
    let deck = emptyDeck();
    for (let index = 0; index < MAX_CARDS; index++) {
      deck = addCard(deck, "phrase-" + index, { en: phrase, fr: phrase });
    }
    const serialized = encodeDeck(deck);
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(previewDeckImport(serialized, emptyDeck()).deck).toEqual(deck);
  });
});

describe("replacement preview", () => {
  it("reports additions, removals, wording edits and reordered retained cards separately", () => {
    const before = original();
    let after = removeCard(before, wait.id);
    after = editCard(after, entrance.id, { ...entrance, en: "Which entrance has a lift?" });
    after = moveCard(after, directions.id, "up");
    after = addCard(after, "thanks", { en: "Thank you", fr: "Merci" });
    const preview = previewDeckImport(encodeDeck(after), before);
    expect(preview).toMatchObject({ added: 1, removed: 1, changed: 1, reordered: true, deck: after });
    expect(before.cards).toEqual([entrance, wait, directions]);
  });

  it("counts a newly authored translation as one wording change", () => {
    const next = editCard(original(), wait.id, { ...wait, fr: "J’ai besoin d’un moment." });
    const result = previewDeckImport(encodeDeck(next), original());
    expect(result).toMatchObject({ added: 0, removed: 0, changed: 1, reordered: false });
  });

  it("does not call an insertion or removal alone a reorder", () => {
    const before = original();
    const inserted = addCard(before, "stop", { en: "Here, please", fr: "" });
    const movedNew = moveCard(moveCard(inserted, "stop", "up"), "stop", "up");
    const after = removeCard(movedNew, entrance.id);
    const preview = previewDeckImport(encodeDeck(after), before);
    expect(preview).toMatchObject({ added: 1, removed: 1, changed: 0, reordered: false });
  });

  it("treats identical content with a different ID as replacement", () => {
    const existing = addCard(emptyDeck(), "old", wait);
    const replacement = addCard(emptyDeck(), "new", wait);
    const result = previewDeckImport(encodeDeck(replacement), existing);
    expect(result).toMatchObject({ added: 1, removed: 1, changed: 0, reordered: false });
  });

  it("recognizes an identical deck and retains its order", () => {
    const before = original();
    const preview = previewDeckImport(encodeDeck(before), before);
    expect(preview).toMatchObject({ added: 0, removed: 0, changed: 0, reordered: false });
    expect(applyDeckImport(preview, before)).toEqual(before);
  });

  it("previews removal of all cards and leaves the original usable after cancellation", () => {
    const before = original();
    const preview = previewDeckImport(encodeDeck(emptyDeck()), before);
    expect(preview.removed).toBe(3);
    expect(preview.deck.cards).toEqual([]);
    expect(before.cards).toEqual([entrance, wait, directions]);
    expect(applyDeckImport(preview, before).cards).toEqual([]);
    expect(previewDeckImport(preview.baseline, preview.deck).deck).toEqual(before);
  });

  it("does not overwrite intervening changes, including a change of order alone", () => {
    const before = original();
    const preview = previewDeckImport(encodeDeck(emptyDeck()), before);
    const alternatives = [
      editCard(before, wait.id, { ...wait, en: "Please stay here" }),
      addCard(before, "new", wait),
      removeCard(before, entrance.id),
      moveCard(before, wait.id, "down"),
    ];
    for (const current of alternatives) {
      expect(() => applyDeckImport(preview, current)).toThrow("stale-preview");
    }
    expect(encodeDeck(before)).toBe(preview.baseline);
  });

  it("accepts an independently restored baseline with exactly the reviewed content", () => {
    const before = original();
    const preview = previewDeckImport(encodeDeck(emptyDeck()), before);
    const again = previewDeckImport(encodeDeck(before), emptyDeck()).deck;
    expect(applyDeckImport(preview, again).cards).toEqual([]);
  });
});

describe("backup validation", () => {
  it.each([
    "",
    "{",
    "[]",
    "null",
    "123",
    JSON.stringify({ cards: [entrance] }),
    JSON.stringify({ format: "different", version: 1, cards: [entrance] }),
    source({}, 1),
    source(null, 1),
    source([], "1"),
    JSON.stringify({ format: "offline-communication-cards", version: 1, cards: [], destination: "elsewhere" }),
  ])("rejects malformed or unrelated backups", input => {
    expect(() => previewDeckImport(input, original())).toThrow("invalid-backup");
  });

  it("rejects a differently versioned backup even when it resembles this version", () => {
    expect(() => previewDeckImport(source([entrance], 2), original())).toThrow("unsupported-version");
  });

  it.each([
    null,
    15,
    [entrance],
    { id: "front", en: "Front" },
    { id: "front", en: "Front", fr: 1 },
    { id: 0, en: "Front", fr: "" },
    { id: "front", en: "Front", fr: "", selected: true },
  ])("requires exactly three string fields on each card", invalid => {
    expect(() => previewDeckImport(source([entrance, invalid]), emptyDeck())).toThrow("invalid-backup");
  });

  it("requires unique IDs even when duplicate cards are separated", () => {
    const before = original();
    const serialized = source([entrance, wait, { ...entrance, en: "Another text" }]);
    expect(() => previewDeckImport(serialized, before)).toThrow("duplicate-id");
    expect(before.cards).toEqual([entrance, wait, directions]);
  });

  it("rejects an extra prototype-like key at the card level", () => {
    const raw = source([entrance]).replace('"id":', '"__proto__":{"en":"other"},"id":');
    expect(() => previewDeckImport(raw, emptyDeck())).toThrow("invalid-backup");
  });

  it.each([
    [{ ...entrance, id: "../front" }, "invalid-id"],
    [{ ...entrance, en: "", fr: " " }, "empty-text"],
    [{ ...entrance, en: "\u0000front" }, "invalid-text"],
    [{ ...entrance, fr: "é".repeat(MAX_CARD_LENGTH + 1) }, "text-too-long"],
  ] as const)("applies the editor's data rules to restored cards", (card, issue) => {
    expect(() => previewDeckImport(source([card]), emptyDeck())).toThrow(issue);
  });

  it("checks the card count before reading individual entries", () => {
    expect(() => previewDeckImport(source(Array.from({ length: MAX_CARDS + 1 }, () => null)), emptyDeck()))
      .toThrow("card-limit");
  });

  it("uses a byte limit for multibyte files and a fast limit for oversized strings", () => {
    const text = "🌿".repeat(Math.ceil(MAX_BACKUP_BYTES / 4));
    const multibyte = source([{ ...entrance, en: text }]);
    expect(multibyte.length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(() => previewDeckImport(multibyte, emptyDeck())).toThrow("backup-too-large");
    expect(() => previewDeckImport(" ".repeat(MAX_BACKUP_BYTES + 1), emptyDeck())).toThrow("backup-too-large");
  });
});

describe("plain-text handout", () => {
  it("uses the visible order, both authored versions and an explicit missing translation", () => {
    expect(exportDeckText(original(), "en")).toBe([
      "Communication cards",
      "",
      "Card 1",
      "English: " + entrance.en,
      "French: " + entrance.fr,
      "",
      "Card 2",
      "English: " + wait.en,
      "French: UNKNOWN",
      "",
      "Card 3",
      "English: UNKNOWN",
      "French: " + directions.fr,
      "",
    ].join("\n"));
  });

  it("uses French labels, punctuation and language order while retaining English text", () => {
    const output = exportDeckText(addCard(emptyDeck(), "desk", entrance), "fr");
    expect(output).toBe([
      "Cartes de communication",
      "",
      "Carte 1",
      "Français\u00a0: " + entrance.fr,
      "Anglais\u00a0: " + entrance.en,
      "",
    ].join("\n"));
  });

  it("exports an empty deck in both interface languages", () => {
    expect(exportDeckText(emptyDeck(), "en")).toBe("Communication cards\n");
    expect(exportDeckText(emptyDeck(), "fr")).toBe("Cartes de communication\n");
  });
});
