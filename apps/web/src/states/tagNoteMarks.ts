/** The note cut into pieces that join back to exactly the note, with the access and barrier words set apart. */
import type { NoteSignal } from "./tagNoteSignals";

export interface MarkPiece {
  readonly text: string;
  readonly signal: NoteSignal | null;
}

export function markPieces(note: string, signals: readonly NoteSignal[]): MarkPiece[] {
  const out: MarkPiece[] = [];
  let at = 0;
  for (const s of [...signals].sort((a, b) => a.start - b.start)) {
    if (s.start < at || s.end > note.length) continue;
    if (s.start > at) out.push({ text: note.slice(at, s.start), signal: null });
    out.push({ text: note.slice(s.start, s.end), signal: s });
    at = s.end;
  }
  if (at < note.length) out.push({ text: note.slice(at), signal: null });
  return out;
}
