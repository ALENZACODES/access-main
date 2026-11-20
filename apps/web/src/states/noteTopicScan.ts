/**
 * Finds where a note uses a topic word. The note is read as written; positions are positions in that
 * text, so a caller can mark the words without changing a single character of the note.
 */
import { foldText } from "./suggest";
import { CUE_TO_TOPIC, TOPIC_MAX_CUE_WORDS, TOPIC_NEGATION_REACH, TOPIC_NEGATORS, type TopicId } from "./noteTopicLexicon";

/** Notes are short; text past this is not read, never rejected. */
export const TOPIC_MAX_SCAN_CHARS = 5000;

export interface TopicWordSpan {
  readonly folded: string;
  readonly start: number;
  readonly end: number;
}

export interface TopicMention {
  readonly topic: TopicId;
  /** The folded cue that matched. */
  readonly cue: string;
  readonly start: number;
  readonly end: number;
  /** True when a word like "no" or "without" comes shortly before, in the same clause. */
  readonly negated: boolean;
}

/** The words of a text with their positions. Marks that follow a letter stay with it. */
export function topicWordSpans(text: string): TopicWordSpan[] {
  const spans: TopicWordSpan[] = [];
  for (const m of text.slice(0, TOPIC_MAX_SCAN_CHARS).matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const folded = foldText(m[0]);
    if (folded === "") continue;
    spans.push({ folded, start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/** Where a clause ends, so a negating word is not carried into the next one. */
const CLAUSE_BREAK = /[.,;:!?\n\r\u2013\u2014()]/;

function negatedBefore(text: string, spans: readonly TopicWordSpan[], at: number): boolean {
  for (let back = 1; back <= TOPIC_NEGATION_REACH && at - back >= 0; back++) {
    const prev = spans[at - back]!;
    const next = spans[at - back + 1]!;
    if (CLAUSE_BREAK.test(text.slice(prev.end, next.start))) return false;
    if (TOPIC_NEGATORS.has(prev.folded)) return true;
  }
  return false;
}

/**
 * Every use of a topic word, in reading order. The longest cue is tried first. No cue starts another (the lexicon test checks it), so the
 * order cannot change what is found. A word used by one cue is not used again.
 */
export function scanTopics(text: string): TopicMention[] {
  const spans = topicWordSpans(text);
  const found: TopicMention[] = [];
  let i = 0;
  while (i < spans.length) {
    let matched = 0;
    let topic: TopicId | undefined;
    let cue = "";
    for (let n = Math.min(TOPIC_MAX_CUE_WORDS, spans.length - i); n >= 1; n--) {
      const candidate = spans.slice(i, i + n).map((s) => s.folded).join(" ");
      const hit = CUE_TO_TOPIC.get(candidate);
      if (hit !== undefined) {
        matched = n;
        topic = hit;
        cue = candidate;
        break;
      }
    }
    if (topic === undefined) {
      i += 1;
      continue;
    }
    found.push({ topic, cue, start: spans[i]!.start, end: spans[i + matched - 1]!.end, negated: negatedBefore(text, spans, i) });
    i += matched;
  }
  return found;
}

export interface TopicMarkSegment {
  readonly text: string;
  readonly mention: TopicMention | null;
}

/** The note cut into pieces that join back to exactly the note, with the topic words set apart. */
export function topicMarkSegments(text: string, mentions: readonly TopicMention[]): TopicMarkSegment[] {
  const out: TopicMarkSegment[] = [];
  let at = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    if (m.start < at || m.end > text.length) continue;
    if (m.start > at) out.push({ text: text.slice(at, m.start), mention: null });
    out.push({ text: text.slice(m.start, m.end), mention: m });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mention: null });
  return out;
}
