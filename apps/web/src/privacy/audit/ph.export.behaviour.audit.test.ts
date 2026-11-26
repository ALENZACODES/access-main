// Behaviour audit of the contribution export, read back with a separate ZIP reader and the JPEG audit. What the
// export does as a rule (names by id, a checksum that matches, every photo as stored) is checked as a rule; what it
// does not do is recorded as known. It uses drafts that pass the App's own schema check.

import { describe, expect, it } from "vitest";
import { exportZip } from "../../../../../packages/contribute/src/export";
import { makeDraft, validateDraft, type Draft } from "../../../../../packages/contribute/src/schema";
import { ascTag, baselineSegments, exifSegment, gpsTags, jpegBytes } from "./phBuild";
import { auditJpeg } from "./phRules";
import { badChecksums, entryText, readZip } from "./phZip";

const clean = jpegBytes({ before: baselineSegments() });
const dirty = jpegBytes({ before: [exifSegment({ ifd0: [ascTag(0x010f, "Acme")], gps: gpsTags(43.6, -79.4) }), ...baselineSegments()] });
const draftOf = (id: string, photos: Array<[string, string]>): Draft => ({
  ...makeDraft(),
  id,
  target: "place-1",
  kind: "correction",
  changes: { door_width_cm: { value: 90, unit: "cm" } },
  photos: photos.map(([pid, name]) => ({ id: pid, name, licence: "CC BY 4.0" as const, mime: "image/jpeg" as const })),
});
const build = async (drafts: Draft[], stored: Record<string, Uint8Array>) =>
  readZip(new Uint8Array(await (await exportZip(drafts, async (id) => (stored[id] ? new Blob([stored[id] as Uint8Array<ArrayBuffer>]) : undefined))).arrayBuffer()));

describe("the export, read back", () => {
  it("is built from drafts that pass the schema check", () => expect(validateDraft(draftOf("d1", [["p1", "a.jpg"]]))).toEqual(expect.anything()));
  it("names each photo by the draft id and the photo id, not by the picked file's name", async () => {
    const z = await build([draftOf("d1", [["p1", "IMG_0001 home.jpg"]])], { p1: clean });
    const names = z.entries.map((e) => e.name);
    expect(names).toContain("photos/d1/p1.jpg");
    expect(names.join("\n")).not.toContain("IMG_0001");
  });
  it("has a checksum that matches for every entry", async () => expect(badChecksums(await build([draftOf("d1", [["p1", "a.jpg"]])], { p1: clean }))).toEqual([]));
  it("gives each photo's bytes as stored", async () => {
    const z = await build([draftOf("d1", [["p1", "a.jpg"], ["p2", "b.jpg"]])], { p1: clean, p2: dirty });
    expect(Array.from(z.entries.find((e) => e.name.endsWith("p1.jpg"))?.data ?? [])).toEqual(Array.from(clean));
    expect(Array.from(z.entries.find((e) => e.name.endsWith("p2.jpg"))?.data ?? [])).toEqual(Array.from(dirty));
  });
  it("holds no finding in the photos when the stored photos were clean", async () => {
    const z = await build([draftOf("d1", [["p1", "a.jpg"], ["p2", "b.jpg"]])], { p1: clean, p2: clean });
    for (const e of z.entries.filter((x) => x.name.startsWith("photos/"))) expect(auditJpeg(e.data), e.name).toEqual([]);
  });
  it("refuses an export when a stored photo is missing", async () => {
    await expect(build([draftOf("d1", [["p1", "a.jpg"]])], {})).rejects.toThrow("Missing photo: p1");
  });
  it("puts photos of two drafts in two folders", async () => {
    const z = await build([draftOf("d1", [["p1", "a.jpg"]]), draftOf("d2", [["p2", "a.jpg"]])], { p1: clean, p2: clean });
    expect(z.entries.map((e) => e.name).filter((n) => n.startsWith("photos/"))).toEqual(["photos/d1/p1.jpg", "photos/d2/p2.jpg"]);
  });
});

describe("known: what the export keeps", () => {
  it("writes the picked file's name into contributions.json", async () => {
    const z = await build([draftOf("d1", [["p1", "IMG_0001 home.jpg"]])], { p1: clean });
    expect(entryText(z, "contributions.json")).toContain("IMG_0001 home.jpg");
  });
  it("writes stored bytes unchanged, so a photo stored with metadata leaves with it", async () => {
    const z = await build([draftOf("d1", [["p1", "a.jpg"]])], { p1: dirty });
    const photo = z.entries.find((e) => e.name === "photos/d1/p1.jpg");
    expect(auditJpeg(photo?.data ?? new Uint8Array(0)).map((f) => f.code)).toEqual(expect.arrayContaining(["ph-exif-gps", "ph-exif-identity"]));
  });
});
