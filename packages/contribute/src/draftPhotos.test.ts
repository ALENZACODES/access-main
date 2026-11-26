import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DraftConflictError } from "./draftComparison";
import { importDraftsWithPhotos, readOwnedPhoto, saveDraftWithPhotos } from "./draftPhotos";
import { exportZip, parseImport, toGeoJSON } from "./export";
import { makeDraft, type Draft, type PhotoReference } from "./schema";
import { contributions, deleteDraft, type SavedPhoto } from "./store";

function ready(note = ""): Draft {
  return { ...makeDraft(), changes: { ramp: { value: true } }, note };
}

function reference(id: string): PhotoReference {
  return { id, name: `${id}.jpg`, mime: "image/jpeg", licence: "CC BY 4.0" };
}

function bytes(id: string, draftId: string, content = id): SavedPhoto {
  return { id, draftId, data: new Blob([content], { type: "image/jpeg" }) };
}

function stage(...rows: SavedPhoto[]) {
  return new Map(rows.map(row => [row.id, row]));
}

async function savedWith(...ids: string[]): Promise<Draft> {
  const draft = ready("before");
  draft.photos = ids.map(reference);
  await saveDraftWithPhotos(draft, stage(...ids.map(id => bytes(id, draft.id))));
  return draft;
}

afterEach(async () => {
  await contributions.transaction("rw", contributions.photos, contributions.drafts, async () => {
    await contributions.photos.clear();
    await contributions.drafts.clear();
  });
});

describe("draft photo commits", () => {
  it("stores each referenced staging row and ignores a selection removed before Save", async () => {
    const draft = ready();
    draft.photos = [reference("kept")];
    const pending = stage(bytes("kept", draft.id), bytes("discarded", draft.id));

    await saveDraftWithPhotos(draft, pending);

    expect(await contributions.drafts.get(draft.id)).toEqual(draft);
    expect(await contributions.photos.toCollection().primaryKeys()).toEqual(["kept"]);
    expect(await (await readOwnedPhoto("kept", draft.id))?.text()).toBe("kept");
    expect(await readOwnedPhoto("kept", "different-draft")).toBeUndefined();
  });

  it("does not commit bytes or an incomplete draft when validation fails", async () => {
    const draft = makeDraft();
    draft.photos = [reference("new-photo")];

    await expect(saveDraftWithPhotos(draft, stage(bytes("new-photo", draft.id)))).rejects.toThrow();
    expect(await contributions.photos.count()).toBe(0);
    expect(await contributions.drafts.count()).toBe(0);
  });

  it("adds new images, keeps existing bytes, and removes only this draft's discarded images", async () => {
    const first = await savedWith("entrance", "lift");
    const other = await savedWith("toilet");
    const revised = {
      ...first,
      photos: [reference("lift"), reference("pavement")],
      note: "Follow-up visit",
    };

    await saveDraftWithPhotos(revised, stage(bytes("pavement", revised.id)));
    await saveDraftWithPhotos(revised, stage());

    expect(await contributions.drafts.get(first.id)).toEqual(revised);
    expect(await contributions.drafts.get(other.id)).toEqual(other);
    expect(await contributions.photos.toCollection().primaryKeys()).toEqual(["lift", "pavement", "toilet"]);
    expect(await (await readOwnedPhoto("lift", first.id))?.text()).toBe("lift");
    expect(await (await readOwnedPhoto("toilet", other.id))?.text()).toBe("toilet");
  });

  it("rolls back the whole batch if a new ID collides after another insert succeeds", async () => {
    const owner = await savedWith("owned");
    const first = await savedWith("original");
    const revised = { ...first, photos: [reference("brand-new"), reference("owned")] };

    await expect(saveDraftWithPhotos(revised, stage(
      bytes("brand-new", first.id),
      bytes("owned", first.id, "accidental collision"),
    ))).rejects.toThrow();

    expect(await contributions.drafts.get(first.id)).toEqual(first);
    expect(await contributions.photos.get("brand-new")).toBeUndefined();
    expect(await readOwnedPhoto("original", first.id)).toBeDefined();
    expect(await (await readOwnedPhoto("owned", owner.id))?.text()).toBe("owned");
  });

  it("can recover a legacy draft whose referenced bytes disappeared", async () => {
    const draft = await savedWith("available");
    const damaged = { ...draft, photos: [...draft.photos, reference("missing")] };
    await contributions.drafts.put(damaged);
    const editing = { ...damaged, note: "Corrected description" };

    await expect(saveDraftWithPhotos(editing, stage())).rejects.toThrow(/unavailable/);
    expect(await contributions.drafts.get(draft.id)).toEqual(damaged);

    const repaired = { ...editing, photos: [reference("available")] };
    await saveDraftWithPhotos(repaired, stage());
    expect(await contributions.drafts.get(draft.id)).toEqual(repaired);
    expect(await readOwnedPhoto("available", draft.id)).toBeDefined();
  });

  it("rejects a reference to another draft even when the ID exists locally", async () => {
    const owner = await savedWith("private");
    const borrower = ready();
    borrower.photos = owner.photos;

    await expect(saveDraftWithPhotos(borrower, stage())).rejects.toThrow(/unavailable/);
    await expect(exportZip([borrower], readOwnedPhoto)).rejects.toThrow(/Missing photo/);
    expect(await contributions.drafts.get(borrower.id)).toBeUndefined();
    expect(await readOwnedPhoto("private", owner.id)).toBeDefined();
  });

  it("rejects cross-draft staging entries before a save can persist them", async () => {
    const draft = ready();
    draft.photos = [reference("step")];
    const wrong = bytes("step", "old-editor-session");

    await expect(saveDraftWithPhotos(draft, stage(wrong))).rejects.toThrow(/staged photo/);
    expect(await contributions.photos.count()).toBe(0);
    expect(await contributions.drafts.count()).toBe(0);
  });

  it("rejects mismatched staging keys and unsanitized blob types", async () => {
    const draft = ready();
    draft.photos = [reference("stairs")];
    const mislabeled = new Map([["stairs", bytes("ramp", draft.id)]]);
    const unprocessed = stage({ ...bytes("stairs", draft.id), data: new Blob(["raw"], { type: "image/png" }) });

    await expect(saveDraftWithPhotos(draft, mislabeled)).rejects.toThrow(/staged photo/);
    await expect(saveDraftWithPhotos(draft, unprocessed)).rejects.toThrow(/staged photo/);
    expect(await contributions.photos.count()).toBe(0);
    expect(await contributions.drafts.count()).toBe(0);
  });

  it("allows deleting a draft containing a legacy foreign reference without deleting that photo", async () => {
    const owner = await savedWith("kept");
    const broken = await savedWith("own");
    await contributions.drafts.put({ ...broken, photos: [...broken.photos, ...owner.photos] });

    await deleteDraft(broken.id);

    expect(await contributions.photos.get("own")).toBeUndefined();
    expect(await contributions.drafts.get(broken.id)).toBeUndefined();
    expect(await readOwnedPhoto("kept", owner.id)).toBeDefined();
  });
});

describe("reconciling imported photo references", () => {
  it("retains only owned, present bytes during a GeoJSON replacement and prunes old bytes", async () => {
    const original = await savedWith("replace", "retain");
    const neighbor = await savedWith("neighbor");
    const replacement = {
      ...original,
      note: "Revised after visit",
      photos: [reference("absent"), reference("neighbor"), reference("retain")],
    };
    const imported = parseImport(toGeoJSON([replacement]));

    const result = await importDraftsWithPhotos(imported);

    expect(result).toEqual([{ ...replacement, photos: [reference("retain")] }]);
    expect(await contributions.drafts.get(original.id)).toEqual(result[0]);
    expect(await contributions.photos.get("replace")).toBeUndefined();
    expect(await readOwnedPhoto("neighbor", neighbor.id)).toBeDefined();
    expect(await readOwnedPhoto("retain", original.id)).toBeDefined();
    expect(imported[0]?.photos).toHaveLength(3);
  });

  it("uses the final duplicate ID before pruning, preserving photos in the winning revision", async () => {
    const original = await savedWith("final");
    const first = { ...original, note: "superseded", photos: [] };
    const last = { ...original, note: "chosen revision" };

    const result = await importDraftsWithPhotos([first, last]);

    expect(result).toEqual([last]);
    expect(await contributions.drafts.get(original.id)).toEqual(last);
    expect(await readOwnedPhoto("final", original.id)).toBeDefined();
  });

  it("keeps earlier records intact when a later imported draft is invalid", async () => {
    const original = await savedWith("arch");
    const invalid = { ...ready(), changes: {} };
    const replacement = { ...original, photos: [], note: "never committed" };

    await expect(importDraftsWithPhotos([replacement, invalid])).rejects.toThrow();
    expect(await contributions.drafts.get(original.id)).toEqual(original);
    expect(await readOwnedPhoto("arch", original.id)).toBeDefined();
    expect(await contributions.drafts.get(invalid.id)).toBeUndefined();
  });

  it("drops detached legacy bytes owned by a replaced draft", async () => {
    const draft = await savedWith("selected");
    await contributions.photos.put(bytes("old-detached", draft.id));

    const [replaced] = await importDraftsWithPhotos([{
      ...draft,
      photos: [...draft.photos, reference("old-detached")],
    }]);

    expect(replaced?.photos).toEqual(draft.photos);
    expect(await contributions.photos.get("old-detached")).toBeUndefined();
    expect(await readOwnedPhoto("selected", draft.id)).toBeDefined();
  });

  it("does not transfer bytes between two drafts imported in the same batch", async () => {
    const left = await savedWith("west");
    const right = await savedWith("east");
    const leftReplacement = { ...left, photos: [reference("east"), reference("west")] };
    const rightReplacement = { ...right, photos: [reference("west"), reference("east")] };

    const results = await importDraftsWithPhotos([leftReplacement, rightReplacement]);

    expect(results).toEqual([left, right]);
    expect(await contributions.drafts.get(left.id)).toEqual(left);
    expect(await contributions.drafts.get(right.id)).toEqual(right);
    expect(await readOwnedPhoto("west", right.id)).toBeUndefined();
    expect(await readOwnedPhoto("east", left.id)).toBeUndefined();
  });
});


describe("competing edits to the same local draft", () => {
  it("detects a newly occupied draft ID before writing any staged bytes", async () => {
    const first = await savedWith("existing");
    const incoming = { ...first, note: "Different tab", photos: [reference("pending")] };

    await expect(saveDraftWithPhotos(incoming, stage(bytes("pending", first.id)), null))
      .rejects.toBeInstanceOf(DraftConflictError);

    expect(await contributions.drafts.get(first.id)).toEqual(first);
    expect(await contributions.photos.get("pending")).toBeUndefined();
    expect(await readOwnedPhoto("existing", first.id)).toBeDefined();
  });

  it("serializes simultaneous saves and preserves the first committed draft and photos", async () => {
    const original = ready();
    await saveDraftWithPhotos(original, stage(), null);
    const left = { ...original, photos: [reference("left")], note: "West side" };
    const right = { ...original, photos: [reference("right")], note: "East side" };

    const attempts = await Promise.allSettled([
      saveDraftWithPhotos(left, stage(bytes("left", original.id)), original),
      saveDraftWithPhotos(right, stage(bytes("right", original.id)), original),
    ]);

    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = attempts.find(result => result.status === "rejected");
    expect(failure?.reason).toBeInstanceOf(DraftConflictError);
    const winner = attempts[0]?.status === "fulfilled" ? left : right;
    expect(await contributions.drafts.get(original.id)).toEqual(winner);
    expect(await contributions.photos.toCollection().primaryKeys()).toEqual(winner.photos.map(photo => photo.id));
  });

  it("does not recreate a draft deleted in another tab while a revision was pending", async () => {
    const original = await savedWith("before-delete");
    await deleteDraft(original.id);
    const edited = { ...original, photos: [reference("late")] };

    await expect(saveDraftWithPhotos(edited, stage(bytes("late", original.id)), original))
      .rejects.toBeInstanceOf(DraftConflictError);

    expect(await contributions.drafts.count()).toBe(0);
    expect(await contributions.photos.count()).toBe(0);
  });
});
