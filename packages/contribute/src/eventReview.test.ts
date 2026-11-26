import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { exportEventSelection, groupEventDrafts, matchesReview } from "./eventReview";
import { makeDraft, type Draft, type PhotoReference } from "./schema";
import { contributions } from "./store";

function visit(id: string, event: string | undefined, observed = "2025-02-04"): Draft {
  return {
    ...makeDraft(),
    id,
    kind: "audit",
    target: `Library ${id}`,
    observed,
    ...(event !== undefined ? { event } : {}),
    changes: { automatic_door: { value: "UNKNOWN" } },
  };
}

describe("saved mapping-day observations", () => {
  it("requires a named event and a complete valid observation", () => {
    const valid = visit("good", "Library day");
    const groups = groupEventDrafts([
      valid, null, {}, visit("none", undefined), visit("blank", "  "),
      { ...valid, id: "unobserved", changes: {} },
      { ...valid, id: "untrusted", tier: "verified" },
      { ...valid, id: "bad-date", observed: "2025-02-30" },
    ]);
    expect([...groups.keys()]).toEqual(["Library day"]);
    expect(groups.get("Library day")).toEqual([valid]);
  });

  it("keeps similar names separate including punctuation, accents and outer whitespace", () => {
    const names = ["Centre", "Centres", "centre", " Centre", "Centre ", "Centré", "Centre/West"];
    const groups = groupEventDrafts(names.map((name, index) => visit(String(index), name)));
    for (const [index, name] of names.entries()) {
      expect(groups.get(name)?.map(draft => draft.id)).toEqual([String(index)]);
    }
  });

  it("accepts event names that also name inherited object properties", () => {
    const row = visit("local", "__proto__");
    expect(groupEventDrafts([row]).get("__proto__")).toEqual([row]);
    expect(groupEventDrafts([row]).has("constructor")).toBe(false);
  });

  it("reviews recent observations first with repeatable order on the same date", () => {
    const rows = [
      visit("b", "Group"), visit("old", "Group", "2024-12-31"),
      visit("a", "Group"), visit("latest", "Group", "2025-11-03"),
    ];
    const expected = ["latest", "a", "b", "old"];
    const ids = (drafts: Draft[]) => groupEventDrafts(drafts).get("Group")?.map(draft => draft.id);
    expect(ids(rows)).toEqual(expected);
    expect(ids([...rows].reverse())).toEqual(expected);
    expect(rows[0]?.id).toBe("b");
  });

  it("keeps a review valid when an import reorders the same recorded fields", () => {
    const draft = visit("a", "Group");
    draft.changes = { width: { value: 0, unit: "cm" }, powered: { value: false } };
    const imported = { ...draft, changes: { powered: { value: false }, width: { unit: "cm", value: 0 } } };
    expect(matchesReview(imported, draft)).toBe(true);
    imported.changes.width.unit = "m";
    expect(matchesReview(imported, draft)).toBe(false);
  });

  it("accepts a fresh IndexedDB copy but requires another review for edited content", () => {
    const draft = visit("a", "Group");
    const stored = structuredClone(draft);
    expect(matchesReview(stored, draft)).toBe(true);
    expect(matchesReview(stored, undefined)).toBe(false);
    stored.changes.automatic_door = { value: false };
    expect(matchesReview(stored, draft)).toBe(false);
  });
});

describe("exporting from the reviewed event snapshot", () => {
  const event = "Neighbourhood survey";
  let first: Draft;
  let second: Draft;
  let other: Draft;

  beforeEach(async () => {
    await contributions.drafts.clear();
    await contributions.photos.clear();
    first = visit("first", event);
    second = visit("second", event);
    other = visit("other", event.toLowerCase());
    await contributions.drafts.bulkPut([first, second, other]);
  });

  it("includes only the selected record and retains its reported uncertainty", async () => {
    const blob = await exportEventSelection(event, [second]);
    const text = await blob.text();
    expect(blob.type).toBe("application/zip");
    expect(text).toContain(second.target);
    expect(text).toContain("UNKNOWN");
    expect(text).not.toContain(first.target);
    expect(text).not.toContain(other.target);
  });

  it("requires a nonempty, nonduplicated selection from one exact event", async () => {
    for (const [name, selected] of [
      ["", [first]], [event, []], [event, [first, first]], [event, [first, other]],
    ] as const) {
      await expect(exportEventSelection(name, selected)).rejects.toMatchObject({ reason: "changed" });
    }
  });

  it("rejects an observation deleted since review, even when the rest are unchanged", async () => {
    await contributions.drafts.delete(second.id);
    await expect(exportEventSelection(event, [first, second])).rejects.toMatchObject({ reason: "changed" });
  });

  it("requires the current version when a second editor updates the same event", async () => {
    const edited = { ...first, note: "New observation at the side door" };
    await contributions.drafts.put(edited);
    await expect(exportEventSelection(event, [first])).rejects.toMatchObject({ reason: "changed" });
    const text = await (await exportEventSelection(event, [edited])).text();
    expect(text).toContain(edited.note);
  });

  it("refuses a moved record and never substitutes another draft from the original event", async () => {
    await contributions.drafts.put({ ...first, event: other.event });
    await expect(exportEventSelection(event, [first])).rejects.toMatchObject({ reason: "changed" });
  });

  it("uses the stored owner of each photo and fails the entire selection if bytes are missing", async () => {
    const photo: PhotoReference = { id: "photo-1", name: "Entrance.jpg", licence: "CC BY 4.0", mime: "image/jpeg" };
    const illustrated = { ...first, photos: [photo] };
    await contributions.drafts.put(illustrated);
    const exportReviewed = () => exportEventSelection(event, [second, illustrated]);
    await expect(exportReviewed()).rejects.toMatchObject({ reason: "photo" });
    const data = new Blob(["image-bytes"], { type: photo.mime });
    await contributions.photos.put({ id: photo.id, draftId: other.id, data });
    await expect(exportReviewed()).rejects.toMatchObject({ reason: "photo" });
    await contributions.photos.put({ id: photo.id, draftId: first.id, data });
    const output = await (await exportReviewed()).text();
    expect(output).toContain("image-bytes");
    expect(output).toContain("photos/first/photo-1.jpg");
  });
});
