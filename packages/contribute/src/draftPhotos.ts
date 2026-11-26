import { DraftConflictError, draftHasEdits } from "./draftComparison";
import { assertDraft, type Draft } from "./schema";
import { contributions, type SavedPhoto } from "./store";

/** A photo ID in imported JSON is a reference, never permission to read another draft. */
export async function readOwnedPhoto(id: string, draftId: string): Promise<Blob | undefined> {
  const row = await contributions.photos.get(id);
  return row?.draftId === draftId ? row.data : undefined;
}

async function prunePhotos(draftId: string, keep: Set<string>): Promise<void> {
  const owned = await contributions.photos.where("draftId").equals(draftId).primaryKeys();
  const removed = owned.filter(id => !keep.has(id));
  if (removed.length) await contributions.photos.bulkDelete(removed);
}

/** The draft and its referenced bytes share a commit, including removals. */
export async function saveDraftWithPhotos(
  draft: Draft,
  staged: ReadonlyMap<string, SavedPhoto>,
  expected?: Draft | null,
): Promise<void> {
  assertDraft(draft);
  await contributions.transaction("rw", contributions.drafts, contributions.photos, async () => {
    if (expected !== undefined) {
      const saved = await contributions.drafts.get(draft.id);
      if (expected === null ? saved !== undefined : !saved || draftHasEdits(expected, saved)) {
        throw new DraftConflictError();
      }
    }
    const ids = new Set(draft.photos.map(photo => photo.id));
    const rows = await contributions.photos.bulkGet([...ids]);
    const existing = new Map(rows.flatMap(row => row ? [[row.id, row] as const] : []));
    const additions: SavedPhoto[] = [];
    for (const id of ids) {
      const pending = staged.get(id);
      if (pending) {
        if (pending.id !== id || pending.draftId !== draft.id || pending.data.type !== "image/jpeg") {
          throw new Error("Invalid staged photo");
        }
        // add(), rather than put(), ensures even an ID collision cannot replace an existing image.
        additions.push(pending);
      } else if (existing.get(id)?.draftId !== draft.id) {
        throw new Error("A referenced photo is unavailable. Remove it before saving.");
      }
    }
    if (additions.length) await contributions.photos.bulkAdd(additions);
    await prunePhotos(draft.id, ids);
    await contributions.drafts.put(draft);
  });
}

/** Replace matching drafts using only bytes already saved for that same draft. */
export async function importDraftsWithPhotos(input: Draft[]): Promise<Draft[]> {
  input.forEach(assertDraft);
  // As with bulkPut, the last entry for a repeated draft ID is the replacement.
  const replacements = new Map(input.map(draft => [draft.id, draft]));
  return contributions.transaction("rw", contributions.drafts, contributions.photos, async () => {
    const saved: Draft[] = [];
    for (const draft of replacements.values()) {
      const owned = new Set(await contributions.photos.where("draftId").equals(draft.id).primaryKeys());
      const previous = await contributions.drafts.get(draft.id);
      const referenced = new Set(previous?.photos.map(photo => photo.id));
      const photos = draft.photos.filter(photo => referenced.has(photo.id) && owned.has(photo.id));
      const keep = new Set(photos.map(photo => photo.id));
      await contributions.photos.bulkDelete([...owned].filter(id => !keep.has(id)));
      saved.push({ ...draft, photos });
    }
    await contributions.drafts.bulkPut(saved);
    return saved;
  });
}
