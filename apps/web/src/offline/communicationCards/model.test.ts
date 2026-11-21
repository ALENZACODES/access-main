import { describe, expect, it } from "vitest";
import {
  addCard,
  CardDeckError,
  displayText,
  duplicateCard,
  editCard,
  emptyDeck,
  MAX_CARDS,
  MAX_CARD_LENGTH,
  moveCard,
  nextCardId,
  removeCard,
  type CardDeck,
  type CardText,
} from "./model";

const arrival = { en: "Where is the entrance?", fr: "Où se trouve l’entrée\u202f?" };
const seat = { en: "May I sit here?", fr: "" };
const pause = { en: "", fr: "Une pause, s’il vous plaît." };

function three(): CardDeck {
  let deck = addCard(emptyDeck(), "door", arrival);
  deck = addCard(deck, "seat", seat);
  return addCard(deck, "pause", pause);
}

function ids(deck: CardDeck): string[] {
  return deck.cards.map(card => card.id);
}

describe("creating and reading communication cards", () => {
  it("starts with an empty deck", () => {
    const deck = emptyDeck();
    expect(deck.cards).toEqual([]);
    expect(nextCardId(deck)).toBe("card-1");
  });

  it("keeps the author's two versions independent", () => {
    const [card] = three().cards;
    expect(displayText(card!, "en")).toBe(arrival.en);
    expect(displayText(card!, "fr")).toBe(arrival.fr);
  });

  it("shows the missing-language token only in the presentation", () => {
    const [, english, french] = three().cards;
    expect(displayText(english!, "fr")).toBe("UNKNOWN");
    expect(displayText(french!, "en")).toBe("UNKNOWN");
    expect(english?.fr).toBe("");
    expect(french?.en).toBe("");
  });

  it("keeps deliberate accents, internal spacing and composed characters intact", () => {
    const fr = "L’accueil\u00a0: «\u202fporte A\u202f»\u202f?\nCafé ou cafe\u0301";
    const en = "👩🏾‍🦽  Entrance · مدخل · ทางเข้า";
    const deck = addCard(emptyDeck(), "entry", { en: "  " + en, fr: fr + "  " });
    expect(deck.cards[0]).toEqual({ id: "entry", en, fr });
  });

  it("normalizes line endings while keeping internal line breaks", () => {
    const en = "Front desk\r\nEast hall\rLevel two";
    const deck = addCard(emptyDeck(), "desk", { en, fr: "" });
    expect(deck.cards[0]?.en).toBe("Front desk\nEast hall\nLevel two");
  });

  it("accepts the native field length boundary, including a complete surrogate pair", () => {
    const en = "a".repeat(MAX_CARD_LENGTH - 2) + "🌿";
    expect(addCard(emptyDeck(), "leaf", { en, fr: "" }).cards[0]?.en).toBe(en);
    expect(() => addCard(emptyDeck(), "leaf", { en: en + "!", fr: "" })).toThrow("text-too-long");
  });

  it("allows an existing copy to gain a translation without changing its ID", () => {
    const previous = addCard(emptyDeck(), "seat", seat);
    const translated = editCard(previous, "seat", { ...seat, fr: "Puis-je m’asseoir ici\u202f?" });
    expect(translated.cards[0]?.id).toBe("seat");
    expect(translated.cards[0]?.fr).toBe("Puis-je m’asseoir ici\u202f?");
    expect(previous.cards[0]?.fr).toBe("");
  });

  it("allows a translation to be cleared without losing the other language", () => {
    const deck = editCard(three(), "door", { en: "", fr: arrival.fr });
    expect(displayText(deck.cards[0]!, "en")).toBe("UNKNOWN");
    expect(displayText(deck.cards[0]!, "fr")).toBe(arrival.fr);
  });

  it.each([
    { en: "", fr: "" },
    { en: "  ", fr: "\u202f\n\u00a0" },
  ])("requires at least one authored version", text => {
    expect(() => addCard(emptyDeck(), "blank", text)).toThrow("empty-text");
    expect(() => editCard(three(), "door", text)).toThrow("empty-text");
  });

  it.each([
    ["NUL", "front\u0000desk"],
    ["tab", "desk\troom"],
    ["delete", "desk\u007froom"],
    ["C1 control", "desk\u009broom"],
    ["reversed display order", "desk\u202eroom"],
    ["unpaired high surrogate", "desk\ud83d"],
    ["unpaired low surrogate", "\ude04room"],
  ])("rejects a %s character with an actionable error code", (_name, fr) => {
    expect(() => addCard(emptyDeck(), "invalid", { en: "Desk", fr: fr! })).toThrow("invalid-text");
  });

  it("validates both languages before changing any card", () => {
    const original = three();
    expect(() => editCard(original, "seat", { en: "Other", fr: "é".repeat(MAX_CARD_LENGTH + 1) }))
      .toThrow("text-too-long");
    expect(original.cards[1]).toEqual({ id: "seat", ...seat });
  });
});

describe("stable identity and deck order", () => {
  it("allocates a distinct ID after restoring a sparse sequence", () => {
    let deck = addCard(emptyDeck(), "card-1", arrival);
    deck = addCard(deck, "card-3", seat);
    const allocated = nextCardId(deck);
    expect(allocated).toBe("card-2");
    const extended = addCard(deck, allocated, pause);
    expect(ids(extended)).toEqual(["card-1", "card-3", "card-2"]);
    expect(nextCardId(extended)).toBe("card-4");
  });

  it.each(["", " spaces", "a/b", "a.b", "door\n", "a".repeat(49)])("rejects an invalid card ID", id => {
    expect(() => addCard(emptyDeck(), id, arrival)).toThrow("invalid-id");
  });

  it("rejects duplicate keys even if their text is identical", () => {
    const deck = three();
    expect(() => addCard(deck, "door", arrival)).toThrow("duplicate-id");
    expect(() => duplicateCard(deck, "door", "door")).toThrow("duplicate-id");
    expect(() => duplicateCard(deck, "door", "pause")).toThrow("duplicate-id");
    expect(ids(deck)).toEqual(["door", "seat", "pause"]);
  });

  it("places a copy immediately after its source, with a separate ID", () => {
    const original = three();
    const copy = duplicateCard(original, "seat", "second-seat");
    expect(ids(copy)).toEqual(["door", "seat", "second-seat", "pause"]);
    expect(copy.cards[2]).toEqual({ id: "second-seat", ...seat });
    expect(copy.cards[1]).toBe(original.cards[1]);
    const edited = editCard(copy, "second-seat", arrival);
    expect(edited.cards[1]?.en).toBe(seat.en);
    expect(edited.cards[2]?.en).toBe(arrival.en);
    expect(ids(original)).toEqual(["door", "seat", "pause"]);
  });

  it("moves the selected ID exactly one position in either direction", () => {
    const original = three();
    const earlier = moveCard(original, "seat", "up");
    expect(ids(earlier)).toEqual(["seat", "door", "pause"]);
    const later = moveCard(earlier, "seat", "down");
    expect(ids(later)).toEqual(ids(original));
    expect(later.cards).toEqual(original.cards);
  });

  it("preserves the same deck at movement boundaries", () => {
    const original = three();
    expect(moveCard(original, "door", "up")).toBe(original);
    expect(moveCard(original, "pause", "down")).toBe(original);
    const single = addCard(emptyDeck(), "solo", pause);
    expect(moveCard(single, "solo", "up")).toBe(single);
    expect(moveCard(single, "solo", "down")).toBe(single);
  });

  it("removes only the selected card and retains other identities", () => {
    const original = three();
    const result = removeCard(original, "seat");
    expect(ids(result)).toEqual(["door", "pause"]);
    expect(result.cards[1]).toBe(original.cards[2]);
    expect(ids(original)).toEqual(["door", "seat", "pause"]);
    const empty = removeCard(removeCard(result, "door"), "pause");
    expect(empty.cards).toEqual([]);
  });

  it("reports a missing selection without silently changing a different card", () => {
    const deck = three();
    for (const action of [
      () => removeCard(deck, "lost"),
      () => moveCard(deck, "lost", "up"),
      () => duplicateCard(deck, "lost", "copy"),
      () => editCard(deck, "lost", seat),
    ]) {
      expect(action).toThrow(CardDeckError);
      expect(action).toThrow("missing-card");
    }
    expect(ids(deck)).toEqual(["door", "seat", "pause"]);
  });

  it("allows edits, reordering and removal at the deck limit", () => {
    let full = emptyDeck();
    for (let i = 0; i < MAX_CARDS; i++) full = addCard(full, nextCardId(full), seat);
    const last = full.cards[MAX_CARDS - 1]!;
    expect(() => addCard(full, nextCardId(full), pause)).toThrow("card-limit");
    expect(() => duplicateCard(full, last.id, "copy")).toThrow("card-limit");
    const edited = editCard(full, last.id, arrival);
    const earlier = moveCard(edited, last.id, "up");
    expect(earlier.cards[MAX_CARDS - 2]).toEqual({ id: last.id, ...arrival });
    const room = removeCard(earlier, "card-1");
    expect(duplicateCard(room, last.id, "copy").cards).toHaveLength(MAX_CARDS);
  });

  it("does not retain a mutable caller's draft or mutate prior history", () => {
    const draft = { en: seat.en, fr: "" };
    const initial = addCard(emptyDeck(), "seat", draft);
    draft.en = "Another question";
    expect(initial.cards[0]?.en).toBe(seat.en);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.cards)).toBe(true);
    expect(Object.isFrozen(initial.cards[0])).toBe(true);
    expect(editCard(initial, "seat", { ...seat, en: " " + seat.en })).toBe(initial);
  });

  it("rejects non-string runtime text without converting it into user-facing words", () => {
    const malformed = { en: null, fr: "Porte" } as unknown as CardText;
    expect(() => addCard(emptyDeck(), "invalid", malformed)).toThrow("invalid-text");
  });
});
