/**
 * "Did you mean" hints for the empty states that have a search box: places in
 * the pack on this device, and help article titles. A hint is a different thing
 * to search for, nothing more: it says nothing about whether a place is accessible.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { suggest, type Candidate } from "./suggest";

export interface Hint {
  readonly key: string;
  /** Text to put in the search box when the hint is chosen. */
  readonly label: string;
}

export interface TitledItem {
  readonly id: string;
  readonly title: string;
}

function toHints(query: string, candidates: readonly Candidate<null>[], limit: number): Hint[] {
  return suggest(query, candidates, { limit }).map((s) => ({ key: s.key, label: s.label }));
}

/** Names of pack places close to the query. Places the pack gives no name for are never suggested. */
export function placeNameHints(query: string, places: readonly PackPlaceRecord[], limit = 3): Hint[] {
  const candidates: Candidate<null>[] = [];
  for (const place of places) {
    if (place.name !== null) candidates.push({ key: place.id, label: place.name, value: null });
  }
  return toHints(query, candidates, limit);
}

/** Titles of help articles close to the query. */
export function helpTitleHints(query: string, articles: readonly TitledItem[], limit = 3): Hint[] {
  const candidates: Candidate<null>[] = [];
  for (const article of articles) {
    if (typeof article.title === "string") candidates.push({ key: article.id, label: article.title, value: null });
  }
  return toHints(query, candidates, limit);
}

/**
 * Read the items of a module result as titled items, ignoring anything that is not.
 * A title is a string, or an object with one string per language (the language asked for is used).
 */
export function titledItems(items: readonly unknown[], locale: "en" | "fr" = "en"): TitledItem[] {
  const out: TitledItem[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const { id, title } = item as { id?: unknown; title?: unknown };
    if (typeof id !== "string") continue;
    let text: unknown = title;
    if (title !== null && typeof title === "object") text = (title as Record<string, unknown>)[locale];
    if (typeof text === "string" && text.trim() !== "") out.push({ id, title: text });
  }
  return out;
}
