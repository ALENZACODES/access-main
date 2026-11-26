import { validateDraft, type Draft } from "./schema";
import { contributions } from "./store";
import { draftHasEdits } from "./draftComparison";
import { readOwnedPhoto } from "./draftPhotos";
import { exportZip } from "./export";

/** Group only validated, saved observations. Case, accents and punctuation are part of the event name. */
export function groupEventDrafts(saved: readonly unknown[]): Map<string, Draft[]> {
  const groups = new Map<string, Draft[]>();
  for (const draft of saved) {
    if (!validateDraft(draft) || !draft.event?.trim()) continue;
    const group = groups.get(draft.event);
    if (group) group.push(draft);
    else groups.set(draft.event, [draft]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.observed.localeCompare(a.observed) || a.id.localeCompare(b.id));
  }
  return groups;
}

/** IndexedDB returns fresh objects even for rows that haven't changed. */
export function matchesReview(saved: Draft, reviewed: Draft | undefined): boolean {
  return reviewed !== undefined && !draftHasEdits(saved, reviewed);
}

export class EventReviewError extends Error {
  constructor(readonly reason: "changed" | "photo") {
    super(reason);
  }
}

export async function exportEventSelection(name: string, reviewed: readonly Draft[]): Promise<Blob> {
  if (!name.trim() || !reviewed.length || new Set(reviewed.map(draft => draft.id)).size !== reviewed.length) {
    throw new EventReviewError("changed");
  }

  // A second tab can reassign a draft, replace its contents or remove a photo
  // after the list appeared. Read the rows and their owned images in one snapshot.
  const snapshot = await contributions.transaction("r", contributions.drafts, contributions.photos, async () => {
    const rows = await contributions.drafts.bulkGet(reviewed.map(draft => draft.id));
    const drafts: Draft[] = [];
    const images = new Map<string, Map<string, Blob>>();
    for (const [index, row] of rows.entries()) {
      if (!validateDraft(row) || row.event !== name || !matchesReview(row, reviewed[index])) {
        throw new EventReviewError("changed");
      }
      const owned = new Map<string, Blob>();
      for (const photo of row.photos) {
        const bytes = await readOwnedPhoto(photo.id, row.id);
        if (!bytes) throw new EventReviewError("photo");
        owned.set(photo.id, bytes);
      }
      drafts.push(row);
      images.set(row.id, owned);
    }
    return { drafts, images };
  });

  // Encode outside the transaction. Reading Blob bytes can otherwise idle and
  // close the IndexedDB transaction between two images.
  return exportZip(snapshot.drafts, async (id, draftId) => snapshot.images.get(draftId)?.get(id));
}
