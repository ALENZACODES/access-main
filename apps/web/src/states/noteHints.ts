/**
 * Things in a note that make it harder to read, named so the person who keeps the note can see them.
 * It only points at the text as written. It never rewrites a note and never says what a note should say.
 */
import { LONG_SENTENCE_WORDS, readNote } from "./noteReadability";
import { splitSentences, tokensOf } from "./noteSentences";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type NoteHintKind = "long-sentence" | "long-word" | "all-caps" | "no-end-mark" | "many-numbers" | "semicolon-chain" | "short-forms";

export const HINT_KINDS: readonly NoteHintKind[] = ["long-sentence", "long-word", "all-caps", "no-end-mark", "many-numbers", "semicolon-chain", "short-forms"];

export interface NoteHint {
  readonly kind: NoteHintKind;
  /** The part of the note the hint is about, exactly as written; empty for a hint about the whole note. */
  readonly excerpt: string;
}

/** Short forms a reader may not know: kept to those that are not street types. */
const SHORT_FORMS = new Set(["w/c", "wc", "approx", "esp", "incl", "excl", "ent", "acc", "n/a", "tbc", "tbd", "asap", "fyi", "etc", "ctr"]);

const EXCERPT_MAX = 80;
const cut = (s: string): string => (s.length <= EXCERPT_MAX ? s : `${s.slice(0, EXCERPT_MAX - 1).trimEnd()}…`);

/** The hints for one note, in the order of HINT_KINDS and then of the text. A plain note has none. */
export function hintsFor(note: string | null, locale: Locale): NoteHint[] {
  if (note === null || note.trim() === "") return [];
  const out: NoteHint[] = [];
  const reading = readNote(note, locale);
  for (const s of reading.longSentences) out.push({ kind: "long-sentence", excerpt: cut(s.text) });
  for (const w of reading.longWords) out.push({ kind: "long-word", excerpt: w });

  const sentences = splitSentences(note);
  const tokens = sentences.flatMap((s) => tokensOf(s));
  const caps = tokens.filter((tk) => tk.kind === "word" && tk.text.length >= 4 && tk.text === tk.text.toUpperCase() && tk.text !== tk.text.toLowerCase());
  for (const c of caps) out.push({ kind: "all-caps", excerpt: c.text });

  if (!/[.!?…]["”’)\]]*\s*$/.test(note.trim()) && tokens.length >= 6) out.push({ kind: "no-end-mark", excerpt: "" });

  const numbers = tokens.filter((tk) => tk.kind === "number");
  if (numbers.length >= 3 && numbers.length * 3 >= tokens.length) out.push({ kind: "many-numbers", excerpt: "" });

  if ((note.match(/;/g) ?? []).length >= 3) out.push({ kind: "semicolon-chain", excerpt: "" });

  const seen = new Set<string>();
  for (const raw of note.split(/\s+/)) {
    const w = raw.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}/]+$/gu, "").replace(/\.$/, "");
    if (SHORT_FORMS.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push({ kind: "short-forms", excerpt: raw.replace(/^[^\p{L}]+|[^\p{L}/.]+$/gu, "") });
    }
  }
  const rank = (k: NoteHintKind): number => HINT_KINDS.indexOf(k);
  return out.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h.kind) - rank(b.h.kind) || a.i - b.i).map((x) => x.h);
}

export function hintText(hint: NoteHint, locale: Locale): string {
  const x = hint.excerpt;
  switch (hint.kind) {
    case "long-sentence":
      return t(locale, `A long sentence (over ${LONG_SENTENCE_WORDS} words): “${x}”`, `Une longue phrase (plus de ${LONG_SENTENCE_WORDS} mots)\u00a0: « ${x} »`);
    case "long-word":
      return t(locale, `A long word: “${x}”`, `Un mot long\u00a0: « ${x} »`);
    case "all-caps":
      return t(locale, `A word in capitals: “${x}”. Capitals can be harder to read.`, `Un mot en majuscules\u00a0: « ${x} ». Les majuscules peuvent être plus difficiles à lire.`);
    case "no-end-mark":
      return t(locale, "The note does not end with a full stop or similar mark.", "La note ne se termine pas par un point ou une marque semblable.");
    case "many-numbers":
      return t(locale, "A large share of the note is numbers.", "Une grande part de la note est faite de nombres.");
    case "semicolon-chain":
      return t(locale, "Several clauses are joined with semicolons.", "Plusieurs propositions sont reliées par des points-virgules.");
    case "short-forms":
      return t(locale, `A short form a reader may not know: “${x}”`, `Une abréviation que le lecteur ne connaît peut-être pas\u00a0: « ${x} »`);
  }
}
