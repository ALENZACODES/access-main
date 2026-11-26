import type { Draft } from "./schema";

/** Compare editable content, ignoring insertion order and missing optional properties. */
export function draftHasEdits(saved: Draft, current: Draft): boolean {
  if (current === saved) return false;
  if (
    saved.version !== current.version ||
    saved.tier !== current.tier ||
    saved.id !== current.id ||
    saved.kind !== current.kind ||
    saved.target !== current.target ||
    saved.observed !== current.observed ||
    saved.note !== current.note ||
    saved.event !== current.event
  ) return true;

  const fields = Object.keys(current.changes);
  if (Object.keys(saved.changes).length !== fields.length) return true;
  for (const key of fields) {
    if (!Object.hasOwn(saved.changes, key)) return true;
    const before = saved.changes[key];
    const after = current.changes[key];
    if (!before || !after || before.value !== after.value || before.unit !== after.unit) return true;
  }

  if (saved.photos.length !== current.photos.length) return true;
  return current.photos.some((photo, index) => {
    const original = saved.photos[index];
    return !original || original.id !== photo.id ||
      original.name !== photo.name ||
      original.mime !== photo.mime ||
      original.licence !== photo.licence;
  });
}

export class DraftConflictError extends Error {
  constructor() {
    super("The saved draft changed since it was opened.");
    this.name = "DraftConflictError";
  }
}
