import Dexie, { type EntityTable } from "dexie";
import type { Draft } from "./schema";

export interface SavedPhoto { id: string; draftId: string; data: Blob }
class ContributionsDB extends Dexie {
  drafts!: EntityTable<Draft, "id">;
  photos!: EntityTable<SavedPhoto, "id">;
  constructor() {
    super("access-contributions-local");
    this.version(1).stores({ drafts: "id, event, observed", photos: "id, draftId" });
  }
}
export const contributions = new ContributionsDB();

export async function deleteDraft(id: string): Promise<void> {
  await contributions.transaction("rw", contributions.drafts, contributions.photos, async () => {
    await contributions.photos.where("draftId").equals(id).delete();
    await contributions.drafts.delete(id);
  });
}
