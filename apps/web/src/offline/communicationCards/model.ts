export type CardLanguage = "en" | "fr";

export interface CardText {
  readonly en: string;
  readonly fr: string;
}

export interface CommunicationCard extends CardText {
  readonly id: string;
}

export interface CardDeck {
  readonly cards: readonly CommunicationCard[];
}

export type CardDeckIssue =
  | "empty-text"
  | "text-too-long"
  | "invalid-text"
  | "invalid-id"
  | "duplicate-id"
  | "card-limit"
  | "missing-card"
  | "invalid-backup"
  | "unsupported-version"
  | "backup-too-large"
  | "stale-preview";

export class CardDeckError extends Error {
  constructor(readonly code: CardDeckIssue) {
    super(code);
    this.name = "CardDeckError";
  }
}

export const MAX_CARDS = 40;
// Matches the maxlength unit used by native text fields.
export const MAX_CARD_LENGTH = 300;

function makeDeck(cards: CommunicationCard[]): CardDeck {
  return Object.freeze({ cards: Object.freeze(cards) });
}

export function emptyDeck(): CardDeck {
  return makeDeck([]);
}

function cleanText(value: string): string {
  if (typeof value !== "string") throw new CardDeckError("invalid-text");
  const text = value.replace(/\r\n?/gu, "\n");
  // Line breaks are intentional on a communication card. Ordinary accented
  // letters, combining marks, emoji sequences and French spacing survive intact.
  for (const char of text) {
    const point = char.codePointAt(0)!;
    if ((point < 32 && point !== 10) || (point >= 127 && point <= 159) ||
        (point >= 0xd800 && point <= 0xdfff) || (point >= 0x202a && point <= 0x202e)) {
      throw new CardDeckError("invalid-text");
    }
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_CARD_LENGTH) throw new CardDeckError("text-too-long");
  return trimmed;
}

function makeCard(id: string, text: CardText): CommunicationCard {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/u.test(id)) {
    throw new CardDeckError("invalid-id");
  }
  const en = cleanText(text.en);
  const fr = cleanText(text.fr);
  if (en === "" && fr === "") throw new CardDeckError("empty-text");
  return Object.freeze({ id, en, fr });
}

function positionOf(deck: CardDeck, id: string): number {
  const index = deck.cards.findIndex(card => card.id === id);
  if (index < 0) throw new CardDeckError("missing-card");
  return index;
}

function checkNewId(deck: CardDeck, id: string): void {
  if (deck.cards.length >= MAX_CARDS) throw new CardDeckError("card-limit");
  if (deck.cards.some(card => card.id === id)) throw new CardDeckError("duplicate-id");
}

/** Allocate locally, without a clock, account or network connection. */
export function nextCardId(deck: CardDeck): string {
  const occupied = new Set(deck.cards.map(card => card.id));
  let number = 1;
  while (occupied.has(`card-${number}`)) number++;
  return `card-${number}`;
}

export function addCard(deck: CardDeck, id: string, text: CardText): CardDeck {
  checkNewId(deck, id);
  return makeDeck([...deck.cards, makeCard(id, text)]);
}

export function editCard(deck: CardDeck, id: string, text: CardText): CardDeck {
  const at = positionOf(deck, id);
  const replacement = makeCard(id, text);
  const previous = deck.cards[at]!;
  if (replacement.en === previous.en && replacement.fr === previous.fr) return deck;
  const cards = [...deck.cards];
  cards[at] = replacement;
  return makeDeck(cards);
}

export function duplicateCard(deck: CardDeck, id: string, newId: string): CardDeck {
  const at = positionOf(deck, id);
  checkNewId(deck, newId);
  const cards = [...deck.cards];
  cards.splice(at + 1, 0, makeCard(newId, deck.cards[at]!));
  return makeDeck(cards);
}

export function moveCard(deck: CardDeck, id: string, direction: "up" | "down"): CardDeck {
  const from = positionOf(deck, id);
  const to = from + (direction === "up" ? -1 : 1);
  if (to < 0 || to >= deck.cards.length) return deck;
  const cards = [...deck.cards];
  cards[from] = deck.cards[to]!;
  cards[to] = deck.cards[from]!;
  return makeDeck(cards);
}

export function removeCard(deck: CardDeck, id: string): CardDeck {
  const at = positionOf(deck, id);
  const cards = [...deck.cards];
  cards.splice(at, 1);
  return makeDeck(cards);
}

export function displayText(card: CommunicationCard, language: CardLanguage): string {
  return card[language] || "UNKNOWN";
}
