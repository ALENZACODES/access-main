/**
 * Words in a note that read as pointing toward access or toward a barrier. This only looks at the
 * words the note uses, as written: "no ramp" reads as a barrier word, "no steps" as an access word,
 * "step free" as an access word. It does not say what is true at the place. The page that uses it
 * says so, and never says which of a tag and a note is right.
 */
import { scanTopics, topicWordSpans, type TopicMention, type TopicWordSpan } from "./noteTopicScan";

export type SignalDirection = "access" | "barrier";

export interface NoteSignal {
  readonly direction: SignalDirection;
  /** The words as written in the note. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** The folded cue that produced it. */
  readonly cue: string;
}

/** Phrases that point one way whatever is around them. Folded: lower case, no accents, single spaces. */
const PHRASES: readonly { readonly cue: string; readonly direction: SignalDirection }[] = [
  { cue: "step free", direction: "access" },
  { cue: "stepfree", direction: "access" },
  { cue: "level entrance", direction: "access" },
  { cue: "level access", direction: "access" },
  { cue: "automatic door", direction: "access" },
  { cue: "automatic doors", direction: "access" },
  { cue: "wide door", direction: "access" },
  { cue: "wide doors", direction: "access" },
  { cue: "de plain pied", direction: "access" },
  { cue: "sans marche", direction: "access" },
  { cue: "sans marches", direction: "access" },
  { cue: "sans escalier", direction: "access" },
  { cue: "porte automatique", direction: "access" },
  { cue: "portes automatiques", direction: "access" },
  { cue: "stairs only", direction: "barrier" },
  { cue: "only stairs", direction: "barrier" },
  { cue: "steps only", direction: "barrier" },
  { cue: "not wheelchair", direction: "barrier" },
  { cue: "no wheelchair", direction: "barrier" },
  { cue: "inaccessible", direction: "barrier" },
  { cue: "escaliers seulement", direction: "barrier" },
  { cue: "escalier seulement", direction: "barrier" },
  { cue: "seulement des escaliers", direction: "barrier" },
  { cue: "pas de fauteuil roulant", direction: "barrier" },
];

const MAX_PHRASE_WORDS = Math.max(...PHRASES.map((p) => p.cue.split(" ").length));
const PHRASE_MAP = new Map(PHRASES.map((p) => [p.cue, p.direction] as const));

/** Topics whose words point toward access when plainly used, and toward a barrier when negated. */
const ACCESS_WHEN_PLAIN: ReadonlySet<TopicMention["topic"]> = new Set(["ramp", "lift"]);
/** Topics whose words point toward a barrier when plainly used, and toward access when negated. */
const BARRIER_WHEN_PLAIN: ReadonlySet<TopicMention["topic"]> = new Set(["steps"]);
/** Width cues: wide points toward access, narrow and tight toward a barrier. Negation turns them round. */
const WIDE = new Set(["wide", "width", "widths", "largeur"]);
const NARROW = new Set(["narrow", "tight", "etroit", "etroite", "etroits", "etroites"]);

function fromMention(text: string, m: TopicMention): NoteSignal | null {
  let direction: SignalDirection | null = null;
  if (ACCESS_WHEN_PLAIN.has(m.topic)) direction = m.negated ? "barrier" : "access";
  else if (BARRIER_WHEN_PLAIN.has(m.topic)) direction = m.negated ? "access" : "barrier";
  else if (m.topic === "width") {
    if (NARROW.has(m.cue)) direction = m.negated ? "access" : "barrier";
    else if (m.cue === "wide") direction = m.negated ? "barrier" : "access";
    // "width" alone says nothing about which way.
    else if (WIDE.has(m.cue)) direction = null;
  }
  return direction === null ? null : { direction, text: text.slice(m.start, m.end), start: m.start, end: m.end, cue: m.cue };
}

function phraseSignals(text: string, spans: readonly TopicWordSpan[]): NoteSignal[] {
  const out: NoteSignal[] = [];
  let i = 0;
  while (i < spans.length) {
    let hit = 0;
    let direction: SignalDirection | undefined;
    let cue = "";
    for (let n = Math.min(MAX_PHRASE_WORDS, spans.length - i); n >= 1; n -= 1) {
      const candidate = spans.slice(i, i + n).map((s) => s.folded).join(" ");
      const d = PHRASE_MAP.get(candidate);
      if (d !== undefined) {
        hit = n;
        direction = d;
        cue = candidate;
        break;
      }
    }
    if (direction === undefined) {
      i += 1;
      continue;
    }
    const start = spans[i]!.start;
    const end = spans[i + hit - 1]!.end;
    out.push({ direction, text: text.slice(start, end), start, end, cue });
    i += hit;
  }
  return out;
}

/** True when a signal lies inside another's span. */
const inside = (a: NoteSignal, b: NoteSignal): boolean => a.start >= b.start && a.end <= b.end && (a.start !== b.start || a.end !== b.end);

/** Every access or barrier word in a note, in reading order. A word inside a longer phrase is not counted twice. */
export function scanSignals(note: string | null): NoteSignal[] {
  if (note === null || note.trim() === "") return [];
  const spans = topicWordSpans(note);
  const phrases = phraseSignals(note, spans);
  const words = scanTopics(note).map((m) => fromMention(note, m)).filter((s): s is NoteSignal => s !== null);
  const kept = words.filter((w) => !phrases.some((p) => inside(w, p) || (w.start >= p.start && w.end <= p.end)));
  return [...phrases, ...kept].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function countByDirection(signals: readonly NoteSignal[]): { access: number; barrier: number } {
  let access = 0;
  let barrier = 0;
  for (const s of signals) {
    if (s.direction === "access") access += 1;
    else barrier += 1;
  }
  return { access, barrier };
}
