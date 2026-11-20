/**
 * Counts, by topic word, how the notes of the pack places speak. Only places with a note count.
 * Counting words is all this does: it never decides what a note means, and a place with no note is
 * not a place with nothing to know.
 */
import { TOPIC_IDS, type TopicId } from "./noteTopicLexicon";
import { type TopicMention, scanTopics } from "./noteTopicScan";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export const TOPIC_TAG_ORDER: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

export interface TopicEntry {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly category: string | null;
  readonly address: string | null;
  readonly note: string;
  readonly mentions: readonly TopicMention[];
  /** Distinct topics, in the lexicon's order. */
  readonly topics: readonly TopicId[];
  /** Topics whose every use comes right after a word like "no" or "without". */
  readonly negatedOnly: readonly TopicId[];
}

export interface TopicTally {
  /** Places whose note uses a word of the topic. */
  readonly places: number;
  /** Uses of the topic's words, all notes together. */
  readonly mentions: number;
  /** Places where every use comes right after a word like "no" or "without". */
  readonly negatedOnly: number;
}

export interface TopicPair {
  readonly a: TopicId;
  readonly b: TopicId;
  readonly places: number;
}

export type TopicTagCounts = Readonly<Record<WheelchairTag, number>>;

export interface TopicIndex {
  readonly entries: readonly TopicEntry[];
  readonly total: number;
  readonly withNote: number;
  readonly withTopic: number;
  readonly withoutTopic: number;
  readonly byTopic: Readonly<Record<TopicId, TopicTally>>;
  readonly tagTable: Readonly<Record<TopicId, TopicTagCounts>>;
  /** Topics used together in the same note, most places first, ties in lexicon order. */
  readonly pairs: readonly TopicPair[];
}

const emptyTags = (): Record<WheelchairTag, number> => ({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });

export function topicEntryFor(p: PackPlaceRecord): TopicEntry | null {
  if (p.note === null || p.note.trim() === "") return null;
  const mentions = scanTopics(p.note);
  const topics = TOPIC_IDS.filter((id) => mentions.some((m) => m.topic === id));
  const negatedOnly = topics.filter((id) => mentions.filter((m) => m.topic === id).every((m) => m.negated));
  return { id: p.id, name: p.name, tag: p.tag, category: p.category, address: p.address, note: p.note, mentions, topics, negatedOnly };
}

export function buildTopicIndex(places: readonly PackPlaceRecord[]): TopicIndex {
  const entries: TopicEntry[] = [];
  for (const p of places) {
    const e = topicEntryFor(p);
    if (e !== null) entries.push(e);
  }
  const byTopic = {} as Record<TopicId, { places: number; mentions: number; negatedOnly: number }>;
  const tagTable = {} as Record<TopicId, Record<WheelchairTag, number>>;
  for (const id of TOPIC_IDS) {
    byTopic[id] = { places: 0, mentions: 0, negatedOnly: 0 };
    tagTable[id] = emptyTags();
  }
  const pairCounts = new Map<string, number>();
  for (const e of entries) {
    for (const m of e.mentions) byTopic[m.topic].mentions += 1;
    for (const id of e.topics) {
      byTopic[id].places += 1;
      tagTable[id][e.tag] += 1;
    }
    for (const id of e.negatedOnly) byTopic[id].negatedOnly += 1;
    for (let i = 0; i < e.topics.length; i++) {
      for (let j = i + 1; j < e.topics.length; j++) {
        const key = `${e.topics[i]}|${e.topics[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs: TopicPair[] = [...pairCounts].map(([key, places]) => {
    const [a, b] = key.split("|") as [TopicId, TopicId];
    return { a, b, places };
  });
  pairs.sort((x, y) => y.places - x.places || TOPIC_IDS.indexOf(x.a) - TOPIC_IDS.indexOf(y.a) || TOPIC_IDS.indexOf(x.b) - TOPIC_IDS.indexOf(y.b));
  const withTopic = entries.filter((e) => e.topics.length > 0).length;
  return { entries, total: places.length, withNote: entries.length, withTopic, withoutTopic: entries.length - withTopic, byTopic, tagTable, pairs };
}

/** Every place with a note is counted once: with a topic word or without. A cheap check for tests and callers. */
export function topicTallyAddsUp(index: TopicIndex): boolean {
  const tagsSum = (c: TopicTagCounts) => TOPIC_TAG_ORDER.reduce((s, t) => s + c[t], 0);
  return (
    index.withTopic + index.withoutTopic === index.withNote &&
    index.withNote <= index.total &&
    TOPIC_IDS.every((id) => tagsSum(index.tagTable[id]) === index.byTopic[id].places && index.byTopic[id].negatedOnly <= index.byTopic[id].places && index.byTopic[id].places <= index.byTopic[id].mentions)
  );
}
