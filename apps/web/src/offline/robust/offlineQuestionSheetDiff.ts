import type { Language, RegionManifest } from "./regionDownload";
import type { QuestionSheet, SheetItem } from "./offlineQuestionSheet";
import { encodeQuestionSheet } from "./offlineQuestionSheet";

export type SheetChangeKind = "added" | "removed" | "question-changed" | "reply-changed" | "note-changed" | "priority-changed" | "moved" | "unchanged";
export interface QuestionChange {
  readonly id: string;
  readonly kind: SheetChangeKind;
  readonly oldPosition: number | null;
  readonly newPosition: number | null;
  readonly oldQuestion: string | null;
  readonly newQuestion: string | null;
  readonly oldReply: string | null;
  readonly newReply: string | null;
  readonly notesAffected: boolean;
}
export interface SheetDiff {
  readonly status: "ready" | "UNKNOWN";
  readonly oldCount: number;
  readonly newCount: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly moved: number;
  readonly noteChanges: number;
  readonly replyChanges: number;
  readonly unchanged: number;
  readonly entries: readonly QuestionChange[];
}
function row(id: string, kind: SheetChangeKind, oldItem: SheetItem | undefined, newItem: SheetItem | undefined): QuestionChange {
  return { id, kind, oldPosition: oldItem?.position ?? null, newPosition: newItem?.position ?? null,
    oldQuestion: oldItem?.question ?? null, newQuestion: newItem?.question ?? null,
    oldReply: oldItem?.replyText ?? null, newReply: newItem?.replyText ?? null,
    notesAffected: oldItem !== undefined && (newItem === undefined || oldItem.note !== newItem.note) };
}
/** The preview describes only user notes and their order, never an accessibility assessment. */
export function compareQuestionSheets(current: QuestionSheet, incoming: QuestionSheet, manifest: RegionManifest): SheetDiff {
  // Validate both complete documents before presenting a preview or allowing replacement.
  encodeQuestionSheet(current, manifest);
  encodeQuestionSheet(incoming, manifest);
  if (current.regionId !== incoming.regionId) throw new TypeError("Region mismatch");
  const previous = new Map(current.items.map((item) => [item.id, item]));
  const future = new Map(incoming.items.map((item) => [item.id, item]));
  const entries: QuestionChange[] = [];
  let added = 0, removed = 0, changed = 0, moved = 0, noteChanges = 0, replyChanges = 0, unchanged = 0;
  for (const next of incoming.items) {
    const old = previous.get(next.id);
    if (!old) { added++; entries.push(row(next.id, "added", undefined, next)); continue; }
    const questionChanged = old.question !== next.question || old.cellId !== next.cellId || old.category !== next.category;
    const replyChanged = old.reply !== next.reply || old.replyText !== next.replyText;
    const noteChanged = old.note !== next.note;
    const priorityChanged = old.priority !== next.priority;
    const positionChanged = old.position !== next.position;
    if (replyChanged) replyChanges++;
    if (noteChanged) noteChanges++;
    if (positionChanged) moved++;
    if (questionChanged || replyChanged || noteChanged || priorityChanged) changed++;
    else if (!positionChanged) unchanged++;
    const kind: SheetChangeKind = questionChanged ? "question-changed" : replyChanged ? "reply-changed" :
      noteChanged ? "note-changed" : priorityChanged ? "priority-changed" : positionChanged ? "moved" : "unchanged";
    entries.push(row(next.id, kind, old, next));
  }
  for (const old of current.items) {
    if (future.has(old.id)) continue;
    removed++;
    if (old.note) noteChanges++;
    if (old.reply !== "not-asked" || old.replyText) replyChanges++;
    entries.push(row(old.id, "removed", old, undefined));
  }
  return { status: "ready", oldCount: current.items.length, newCount: incoming.items.length,
    added, removed, changed, moved, noteChanges, replyChanges, unchanged, entries };
}
export interface SheetPreviewOptions { readonly filter: "all" | "changed" | "notes"; readonly offset: number; readonly limit: number }
export function pageSheetDiff(diff: SheetDiff, options: SheetPreviewOptions): { readonly entries: readonly QuestionChange[]; readonly total: number; readonly more: boolean } {
  if (!Number.isSafeInteger(options.offset) || options.offset < 0 || !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new RangeError("Invalid preview page");
  const entries = diff.entries.filter((value) => {
    if (options.filter === "all") return true;
    if (options.filter === "notes") return value.notesAffected || value.kind === "reply-changed" || value.kind === "removed";
    return options.filter === "changed" && value.kind !== "unchanged";
  });
  return { entries: entries.slice(options.offset, options.offset + options.limit), total: entries.length, more: options.offset + options.limit < entries.length };
}
export const SHEET_DIFF_COPY = {
  en: { heading: "Backup changes", added: "Questions added", removed: "Questions removed", changed: "Questions edited", moved: "Reordered", notes: "Private notes affected",
    replies: "Reply records affected", warning: "These changes replace user-entered information only. They do not establish physical accessibility.",
    kind: { added: "Added", removed: "Removed", "question-changed": "Question changed", "reply-changed": "Reply record changed",
      "note-changed": "Personal note changed", "priority-changed": "Importance changed", moved: "Reordered", unchanged: "Unchanged" } },
  fr: { heading: "Modifications de la copie", added: "Questions ajoutées", removed: "Questions retirées", changed: "Questions modifiées", moved: "Ordre modifié", notes: "Notes privées touchées",
    replies: "Réponses notées touchées", warning: "Ces modifications remplacent seulement les notes saisies. Elles ne prouvent pas l’accessibilité physique.",
    kind: { added: "Ajoutée", removed: "Retirée", "question-changed": "Question modifiée", "reply-changed": "Réponse notée modifiée",
      "note-changed": "Note personnelle modifiée", "priority-changed": "Importance modifiée", moved: "Ordre modifié", unchanged: "Inchangée" } },
} as const;
export function questionSheetDiffText(diff: SheetDiff, language: Language): string {
  const c = SHEET_DIFF_COPY[language];
  const sep = language === "fr" ? "\u00a0: " : ": ";
  return [c.heading, c.warning, `${c.added}${sep}${diff.added}`, `${c.removed}${sep}${diff.removed}`,
    `${c.changed}${sep}${diff.changed}`, `${c.moved}${sep}${diff.moved}`,
    `${c.notes}${sep}${diff.noteChanges}`, `${c.replies}${sep}${diff.replyChanges}`,
    ...diff.entries.map((entry) => `${c.kind[entry.kind]} (${entry.id}) ${entry.newQuestion ?? entry.oldQuestion ?? "UNKNOWN"}`), ""].join("\n");
}
