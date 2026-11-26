import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Draft, Licence, PhotoReference } from "../../../../packages/contribute/src/schema";
import type { SavedPhoto } from "../../../../packages/contribute/src/store";
import { readOwnedPhoto, saveDraftWithPhotos } from "../../../../packages/contribute/src/draftPhotos";
import { sanitisePhoto } from "../../../../packages/contribute/src/photos";

export const photoCopy = {
  en: {
    count: "Photos in this draft",
    pending: "Preparing photos…",
    ready: "Photos ready. Save the draft to keep them on this device.",
    limit: "A draft can contain up to 20 photos.",
    invalid: "Could not prepare these photos. Choose images of 20 MB or less and try again.",
  },
  fr: {
    count: "Photos dans ce brouillon",
    pending: "Préparation des photos…",
    ready: "Photos prêtes. Enregistrez le brouillon pour les conserver sur cet appareil.",
    limit: "Un brouillon peut contenir jusqu’à 20 photos.",
    invalid: "Impossible de préparer ces photos. Choisissez des images de 20 Mo ou moins et réessayez.",
  },
} as const;

export function useDraftPhotos(
  draft: Draft,
  setDraft: Dispatch<SetStateAction<Draft>>,
  locale: keyof typeof photoCopy,
  setStatus: (message: string) => void,
) {
  const session = useRef({ busy: false, staged: new Map<string, SavedPhoto>() });
  const [processing, setProcessing] = useState(false);
  const words = photoCopy[locale];

  function invalidate() {
    session.current.staged.clear();
    session.current = { busy: false, staged: new Map() };
  }
  useEffect(() => invalidate, []);

  function reset() {
    invalidate();
    setProcessing(false);
  }

  async function add(files: File[], licence: Licence): Promise<void> {
    const current = session.current;
    if (current.busy || files.length === 0) return;
    if (draft.photos.length + files.length > 20) {
      setStatus(words.limit);
      return;
    }
    current.busy = true;
    setProcessing(true);
    setStatus(words.pending);
    try {
      const prepared: Array<{ ref: PhotoReference; row: SavedPhoto }> = [];
      for (const file of files) {
        const data = await sanitisePhoto(file);
        if (session.current !== current) return;
        const id = crypto.randomUUID();
        const name = file.name.slice(0, 200) || `${id}.jpg`;
        prepared.push({
          ref: { id, name, licence, mime: "image/jpeg" },
          row: { id, draftId: draft.id, data },
        });
      }
      for (const { row } of prepared) current.staged.set(row.id, row);
      const refs = prepared.map(photo => photo.ref);
      setDraft(latest => latest.id === draft.id && session.current === current
        ? { ...latest, photos: [...latest.photos, ...refs] }
        : latest);
      setStatus(words.ready);
    } catch {
      // The batch is all-or-nothing; the input can immediately retry the same selection.
      if (session.current === current) setStatus(words.invalid);
    } finally {
      if (session.current === current) {
        current.busy = false;
        setProcessing(false);
      }
    }
  }

  function remove(id: string) {
    session.current.staged.delete(id);
    setDraft(latest => latest.id === draft.id
      ? { ...latest, photos: latest.photos.filter(photo => photo.id !== id) }
      : latest);
  }

  async function save(snapshot: Draft, expected?: Draft | null) {
    const current = session.current;
    if (current.busy) throw new Error(words.pending);
    await saveDraftWithPhotos(snapshot, new Map(current.staged), expected);
    // A save may finish after the editor has started another draft or added more photos.
    for (const photo of snapshot.photos) current.staged.delete(photo.id);
  }

  async function read(id: string, draftId: string) {
    const pending = session.current.staged.get(id);
    return pending?.draftId === draftId ? pending.data : readOwnedPhoto(id, draftId);
  }

  return { processing, reset, add, remove, save, read };
}
