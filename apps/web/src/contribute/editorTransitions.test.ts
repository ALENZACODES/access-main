import { describe, expect, it } from "vitest";
import { COMMUNITY_TIER, type Draft } from "../../../../packages/contribute/src/schema";
import { deletionMessage, draftHasEdits, transitionPrompt, type EditorAction } from "./editorTransitions";

function savedDraft(): Draft {
  return {
    id: "visit-1",
    version: 1,
    kind: "audit",
    target: "North library",
    observed: "2024-05-02",
    event: "Weekend survey",
    tier: COMMUNITY_TIER,
    note: "Measured from the inside",
    changes: {
      door_width: { value: 81, unit: "cm" },
      intercom: { value: false },
    },
    photos: [
      { id: "interior", name: "Interior.jpg", licence: "CC BY 4.0", mime: "image/jpeg" },
      { id: "exterior", name: "Exterior.jpg", licence: "CC BY-SA 4.0", mime: "image/jpeg" },
    ],
  };
}

describe("unsaved contribution detection", () => {
  it("recognizes a reloaded copy even if its fields and properties were serialized in another order", () => {
    const original = savedDraft();
    const reloaded = structuredClone(original);
    reloaded.changes = { intercom: { value: false }, door_width: { unit: "cm", value: 81 } };
    expect(draftHasEdits(original, reloaded)).toBe(false);
  });

  it("treats an optional event that was entered and cleared as absent", () => {
    const original = savedDraft();
    delete original.event;
    expect(draftHasEdits(original, { ...original, event: undefined })).toBe(false);
  });

  it("detects edits to each item of visit metadata even when the draft is temporarily invalid", () => {
    const original = savedDraft();
    const edits: Partial<Draft>[] = [
      { id: "another visit" },
      { kind: "correction" },
      { target: "" },
      { observed: "" },
      { event: undefined },
      { note: "" },
    ];
    for (const edit of edits) {
      expect(draftHasEdits(original, { ...original, ...edit })).toBe(true);
    }
  });

  it("detects field changes that preserve the number of observations", () => {
    const original = savedDraft();
    const { intercom } = original.changes;
    if (!intercom) throw new Error("Missing intercom observation");
    const alternatives: Draft["changes"][] = [
      { intercom, door_width: { value: "81", unit: "cm" } },
      { intercom, door_width: { value: 81 } },
      { intercom, rear_door: { value: 81, unit: "cm" } },
      { door_width: { value: 81, unit: "cm" } },
    ];
    for (const changes of alternatives) {
      expect(draftHasEdits(original, { ...original, changes })).toBe(true);
    }
  });

  it("recognizes observations whose keys also exist on the Object prototype", () => {
    const saved = { ...savedDraft(), changes: { constructor: { value: "north" } } };
    const copy = { ...saved, changes: { constructor: { value: "north" } } };
    expect(draftHasEdits(saved, copy)).toBe(false);
    expect(draftHasEdits(saved, { ...copy, changes: { entrance: { value: "north" } } })).toBe(true);
  });

  it("detects photo replacement, removal, reordering and relicensing", () => {
    const original = savedDraft();
    const [first, second] = original.photos;
    if (!first || !second) throw new Error("Expected two reference photos");
    for (const photos of [
      [first],
      [second, first],
      [{ ...first, id: "replacement" }, second],
      [{ ...first, name: "detail.jpg" }, second],
      [{ ...first, licence: "CC BY-SA 4.0" }, second],
    ] satisfies Draft["photos"][]) {
      expect(draftHasEdits(original, { ...original, photos })).toBe(true);
    }
  });
});

describe("switch and delete decisions", () => {
  it("opens new or saved drafts directly when there is nothing to discard", () => {
    const saved = savedDraft();
    expect(transitionPrompt({ type: "new" }, saved.id, false, "en")).toBeNull();
    expect(transitionPrompt({ type: "edit", item: saved }, "scratch", false, "fr")).toBeNull();
  });

  it("distinguishes reopening the active record from leaving to open a different one", () => {
    const saved = savedDraft();
    const edit: EditorAction = { type: "edit", item: saved };
    const restore = transitionPrompt(edit, saved.id, true, "en");
    const switchDraft = transitionPrompt(edit, "another visit", true, "en");
    expect(restore?.body).toContain("restore its saved version");
    expect(switchDraft?.body).toContain("North library · 2024-05-02 · Weekend survey");
    expect(switchDraft?.cancel).toBe("Keep editing");
  });

  it("calls out unsaved work only when deleting the active record", () => {
    const item = savedDraft();
    const action: EditorAction = { type: "delete", item };
    const clean = transitionPrompt(action, item.id, false, "en");
    const sibling = transitionPrompt(action, "another visit", true, "en");
    const active = transitionPrompt(action, item.id, true, "en");
    expect(clean).toEqual(sibling);
    expect(active?.body).toContain("Your unsaved edits to this draft");
    expect(clean?.body).toContain("North library");
    expect(clean?.body).toContain("photos will be deleted");
  });

  it("localizes all actions, including the placeholder for a new place", () => {
    const item: Draft = { ...savedDraft(), kind: "new-place", target: "new place", event: undefined };
    const open = transitionPrompt({ type: "edit", item }, "other", true, "fr");
    expect(open?.body).toContain("Nouveau lieu · 2024-05-02");
    expect(open?.confirm).toBe("Abandonner et ouvrir le brouillon");
    expect(transitionPrompt({ type: "new" }, item.id, true, "fr")?.cancel).toBe("Continuer la saisie");
    expect(transitionPrompt({ type: "delete", item }, item.id, false, "fr")?.confirm).toBe("Supprimer le brouillon");
    expect(deletionMessage("fr")).toContain("supprimé");
  });
});
