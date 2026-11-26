/**
 * Places whose wheelchair tag and note can be read in different directions at first sight. Three plain
 * readings, written out so nothing is hidden:
 *
 *   yes-steps      tag Yes or Designated, and the note uses a steps word (not after "no", not "step-free")
 *   no-ramp-lift   tag No, and the note uses a ramp or lift word (not after "no")
 *   unknown-words  no tag (UNKNOWN), and the note uses a steps, ramp or lift word
 *
 * A reading is a reason to read the note beside the tag. It does not say the tag or the note is wrong:
 * a note may well explain its tag. Tag Limited has no reading, because "limited" can be about anything.
 * Nothing here changes a place or a tag.
 */
import type { TopicEntry } from "./noteTopicIndex";
import type { TopicId } from "./noteTopicLexicon";
import type { TopicMention } from "./noteTopicScan";
import type { WheelchairTag } from "./packPlaces";

export const TAG_NOTE_KINDS = ["yes-steps", "no-ramp-lift", "unknown-words"] as const;
export type TagNoteKind = (typeof TAG_NOTE_KINDS)[number];

export interface TagNoteRule {
  readonly kind: TagNoteKind;
  readonly tags: readonly WheelchairTag[];
  readonly topics: readonly TopicId[];
}

export const TAG_NOTE_RULES: readonly TagNoteRule[] = [
  { kind: "yes-steps", tags: ["yes", "designated"], topics: ["steps"] },
  { kind: "no-ramp-lift", tags: ["no"], topics: ["ramp", "lift"] },
  { kind: "unknown-words", tags: ["unknown"], topics: ["steps", "ramp", "lift"] },
];

export function isTagNoteKind(value: unknown): value is TagNoteKind {
  return typeof value === "string" && (TAG_NOTE_KINDS as readonly string[]).includes(value);
}

/** Words that, right after a steps word, turn it round: "step-free", "step free", "marches libres". */
const STEP_FREE = /^[\s\-‐-―]*(free|less|libres?|sans)(?![\p{L}\p{N}])/iu;

/** True for "step-free" and the like: the steps word is there to say there are none. */
export function isStepFree(note: string, mention: TopicMention): boolean {
  return mention.topic === "steps" && STEP_FREE.test(note.slice(mention.end, mention.end + 12));
}

/** The uses of a word that count: not after "no", and not "step-free". */
export function standingMentions(entry: Pick<TopicEntry, "note" | "mentions">, topics: readonly TopicId[]): TopicMention[] {
  return entry.mentions.filter((m) => topics.includes(m.topic) && !m.negated && !isStepFree(entry.note, m));
}

export interface TagNoteRead {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly category: string | null;
  readonly address: string | null;
  readonly note: string;
  readonly kind: TagNoteKind;
  /** The words that make the reading, distinct, in the lexicon's order. */
  readonly topics: readonly TopicId[];
  /** The uses to mark in the note. */
  readonly mentions: readonly TopicMention[];
}

/** The reading for one note, or null. A tag has at most one rule, so there is never more than one. */
export function tagNoteFor(entry: TopicEntry): TagNoteRead | null {
  const rule = TAG_NOTE_RULES.find((r) => r.tags.includes(entry.tag));
  if (rule === undefined) return null;
  const mentions = standingMentions(entry, rule.topics);
  if (mentions.length === 0) return null;
  const topics = rule.topics.filter((id) => mentions.some((m) => m.topic === id));
  return { id: entry.id, name: entry.name, tag: entry.tag, category: entry.category, address: entry.address, note: entry.note, kind: rule.kind, topics, mentions };
}
