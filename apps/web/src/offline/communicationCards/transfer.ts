import {
  addCard,
  CardDeckError,
  displayText,
  emptyDeck,
  MAX_CARDS,
  type CardDeck,
  type CardLanguage,
} from "./model";

const BACKUP_FORMAT = "offline-communication-cards";
const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 128_000;

export interface DeckImportPreview {
  readonly deck: CardDeck;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly reordered: boolean;
  /** Identifies the exact content reviewed for replacement, including order. */
  readonly baseline: string;
}

export function encodeDeck(deck: CardDeck): string {
  const cards = deck.cards.map(({ id, en, fr }) => ({ id, en, fr }));
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, cards }, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function readBackup(source: string): CardDeck {
  if (typeof source !== "string") throw new CardDeckError("invalid-backup");
  // The string length provides a cheap lower bound before encoding allocates bytes.
  if (source.length > MAX_BACKUP_BYTES || new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) {
    throw new CardDeckError("backup-too-large");
  }
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/u, ""));
  } catch {
    throw new CardDeckError("invalid-backup");
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || typeof value.version !== "number") {
    throw new CardDeckError("invalid-backup");
  }
  if (value.version !== BACKUP_VERSION) throw new CardDeckError("unsupported-version");
  if (!hasFields(value, ["format", "version", "cards"]) || !Array.isArray(value.cards)) {
    throw new CardDeckError("invalid-backup");
  }
  if (value.cards.length > MAX_CARDS) throw new CardDeckError("card-limit");
  let deck = emptyDeck();
  for (const card of value.cards as unknown[]) {
    if (!isRecord(card) || !hasFields(card, ["id", "en", "fr"]) ||
        typeof card.id !== "string" || typeof card.en !== "string" || typeof card.fr !== "string") {
      throw new CardDeckError("invalid-backup");
    }
    deck = addCard(deck, card.id, { en: card.en, fr: card.fr });
  }
  return deck;
}

export function previewDeckImport(source: string, current: CardDeck): DeckImportPreview {
  const deck = readBackup(source);
  const before = new Map(current.cards.map(card => [card.id, card]));
  const after = new Set(deck.cards.map(card => card.id));
  const retained = current.cards.filter(card => after.has(card.id));
  const incomingRetained = deck.cards.filter(card => before.has(card.id));
  const changed = incomingRetained.filter(card => {
    const original = before.get(card.id)!;
    return card.en !== original.en || card.fr !== original.fr;
  }).length;
  return Object.freeze({
    deck,
    added: deck.cards.length - retained.length,
    removed: current.cards.length - retained.length,
    changed,
    reordered: incomingRetained.some((card, index) => card.id !== retained[index]?.id),
    baseline: encodeDeck(current),
  });
}

export function applyDeckImport(preview: DeckImportPreview, current: CardDeck): CardDeck {
  if (encodeDeck(current) !== preview.baseline) throw new CardDeckError("stale-preview");
  return preview.deck;
}

/** Both authored versions stay together, even when the interface is in just one language. */
export function exportDeckText(deck: CardDeck, locale: CardLanguage): string {
  const french = locale === "fr";
  const lines = [french ? "Cartes de communication" : "Communication cards"];
  const labels = french ? { en: "Anglais", fr: "Français" } : { en: "English", fr: "French" };
  const colon = french ? "\u00a0: " : ": ";
  const languages: readonly CardLanguage[] = french ? ["fr", "en"] : ["en", "fr"];
  for (const [index, card] of deck.cards.entries()) {
    lines.push("", `${french ? "Carte" : "Card"} ${index + 1}`);
    for (const language of languages) {
      lines.push(`${labels[language]}${colon}${displayText(card, language)}`);
    }
  }
  return lines.join("\n") + "\n";
}
