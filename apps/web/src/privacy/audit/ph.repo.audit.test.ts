// CI audit of the photo path in the source: a photo is stored only after sanitisePhoto, the export reads stored
// bytes, and the original file name is kept in the draft. The first is a rule; the others are recorded as known and
// each known test fails when the code changes, so the record changes with it.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPhotoSites, findPhotoWrites, storesFileName, unsanitisedWrites } from "./phRepo";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = [...loadFiles(ROOT, ["apps/web/src"]), ...loadFiles(ROOT, ["packages/contribute/src"])].filter((f) => !/\.test\.tsx?$/.test(f.path) && !f.path.includes("/privacy/audit/"));
const PAGE = "apps/web/src/contribute/ContributePage.tsx";

describe("photos in the source", () => {
  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((f) => f.path)).toContain(PAGE);
    expect(findPhotoSites(files).map((s) => s.name)).toContain("sanitisePhoto");
  });
  it("writes a stored photo in one place only", () => {
    expect(findPhotoWrites(files).map((w) => `${w.path}:${w.call}`)).toEqual([`${PAGE}:put`]);
  });
  it("cleans a picture before every write of a stored photo", () => {
    const bad = unsanitisedWrites(files);
    expect(bad, bad.map((b) => `${b.path}:${b.line}`).join("\n")).toEqual([]);
  });
  it("calls the picture functions only where they are expected", () => {
    const where = (n: string): string[] => [...new Set(findPhotoSites(files).filter((s) => s.name === n).map((s) => s.path))];
    // photos.ts is listed for its own definition of the function.
    expect(where("sanitisePhoto")).toEqual([PAGE, "packages/contribute/src/photos.ts"]);
    expect(where("stripJpegMetadata")).toEqual(["packages/contribute/src/photos.ts"]);
    expect(where("createImageBitmap")).toEqual(["packages/contribute/src/photos.ts"]);
    expect(where("exportZip")).toEqual([PAGE, "packages/contribute/src/export.ts"]);
  });
  it("cleans the picture in the same step that reads the picked file", () => {
    const page = files.find((f) => f.path === PAGE)?.text ?? "";
    expect(page).toMatch(/data:\s*await sanitisePhoto\(file\)/);
  });
  it("writes the photos and the draft in one transaction", () => {
    const page = files.find((f) => f.path === PAGE)?.text ?? "";
    expect(page).toMatch(/transaction\("rw",\s*contributions\.photos,\s*contributions\.drafts/);
  });
});

describe("known: what the source keeps", () => {
  it("keeps the picked file's name in the draft, which the export writes into contributions.json", () => {
    const page = files.find((f) => f.path === PAGE)?.text ?? "";
    expect(storesFileName(page)).toBe(true);
  });
  it("exports stored bytes as they are, without cleaning them again", () => {
    const exp = files.find((f) => f.path === "packages/contribute/src/export.ts")?.text ?? "";
    expect(findPhotoSites([{ path: "x", text: exp }]).map((s) => s.name)).not.toContain("stripJpegMetadata");
    expect(findPhotoSites([{ path: "x", text: exp }]).map((s) => s.name)).not.toContain("sanitisePhoto");
  });
});
