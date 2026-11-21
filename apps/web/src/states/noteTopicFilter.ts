/** Narrowing and ordering the notes by topic word. Pure: the entries given come back, fewer or reordered, never changed. */
import { TOPIC_IDS, type TopicId } from "./noteTopicLexicon";
import { TOPIC_TAG_ORDER, type TopicEntry } from "./noteTopicIndex";
import type { WheelchairTag } from "./packPlaces";

export const TOPIC_MODES = ["any", "all"] as const;
export type TopicMode = (typeof TOPIC_MODES)[number];

export const TOPIC_ORDERS = ["name", "topics", "tag"] as const;
export type TopicOrder = (typeof TOPIC_ORDERS)[number];
export const DEFAULT_TOPIC_ORDER: TopicOrder = "name";

export interface TopicFilter {
  readonly topics: readonly TopicId[];
  readonly mode: TopicMode;
  readonly tags: readonly WheelchairTag[];
  /** Count a topic only where at least one use is not right after a word like "no" or "without". */
  readonly skipNegatedOnly: boolean;
}

export const NO_TOPIC_FILTER: TopicFilter = { topics: [], mode: "any", tags: [], skipNegatedOnly: false };

export function isTopicMode(v: unknown): v is TopicMode {
  return typeof v === "string" && (TOPIC_MODES as readonly string[]).includes(v);
}
export function isTopicOrder(v: unknown): v is TopicOrder {
  return typeof v === "string" && (TOPIC_ORDERS as readonly string[]).includes(v);
}

export function isTopicFiltered(f: TopicFilter): boolean {
  return f.topics.length > 0 || f.tags.length > 0;
}

export function toggleTopicIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Whether the entry's note uses a word of the topic, counting only some uses when asked to. */
export function entryUsesTopic(e: TopicEntry, id: TopicId, skipNegatedOnly: boolean): boolean {
  return skipNegatedOnly ? e.topics.includes(id) && !e.negatedOnly.includes(id) : e.topics.includes(id);
}

export function filterTopicEntries(entries: readonly TopicEntry[], f: TopicFilter): TopicEntry[] {
  return entries.filter((e) => {
    if (f.tags.length > 0 && !f.tags.includes(e.tag)) return false;
    if (f.topics.length === 0) return true;
    const has = (id: TopicId) => entryUsesTopic(e, id, f.skipNegatedOnly);
    return f.mode === "all" ? f.topics.every(has) : f.topics.some(has);
  });
}

const byName = (a: TopicEntry, b: TopicEntry): number => (a.name ?? "￿").localeCompare(b.name ?? "￿", "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);

export function orderTopicEntries(entries: readonly TopicEntry[], order: TopicOrder): TopicEntry[] {
  const list = [...entries];
  if (order === "topics") return list.sort((a, b) => b.topics.length - a.topics.length || byName(a, b));
  if (order === "tag") return list.sort((a, b) => TOPIC_TAG_ORDER.indexOf(a.tag) - TOPIC_TAG_ORDER.indexOf(b.tag) || byName(a, b));
  return list.sort(byName);
}

/** Topics that at least one entry uses, in the lexicon's order. */
export function topicsInUse(entries: readonly TopicEntry[]): TopicId[] {
  return TOPIC_IDS.filter((id) => entries.some((e) => e.topics.includes(id)));
}
