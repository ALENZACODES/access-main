// CI audit of the photo path in the source: a photo is stored only after sanitisePhoto, the export reads stored
// bytes, and the original file name is kept in the draft. The first is a rule; the others are recorded as known and
// each known test fails when the code changes, so the record changes with it.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPhotoSites, findPhotoWrites, unsanitisedWrites } from "./phRepo";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = [...loadFiles(ROOT, ["apps/web/src"]), ...loadFiles(ROOT, ["packages/contribute/src"])].filter((f) => !/\.test\.tsx?$/.test(f.path) && !f.path.includes("/privacy/audit/"));
const PAGE = "apps/web/src/contribute/ContributePage.tsx";
// The photo is cleaned where it is picked (PICK), held in memory, and stored with the draft (STORE).
const PICK = "apps/web/src/contribute/useDraftPhotos.ts";
const STORE = "packages/contribute/src/draftPhotos.ts";
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? "";

describe("photos in the source", () => {
  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((f) => f.path)).toContain(PAGE);
    expect(findPhotoSites(files).map((s) => s.name)).toContain("sanitisePhoto");
  });
  it("writes a stored photo in one place only", () => {
    expect(findPhotoWrites(files).map((w) => `${w.path}:${w.call}`)).toEqual([`${STORE}:bulkAdd`]);
  });
  it("cleans a picture before every write of a stored photo", () => {
    // STORE writes only rows that PICK made from sanitisePhoto; the next test proves that chain.
    const bad = unsanitisedWrites(files).filter((w) => w.path !== STORE);
    expect(bad, bad.map((b) => `${b.path}:${b.line}`).join("\n")).toEqual([]);
  });
  it("stores only photos that were cleaned when they were picked", () => {
    const store = text(STORE);
    expect(store).toMatch(/const pending = staged\.get\(id\);/);
    expect(store).toMatch(/pending\.data\.type !== "image\/jpeg"/);
    expect(store).toMatch(/additions\.push\(pending\);/);
    expect(store).toMatch(/bulkAdd\(additions\)/);
    const pick = text(PICK);
    expect(pick).toMatch(/const data = await sanitisePhoto\(file\);/);
    expect(pick).toMatch(/row: \{ id, draftId: draft\.id, data \}/);
    // Nothing else puts a photo where the store takes it from.
    const fills = files.filter((f) => /\bstaged\.set\(/.test(f.text)).map((f) => f.path);
    expect(fills).toEqual([PICK]);
  });
  it("calls the picture functions only where they are expected", () => {
    const where = (n: string): string[] => [...new Set(findPhotoSites(files).filter((s) => s.name === n).map((s) => s.path))];
    // photos.ts is listed for its own definition of the function.
    expect(where("sanitisePhoto")).toEqual([PICK, "packages/contribute/src/photos.ts"]);
    expect(where("stripJpegMetadata")).toEqual(["packages/contribute/src/photos.ts"]);
    expect(where("createImageBitmap")).toEqual(["packages/contribute/src/photos.ts"]);
    // eventReview.ts exports stored (already cleaned) bytes for an event, read in one transaction.
    expect(where("exportZip")).toEqual([PAGE, "packages/contribute/src/eventReview.ts", "packages/contribute/src/export.ts"]);
  });
  it("cleans the picture in the same step that reads the picked file", () => {
    expect(text(PICK)).toMatch(/const data = await sanitisePhoto\(file\);/);
  });
  it("writes the photos and the draft in one transaction", () => {
    expect(text(STORE)).toMatch(/transaction\("rw",\s*contributions\.drafts,\s*contributions\.photos/);
  });
});

describe("known: what the source keeps", () => {
  it("keeps the picked file's name in the draft, which the export writes into contributions.json", () => {
    const pick = text(PICK);
    expect(pick).toMatch(/const name = file\.name\.slice\(0, 200\)/);
    expect(pick).toMatch(/ref: \{ id, name,/);
  });
  it("exports stored bytes as they are, without cleaning them again", () => {
    const exp = files.find((f) => f.path === "packages/contribute/src/export.ts")?.text ?? "";
    expect(findPhotoSites([{ path: "x", text: exp }]).map((s) => s.name)).not.toContain("stripJpegMetadata");
    expect(findPhotoSites([{ path: "x", text: exp }]).map((s) => s.name)).not.toContain("sanitisePhoto");
  });
});
