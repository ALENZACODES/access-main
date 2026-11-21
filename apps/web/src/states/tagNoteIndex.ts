/** Builds the list of readings for the places given, with counts. Reads the notes; changes nothing. */
import { buildTopicIndex } from "./noteTopicIndex";
import type { PackPlaceRecord } from "./packPlaces";
import { TAG_NOTE_KINDS, type TagNoteKind, type TagNoteRead, tagNoteFor } from "./tagNoteRules";

export interface TagNoteIndex {
  /** In the order of the places given. */
  readonly reads: readonly TagNoteRead[];
  /** Places with a note. */
  readonly withNote: number;
  readonly byKind: Readonly<Record<TagNoteKind, number>>;
}

export function buildTagNoteIndex(places: readonly PackPlaceRecord[]): TagNoteIndex {
  const topics = buildTopicIndex(places);
  const reads: TagNoteRead[] = [];
  const byKind: Record<TagNoteKind, number> = { "yes-steps": 0, "no-ramp-lift": 0, "unknown-words": 0 };
  for (const entry of topics.entries) {
    const read = tagNoteFor(entry);
    if (read === null) continue;
    reads.push(read);
    byKind[read.kind] += 1;
  }
  return { reads, withNote: topics.withNote, byKind };
}

export const TAG_NOTE_ORDERS = ["name", "kind"] as const;
export type TagNoteOrder = (typeof TAG_NOTE_ORDERS)[number];
export const DEFAULT_TAG_NOTE_ORDER: TagNoteOrder = "name";

export function isTagNoteOrder(value: unknown): value is TagNoteOrder {
  return typeof value === "string" && (TAG_NOTE_ORDERS as readonly string[]).includes(value);
}

const byName = (a: TagNoteRead, b: TagNoteRead): number => {
  // A place with no name goes last, and ties go by id, so the order never depends on the pack's order.
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const an = (a.name ?? "").toLowerCase();
  const bn = (b.name ?? "").toLowerCase();
  return an < bn ? -1 : an > bn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** The reads for one kind (all when null), put in order. The reads themselves are not changed. */
export function shownTagNotes(reads: readonly TagNoteRead[], kind: TagNoteKind | null, order: TagNoteOrder): TagNoteRead[] {
  const kept = kind === null ? [...reads] : reads.filter((r) => r.kind === kind);
  return kept.sort((a, b) => (order === "kind" ? TAG_NOTE_KINDS.indexOf(a.kind) - TAG_NOTE_KINDS.indexOf(b.kind) || byName(a, b) : byName(a, b)));
}
